<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class LaporanController extends Controller
{
    // Ringkasan laporan berdasarkan rentang tanggal
    public function index(Request $request)
    {
        $validated = $request->validate([
            'tanggal_mulai' => 'required|date',
            'tanggal_akhir' => 'required|date|after_or_equal:tanggal_mulai',
        ]);

        $mulai = Carbon::parse($validated['tanggal_mulai'])
            ->startOfDay();

        $akhir = Carbon::parse($validated['tanggal_akhir'])
            ->endOfDay();

        // Menghitung pendapatan
        $pendapatan = DB::table('pembayaran')
            ->join(
                'pesanan',
                'pembayaran.id_pesanan',
                '=',
                'pesanan.id_pesanan'
            )
            ->where('pembayaran.status_pembayaran', 'sudah_dibayar')
            ->where('pesanan.status_pesanan', '!=', 'dibatalkan')
            ->whereBetween(
                'pembayaran.waktu_penerimaan',
                [$mulai, $akhir]
            )
            ->sum('pembayaran.jumlah_dibayar');

        // Menghitung jumlah kendaraan
        $jumlahKendaraan = DB::table('kendaraan_pesanan')
            ->join(
                'pesanan',
                'kendaraan_pesanan.id_pesanan',
                '=',
                'pesanan.id_pesanan'
            )
            ->where('pesanan.status_pesanan', '!=', 'dibatalkan')
            ->whereBetween(
                'pesanan.waktu_pesanan',
                [$mulai, $akhir]
            )
            ->count('kendaraan_pesanan.id_kendaraan_pesanan');

        // Menghitung total pengeluaran
        $pengeluaran = DB::table('pengeluaran')
            ->where('status_pengeluaran', 'aktif')
            ->whereBetween(
                'tanggal_pengeluaran',
                [
                    $mulai->toDateString(),
                    $akhir->toDateString()
                ]
            )
            ->sum('nominal');

        // Menghitung keuntungan bersih
        $keuntunganBersih = $pendapatan - $pengeluaran;

        return response()->json([
            'message' => 'Laporan berhasil diambil.',
            'periode' => [
                'tanggal_mulai' => $mulai->toDateString(),
                'tanggal_akhir' => $akhir->toDateString(),
            ],
            'data' => [
                'total_pendapatan' => (float) $pendapatan,
                'jumlah_kendaraan' => $jumlahKendaraan,
                'total_pengeluaran' => (float) $pengeluaran,
                'keuntungan_bersih' => (float) $keuntunganBersih,
            ]
        ]);
    }

    // Laporan harian dalam rentang tanggal
    public function daily(Request $request)
    {
        $validated = $request->validate([
            'tanggal_mulai' => 'required|date',
            'tanggal_akhir' => 'required|date|after_or_equal:tanggal_mulai',
        ]);

        $mulai = Carbon::parse($validated['tanggal_mulai'])
            ->startOfDay();

        $akhir = Carbon::parse($validated['tanggal_akhir'])
            ->endOfDay();

        $tanggalMulai = $mulai->toDateString();
        $tanggalAkhir = $akhir->toDateString();

        // Pendapatan per tanggal penerimaan pembayaran
        $pendapatanHarian = DB::table('pembayaran')
            ->join(
                'pesanan',
                'pembayaran.id_pesanan',
                '=',
                'pesanan.id_pesanan'
            )
            ->where('pembayaran.status_pembayaran', 'sudah_dibayar')
            ->where('pesanan.status_pesanan', '!=', 'dibatalkan')
            ->whereBetween(
                'pembayaran.waktu_penerimaan',
                [$mulai, $akhir]
            )
            ->selectRaw(
                'DATE(pembayaran.waktu_penerimaan) as tanggal,
                SUM(pembayaran.jumlah_dibayar) as pendapatan'
            )
            ->groupByRaw('DATE(pembayaran.waktu_penerimaan)')
            ->get()
            ->keyBy('tanggal');

        // Pengeluaran per tanggal
        $pengeluaranHarian = DB::table('pengeluaran')
            ->where('status_pengeluaran', 'aktif')
            ->whereBetween(
                'tanggal_pengeluaran',
                [$tanggalMulai, $tanggalAkhir]
            )
            ->selectRaw(
                'tanggal_pengeluaran as tanggal,
                SUM(nominal) as pengeluaran'
            )
            ->groupBy('tanggal_pengeluaran')
            ->get()
            ->keyBy('tanggal');

        // Jumlah kendaraan per tanggal pesanan
        $kendaraanHarian = DB::table('kendaraan_pesanan')
            ->join(
                'pesanan',
                'kendaraan_pesanan.id_pesanan',
                '=',
                'pesanan.id_pesanan'
            )
            ->where('pesanan.status_pesanan', '!=', 'dibatalkan')
            ->whereBetween(
                'pesanan.waktu_pesanan',
                [$mulai, $akhir]
            )
            ->selectRaw(
                'DATE(pesanan.waktu_pesanan) as tanggal,
                COUNT(kendaraan_pesanan.id_kendaraan_pesanan) as jumlah'
            )
            ->groupByRaw('DATE(pesanan.waktu_pesanan)')
            ->get()
            ->keyBy('tanggal');

        $hasil = [];

        $tanggal = $mulai->copy();

        while ($tanggal->lte($akhir)) {
            $key = $tanggal->toDateString();

            $pendapatan = (float) (
                $pendapatanHarian[$key]->pendapatan ?? 0
            );

            $pengeluaran = (float) (
                $pengeluaranHarian[$key]->pengeluaran ?? 0
            );

            $jumlahKendaraan = (int) (
                $kendaraanHarian[$key]->jumlah ?? 0
            );

            $hasil[] = [
                'tanggal' => $key,
                'pendapatan' => $pendapatan,
                'jumlah_kendaraan' => $jumlahKendaraan,
                'pengeluaran' => $pengeluaran,
                'keuntungan_bersih' => $pendapatan - $pengeluaran,
            ];

            $tanggal->addDay();
        }

        return response()->json([
            'message' => 'Laporan harian berhasil diambil.',
            'data' => $hasil,
        ]);
    }
}
