<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KategoriPengeluaran;
use Illuminate\Http\Request;

class KategoriPengeluaranController extends Controller
{
    public function index()
    {
        return response()->json([
            'data' => KategoriPengeluaran::latest()->get()
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'nama_kategori' => 'required|string|max:255|unique:kategori_pengeluaran,nama_kategori',
        ]);

        $kategori = KategoriPengeluaran::create([
            'nama_kategori' => $validated['nama_kategori'],
        ]);

        return response()->json([
            'message' => 'Kategori berhasil ditambahkan.',
            'data' => $kategori
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $kategori = KategoriPengeluaran::findOrFail($id);

        $validated = $request->validate([
            'nama_kategori' => 'required|string|max:255|unique:kategori_pengeluaran,nama_kategori,' . $id . ',id_kategori_pengeluaran',
        ]);

        $kategori->update($validated);

        return response()->json([
            'message' => 'Kategori berhasil diperbarui.',
            'data' => $kategori
        ]);
    }

    public function destroy($id)
    {
        $kategori = KategoriPengeluaran::findOrFail($id);

        $kategori->update([
            'status_aktif' => false
        ]);

        return response()->json([
            'message' => 'Kategori berhasil dinonaktifkan.'
        ]);
    }
}
