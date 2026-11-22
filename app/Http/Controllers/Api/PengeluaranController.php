<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KategoriPengeluaran;
use App\Models\Pengeluaran;
use App\Services\Audit\AuditLogService;
use App\Services\Idempotency\IdempotencyService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PengeluaranController extends Controller
{
    public function __construct(
        private readonly AuditLogService $auditLog,
        private readonly IdempotencyService $idempotency,
    ) {}

    public function index(): JsonResponse
    {
        $data = Pengeluaran::with([
            'pengguna:id_pengguna,nama_lengkap',
            'kategori',
        ])->latest()->orderByDesc('id_pengeluaran')->paginate(10);

        return response()->json([
            'data' => $data,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $key = $this->idempotency->extractKey($request);

        $validated = $request->validate([
            'id_kategori_pengeluaran' => ['required', 'exists:kategori_pengeluaran,id_kategori_pengeluaran'],
            'tanggal_pengeluaran' => ['required', 'date'],
            'deskripsi' => ['required', 'string'],
            'nominal' => ['required', 'numeric', 'min:0.01'],
        ]);

        $callerId = (int) $request->user()->id_pengguna;
        $requestHash = $this->idempotency->hashPayload([
            'id_kategori_pengeluaran' => (int) $validated['id_kategori_pengeluaran'],
            'tanggal_pengeluaran' => (string) $validated['tanggal_pengeluaran'],
            'deskripsi' => trim((string) $validated['deskripsi']),
            'nominal' => round((float) $validated['nominal'], 2),
        ]);

        if ($key !== null) {
            $existingKey = $this->idempotency->findForUser(
                $callerId,
                IdempotencyService::SCOPE_CREATE_EXPENSE,
                $key,
            );

            if ($existingKey !== null) {
                if ($existingKey->request_hash !== $requestHash) {
                    return $this->idempotency->mismatchResponse();
                }

                return response()->json($existingKey->response_body, 200);
            }
        }

        $kategori = KategoriPengeluaran::query()->findOrFail(
            $validated['id_kategori_pengeluaran']
        );

        if (! $kategori->status_aktif) {
            return response()->json([
                'message' => 'Kategori pengeluaran tidak aktif.',
            ], 422);
        }

        try {
            $responsePayload = DB::transaction(function () use ($validated, $key, $callerId, $requestHash): array {
                $created = Pengeluaran::query()->create([
                    'id_kategori_pengeluaran' => $validated['id_kategori_pengeluaran'],
                    'tanggal_pengeluaran' => $validated['tanggal_pengeluaran'],
                    'deskripsi' => trim((string) $validated['deskripsi']),
                    'nominal' => $validated['nominal'],
                    'id_pengguna' => $callerId,
                    'status_pengeluaran' => 'aktif',
                ]);

                $this->auditLog->record(
                    actorUserId: $callerId,
                    entity: 'pengeluaran',
                    recordId: $created->id_pengeluaran,
                    before: null,
                    after: $created->toArray(),
                    reason: 'Pencatatan pengeluaran baru',
                );

                $payload = [
                    'message' => 'Pengeluaran berhasil ditambahkan.',
                    'data' => $created->toArray(),
                ];

                if ($key !== null) {
                    $this->idempotency->storeRecord(
                        userId: $callerId,
                        scope: IdempotencyService::SCOPE_CREATE_EXPENSE,
                        key: $key,
                        requestHash: $requestHash,
                        responseStatus: 201,
                        responseBody: $payload,
                    );
                }

                return $payload;
            });
        } catch (UniqueConstraintViolationException $e) {
            if ($key !== null) {
                $existingKey = $this->idempotency->findForUser(
                    $callerId,
                    IdempotencyService::SCOPE_CREATE_EXPENSE,
                    $key,
                );

                if ($existingKey !== null) {
                    if ($existingKey->request_hash !== $requestHash) {
                        return $this->idempotency->mismatchResponse();
                    }

                    return response()->json($existingKey->response_body, 200);
                }
            }

            throw $e;
        }

        return response()->json($responsePayload, 201);
    }

    public function update(Request $request, int|string $id): JsonResponse
    {
        $validated = $request->validate([
            'id_kategori_pengeluaran' => ['required', 'exists:kategori_pengeluaran,id_kategori_pengeluaran'],
            'tanggal_pengeluaran' => ['required', 'date'],
            'deskripsi' => ['required', 'string'],
            'nominal' => ['required', 'numeric', 'min:0.01'],
            'alasan' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        $kategori = KategoriPengeluaran::query()->findOrFail(
            $validated['id_kategori_pengeluaran']
        );

        if (! $kategori->status_aktif) {
            return response()->json([
                'message' => 'Kategori pengeluaran tidak aktif.',
            ], 422);
        }

        $outcome = DB::transaction(function () use ($request, $id, $validated): array {
            /** @var Pengeluaran $pengeluaran */
            $pengeluaran = Pengeluaran::query()
                ->where('id_pengeluaran', $id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($pengeluaran->status_pengeluaran === 'dibatalkan') {
                return [
                    'error' => true,
                    'message' => 'Pengeluaran yang dibatalkan tidak dapat diedit.',
                ];
            }

            $sebelum = $pengeluaran->toArray();

            $pengeluaran->update([
                'id_kategori_pengeluaran' => $validated['id_kategori_pengeluaran'],
                'tanggal_pengeluaran' => $validated['tanggal_pengeluaran'],
                'deskripsi' => $validated['deskripsi'],
                'nominal' => $validated['nominal'],
            ]);

            $updated = $pengeluaran->fresh();

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'pengeluaran',
                recordId: $pengeluaran->id_pengeluaran,
                before: $sebelum,
                after: $updated->toArray(),
                reason: trim((string) $validated['alasan']),
            );

            return [
                'error' => false,
                'data' => $updated,
            ];
        });

        if ($outcome['error']) {
            return response()->json([
                'message' => $outcome['message'],
            ], 422);
        }

        return response()->json([
            'message' => 'Pengeluaran berhasil diperbarui.',
            'data' => $outcome['data'],
        ]);
    }

    public function cancel(Request $request, int|string $id): JsonResponse
    {
        $validated = $request->validate([
            'alasan' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        $outcome = DB::transaction(function () use ($request, $id, $validated): array {
            /** @var Pengeluaran $pengeluaran */
            $pengeluaran = Pengeluaran::query()
                ->where('id_pengeluaran', $id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($pengeluaran->status_pengeluaran === 'dibatalkan') {
                return [
                    'error' => true,
                    'message' => 'Pengeluaran sudah dibatalkan.',
                ];
            }

            $sebelum = [
                'status_pengeluaran' => $pengeluaran->status_pengeluaran,
            ];

            $pengeluaran->update([
                'status_pengeluaran' => 'dibatalkan',
            ]);

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'pengeluaran',
                recordId: $pengeluaran->id_pengeluaran,
                before: $sebelum,
                after: [
                    'status_pengeluaran' => 'dibatalkan',
                ],
                reason: trim((string) $validated['alasan']),
            );

            return [
                'error' => false,
                'data' => $pengeluaran->fresh(),
            ];
        });

        if ($outcome['error']) {
            return response()->json([
                'message' => $outcome['message'],
            ], 422);
        }

        return response()->json([
            'message' => 'Pengeluaran berhasil dibatalkan.',
            'data' => $outcome['data'],
        ]);
    }
}
