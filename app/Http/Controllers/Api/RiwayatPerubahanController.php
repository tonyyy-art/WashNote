<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RiwayatPerubahan;
use Illuminate\Http\Request;

class RiwayatPerubahanController extends Controller
{
    public function index(Request $request)
    {
        $riwayat = RiwayatPerubahan::with('pengguna:id_pengguna,nama_lengkap')
            ->latest('waktu_perubahan')
            ->paginate(10);

        return response()->json([
            'message' => 'Data riwayat perubahan berhasil diambil',
            'data' => $riwayat,
        ]);
    }
}
