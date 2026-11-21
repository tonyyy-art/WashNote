<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Layanan;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LayananController extends Controller
{
    public function index()
    {
        return response()->json([
            'success' => true,
            'data' => Layanan::with('hargaLayanan')->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'nama_layanan' => 'required|string|max:150|unique:layanan,nama_layanan',
            'deskripsi' => 'nullable|string',
            'status_aktif' => 'sometimes|boolean',
        ]);

        $layanan = Layanan::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Layanan berhasil ditambahkan.',
            'data' => $layanan,
        ], 201);
    }

    public function show(Layanan $layanan)
    {
        return response()->json([
            'success' => true,
            'data' => $layanan->load('hargaLayanan'),
        ]);
    }

    public function update(Request $request, Layanan $layanan)
    {
        $validated = $request->validate([
            'nama_layanan' => [
                'required',
                'string',
                'max:150',
                Rule::unique('layanan', 'nama_layanan')
                    ->ignore($layanan->id_layanan, 'id_layanan'),
            ],
            'deskripsi' => 'nullable|string',
            'status_aktif' => 'required|boolean',
        ]);

        $layanan->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Layanan berhasil diperbarui.',
            'data' => $layanan,
        ]);
    }

    public function destroy(Layanan $layanan)
    {
        // Nonaktifkan, bukan menghapus permanen.
        $layanan->update([
            'status_aktif' => false,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Layanan berhasil dinonaktifkan.',
        ]);
    }
}
