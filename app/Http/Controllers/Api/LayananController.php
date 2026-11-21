<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Layanan;
use App\Services\Audit\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class LayananController extends Controller
{
    public function __construct(
        private readonly AuditLogService $auditLog,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->normalizeTipeLayanan($request);
        $this->normalizeBooleanFilter($request, 'status_aktif');

        $validated = $request->validate([
            'tipe_layanan' => ['sometimes', 'nullable', 'string', 'in:utama,tambahan'],
            'status_aktif' => ['sometimes', 'nullable', 'boolean'],
        ]);

        $query = Layanan::with('hargaLayanan');

        if (isset($validated['tipe_layanan']) && $validated['tipe_layanan'] !== null) {
            $query->where('tipe_layanan', $validated['tipe_layanan']);
        }

        if (array_key_exists('status_aktif', $validated) && $validated['status_aktif'] !== null) {
            $query->where('status_aktif', (bool) $validated['status_aktif']);
        }

        return response()->json([
            'success' => true,
            'data' => $query->orderBy('id_layanan')->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->normalizeTipeLayanan($request);

        $validated = $request->validate([
            'nama_layanan' => ['required', 'string', 'max:150', 'unique:layanan,nama_layanan'],
            'tipe_layanan' => ['sometimes', 'string', 'in:utama,tambahan'],
            'deskripsi' => ['nullable', 'string'],
            'status_aktif' => ['sometimes', 'boolean'],
        ]);

        $layanan = DB::transaction(function () use ($request, $validated): Layanan {
            $created = Layanan::query()->create([
                'nama_layanan' => trim((string) $validated['nama_layanan']),
                'tipe_layanan' => $validated['tipe_layanan'] ?? Layanan::TIPE_UTAMA,
                'deskripsi' => $validated['deskripsi'] ?? null,
                'status_aktif' => (bool) ($validated['status_aktif'] ?? true),
            ]);

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'layanan',
                recordId: $created->id_layanan,
                before: null,
                after: $created->fresh()->toArray(),
                reason: 'Penambahan layanan',
            );

            return $created->fresh();
        });

        return response()->json([
            'success' => true,
            'message' => 'Layanan berhasil ditambahkan.',
            'data' => $layanan,
        ], 201);
    }

    public function show(Layanan $layanan): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $layanan->load('hargaLayanan'),
        ]);
    }

    public function update(Request $request, Layanan $layanan): JsonResponse
    {
        $this->normalizeTipeLayanan($request);

        $validated = $request->validate([
            'nama_layanan' => [
                'required',
                'string',
                'max:150',
                Rule::unique('layanan', 'nama_layanan')
                    ->ignore($layanan->id_layanan, 'id_layanan'),
            ],
            'tipe_layanan' => ['sometimes', 'string', 'in:utama,tambahan'],
            'deskripsi' => ['nullable', 'string'],
            'status_aktif' => ['required', 'boolean'],
        ]);

        $updated = DB::transaction(function () use ($request, $layanan, $validated): Layanan {
            /** @var Layanan $locked */
            $locked = Layanan::query()
                ->where('id_layanan', $layanan->id_layanan)
                ->lockForUpdate()
                ->firstOrFail();

            $sebelum = $locked->toArray();

            $locked->update([
                'nama_layanan' => trim((string) $validated['nama_layanan']),
                'tipe_layanan' => $validated['tipe_layanan'] ?? $locked->tipe_layanan ?? Layanan::TIPE_UTAMA,
                'deskripsi' => $validated['deskripsi'] ?? null,
                'status_aktif' => (bool) $validated['status_aktif'],
            ]);

            $fresh = $locked->fresh();

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'layanan',
                recordId: $locked->id_layanan,
                before: $sebelum,
                after: $fresh->toArray(),
                reason: 'Pembaruan layanan',
            );

            return $fresh;
        });

        return response()->json([
            'success' => true,
            'message' => 'Layanan berhasil diperbarui.',
            'data' => $updated,
        ]);
    }

    public function destroy(Request $request, Layanan $layanan): JsonResponse
    {
        DB::transaction(function () use ($request, $layanan): void {
            /** @var Layanan $locked */
            $locked = Layanan::query()
                ->where('id_layanan', $layanan->id_layanan)
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
                entity: 'layanan',
                recordId: $locked->id_layanan,
                before: $sebelum,
                after: [
                    'status_aktif' => false,
                ],
                reason: 'Penonaktifan layanan',
            );
        });

        return response()->json([
            'success' => true,
            'message' => 'Layanan berhasil dinonaktifkan.',
        ]);
    }

    private function normalizeTipeLayanan(Request $request): void
    {
        if ($request->has('tipe_layanan') && is_string($request->input('tipe_layanan'))) {
            $request->merge([
                'tipe_layanan' => mb_strtolower(trim($request->input('tipe_layanan'))),
            ]);
        }
    }

    private function normalizeBooleanFilter(Request $request, string $field): void
    {
        $value = $request->input($field);

        if (! is_string($value)) {
            return;
        }

        $normalized = mb_strtolower(trim($value));

        if ($normalized === 'true') {
            $request->merge([$field => true]);
        } elseif ($normalized === 'false') {
            $request->merge([$field => false]);
        }
    }
}
