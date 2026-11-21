<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HargaLayanan;
use App\Models\KategoriKendaraan;
use App\Models\Layanan;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

class CatalogController extends Controller
{
    /**
     * Return active vehicle categories, services, and tariffs for operational order entry (Kasir & Owner).
     */
    public function index(): JsonResponse
    {
        $kategori = KategoriKendaraan::query()
            ->where('status_aktif', true)
            ->orderBy('id_kategori_kendaraan')
            ->get();

        $layanan = Layanan::query()
            ->where('status_aktif', true)
            ->orderBy('tipe_layanan')
            ->orderBy('id_layanan')
            ->get();

        $hargaLayanan = HargaLayanan::with([
            'layanan',
            'kategoriKendaraan',
        ])
            ->where('status_aktif', true)
            ->whereHas('layanan', static function (Builder $query): void {
                $query->where('status_aktif', true);
            })
            ->whereHas('kategoriKendaraan', static function (Builder $query): void {
                $query->where('status_aktif', true);
            })
            ->orderBy('id_kategori_kendaraan')
            ->orderBy('id_layanan')
            ->get();

        return response()->json([
            'success' => true,
            'data' => [
                'kategori_kendaraan' => $kategori,
                'layanan' => $layanan,
                'harga_layanan' => $hargaLayanan,
            ],
        ]);
    }
}
