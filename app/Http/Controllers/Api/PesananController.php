<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HargaLayanan;
use App\Models\KategoriKendaraan;
use App\Models\KendaraanPesanan;
use App\Models\Layanan;
use App\Models\Pembayaran;
use App\Models\Pesanan;
use App\Services\Audit\AuditLogService;
use App\Services\Idempotency\IdempotencyService;
use App\Services\Operasional\OperationalHoursService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PesananController extends Controller
{
    public function __construct(
        private readonly AuditLogService $auditLog,
        private readonly IdempotencyService $idempotency,
        private readonly OperationalHoursService $operationalHours,
    ) {}

    /**
     * List orders with optional Cashier Queue Dashboard scope (`scope=dashboard`), status, date, and search filters.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'scope' => ['sometimes', 'nullable', 'string', 'in:all,dashboard'],
            'status_pesanan' => ['sometimes', 'nullable', 'string', 'in:berjalan,selesai,dibatalkan'],
            'status_pembayaran' => ['sometimes', 'nullable', 'string', 'in:belum_dibayar,sudah_dibayar'],
            'tanggal_mulai' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'tanggal_akhir' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:tanggal_mulai'],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'per_page' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $scope = (string) ($validated['scope'] ?? 'all');
        $perPage = (int) ($validated['per_page'] ?? 10);

        $query = Pesanan::with([
            'pengguna',
            'kendaraan.detailLayanan.hargaLayanan.layanan',
            'pembayaran',
        ]);

        $ringkasan = null;

        if ($scope === 'dashboard') {
            $this->applyDashboardActiveQueueScope($query);
            $ringkasan = $this->buildCashierDashboardSummary();
        }

        if (! empty($validated['status_pesanan'])) {
            $query->where('status_pesanan', $validated['status_pesanan']);
        }

        if (! empty($validated['status_pembayaran'])) {
            $statusPembayaran = $validated['status_pembayaran'];
            $query->whereHas('pembayaran', static function (Builder $pay) use ($statusPembayaran): void {
                $pay->where('status_pembayaran', $statusPembayaran);
            });
        }

        if (! empty($validated['tanggal_mulai']) || ! empty($validated['tanggal_akhir'])) {
            $appTimezone = config('app.timezone', 'UTC');

            if (! empty($validated['tanggal_mulai'])) {
                $startUtc = Carbon::parse($validated['tanggal_mulai'], 'Asia/Jakarta')
                    ->startOfDay()
                    ->timezone($appTimezone);
                $query->where('waktu_pesanan', '>=', $startUtc);
            }

            if (! empty($validated['tanggal_akhir'])) {
                $endUtcExclusive = Carbon::parse($validated['tanggal_akhir'], 'Asia/Jakarta')
                    ->addDay()
                    ->startOfDay()
                    ->timezone($appTimezone);
                $query->where('waktu_pesanan', '<', $endUtcExclusive);
            }
        }

        $search = trim((string) ($validated['search'] ?? ''));

        if ($search !== '') {
            $escaped = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($search));
            $pattern = '%'.$escaped.'%';

            $query->where(static function (Builder $subQuery) use ($pattern): void {
                $subQuery
                    ->whereRaw("LOWER(nomor_nota) LIKE ? ESCAPE '!'", [$pattern])
                    ->orWhereHas('kendaraan', static function (Builder $kendaraanQuery) use ($pattern): void {
                        $kendaraanQuery->whereRaw("LOWER(plat_nomor) LIKE ? ESCAPE '!'", [$pattern]);
                    });
            });
        }

        $pesanan = $query
            ->latest('waktu_pesanan')
            ->orderByDesc('id_pesanan')
            ->paginate($perPage);

        foreach ($pesanan->getCollection() as $item) {
            /** @var Pesanan $item */
            $totals = $this->calculateOrderTotals($item);
            $item->setAttribute('subtotal_utama', $totals['subtotal_utama']);
            $item->setAttribute('subtotal_tambahan', $totals['subtotal_tambahan']);
            $item->setAttribute('total_harga', $totals['total_harga']);
        }

        $response = [
            'success' => true,
            'data' => $pesanan,
        ];

        if ($ringkasan !== null) {
            $response['ringkasan'] = $ringkasan;
        }

        return response()->json($response);
    }

    /**
     * Create a new multi-vehicle order with snapshot pricing, metadata, schedule checks, and idempotency safety.
     */
    public function store(Request $request): JsonResponse
    {
        $this->normalizeOrderInput($request);
        $key = $this->idempotency->extractKey($request);

        $validated = $request->validate([
            'catatan' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'konfirmasi_hari_libur' => ['sometimes', 'boolean'],
            'kendaraan' => ['required', 'array', 'min:1'],
            'kendaraan.*.id_kategori_kendaraan' => ['required', 'exists:kategori_kendaraan,id_kategori_kendaraan'],
            'kendaraan.*.plat_nomor' => ['sometimes', 'nullable', 'string', 'max:20'],
            'kendaraan.*.layanan' => ['required', 'array', 'min:1'],
            'kendaraan.*.layanan.*.id_harga' => ['required', 'exists:harga_layanan,id_harga'],
            'kendaraan.*.layanan.*.harga_akhir' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'kendaraan.*.layanan.*.alasan_penyesuaian' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        $callerId = (int) $request->user()->id_pengguna;
        $requestHash = $this->idempotency->hashPayload(
            $this->canonicalizeOrderCreatePayload($validated)
        );

        if ($key !== null) {
            $existing = Pesanan::query()->where('idempotency_key', $key)->first();

            if ($existing !== null) {
                return $this->resolveExistingOrderIdempotency($existing, $callerId, $key, $requestHash);
            }
        }

        $nowJakarta = Carbon::now('Asia/Jakarta');
        $schedule = $this->operationalHours->evaluate($nowJakarta);

        if ($schedule['perlu_konfirmasi_hari_libur'] && ! (bool) ($validated['konfirmasi_hari_libur'] ?? false)) {
            return response()->json([
                'success' => false,
                'error_code' => 'HOLIDAY_CONFIRMATION_REQUIRED',
                'message' => 'Operasional hari ini tercatat libur. Konfirmasi eksplisit diperlukan untuk membuat pesanan.',
                'operational_status' => $schedule,
            ], 409);
        }

        $catatan = isset($validated['catatan']) ? trim((string) $validated['catatan']) : '';
        $catatanValue = $catatan !== '' ? $catatan : null;

        try {
            $pesanan = DB::transaction(function () use (
                $validated,
                $callerId,
                $key,
                $requestHash,
                $nowJakarta,
                $schedule,
                $catatanValue,
            ): Pesanan {
                $created = Pesanan::query()->create([
                    'id_pengguna' => $callerId,
                    'waktu_pesanan' => $nowJakarta->copy()->timezone(config('app.timezone', 'Asia/Jakarta')),
                    'status_pesanan' => Pesanan::STATUS_BERJALAN,
                    'catatan' => $catatanValue,
                    'di_luar_jam_operasional' => $schedule['di_luar_jam_operasional'],
                    'status_jam_operasional' => $schedule['status_jam_operasional'],
                    'pada_hari_libur' => $schedule['pada_hari_libur'],
                    'konfirmasi_hari_libur' => $schedule['pada_hari_libur']
                        ? (bool) ($validated['konfirmasi_hari_libur'] ?? false)
                        : false,
                    'idempotency_key' => $key,
                    'version' => 1,
                ]);

                $created->update([
                    'nomor_nota' => sprintf('#TRX-%s-%04d', $nowJakarta->format('Ymd'), (int) $created->id_pesanan),
                ]);

                foreach ($validated['kendaraan'] as $kendaraanIndex => $dataKendaraan) {
                    $kategori = KategoriKendaraan::query()->findOrFail(
                        $dataKendaraan['id_kategori_kendaraan']
                    );

                    if (! $kategori->status_aktif) {
                        throw ValidationException::withMessages([
                            'kendaraan' => ['Kategori kendaraan tidak aktif.'],
                        ]);
                    }

                    $kendaraan = $created->kendaraan()->create([
                        'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                        'nama_kategori_snapshot' => $kategori->nama_kategori,
                        'plat_nomor' => $this->normalizePlatNomor($dataKendaraan['plat_nomor'] ?? null),
                        'status_proses' => KendaraanPesanan::STATUS_MENUNGGU,
                    ]);

                    foreach ($dataKendaraan['layanan'] as $layananIndex => $dataLayanan) {
                        $kendaraan->detailLayanan()->create(
                            $this->resolveDetailLayananAttributes(
                                $dataLayanan,
                                (int) $kategori->id_kategori_kendaraan,
                                (int) $kendaraanIndex,
                                (int) $layananIndex,
                            )
                        );
                    }
                }

                $created->pembayaran()->create([
                    'status_pembayaran' => 'belum_dibayar',
                ]);

                $created->load([
                    'pengguna',
                    'kendaraan.detailLayanan.hargaLayanan.layanan',
                    'pembayaran',
                ]);

                $totals = $this->calculateOrderTotals($created);

                if ($key !== null) {
                    $this->idempotency->storeRecord(
                        userId: $callerId,
                        scope: IdempotencyService::SCOPE_CREATE_ORDER,
                        key: $key,
                        requestHash: $requestHash,
                        responseStatus: 201,
                        responseBody: [
                            'success' => true,
                            'message' => 'Pesanan berhasil dibuat.',
                            'data' => [
                                'pesanan' => $created->toArray(),
                                'subtotal_utama' => $totals['subtotal_utama'],
                                'subtotal_tambahan' => $totals['subtotal_tambahan'],
                                'total_harga' => $totals['total_harga'],
                            ],
                        ],
                    );
                }

                $this->auditLog->record(
                    actorUserId: $callerId,
                    entity: 'pesanan',
                    recordId: $created->id_pesanan,
                    before: null,
                    after: $this->buildOrderAuditSnapshot($created),
                    reason: 'Pembuatan pesanan baru',
                );

                return $created;
            });
        } catch (UniqueConstraintViolationException $e) {
            if ($key !== null) {
                $existing = Pesanan::query()->where('idempotency_key', $key)->first();

                if ($existing !== null) {
                    return $this->resolveExistingOrderIdempotency($existing, $callerId, $key, $requestHash);
                }
            }

            throw $e;
        }

        $totals = $this->calculateOrderTotals($pesanan);

        $payload = [
            'success' => true,
            'message' => 'Pesanan berhasil dibuat.',
            'data' => [
                'pesanan' => $pesanan,
                'subtotal_utama' => $totals['subtotal_utama'],
                'subtotal_tambahan' => $totals['subtotal_tambahan'],
                'total_harga' => $totals['total_harga'],
            ],
        ];

        if ($schedule['warnings'] !== []) {
            $payload['warnings'] = $schedule['warnings'];
        }

        return response()->json($payload, 201);
    }

    /**
     * Show full order detail with service-type subtotals and grand total.
     */
    public function show(Pesanan $pesanan): JsonResponse
    {
        $pesanan->load([
            'pengguna',
            'kendaraan.detailLayanan.hargaLayanan.layanan',
            'pembayaran',
        ]);

        $totals = $this->calculateOrderTotals($pesanan);

        return response()->json([
            'success' => true,
            'data' => [
                'pesanan' => $pesanan,
                'subtotal_utama' => $totals['subtotal_utama'],
                'subtotal_tambahan' => $totals['subtotal_tambahan'],
                'total_harga' => $totals['total_harga'],
            ],
        ]);
    }

    /**
     * Soft-void a non-cancelled order with mandatory reason, optional version check, and audit log.
     */
    public function cancel(Request $request, Pesanan $pesanan): JsonResponse
    {
        $validated = $request->validate([
            'alasan_pembatalan' => ['required', 'string', 'min:5', 'max:1000'],
            'expected_version' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ]);

        $outcome = DB::transaction(function () use ($request, $pesanan, $validated): array {
            /** @var Pesanan $locked */
            $locked = Pesanan::query()
                ->where('id_pesanan', $pesanan->id_pesanan)
                ->lockForUpdate()
                ->firstOrFail();

            if ($locked->status_pesanan === Pesanan::STATUS_DIBATALKAN) {
                return [
                    'error' => true,
                    'status' => 422,
                    'payload' => [
                        'message' => 'Pesanan sudah dibatalkan.',
                    ],
                ];
            }

            if (
                array_key_exists('expected_version', $validated)
                && $validated['expected_version'] !== null
                && (int) $validated['expected_version'] !== (int) $locked->version
            ) {
                return [
                    'error' => true,
                    'status' => 409,
                    'payload' => [
                        'success' => false,
                        'error_code' => 'VERSION_CONFLICT',
                        'message' => 'Data pesanan telah diubah oleh pengguna lain. Silakan muat ulang.',
                    ],
                ];
            }

            $sebelum = [
                'status_pesanan' => $locked->status_pesanan,
                'alasan_pembatalan' => $locked->alasan_pembatalan,
                'version' => (int) $locked->version,
            ];

            $alasan = trim((string) $validated['alasan_pembatalan']);
            $nextVersion = ((int) $locked->version) + 1;

            $locked->update([
                'status_pesanan' => Pesanan::STATUS_DIBATALKAN,
                'alasan_pembatalan' => $alasan,
                'version' => $nextVersion,
            ]);

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'pesanan',
                recordId: $locked->id_pesanan,
                before: $sebelum,
                after: [
                    'status_pesanan' => Pesanan::STATUS_DIBATALKAN,
                    'alasan_pembatalan' => $alasan,
                    'version' => $nextVersion,
                ],
                reason: $alasan,
            );

            return [
                'error' => false,
                'data' => $locked->fresh(),
            ];
        });

        if ($outcome['error']) {
            return response()->json($outcome['payload'], $outcome['status']);
        }

        return response()->json([
            'message' => 'Pesanan berhasil dibatalkan.',
            'data' => $outcome['data'],
        ]);
    }

    /**
     * Edit a non-cancelled order (unpaid or paid) transactionally while enforcing audit reason, version concurrency, and derived Option B status.
     */
    public function update(Request $request, Pesanan $pesanan): JsonResponse
    {
        $this->normalizeOrderInput($request);

        $validated = $request->validate([
            'alasan' => ['required', 'string', 'min:5', 'max:1000'],
            'expected_version' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'catatan' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'status_pesanan' => ['sometimes', 'string', 'in:berjalan,selesai'],
            'kendaraan' => ['sometimes', 'array', 'min:1'],
            'kendaraan.*.id_kendaraan_pesanan' => ['sometimes', 'nullable', 'integer'],
            'kendaraan.*.id_kategori_kendaraan' => ['required_with:kendaraan', 'exists:kategori_kendaraan,id_kategori_kendaraan'],
            'kendaraan.*.plat_nomor' => ['sometimes', 'nullable', 'string', 'max:20'],
            'kendaraan.*.layanan' => ['required_with:kendaraan', 'array', 'min:1'],
            'kendaraan.*.layanan.*.id_harga' => ['required_with:kendaraan', 'exists:harga_layanan,id_harga'],
            'kendaraan.*.layanan.*.harga_akhir' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'kendaraan.*.layanan.*.alasan_penyesuaian' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        $outcome = DB::transaction(function () use ($request, $pesanan, $validated): array {
            /** @var Pesanan $locked */
            $locked = Pesanan::query()
                ->where('id_pesanan', $pesanan->id_pesanan)
                ->lockForUpdate()
                ->firstOrFail();

            if ($locked->status_pesanan === Pesanan::STATUS_DIBATALKAN) {
                return [
                    'error' => true,
                    'status' => 422,
                    'payload' => [
                        'message' => 'Pesanan yang dibatalkan tidak dapat diedit.',
                    ],
                ];
            }

            Pembayaran::query()
                ->where('id_pesanan', $locked->id_pesanan)
                ->lockForUpdate()
                ->first();

            if (
                array_key_exists('expected_version', $validated)
                && $validated['expected_version'] !== null
                && (int) $validated['expected_version'] !== (int) $locked->version
            ) {
                return [
                    'error' => true,
                    'status' => 409,
                    'payload' => [
                        'success' => false,
                        'error_code' => 'VERSION_CONFLICT',
                        'message' => 'Data pesanan telah diubah oleh pengguna lain. Silakan muat ulang.',
                    ],
                ];
            }

            $existingVehicles = KendaraanPesanan::query()
                ->where('id_pesanan', $locked->id_pesanan)
                ->with('detailLayanan')
                ->lockForUpdate()
                ->get()
                ->keyBy('id_kendaraan_pesanan');

            $locked->load([
                'kendaraan.detailLayanan.hargaLayanan.layanan',
            ]);

            $beforeSnapshot = $this->buildOrderAuditSnapshot($locked);

            if (array_key_exists('kendaraan', $validated)) {
                $this->syncOrderVehiclesAndServices($locked, $existingVehicles, $validated['kendaraan']);
            }

            $currentVehicles = KendaraanPesanan::query()
                ->where('id_pesanan', $locked->id_pesanan)
                ->orderBy('id_kendaraan_pesanan')
                ->lockForUpdate()
                ->get();

            $derivedStatus = $this->deriveOrderStatusFromVehicles($currentVehicles);

            if (
                array_key_exists('status_pesanan', $validated)
                && $validated['status_pesanan'] !== $derivedStatus
            ) {
                throw ValidationException::withMessages([
                    'status_pesanan' => [
                        'Status pesanan diturunkan otomatis dari status kendaraan dan tidak dapat diubah manual bertentangan dengan derivasi.',
                    ],
                ]);
            }

            $updateAttributes = [
                'status_pesanan' => $derivedStatus,
                'version' => ((int) $locked->version) + 1,
            ];

            if (array_key_exists('catatan', $validated)) {
                $trimmedCatatan = trim((string) ($validated['catatan'] ?? ''));
                $updateAttributes['catatan'] = $trimmedCatatan !== '' ? $trimmedCatatan : null;
            }

            $locked->update($updateAttributes);

            $fresh = $locked->fresh([
                'pengguna',
                'kendaraan.detailLayanan.hargaLayanan.layanan',
                'pembayaran',
            ]);

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'pesanan',
                recordId: $locked->id_pesanan,
                before: $beforeSnapshot,
                after: $this->buildOrderAuditSnapshot($fresh),
                reason: trim((string) $validated['alasan']),
            );

            return [
                'error' => false,
                'data' => $fresh,
                'totals' => $this->calculateOrderTotals($fresh),
            ];
        });

        if ($outcome['error']) {
            return response()->json($outcome['payload'], $outcome['status']);
        }

        return response()->json([
            'success' => true,
            'message' => 'Pesanan berhasil diperbarui.',
            'data' => $outcome['data'],
            'subtotal_utama' => $outcome['totals']['subtotal_utama'],
            'subtotal_tambahan' => $outcome['totals']['subtotal_tambahan'],
            'total_harga' => $outcome['totals']['total_harga'],
        ]);
    }

    /**
     * Update non-financial order metadata (`catatan` and `plat_nomor`) before or after payment (`FR-33`).
     */
    public function updateMetadata(Request $request, Pesanan $pesanan): JsonResponse
    {
        $this->normalizeOrderInput($request);

        $validated = $request->validate([
            'alasan' => ['required', 'string', 'min:5', 'max:1000'],
            'expected_version' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'catatan' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'kendaraan' => ['sometimes', 'array', 'min:1'],
            'kendaraan.*.id_kendaraan_pesanan' => ['required_with:kendaraan', 'integer'],
            'kendaraan.*.plat_nomor' => ['present', 'nullable', 'string', 'max:20'],
            'status_pesanan' => ['prohibited'],
            'layanan' => ['prohibited'],
            'id_harga' => ['prohibited'],
            'harga_akhir' => ['prohibited'],
            'jumlah_dibayar' => ['prohibited'],
            'metode_pembayaran' => ['prohibited'],
            'status_pembayaran' => ['prohibited'],
        ]);

        if (! array_key_exists('catatan', $validated) && ! array_key_exists('kendaraan', $validated)) {
            throw ValidationException::withMessages([
                'metadata' => ['Minimal salah satu field catatan atau plat nomor kendaraan harus disediakan.'],
            ]);
        }

        $outcome = DB::transaction(function () use ($request, $pesanan, $validated): array {
            /** @var Pesanan $locked */
            $locked = Pesanan::query()
                ->where('id_pesanan', $pesanan->id_pesanan)
                ->lockForUpdate()
                ->firstOrFail();

            if ($locked->status_pesanan === Pesanan::STATUS_DIBATALKAN) {
                return [
                    'error' => true,
                    'status' => 422,
                    'payload' => [
                        'message' => 'Pesanan yang dibatalkan tidak dapat diubah metadatanya.',
                    ],
                ];
            }

            if (
                array_key_exists('expected_version', $validated)
                && $validated['expected_version'] !== null
                && (int) $validated['expected_version'] !== (int) $locked->version
            ) {
                return [
                    'error' => true,
                    'status' => 409,
                    'payload' => [
                        'success' => false,
                        'error_code' => 'VERSION_CONFLICT',
                        'message' => 'Data pesanan telah diubah oleh pengguna lain. Silakan muat ulang.',
                    ],
                ];
            }

            $existingVehicles = KendaraanPesanan::query()
                ->where('id_pesanan', $locked->id_pesanan)
                ->orderBy('id_kendaraan_pesanan')
                ->lockForUpdate()
                ->get()
                ->keyBy('id_kendaraan_pesanan');

            $before = [
                'catatan' => $locked->catatan,
                'version' => (int) $locked->version,
                'kendaraan' => $existingVehicles->map(static fn (KendaraanPesanan $item): array => [
                    'id_kendaraan_pesanan' => (int) $item->id_kendaraan_pesanan,
                    'plat_nomor' => $item->plat_nomor,
                ])->values()->all(),
            ];

            if (array_key_exists('kendaraan', $validated)) {
                $seenIds = [];

                foreach ($validated['kendaraan'] as $index => $vehicleUpdate) {
                    $vehicleId = (int) $vehicleUpdate['id_kendaraan_pesanan'];

                    if (in_array($vehicleId, $seenIds, true)) {
                        throw ValidationException::withMessages([
                            "kendaraan.{$index}.id_kendaraan_pesanan" => ['ID kendaraan duplikat dalam permintaan.'],
                        ]);
                    }

                    $seenIds[] = $vehicleId;

                    /** @var KendaraanPesanan|null $targetVehicle */
                    $targetVehicle = $existingVehicles->get($vehicleId);

                    if ($targetVehicle === null) {
                        throw ValidationException::withMessages([
                            "kendaraan.{$index}.id_kendaraan_pesanan" => ['Kendaraan tidak ditemukan pada pesanan ini.'],
                        ]);
                    }

                    $targetVehicle->update([
                        'plat_nomor' => $this->normalizePlatNomor($vehicleUpdate['plat_nomor'] ?? null),
                    ]);
                }
            }

            $nextVersion = ((int) $locked->version) + 1;
            $orderUpdate = [
                'version' => $nextVersion,
            ];

            if (array_key_exists('catatan', $validated)) {
                $trimmedCatatan = trim((string) ($validated['catatan'] ?? ''));
                $orderUpdate['catatan'] = $trimmedCatatan !== '' ? $trimmedCatatan : null;
            }

            $locked->update($orderUpdate);

            $fresh = $locked->fresh([
                'pengguna',
                'kendaraan.detailLayanan.hargaLayanan.layanan',
                'pembayaran',
            ]);

            $after = [
                'aksi' => 'METADATA_UPDATE',
                'catatan' => $fresh->catatan,
                'version' => (int) $fresh->version,
                'kendaraan' => $fresh->kendaraan->map(static fn (KendaraanPesanan $item): array => [
                    'id_kendaraan_pesanan' => (int) $item->id_kendaraan_pesanan,
                    'plat_nomor' => $item->plat_nomor,
                ])->values()->all(),
            ];

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'pesanan',
                recordId: $locked->id_pesanan,
                before: $before,
                after: $after,
                reason: trim((string) $validated['alasan']),
            );

            return [
                'error' => false,
                'data' => $fresh,
                'totals' => $this->calculateOrderTotals($fresh),
            ];
        });

        if ($outcome['error']) {
            return response()->json($outcome['payload'], $outcome['status']);
        }

        return response()->json([
            'success' => true,
            'message' => 'Metadata pesanan berhasil diperbarui.',
            'data' => $outcome['data'],
            'subtotal_utama' => $outcome['totals']['subtotal_utama'],
            'subtotal_tambahan' => $outcome['totals']['subtotal_tambahan'],
            'total_harga' => $outcome['totals']['total_harga'],
        ]);
    }

    /**
     * Update an individual vehicle's process status and atomically derive aggregate `pesanan.status_pesanan` (Option B).
     */
    public function updateVehicleStatus(Request $request, int|string $id): JsonResponse
    {
        $validated = $request->validate([
            'status_proses' => ['required', 'in:menunggu,proses,selesai'],
            'expected_version' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ]);

        $kendaraanRef = KendaraanPesanan::query()->findOrFail($id);

        $outcome = DB::transaction(function () use ($request, $kendaraanRef, $validated): array {
            /** @var Pesanan $pesanan */
            $pesanan = Pesanan::query()
                ->where('id_pesanan', $kendaraanRef->id_pesanan)
                ->lockForUpdate()
                ->firstOrFail();

            if ($pesanan->status_pesanan === Pesanan::STATUS_DIBATALKAN) {
                return [
                    'error' => true,
                    'status' => 422,
                    'payload' => [
                        'message' => 'Pesanan sudah dibatalkan.',
                    ],
                ];
            }

            if (
                array_key_exists('expected_version', $validated)
                && $validated['expected_version'] !== null
                && (int) $validated['expected_version'] !== (int) $pesanan->version
            ) {
                return [
                    'error' => true,
                    'status' => 409,
                    'payload' => [
                        'success' => false,
                        'error_code' => 'VERSION_CONFLICT',
                        'message' => 'Data pesanan telah diubah oleh pengguna lain. Silakan muat ulang.',
                    ],
                ];
            }

            $allVehicles = KendaraanPesanan::query()
                ->where('id_pesanan', $pesanan->id_pesanan)
                ->orderBy('id_kendaraan_pesanan')
                ->lockForUpdate()
                ->get();

            /** @var KendaraanPesanan $kendaraan */
            $kendaraan = $allVehicles->firstWhere('id_kendaraan_pesanan', $kendaraanRef->id_kendaraan_pesanan);

            if ($kendaraan === null) {
                abort(404);
            }

            $oldVehicleStatus = $kendaraan->status_proses;
            $kendaraan->update([
                'status_proses' => $validated['status_proses'],
            ]);

            $refreshedVehicles = KendaraanPesanan::query()
                ->where('id_pesanan', $pesanan->id_pesanan)
                ->orderBy('id_kendaraan_pesanan')
                ->get();

            $oldOrderStatus = $pesanan->status_pesanan;
            $oldVersion = (int) $pesanan->version;
            $derivedStatus = $this->deriveOrderStatusFromVehicles($refreshedVehicles);
            $nextVersion = $oldVersion + 1;

            $pesanan->update([
                'status_pesanan' => $derivedStatus,
                'version' => $nextVersion,
            ]);

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'kendaraan_pesanan',
                recordId: $kendaraan->id_kendaraan_pesanan,
                before: [
                    'status_proses' => $oldVehicleStatus,
                ],
                after: [
                    'status_proses' => $validated['status_proses'],
                ],
                reason: 'Perubahan status proses kendaraan',
            );

            if ($oldOrderStatus !== $derivedStatus) {
                $this->auditLog->record(
                    actorUserId: $request->user()->id_pengguna,
                    entity: 'pesanan',
                    recordId: $pesanan->id_pesanan,
                    before: [
                        'status_pesanan' => $oldOrderStatus,
                        'version' => $oldVersion,
                    ],
                    after: [
                        'aksi' => 'STATUS_DERIVATION',
                        'status_pesanan' => $derivedStatus,
                        'version' => $nextVersion,
                    ],
                    reason: 'Derivasi otomatis status pesanan dari status kendaraan',
                );
            }

            return [
                'error' => false,
                'data' => $kendaraan->fresh(),
                'pesanan_status' => $derivedStatus,
                'pesanan_version' => $nextVersion,
            ];
        });

        if ($outcome['error']) {
            return response()->json($outcome['payload'], $outcome['status']);
        }

        return response()->json([
            'message' => 'Status kendaraan berhasil diperbarui.',
            'data' => $outcome['data'],
            'pesanan_status' => $outcome['pesanan_status'],
            'pesanan_version' => $outcome['pesanan_version'],
        ]);
    }

    /**
     * Resolve Option B order status (`selesai` only when all vehicles are `selesai`, otherwise `berjalan`).
     *
     * @param  iterable<int, KendaraanPesanan>  $vehicles
     */
    private function deriveOrderStatusFromVehicles(iterable $vehicles): string
    {
        $hasAnyVehicle = false;

        foreach ($vehicles as $vehicle) {
            $hasAnyVehicle = true;

            if ($vehicle->status_proses !== KendaraanPesanan::STATUS_SELESAI) {
                return Pesanan::STATUS_BERJALAN;
            }
        }

        return $hasAnyVehicle ? Pesanan::STATUS_SELESAI : Pesanan::STATUS_BERJALAN;
    }

    /**
     * Apply order edits to vehicles and service lines while preserving active vehicle statuses.
     *
     * @param  Collection<int, KendaraanPesanan>  $existingVehicles
     * @param  array<int, array<string, mixed>>  $incomingVehicles
     */
    private function syncOrderVehiclesAndServices(
        Pesanan $order,
        Collection $existingVehicles,
        array $incomingVehicles,
    ): void {
        $keptIds = [];

        foreach ($incomingVehicles as $kendaraanIndex => $dataKendaraan) {
            $incomingId = isset($dataKendaraan['id_kendaraan_pesanan'])
                ? (int) $dataKendaraan['id_kendaraan_pesanan']
                : null;

            /** @var KendaraanPesanan|null $targetVehicle */
            $targetVehicle = null;

            if ($incomingId !== null) {
                if (in_array($incomingId, $keptIds, true)) {
                    throw ValidationException::withMessages([
                        "kendaraan.{$kendaraanIndex}.id_kendaraan_pesanan" => ['ID kendaraan duplikat dalam permintaan.'],
                    ]);
                }

                $targetVehicle = $existingVehicles->get($incomingId);

                if ($targetVehicle === null) {
                    throw ValidationException::withMessages([
                        "kendaraan.{$kendaraanIndex}.id_kendaraan_pesanan" => ['Kendaraan tidak ditemukan pada pesanan ini.'],
                    ]);
                }

                $keptIds[] = $incomingId;
            }

            $kategori = KategoriKendaraan::query()->findOrFail(
                $dataKendaraan['id_kategori_kendaraan']
            );

            $categoryChanged = $targetVehicle === null
                || (int) $targetVehicle->id_kategori_kendaraan !== (int) $kategori->id_kategori_kendaraan;

            if ($categoryChanged && ! $kategori->status_aktif) {
                throw ValidationException::withMessages([
                    "kendaraan.{$kendaraanIndex}.id_kategori_kendaraan" => ['Kategori kendaraan tidak aktif.'],
                ]);
            }

            if ($targetVehicle === null) {
                $targetVehicle = $order->kendaraan()->create([
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'nama_kategori_snapshot' => $kategori->nama_kategori,
                    'plat_nomor' => $this->normalizePlatNomor($dataKendaraan['plat_nomor'] ?? null),
                    'status_proses' => KendaraanPesanan::STATUS_MENUNGGU,
                ]);
                $existingHargaIds = [];
            } else {
                $existingHargaIds = $targetVehicle->detailLayanan
                    ->pluck('id_harga')
                    ->map(static fn (mixed $id): int => (int) $id)
                    ->all();

                $updateVehicleData = [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'nama_kategori_snapshot' => $kategori->nama_kategori,
                ];

                if (array_key_exists('plat_nomor', $dataKendaraan)) {
                    $updateVehicleData['plat_nomor'] = $this->normalizePlatNomor($dataKendaraan['plat_nomor']);
                }

                $targetVehicle->update($updateVehicleData);
                $targetVehicle->detailLayanan()->delete();
            }

            foreach ($dataKendaraan['layanan'] as $layananIndex => $dataLayanan) {
                $targetVehicle->detailLayanan()->create(
                    $this->resolveDetailLayananAttributes(
                        $dataLayanan,
                        (int) $kategori->id_kategori_kendaraan,
                        (int) $kendaraanIndex,
                        (int) $layananIndex,
                        $existingHargaIds,
                    )
                );
            }
        }

        foreach ($existingVehicles as $existingId => $existingVehicle) {
            if (! in_array((int) $existingId, $keptIds, true)) {
                $existingVehicle->delete();
            }
        }
    }

    private function applyDashboardActiveQueueScope(Builder $query): void
    {
        $query->where('status_pesanan', '!=', Pesanan::STATUS_DIBATALKAN)
            ->where(static function (Builder $sub): void {
                $sub->where('status_pesanan', '!=', Pesanan::STATUS_SELESAI)
                    ->orWhereHas('pembayaran', static function (Builder $pay): void {
                        $pay->where('status_pembayaran', '!=', 'sudah_dibayar');
                    })
                    ->orWhereDoesntHave('pembayaran');
            });
    }

    /**
     * Compute Cashier Queue Dashboard operational counters under Option B.
     *
     * @return array{
     *     antrean_aktif_total: int,
     *     berjalan_count: int,
     *     selesai_belum_dibayar_count: int,
     *     belum_dibayar_count: int,
     *     kendaraan_menunggu_count: int,
     *     kendaraan_proses_count: int,
     *     kendaraan_selesai_count: int,
     *     hari_ini_total_pesanan: int,
     *     hari_ini_selesai_dibayar_count: int
     * }
     */
    private function buildCashierDashboardSummary(): array
    {
        $activeQuery = Pesanan::query();
        $this->applyDashboardActiveQueueScope($activeQuery);

        $antreanAktifTotal = (clone $activeQuery)->count();
        $berjalanCount = (clone $activeQuery)
            ->where('status_pesanan', Pesanan::STATUS_BERJALAN)
            ->count();
        $selesaiBelumDibayarCount = (clone $activeQuery)
            ->where('status_pesanan', Pesanan::STATUS_SELESAI)
            ->count();
        $belumDibayarCount = (clone $activeQuery)
            ->where(static function (Builder $sub): void {
                $sub->whereHas('pembayaran', static function (Builder $pay): void {
                    $pay->where('status_pembayaran', '!=', 'sudah_dibayar');
                })->orWhereDoesntHave('pembayaran');
            })
            ->count();

        $vehicleCounts = KendaraanPesanan::query()
            ->whereHas('pesanan', function (Builder $orderQuery): void {
                $this->applyDashboardActiveQueueScope($orderQuery);
            })
            ->selectRaw('status_proses, COUNT(*) as total')
            ->groupBy('status_proses')
            ->pluck('total', 'status_proses');

        $appTimezone = config('app.timezone', 'UTC');
        $todayWibStartUtc = Carbon::now('Asia/Jakarta')->startOfDay()->timezone($appTimezone);
        $todayWibEndUtc = Carbon::now('Asia/Jakarta')->addDay()->startOfDay()->timezone($appTimezone);

        $todayOrdersQuery = Pesanan::query()
            ->where('status_pesanan', '!=', Pesanan::STATUS_DIBATALKAN)
            ->where('waktu_pesanan', '>=', $todayWibStartUtc)
            ->where('waktu_pesanan', '<', $todayWibEndUtc);

        $hariIniTotalPesanan = (clone $todayOrdersQuery)->count();
        $hariIniSelesaiDibayarCount = (clone $todayOrdersQuery)
            ->where('status_pesanan', Pesanan::STATUS_SELESAI)
            ->whereHas('pembayaran', static function (Builder $pay): void {
                $pay->where('status_pembayaran', 'sudah_dibayar');
            })
            ->count();

        return [
            'antrean_aktif_total' => $antreanAktifTotal,
            'berjalan_count' => $berjalanCount,
            'selesai_belum_dibayar_count' => $selesaiBelumDibayarCount,
            'belum_dibayar_count' => $belumDibayarCount,
            'kendaraan_menunggu_count' => (int) ($vehicleCounts[KendaraanPesanan::STATUS_MENUNGGU] ?? 0),
            'kendaraan_proses_count' => (int) ($vehicleCounts[KendaraanPesanan::STATUS_PROSES] ?? 0),
            'kendaraan_selesai_count' => (int) ($vehicleCounts[KendaraanPesanan::STATUS_SELESAI] ?? 0),
            'hari_ini_total_pesanan' => $hariIniTotalPesanan,
            'hari_ini_selesai_dibayar_count' => $hariIniSelesaiDibayarCount,
        ];
    }

    private function resolveExistingOrderIdempotency(
        Pesanan $existing,
        int $callerUserId,
        string $key,
        string $requestHash,
    ): JsonResponse {
        if ((int) $existing->id_pengguna !== $callerUserId) {
            return $this->idempotency->conflictResponse();
        }

        $record = $this->idempotency->findForUser(
            $callerUserId,
            IdempotencyService::SCOPE_CREATE_ORDER,
            $key,
        );

        if ($record !== null && $record->request_hash !== $requestHash) {
            return $this->idempotency->mismatchResponse();
        }

        return $this->buildIdempotencyReplayResponse($existing, $callerUserId);
    }

    private function buildIdempotencyReplayResponse(Pesanan $existing, int $callerUserId): JsonResponse
    {
        if ((int) $existing->id_pengguna !== $callerUserId) {
            return $this->idempotency->conflictResponse();
        }

        $existing->load([
            'pengguna',
            'kendaraan.detailLayanan.hargaLayanan.layanan',
            'pembayaran',
        ]);

        $totals = $this->calculateOrderTotals($existing);

        return response()->json([
            'success' => true,
            'message' => 'Pesanan sudah pernah dibuat.',
            'data' => [
                'pesanan' => $existing,
                'subtotal_utama' => $totals['subtotal_utama'],
                'subtotal_tambahan' => $totals['subtotal_tambahan'],
                'total_harga' => $totals['total_harga'],
            ],
        ], 200);
    }

    /**
     * Build a canonical representation of order creation input for idempotency hashing.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function canonicalizeOrderCreatePayload(array $validated): array
    {
        $catatan = isset($validated['catatan']) ? trim((string) $validated['catatan']) : '';

        return [
            'catatan' => $catatan !== '' ? $catatan : null,
            'konfirmasi_hari_libur' => (bool) ($validated['konfirmasi_hari_libur'] ?? false),
            'kendaraan' => array_values(array_map(function (array $kendaraan): array {
                return [
                    'id_kategori_kendaraan' => (int) $kendaraan['id_kategori_kendaraan'],
                    'plat_nomor' => $this->normalizePlatNomor($kendaraan['plat_nomor'] ?? null),
                    'layanan' => array_values(array_map(static function (array $layanan): array {
                        $alasan = isset($layanan['alasan_penyesuaian'])
                            ? trim((string) $layanan['alasan_penyesuaian'])
                            : '';

                        return [
                            'id_harga' => (int) $layanan['id_harga'],
                            'harga_akhir' => array_key_exists('harga_akhir', $layanan) && $layanan['harga_akhir'] !== null
                                ? round((float) $layanan['harga_akhir'], 2)
                                : null,
                            'alasan_penyesuaian' => $alasan !== '' ? $alasan : null,
                        ];
                    }, $kendaraan['layanan'])),
                ];
            }, $validated['kendaraan'])),
        ];
    }

    private function normalizeOrderInput(Request $request): void
    {
        $kendaraan = $request->input('kendaraan');

        if (! is_array($kendaraan)) {
            return;
        }

        foreach ($kendaraan as $idx => $item) {
            if (! is_array($item) || ! array_key_exists('plat_nomor', $item)) {
                continue;
            }

            $kendaraan[$idx]['plat_nomor'] = $this->normalizePlatNomor($item['plat_nomor']);
        }

        $request->merge(['kendaraan' => $kendaraan]);
    }

    private function normalizePlatNomor(mixed $raw): ?string
    {
        if (! is_string($raw)) {
            return null;
        }

        $collapsed = preg_replace('/\s+/', ' ', trim($raw));
        $trimmed = is_string($collapsed) ? trim($collapsed) : trim($raw);

        if ($trimmed === '') {
            return null;
        }

        return mb_strtoupper($trimmed);
    }

    /**
     * Validate a tariff entry and build snapshot attributes for detail_layanan.
     *
     * @param  array<string, mixed>  $dataLayanan
     * @param  array<int, int>  $allowedInactiveHargaIds
     * @return array{
     *     id_harga: int,
     *     nama_layanan_snapshot: string,
     *     tipe_layanan_snapshot: string,
     *     harga_dasar_snapshot: float,
     *     harga_akhir: float,
     *     alasan_penyesuaian: ?string
     * }
     */
    private function resolveDetailLayananAttributes(
        array $dataLayanan,
        int $kategoriId,
        int $kendaraanIndex,
        int $layananIndex,
        array $allowedInactiveHargaIds = [],
    ): array {
        $harga = HargaLayanan::with([
            'layanan',
            'kategoriKendaraan',
        ])->findOrFail($dataLayanan['id_harga']);

        $wasAlreadyOnVehicle = in_array((int) $harga->id_harga, $allowedInactiveHargaIds, true);

        if (! $wasAlreadyOnVehicle && ! $harga->status_aktif) {
            throw ValidationException::withMessages([
                'layanan' => ['Harga layanan tidak aktif.'],
            ]);
        }

        if ((int) $harga->id_kategori_kendaraan !== $kategoriId) {
            throw ValidationException::withMessages([
                'layanan' => ['Harga layanan tidak sesuai kategori kendaraan.'],
            ]);
        }

        if (! $wasAlreadyOnVehicle && ! $harga->layanan->status_aktif) {
            throw ValidationException::withMessages([
                'layanan' => ['Layanan sedang tidak aktif.'],
            ]);
        }

        $hargaDasar = round((float) $harga->harga_dasar, 2);
        $batasBawah = round((float) $harga->batas_bawah, 2);
        $batasAtas = round((float) $harga->batas_atas, 2);
        $rawHargaAkhir = array_key_exists('harga_akhir', $dataLayanan) && $dataLayanan['harga_akhir'] !== null
            ? (float) $dataLayanan['harga_akhir']
            : $hargaDasar;

        if ($rawHargaAkhir < $batasBawah || $rawHargaAkhir > $batasAtas) {
            throw ValidationException::withMessages([
                "kendaraan.{$kendaraanIndex}.layanan.{$layananIndex}.harga_akhir" => [
                    sprintf(
                        'Harga akhir harus berada dalam rentang %s sampai %s.',
                        number_format($batasBawah, 2, '.', ''),
                        number_format($batasAtas, 2, '.', ''),
                    ),
                ],
            ]);
        }

        $hargaAkhir = round($rawHargaAkhir, 2);
        $alasan = isset($dataLayanan['alasan_penyesuaian'])
            ? trim((string) $dataLayanan['alasan_penyesuaian'])
            : '';

        if (abs($hargaAkhir - $hargaDasar) > 0.00001 && $alasan === '') {
            throw ValidationException::withMessages([
                "kendaraan.{$kendaraanIndex}.layanan.{$layananIndex}.alasan_penyesuaian" => [
                    'Alasan penyesuaian harga wajib diisi ketika harga akhir berbeda dari harga dasar.',
                ],
            ]);
        }

        return [
            'id_harga' => (int) $harga->id_harga,
            'nama_layanan_snapshot' => (string) $harga->layanan->nama_layanan,
            'tipe_layanan_snapshot' => (string) ($harga->layanan->tipe_layanan ?? Layanan::TIPE_UTAMA),
            'harga_dasar_snapshot' => $hargaDasar,
            'harga_akhir' => $hargaAkhir,
            'alasan_penyesuaian' => $alasan !== '' ? $alasan : null,
        ];
    }

    /**
     * Build a structured, secret-free audit snapshot of an order and its nested vehicles/services.
     *
     * @return array<string, mixed>
     */
    private function buildOrderAuditSnapshot(Pesanan $pesanan): array
    {
        $totals = $this->calculateOrderTotals($pesanan);

        return [
            'nomor_nota' => $pesanan->nomor_nota,
            'status_pesanan' => $pesanan->status_pesanan,
            'catatan' => $pesanan->catatan,
            'status_jam_operasional' => $pesanan->status_jam_operasional,
            'di_luar_jam_operasional' => (bool) $pesanan->di_luar_jam_operasional,
            'pada_hari_libur' => (bool) $pesanan->pada_hari_libur,
            'konfirmasi_hari_libur' => (bool) $pesanan->konfirmasi_hari_libur,
            'version' => (int) $pesanan->version,
            'subtotal_utama' => $totals['subtotal_utama'],
            'subtotal_tambahan' => $totals['subtotal_tambahan'],
            'total_harga' => $totals['total_harga'],
            'kendaraan' => $pesanan->kendaraan->map(static function (KendaraanPesanan $kendaraan): array {
                return [
                    'id_kendaraan_pesanan' => (int) $kendaraan->id_kendaraan_pesanan,
                    'id_kategori_kendaraan' => (int) $kendaraan->id_kategori_kendaraan,
                    'nama_kategori_snapshot' => $kendaraan->nama_kategori_snapshot,
                    'plat_nomor' => $kendaraan->plat_nomor,
                    'status_proses' => $kendaraan->status_proses,
                    'detail_layanan' => $kendaraan->detailLayanan->map(static function ($detail): array {
                        return [
                            'id_detail_layanan' => (int) $detail->id_detail_layanan,
                            'id_harga' => (int) $detail->id_harga,
                            'nama_layanan_snapshot' => $detail->nama_layanan_snapshot,
                            'tipe_layanan_snapshot' => $detail->tipe_layanan_snapshot,
                            'harga_dasar_snapshot' => (string) $detail->harga_dasar_snapshot,
                            'harga_akhir' => (string) $detail->harga_akhir,
                            'alasan_penyesuaian' => $detail->alasan_penyesuaian,
                        ];
                    })->values()->all(),
                ];
            })->values()->all(),
        ];
    }

    /**
     * Compute order totals split by service type alongside the grand total.
     *
     * @return array{subtotal_utama: float|int, subtotal_tambahan: float|int, total_harga: float|int}
     */
    private function calculateOrderTotals(Pesanan $pesanan): array
    {
        $subtotalUtama = 0.0;
        $subtotalTambahan = 0.0;

        foreach ($pesanan->kendaraan as $kendaraan) {
            foreach ($kendaraan->detailLayanan as $detail) {
                $amount = (float) $detail->harga_akhir;
                $tipe = $detail->tipe_layanan_snapshot
                    ?? $detail->hargaLayanan?->layanan?->tipe_layanan
                    ?? Layanan::TIPE_UTAMA;

                if ($tipe === Layanan::TIPE_TAMBAHAN) {
                    $subtotalTambahan += $amount;
                } else {
                    $subtotalUtama += $amount;
                }
            }
        }

        return [
            'subtotal_utama' => $this->normalizeMoneyAmount($subtotalUtama),
            'subtotal_tambahan' => $this->normalizeMoneyAmount($subtotalTambahan),
            'total_harga' => $this->normalizeMoneyAmount($subtotalUtama + $subtotalTambahan),
        ];
    }

    private function normalizeMoneyAmount(float $amount): float|int
    {
        $rounded = round($amount, 2);

        if (abs($rounded - round($rounded)) < 0.00001) {
            return (int) round($rounded);
        }

        return $rounded;
    }
}
