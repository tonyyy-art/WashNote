<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LaporanController extends Controller
{
    private const int MAX_DAILY_RANGE_DAYS = 366;

    /**
     * Summary financial report for a date range evaluated in `Asia/Jakarta`.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tanggal_mulai' => ['required', 'date'],
            'tanggal_akhir' => ['required', 'date', 'after_or_equal:tanggal_mulai'],
        ]);

        $businessTz = (string) config('washnote.business_timezone', 'Asia/Jakarta');
        $appTz = (string) config('app.timezone', 'Asia/Jakarta');

        $mulai = Carbon::parse($validated['tanggal_mulai'], $businessTz)->startOfDay();
        $akhir = Carbon::parse($validated['tanggal_akhir'], $businessTz)->endOfDay();

        $mulaiQuery = $mulai->copy()->timezone($appTz);
        $akhirExclusiveQuery = Carbon::parse($validated['tanggal_akhir'], $businessTz)
            ->addDay()
            ->startOfDay()
            ->timezone($appTz);

        $pendapatan = (float) DB::table('pembayaran')
            ->join('pesanan', 'pembayaran.id_pesanan', '=', 'pesanan.id_pesanan')
            ->where('pembayaran.status_pembayaran', 'sudah_dibayar')
            ->where('pesanan.status_pesanan', '!=', 'dibatalkan')
            ->where('pembayaran.waktu_penerimaan', '>=', $mulaiQuery)
            ->where('pembayaran.waktu_penerimaan', '<', $akhirExclusiveQuery)
            ->sum('pembayaran.jumlah_dibayar');

        $jumlahKendaraan = (int) DB::table('kendaraan_pesanan')
            ->join('pesanan', 'kendaraan_pesanan.id_pesanan', '=', 'pesanan.id_pesanan')
            ->where('pesanan.status_pesanan', '!=', 'dibatalkan')
            ->where('pesanan.waktu_pesanan', '>=', $mulaiQuery)
            ->where('pesanan.waktu_pesanan', '<', $akhirExclusiveQuery)
            ->count('kendaraan_pesanan.id_kendaraan_pesanan');

        $akhirExclusiveDate = Carbon::parse($validated['tanggal_akhir'], $businessTz)
            ->addDay()
            ->toDateString();

        $pengeluaran = (float) DB::table('pengeluaran')
            ->where('status_pengeluaran', 'aktif')
            ->where('tanggal_pengeluaran', '>=', $mulai->toDateString())
            ->where('tanggal_pengeluaran', '<', $akhirExclusiveDate)
            ->sum('nominal');

        $keuntunganBersih = round($pendapatan - $pengeluaran, 2);

        return response()->json([
            'message' => 'Laporan berhasil diambil.',
            'periode' => [
                'tanggal_mulai' => $mulai->toDateString(),
                'tanggal_akhir' => $akhir->toDateString(),
            ],
            'data' => [
                'total_pendapatan' => round($pendapatan, 2),
                'jumlah_kendaraan' => $jumlahKendaraan,
                'total_pengeluaran' => round($pengeluaran, 2),
                'keuntungan_bersih' => $keuntunganBersih,
            ],
        ]);
    }

    /**
     * Daily financial breakdown across a date range using bounded SQL-grouped aggregation.
     */
    public function daily(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tanggal_mulai' => ['required', 'date'],
            'tanggal_akhir' => ['required', 'date', 'after_or_equal:tanggal_mulai'],
        ]);

        $businessTz = (string) config('washnote.business_timezone', 'Asia/Jakarta');
        $appTz = (string) config('app.timezone', 'Asia/Jakarta');

        $mulai = Carbon::parse($validated['tanggal_mulai'], $businessTz)->startOfDay();
        $akhir = Carbon::parse($validated['tanggal_akhir'], $businessTz)->endOfDay();

        $totalDays = (int) $mulai->diffInDays($akhir->copy()->startOfDay()) + 1;

        if ($totalDays > self::MAX_DAILY_RANGE_DAYS) {
            throw ValidationException::withMessages([
                'tanggal_akhir' => ['Rentang tanggal laporan harian maksimal 366 hari.'],
            ]);
        }

        $mulaiQuery = $mulai->copy()->timezone($appTz);
        $akhirExclusiveQuery = Carbon::parse($validated['tanggal_akhir'], $businessTz)
            ->addDay()
            ->startOfDay()
            ->timezone($appTz);

        $akhirExclusiveDate = Carbon::parse($validated['tanggal_akhir'], $businessTz)
            ->addDay()
            ->toDateString();

        $pendapatanHarian = [];
        $kendaraanHarian = [];

        if ($appTz === $businessTz) {
            $pendapatanGrouped = DB::table('pembayaran')
                ->join('pesanan', 'pembayaran.id_pesanan', '=', 'pesanan.id_pesanan')
                ->where('pembayaran.status_pembayaran', 'sudah_dibayar')
                ->where('pesanan.status_pesanan', '!=', 'dibatalkan')
                ->where('pembayaran.waktu_penerimaan', '>=', $mulaiQuery)
                ->where('pembayaran.waktu_penerimaan', '<', $akhirExclusiveQuery)
                ->selectRaw('DATE(pembayaran.waktu_penerimaan) as tanggal_bisnis, SUM(pembayaran.jumlah_dibayar) as total_pendapatan')
                ->groupBy(DB::raw('DATE(pembayaran.waktu_penerimaan)'))
                ->get();

            foreach ($pendapatanGrouped as $row) {
                $pendapatanHarian[(string) $row->tanggal_bisnis] = (float) $row->total_pendapatan;
            }

            $kendaraanGrouped = DB::table('kendaraan_pesanan')
                ->join('pesanan', 'kendaraan_pesanan.id_pesanan', '=', 'pesanan.id_pesanan')
                ->where('pesanan.status_pesanan', '!=', 'dibatalkan')
                ->where('pesanan.waktu_pesanan', '>=', $mulaiQuery)
                ->where('pesanan.waktu_pesanan', '<', $akhirExclusiveQuery)
                ->selectRaw('DATE(pesanan.waktu_pesanan) as tanggal_bisnis, COUNT(kendaraan_pesanan.id_kendaraan_pesanan) as total_kendaraan')
                ->groupBy(DB::raw('DATE(pesanan.waktu_pesanan)'))
                ->get();

            foreach ($kendaraanGrouped as $row) {
                $kendaraanHarian[(string) $row->tanggal_bisnis] = (int) $row->total_kendaraan;
            }
        } else {
            $pendapatanRows = DB::table('pembayaran')
                ->join('pesanan', 'pembayaran.id_pesanan', '=', 'pesanan.id_pesanan')
                ->where('pembayaran.status_pembayaran', 'sudah_dibayar')
                ->where('pesanan.status_pesanan', '!=', 'dibatalkan')
                ->where('pembayaran.waktu_penerimaan', '>=', $mulaiQuery)
                ->where('pembayaran.waktu_penerimaan', '<', $akhirExclusiveQuery)
                ->select(['pembayaran.waktu_penerimaan', 'pembayaran.jumlah_dibayar'])
                ->get();

            foreach ($pendapatanRows as $row) {
                $dateKey = $this->resolveBusinessDate((string) $row->waktu_penerimaan, $appTz, $businessTz);
                $pendapatanHarian[$dateKey] = ($pendapatanHarian[$dateKey] ?? 0.0) + (float) $row->jumlah_dibayar;
            }

            $kendaraanRows = DB::table('kendaraan_pesanan')
                ->join('pesanan', 'kendaraan_pesanan.id_pesanan', '=', 'pesanan.id_pesanan')
                ->where('pesanan.status_pesanan', '!=', 'dibatalkan')
                ->where('pesanan.waktu_pesanan', '>=', $mulaiQuery)
                ->where('pesanan.waktu_pesanan', '<', $akhirExclusiveQuery)
                ->select(['pesanan.waktu_pesanan'])
                ->get();

            foreach ($kendaraanRows as $row) {
                $dateKey = $this->resolveBusinessDate((string) $row->waktu_pesanan, $appTz, $businessTz);
                $kendaraanHarian[$dateKey] = ($kendaraanHarian[$dateKey] ?? 0) + 1;
            }
        }

        $pengeluaranGrouped = DB::table('pengeluaran')
            ->where('status_pengeluaran', 'aktif')
            ->where('tanggal_pengeluaran', '>=', $mulai->toDateString())
            ->where('tanggal_pengeluaran', '<', $akhirExclusiveDate)
            ->selectRaw('DATE(tanggal_pengeluaran) as tanggal_bisnis, SUM(nominal) as total_pengeluaran')
            ->groupBy(DB::raw('DATE(tanggal_pengeluaran)'))
            ->get();

        $pengeluaranHarian = [];

        foreach ($pengeluaranGrouped as $row) {
            $pengeluaranHarian[(string) $row->tanggal_bisnis] = (float) $row->total_pengeluaran;
        }

        $hasil = [];
        $tanggal = $mulai->copy();

        while ($tanggal->lte($akhir)) {
            $key = $tanggal->toDateString();
            $pendapatan = round($pendapatanHarian[$key] ?? 0.0, 2);
            $pengeluaran = round($pengeluaranHarian[$key] ?? 0.0, 2);
            $jumlahKendaraan = $kendaraanHarian[$key] ?? 0;

            $hasil[] = [
                'tanggal' => $key,
                'pendapatan' => $pendapatan,
                'jumlah_kendaraan' => $jumlahKendaraan,
                'pengeluaran' => $pengeluaran,
                'keuntungan_bersih' => round($pendapatan - $pengeluaran, 2),
            ];

            $tanggal->addDay();
        }

        return response()->json([
            'message' => 'Laporan harian berhasil diambil.',
            'data' => $hasil,
        ]);
    }

    private function resolveBusinessDate(string $timestamp, string $appTz, string $businessTz): string
    {
        return Carbon::parse($timestamp, $appTz)
            ->timezone($businessTz)
            ->toDateString();
    }
}
