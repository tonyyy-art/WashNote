<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HargaLayanan;
use App\Services\Audit\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class HargaLayananController extends Controller
{
    public function __construct(
        private readonly AuditLogService $auditLog,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => HargaLayanan::with([
                'layanan',
                'kategoriKendaraan',
            ])->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id_layanan' => ['required', 'exists:layanan,id_layanan'],
            'id_kategori_kendaraan' => ['required', 'exists:kategori_kendaraan,id_kategori_kendaraan'],
            'harga_dasar' => ['required', 'numeric', 'min:0'],
            'batas_bawah' => ['required', 'numeric', 'min:0'],
            'batas_atas' => ['required', 'numeric', 'min:0'],
            'status_aktif' => ['sometimes', 'boolean'],
        ]);

        $this->validatePriceBounds($validated);

        $statusAktif = (bool) ($validated['status_aktif'] ?? true);

        $harga = DB::transaction(function () use ($request, $validated, $statusAktif): HargaLayanan {
            if ($statusAktif) {
                $activeExists = HargaLayanan::query()
                    ->where('id_layanan', $validated['id_layanan'])
                    ->where('id_kategori_kendaraan', $validated['id_kategori_kendaraan'])
                    ->where('status_aktif', true)
                    ->lockForUpdate()
                    ->exists();

                if ($activeExists) {
                    throw ValidationException::withMessages([
                        'id_layanan' => ['Harga layanan aktif untuk layanan dan kategori kendaraan tersebut sudah ada.'],
                    ]);
                }
            }

            $created = HargaLayanan::query()->create([
                ...$validated,
                'status_aktif' => $statusAktif,
            ]);

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'harga_layanan',
                recordId: $created->id_harga,
                before: null,
                after: $created->toArray(),
                reason: 'Penambahan tarif harga layanan',
            );

            return $created;
        });

        return response()->json([
            'success' => true,
            'message' => 'Harga layanan berhasil ditambahkan.',
            'data' => $harga->load(['layanan', 'kategoriKendaraan']),
        ], 201);
    }

    public function show(HargaLayanan $hargaLayanan): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $hargaLayanan->load([
                'layanan',
                'kategoriKendaraan',
            ]),
        ]);
    }

    public function update(Request $request, HargaLayanan $hargaLayanan): JsonResponse
    {
        $validated = $request->validate([
            'id_layanan' => ['required', 'exists:layanan,id_layanan'],
            'id_kategori_kendaraan' => ['required', 'exists:kategori_kendaraan,id_kategori_kendaraan'],
            'harga_dasar' => ['required', 'numeric', 'min:0'],
            'batas_bawah' => ['required', 'numeric', 'min:0'],
            'batas_atas' => ['required', 'numeric', 'min:0'],
            'status_aktif' => ['required', 'boolean'],
        ]);

        $this->validatePriceBounds($validated);

        $updated = DB::transaction(function () use ($request, $hargaLayanan, $validated): HargaLayanan {
            /** @var HargaLayanan $locked */
            $locked = HargaLayanan::query()
                ->where('id_harga', $hargaLayanan->id_harga)
                ->lockForUpdate()
                ->firstOrFail();

            if ((bool) $validated['status_aktif']) {
                $activeConflict = HargaLayanan::query()
                    ->where('id_layanan', $validated['id_layanan'])
                    ->where('id_kategori_kendaraan', $validated['id_kategori_kendaraan'])
                    ->where('status_aktif', true)
                    ->where('id_harga', '!=', $locked->id_harga)
                    ->lockForUpdate()
                    ->exists();

                if ($activeConflict) {
                    throw ValidationException::withMessages([
                        'status_aktif' => ['Sudah ada harga layanan aktif lain untuk layanan dan kategori kendaraan tersebut.'],
                    ]);
                }
            }

            $sebelum = $locked->toArray();

            $locked->update($validated);
            $fresh = $locked->fresh();

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'harga_layanan',
                recordId: $locked->id_harga,
                before: $sebelum,
                after: $fresh->toArray(),
                reason: 'Pembaruan tarif harga layanan',
            );

            return $fresh;
        });

        return response()->json([
            'success' => true,
            'message' => 'Harga layanan berhasil diperbarui.',
            'data' => $updated->load([
                'layanan',
                'kategoriKendaraan',
            ]),
        ]);
    }

    public function destroy(Request $request, HargaLayanan $hargaLayanan): JsonResponse
    {
        DB::transaction(function () use ($request, $hargaLayanan): void {
            /** @var HargaLayanan $locked */
            $locked = HargaLayanan::query()
                ->where('id_harga', $hargaLayanan->id_harga)
                ->lockForUpdate()
                ->firstOrFail();

            $sebelum = [
                'status_aktif' => $locked->status_aktif,
            ];

            $locked->update([
                'status_aktif' => false,
            ]);

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'harga_layanan',
                recordId: $locked->id_harga,
                before: $sebelum,
                after: [
                    'status_aktif' => false,
                ],
                reason: 'Penonaktifan tarif harga layanan',
            );
        });

        return response()->json([
            'success' => true,
            'message' => 'Harga layanan berhasil dinonaktifkan.',
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function validatePriceBounds(array $data): void
    {
        $batasBawah = (float) $data['batas_bawah'];
        $hargaDasar = (float) $data['harga_dasar'];
        $batasAtas = (float) $data['batas_atas'];

        if ($batasBawah > $hargaDasar || $hargaDasar > $batasAtas) {
            throw ValidationException::withMessages([
                'harga_dasar' => ['Harga dasar harus berada di antara batas bawah dan batas atas.'],
            ]);
        }
    }
}
