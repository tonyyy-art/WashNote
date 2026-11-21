<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KategoriKendaraan;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class KategoriKendaraanController extends Controller
{
    public function index()
    {
        return response()->json([
            'success' => true,
            'data' => KategoriKendaraan::orderBy('id_kategori_kendaraan')
                ->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'jenis_kendaraan' => 'required|string|max:100',
            'nama_kategori' => [
                'required',
                'string',
                'max:100',
                Rule::unique('kategori_kendaraan')
                    ->where('jenis_kendaraan', $request->jenis_kendaraan),
            ],
            'status_aktif' => 'sometimes|boolean',
        ]);

        $kategori = KategoriKendaraan::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Kategori kendaraan berhasil ditambahkan.',
            'data' => $kategori,
        ], 201);
    }

    public function show(KategoriKendaraan $kategoriKendaraan)
    {
        return response()->json([
            'success' => true,
            'data' => $kategoriKendaraan,
        ]);
    }

    public function update(
        Request $request,
        KategoriKendaraan $kategoriKendaraan
    ) {
        $validated = $request->validate([
            'jenis_kendaraan' => 'required|string|max:100',
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
            'status_aktif' => 'required|boolean',
        ]);

        $kategoriKendaraan->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Kategori kendaraan berhasil diperbarui.',
            'data' => $kategoriKendaraan,
        ]);
    }

    public function destroy(KategoriKendaraan $kategoriKendaraan)
    {
        // Nonaktifkan agar data historis tetap aman.
        $kategoriKendaraan->update([
            'status_aktif' => false,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Kategori kendaraan berhasil dinonaktifkan.',
        ]);
    }
}
