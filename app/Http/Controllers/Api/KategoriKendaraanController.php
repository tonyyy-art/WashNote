<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KategoriKendaraan;
use App\Services\Audit\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class KategoriKendaraanController extends Controller
{
    public function __construct(
        private readonly AuditLogService $auditLog,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => KategoriKendaraan::orderBy('id_kategori_kendaraan')->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'jenis_kendaraan' => ['required', 'string', 'max:100'],
            'nama_kategori' => [
                'required',
                'string',
                'max:100',
                Rule::unique('kategori_kendaraan')
                    ->where('jenis_kendaraan', $request->jenis_kendaraan),
            ],
            'status_aktif' => ['sometimes', 'boolean'],
        ]);

        $kategori = DB::transaction(function () use ($request, $validated): KategoriKendaraan {
            $created = KategoriKendaraan::query()->create([
                'jenis_kendaraan' => trim((string) $validated['jenis_kendaraan']),
                'nama_kategori' => trim((string) $validated['nama_kategori']),
                'status_aktif' => (bool) ($validated['status_aktif'] ?? true),
            ]);

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'kategori_kendaraan',
                recordId: $created->id_kategori_kendaraan,
                before: null,
                after: $created->toArray(),
                reason: 'Penambahan kategori kendaraan',
            );

            return $created;
        });

        return response()->json([
            'success' => true,
            'message' => 'Kategori kendaraan berhasil ditambahkan.',
            'data' => $kategori,
        ], 201);
    }

    public function show(KategoriKendaraan $kategoriKendaraan): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $kategoriKendaraan,
        ]);
    }

    public function update(Request $request, KategoriKendaraan $kategoriKendaraan): JsonResponse
    {
        $validated = $request->validate([
            'jenis_kendaraan' => ['required', 'string', 'max:100'],
            'nama_kategori' => [
                'required',
                'string',
                'max:100',
                Rule::unique('kategori_kendaraan')
                    ->where('jenis_kendaraan', $request->jenis_kendaraan)
                    ->ignore(
                        $kategoriKendaraan->id_kategori_kendaraan,
                        'id_kategori_kendaraan'
                    ),
            ],
            'status_aktif' => ['required', 'boolean'],
        ]);

        $updated = DB::transaction(function () use ($request, $kategoriKendaraan, $validated): KategoriKendaraan {
            /** @var KategoriKendaraan $locked */
            $locked = KategoriKendaraan::query()
                ->where('id_kategori_kendaraan', $kategoriKendaraan->id_kategori_kendaraan)
                ->lockForUpdate()
                ->firstOrFail();

            $sebelum = $locked->toArray();

            $locked->update([
                'jenis_kendaraan' => trim((string) $validated['jenis_kendaraan']),
                'nama_kategori' => trim((string) $validated['nama_kategori']),
                'status_aktif' => (bool) $validated['status_aktif'],
            ]);

            $fresh = $locked->fresh();

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'kategori_kendaraan',
                recordId: $locked->id_kategori_kendaraan,
                before: $sebelum,
                after: $fresh->toArray(),
                reason: 'Pembaruan kategori kendaraan',
            );

            return $fresh;
        });

        return response()->json([
            'success' => true,
            'message' => 'Kategori kendaraan berhasil diperbarui.',
            'data' => $updated,
        ]);
    }

    public function destroy(Request $request, KategoriKendaraan $kategoriKendaraan): JsonResponse
    {
        DB::transaction(function () use ($request, $kategoriKendaraan): void {
            /** @var KategoriKendaraan $locked */
            $locked = KategoriKendaraan::query()
                ->where('id_kategori_kendaraan', $kategoriKendaraan->id_kategori_kendaraan)
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
                entity: 'kategori_kendaraan',
                recordId: $locked->id_kategori_kendaraan,
                before: $sebelum,
                after: [
                    'status_aktif' => false,
                ],
                reason: 'Penonaktifan kategori kendaraan',
            );
        });

        return response()->json([
            'success' => true,
            'message' => 'Kategori kendaraan berhasil dinonaktifkan.',
        ]);
    }
}
