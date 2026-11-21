<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RiwayatPerubahan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiwayatPerubahanController extends Controller
{
    /**
     * List append-only audit trail entries with optional entity/record/actor filtering.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'entitas' => ['sometimes', 'nullable', 'string', 'max:60'],
            'record_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'id_pengguna' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = RiwayatPerubahan::with('pengguna:id_pengguna,nama_lengkap,username,peran');

        if (! empty($validated['entitas'])) {
            $query->where('entitas', trim((string) $validated['entitas']));
        }

        if (isset($validated['record_id'])) {
            $query->where('record_id', (int) $validated['record_id']);
        }

        if (isset($validated['id_pengguna'])) {
            $query->where('id_pengguna', (int) $validated['id_pengguna']);
        }

        $perPage = (int) ($validated['per_page'] ?? 10);

        $riwayat = $query
            ->latest('waktu_perubahan')
            ->orderByDesc('id_riwayat')
            ->paginate($perPage);

        return response()->json([
            'message' => 'Data riwayat perubahan berhasil diambil',
            'data' => $riwayat,
        ]);
    }
}
