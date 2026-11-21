<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pesanan;
use App\Models\Pembayaran;
use App\Models\RiwayatPerubahan;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PembayaranController extends Controller
{
    // Melihat pembayaran berdasarkan pesanan
    public function show($id)
    {
        $pesanan = Pesanan::with('pembayaran')
            ->findOrFail($id);

        return response()->json([
            'message' => 'Data pembayaran berhasil diambil',
            'data' => $pesanan->pembayaran,
        ]);
    }

    // Mencatat pembayaran pesanan
    public function store(Request $request, $id)
    {
        $validated = $request->validate([
            'jumlah_dibayar' => 'required|numeric|min:0.01',
            'metode_pembayaran' => 'required|in:tunai,qris,transfer',
        ]);

        $pesanan = Pesanan::with('pembayaran')
            ->findOrFail($id);

        if ($pesanan->status_pesanan === 'dibatalkan') {
            return response()->json([
                'message' => 'Pesanan yang dibatalkan tidak dapat dibayar.',
            ], 422);
        }

        $pembayaran = $pesanan->pembayaran;

        if ($pembayaran->status_pembayaran === 'sudah_dibayar') {
            return response()->json([
                'message' => 'Pesanan sudah dibayar.',
            ], 422);
        }

        // Hitung total harga seluruh layanan
        $pesanan->load('kendaraan.detailLayanan');

        $total = $pesanan->kendaraan
            ->flatMap->detailLayanan
            ->sum('harga_akhir');

        if ((float) $validated['jumlah_dibayar'] < (float) $total) {
            return response()->json([
                'message' => 'Nominal pembayaran kurang dari total pesanan.',
                'total_pesanan' => $total,
            ], 422);
        }

        DB::transaction(function () use (
            $request,
            $pembayaran,
            $validated
        ) {
            $sebelum = [
                'status_pembayaran' => $pembayaran->status_pembayaran,
                'jumlah_dibayar' => $pembayaran->jumlah_dibayar,
            ];

            $pembayaran->update([
                'jumlah_dibayar' => $validated['jumlah_dibayar'],
                'metode_pembayaran' => $validated['metode_pembayaran'],
                'status_pembayaran' => 'sudah_dibayar',
                'waktu_penerimaan' => now(),
            ]);

            RiwayatPerubahan::create([
                'id_pengguna' => $request->user()->id_pengguna,
                'entitas' => 'pembayaran',
                'record_id' => $pembayaran->id_pembayaran,
                'waktu_perubahan' => now(),
                'nilai_sebelum' => $sebelum,
                'nilai_sesudah' => [
                    'jumlah_dibayar' => $pembayaran->jumlah_dibayar,
                    'metode_pembayaran' => $pembayaran->metode_pembayaran,
                    'status_pembayaran' => $pembayaran->status_pembayaran,
                    'waktu_penerimaan' => $pembayaran->waktu_penerimaan,
                ],
                'alasan' => 'Pencatatan pembayaran pesanan',
            ]);
        });

        return response()->json([
            'message' => 'Pembayaran berhasil dicatat.',
            'data' => $pembayaran->fresh(),
            'total_pesanan' => $total,
            'kembalian' => (float) $validated['jumlah_dibayar'] - (float) $total,
        ]);
    }
}
