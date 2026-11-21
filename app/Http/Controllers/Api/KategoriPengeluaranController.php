<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KategoriPengeluaran;
use App\Services\Audit\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class KategoriPengeluaranController extends Controller
{
    public function __construct(
        private readonly AuditLogService $auditLog,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'data' => KategoriPengeluaran::query()
                ->latest()
                ->orderByDesc('id_kategori_pengeluaran')
                ->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'nama_kategori' => ['required', 'string', 'max:255', 'unique:kategori_pengeluaran,nama_kategori'],
            'status_aktif' => ['sometimes', 'boolean'],
        ]);

        $kategori = DB::transaction(function () use ($request, $validated): KategoriPengeluaran {
            $created = KategoriPengeluaran::query()->create([
                'nama_kategori' => trim((string) $validated['nama_kategori']),
                'status_aktif' => (bool) ($validated['status_aktif'] ?? true),
            ]);

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'kategori_pengeluaran',
                recordId: $created->id_kategori_pengeluaran,
                before: null,
                after: $created->toArray(),
                reason: 'Penambahan kategori pengeluaran',
            );

            return $created;
        });

        return response()->json([
            'message' => 'Kategori berhasil ditambahkan.',
            'data' => $kategori,
        ], 201);
    }

    public function show(int|string $id): JsonResponse
    {
        $kategori = KategoriPengeluaran::query()->findOrFail($id);

        return response()->json([
            'data' => $kategori,
        ]);
    }

    public function update(Request $request, int|string $id): JsonResponse
    {
        $kategori = KategoriPengeluaran::query()->findOrFail($id);

        $validated = $request->validate([
            'nama_kategori' => [
                'required',
                'string',
                'max:255',
                Rule::unique('kategori_pengeluaran', 'nama_kategori')
                    ->ignore($kategori->id_kategori_pengeluaran, 'id_kategori_pengeluaran'),
            ],
            'status_aktif' => ['sometimes', 'boolean'],
        ]);

        $updated = DB::transaction(function () use ($request, $id, $validated): KategoriPengeluaran {
            /** @var KategoriPengeluaran $locked */
            $locked = KategoriPengeluaran::query()
                ->where('id_kategori_pengeluaran', $id)
                ->lockForUpdate()
                ->firstOrFail();

            $sebelum = $locked->toArray();

            $payload = [
                'nama_kategori' => trim((string) $validated['nama_kategori']),
            ];

            if (array_key_exists('status_aktif', $validated)) {
                $payload['status_aktif'] = (bool) $validated['status_aktif'];
            }

            $locked->update($payload);
            $fresh = $locked->fresh();

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'kategori_pengeluaran',
                recordId: $locked->id_kategori_pengeluaran,
                before: $sebelum,
                after: $fresh->toArray(),
                reason: 'Pembaruan kategori pengeluaran',
            );

            return $fresh;
        });

        return response()->json([
            'message' => 'Kategori berhasil diperbarui.',
            'data' => $updated,
        ]);
    }

    public function destroy(Request $request, int|string $id): JsonResponse
    {
        DB::transaction(function () use ($request, $id): void {
            /** @var KategoriPengeluaran $locked */
            $locked = KategoriPengeluaran::query()
                ->where('id_kategori_pengeluaran', $id)
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
                entity: 'kategori_pengeluaran',
                recordId: $locked->id_kategori_pengeluaran,
                before: $sebelum,
                after: [
                    'status_aktif' => false,
                ],
                reason: 'Penonaktifan kategori pengeluaran',
            );
        });

        return response()->json([
            'message' => 'Kategori berhasil dinonaktifkan.',
        ]);
    }
}
