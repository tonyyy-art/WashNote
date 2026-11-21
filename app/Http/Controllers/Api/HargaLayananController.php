<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HargaLayanan;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Validator;

class HargaLayananController extends Controller
{
    public function index()
    {
        return response()->json([
            'success' => true,
            'data' => HargaLayanan::with([
                'layanan',
                'kategoriKendaraan'
            ])->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'id_layanan' => 'required|exists:layanan,id_layanan',
            'id_kategori_kendaraan' => 'required|exists:kategori_kendaraan,id_kategori_kendaraan',
            'harga_dasar' => 'required|numeric|min:0',
            'batas_bawah' => 'required|numeric|min:0',
            'batas_atas' => 'required|numeric|min:0',
            'status_aktif' => 'sometimes|boolean',
        ]);

        $this->validatePriceBounds($validated);

        $harga = HargaLayanan::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Harga layanan berhasil ditambahkan.',
            'data' => $harga->load(['layanan', 'kategoriKendaraan']),
        ], 201);
    }

    public function show(HargaLayanan $hargaLayanan)
    {
        return response()->json([
            'success' => true,
            'data' => $hargaLayanan->load([
                'layanan',
                'kategoriKendaraan'
            ]),
        ]);
    }

    public function update(Request $request, HargaLayanan $hargaLayanan)
    {
        $validated = $request->validate([
            'id_layanan' => 'required|exists:layanan,id_layanan',
            'id_kategori_kendaraan' => 'required|exists:kategori_kendaraan,id_kategori_kendaraan',
            'harga_dasar' => 'required|numeric|min:0',
            'batas_bawah' => 'required|numeric|min:0',
            'batas_atas' => 'required|numeric|min:0',
            'status_aktif' => 'required|boolean',
        ]);

        $this->validatePriceBounds($validated);

        $hargaLayanan->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Harga layanan berhasil diperbarui.',
            'data' => $hargaLayanan->load([
                'layanan',
                'kategoriKendaraan'
            ]),
        ]);
    }

    public function destroy(HargaLayanan $hargaLayanan)
    {
        $hargaLayanan->update([
            'status_aktif' => false,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Harga layanan berhasil dinonaktifkan.',
        ]);
    }

    private function validatePriceBounds(array $data): void
    {
        if (
            $data['batas_bawah'] > $data['harga_dasar'] ||
            $data['harga_dasar'] > $data['batas_atas']
        ) {
            abort(response()->json([
                'success' => false,
                'message' => 'Harga dasar harus berada di antara batas bawah dan batas atas.',
            ], 422));
        }
    }
}
