<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pesanan;
use App\Models\KategoriKendaraan;
use App\Models\HargaLayanan;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use App\Models\RiwayatPerubahan;
use App\Models\JamOperasional;
use Carbon\Carbon;

class PesananController extends Controller
{
    // Menampilkan seluruh pesanan
    public function index()
    {
        $pesanan = Pesanan::with([
            'pengguna',
            'kendaraan.detailLayanan.hargaLayanan.layanan',
            'pembayaran',
        ])
            ->latest('waktu_pesanan')
            ->paginate(10);

        return response()->json([
            'success' => true,
            'data' => $pesanan,
        ]);
    }

    // Membuat pesanan baru
    public function store(Request $request)
    {
        $validated = $request->validate([
            'kendaraan' => 'required|array|min:1',

            'kendaraan.*.id_kategori_kendaraan' =>
            'required|exists:kategori_kendaraan,id_kategori_kendaraan',

            'kendaraan.*.layanan' => 'required|array|min:1',

            'kendaraan.*.layanan.*.id_harga' =>
            'required|exists:harga_layanan,id_harga',
        ]);

        // Idempotency: cegah pesanan ganda dari request yang sama
        $key = $request->header('Idempotency-Key');

        if ($key) {
            $existing = Pesanan::where(
                'idempotency_key',
                $key
            )->first();

            if ($existing) {
                if ($existing->id_pengguna !== $request->user()->id_pengguna) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Idempotency key sudah digunakan.',
                    ], 409);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Pesanan sudah pernah dibuat.',
                    'data' => $existing->load([
                        'kendaraan.detailLayanan.hargaLayanan.layanan',
                        'pembayaran',
                    ]),
                ], 200);
            }
        }

        $pesanan = DB::transaction(function () use (
            $validated,
            $request,
            $key
        ) {
            // Buat pesanan utama
            $pesanan = Pesanan::create([
                'id_pengguna' => $request->user()->id_pengguna,
                'waktu_pesanan' => now(),
                'status_pesanan' => 'berjalan',
                'di_luar_jam_operasional' => $this->isOutsideOperationalHours(),
                'idempotency_key' => $key,
            ]);

            foreach ($validated['kendaraan'] as $dataKendaraan) {

                $kategori = KategoriKendaraan::findOrFail(
                    $dataKendaraan['id_kategori_kendaraan']
                );

                if (!$kategori->status_aktif) {
                    throw ValidationException::withMessages([
                        'kendaraan' => [
                            'Kategori kendaraan tidak aktif.',
                        ],
                    ]);
                }

                $kendaraan = $pesanan->kendaraan()->create([
                    'id_kategori_kendaraan' =>
                    $kategori->id_kategori_kendaraan,

                    'nama_kategori_snapshot' =>
                    $kategori->nama_kategori,

                    'status_proses' => 'menunggu',
                ]);

                foreach ($dataKendaraan['layanan'] as $dataLayanan) {

                    $harga = HargaLayanan::with([
                        'layanan',
                        'kategoriKendaraan',
                    ])->findOrFail($dataLayanan['id_harga']);

                    // Pastikan harga aktif
                    if (!$harga->status_aktif) {
                        throw ValidationException::withMessages([
                            'layanan' => [
                                'Harga layanan tidak aktif.',
                            ],
                        ]);
                    }

                    // Pastikan kategori harga sesuai kendaraan
                    if (
                        $harga->id_kategori_kendaraan
                        != $kategori->id_kategori_kendaraan
                    ) {
                        throw ValidationException::withMessages([
                            'layanan' => [
                                'Harga layanan tidak sesuai kategori kendaraan.',
                            ],
                        ]);
                    }

                    // Pastikan layanan masih aktif
                    if (!$harga->layanan->status_aktif) {
                        throw ValidationException::withMessages([
                            'layanan' => [
                                'Layanan sedang tidak aktif.',
                            ],
                        ]);
                    }

                    // Simpan snapshot harga
                    $kendaraan->detailLayanan()->create([
                        'id_harga' => $harga->id_harga,
                        'harga_dasar_snapshot' => $harga->harga_dasar,
                        'harga_akhir' => $harga->harga_dasar,
                    ]);
                }
            }

            // Buat pembayaran awal
            $pesanan->pembayaran()->create([
                'status_pembayaran' => 'belum_dibayar',
            ]);

            return $pesanan;
        });

        $pesanan->load([
            'pengguna',
            'kendaraan.detailLayanan.hargaLayanan.layanan',
            'pembayaran',
        ]);

        $total = $pesanan->kendaraan
            ->flatMap(fn($kendaraan) => $kendaraan->detailLayanan)
            ->sum('harga_akhir');

        return response()->json([
            'success' => true,
            'message' => 'Pesanan berhasil dibuat.',
            'data' => [
                'pesanan' => $pesanan,
                'total_harga' => $total,
            ],
        ], 201);
    }

    // Melihat detail pesanan
    public function show(Pesanan $pesanan)
    {
        $pesanan->load([
            'pengguna',
            'kendaraan.detailLayanan.hargaLayanan.layanan',
            'pembayaran',
        ]);

        $total = $pesanan->kendaraan
            ->flatMap(fn($kendaraan) => $kendaraan->detailLayanan)
            ->sum('harga_akhir');

        return response()->json([
            'success' => true,
            'data' => [
                'pesanan' => $pesanan,
                'total_harga' => $total,
            ],
        ]);
    }

    public function cancel(Request $request, Pesanan $pesanan)
    {
        $validated = $request->validate([
            'alasan_pembatalan' => 'required|string|min:5|max:1000',
        ]);

        // Pesanan yang sudah dibatalkan tidak dapat dibatalkan lagi
        if ($pesanan->status_pesanan === 'dibatalkan') {
            return response()->json([
                'message' => 'Pesanan sudah dibatalkan.',
            ], 422);
        }

        DB::transaction(function () use ($request, $pesanan, $validated) {

            // Simpan kondisi sebelum perubahan
            $sebelum = [
                'status_pesanan' => $pesanan->status_pesanan,
                'alasan_pembatalan' => $pesanan->alasan_pembatalan,
            ];

            // Ubah status pesanan
            $pesanan->update([
                'status_pesanan' => 'dibatalkan',
                'alasan_pembatalan' => $validated['alasan_pembatalan'],
            ]);

            // Simpan riwayat perubahan
            RiwayatPerubahan::create([
                'id_pengguna' => $request->user()->id_pengguna,
                'entitas' => 'pesanan',
                'record_id' => $pesanan->id_pesanan,
                'waktu_perubahan' => now(),
                'nilai_sebelum' => $sebelum,
                'nilai_sesudah' => [
                    'status_pesanan' => 'dibatalkan',
                    'alasan_pembatalan' => $validated['alasan_pembatalan'],
                ],
                'alasan' => $validated['alasan_pembatalan'],
            ]);
        });

        return response()->json([
            'message' => 'Pesanan berhasil dibatalkan.',
            'data' => $pesanan->fresh(),
        ]);
    }

    public function update(Request $request, Pesanan $pesanan)
    {
        $validated = $request->validate([
            'alasan' => 'required|string|min:5|max:1000',
            'status_pesanan' => 'sometimes|in:berjalan,selesai',
        ]);

        if ($pesanan->status_pesanan === 'dibatalkan') {
            return response()->json([
                'message' => 'Pesanan yang dibatalkan tidak dapat diedit.',
            ], 422);
        }

        DB::transaction(function () use ($request, $pesanan, $validated) {

            $sebelum = [
                'status_pesanan' => $pesanan->status_pesanan,
            ];

            $pesanan->update([
                'status_pesanan' => $validated['status_pesanan']
                    ?? $pesanan->status_pesanan,
            ]);

            RiwayatPerubahan::create([
                'id_pengguna' => $request->user()->id_pengguna,
                'entitas' => 'pesanan',
                'record_id' => $pesanan->id_pesanan,
                'waktu_perubahan' => now(),
                'nilai_sebelum' => $sebelum,
                'nilai_sesudah' => [
                    'status_pesanan' => $pesanan->status_pesanan,
                ],
                'alasan' => $validated['alasan'],
            ]);
        });

        return response()->json([
            'message' => 'Pesanan berhasil diperbarui.',
            'data' => $pesanan->fresh(),
        ]);
    }


    public function updateVehicleStatus(Request $request, $id)
    {
        $validated = $request->validate([
            'status_proses' => 'required|in:menunggu,proses,selesai',
        ]);

        $kendaraan = \App\Models\KendaraanPesanan::findOrFail($id);

        $pesanan = $kendaraan->pesanan;

        if ($pesanan->status_pesanan === 'dibatalkan') {
            return response()->json([
                'message' => 'Pesanan sudah dibatalkan.',
            ], 422);
        }

        DB::transaction(function () use ($request, $kendaraan, $validated) {

            $sebelum = [
                'status_proses' => $kendaraan->status_proses,
            ];

            $kendaraan->update([
                'status_proses' => $validated['status_proses'],
            ]);

            RiwayatPerubahan::create([
                'id_pengguna' => $request->user()->id_pengguna,
                'entitas' => 'kendaraan_pesanan',
                'record_id' => $kendaraan->id_kendaraan_pesanan,
                'waktu_perubahan' => now(),
                'nilai_sebelum' => $sebelum,
                'nilai_sesudah' => [
                    'status_proses' => $kendaraan->status_proses,
                ],
                'alasan' => 'Perubahan status proses kendaraan',
            ]);
        });

        return response()->json([
            'message' => 'Status kendaraan berhasil diperbarui.',
            'data' => $kendaraan->fresh(),
        ]);
    }


    private function isOutsideOperationalHours(): bool
    {
        $sekarang = Carbon::now('Asia/Jakarta');

        $daftarHari = [
            1 => 'senin',
            2 => 'selasa',
            3 => 'rabu',
            4 => 'kamis',
            5 => 'jumat',
            6 => 'sabtu',
            7 => 'minggu',
        ];

        $hariIni = $daftarHari[$sekarang->dayOfWeekIso];

        $jadwal = JamOperasional::where(
            'hari',
            $hariIni
        )->first();

        // Jika jadwal belum dibuat, anggap di luar jam operasional
        if (!$jadwal || !$jadwal->status_buka) {
            return true;
        }

        $waktuSekarang = $sekarang->format('H:i:s');

        return !(
            $waktuSekarang >= $jadwal->jam_buka &&
            $waktuSekarang <= $jadwal->jam_tutup
        );
    }
}
