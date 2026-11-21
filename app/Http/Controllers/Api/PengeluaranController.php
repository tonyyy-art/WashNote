<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pengeluaran;
use App\Models\KategoriPengeluaran;
use App\Models\RiwayatPerubahan;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PengeluaranController extends Controller
{
    public function index()
    {
        $data = Pengeluaran::with([
            'pengguna:id_pengguna,nama_lengkap',
            'kategori'
        ])->latest()->paginate(10);

        return response()->json([
            'data' => $data
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'id_kategori_pengeluaran' => 'required|exists:kategori_pengeluaran,id_kategori_pengeluaran',
            'tanggal_pengeluaran' => 'required|date',
            'deskripsi' => 'required|string',
            'nominal' => 'required|numeric|min:0.01',
        ]);

        $kategori = KategoriPengeluaran::findOrFail(
            $validated['id_kategori_pengeluaran']
        );

        if (!$kategori->status_aktif) {
            return response()->json([
                'message' => 'Kategori pengeluaran tidak aktif.'
            ], 422);
        }

        $pengeluaran = Pengeluaran::create([
            ...$validated,
            'id_pengguna' => $request->user()->id_pengguna,
            'status_pengeluaran' => 'aktif',
        ]);

        RiwayatPerubahan::create([
            'id_pengguna' => $request->user()->id_pengguna,
            'entitas' => 'pengeluaran',
            'record_id' => $pengeluaran->id_pengeluaran,
            'waktu_perubahan' => now(),
            'nilai_sebelum' => null,
            'nilai_sesudah' => $pengeluaran->toArray(),
            'alasan' => 'Pencatatan pengeluaran baru',
        ]);

        return response()->json([
            'message' => 'Pengeluaran berhasil ditambahkan.',
            'data' => $pengeluaran
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $pengeluaran = Pengeluaran::findOrFail($id);

        $validated = $request->validate([
            'id_kategori_pengeluaran' => 'required|exists:kategori_pengeluaran,id_kategori_pengeluaran',
            'tanggal_pengeluaran' => 'required|date',
            'deskripsi' => 'required|string',
            'nominal' => 'required|numeric|min:0.01',
            'alasan' => 'required|string|min:5',
        ]);

        if ($pengeluaran->status_pengeluaran === 'dibatalkan') {
            return response()->json([
                'message' => 'Pengeluaran yang dibatalkan tidak dapat diedit.'
            ], 422);
        }

        $kategori = KategoriPengeluaran::findOrFail(
            $validated['id_kategori_pengeluaran']
        );

        if (!$kategori->status_aktif) {
            return response()->json([
                'message' => 'Kategori pengeluaran tidak aktif.'
            ], 422);
        }

        DB::transaction(function () use (
            $request,
            $pengeluaran,
            $validated
        ) {
            $sebelum = $pengeluaran->toArray();

            $pengeluaran->update([
                'id_kategori_pengeluaran' => $validated['id_kategori_pengeluaran'],
                'tanggal_pengeluaran' => $validated['tanggal_pengeluaran'],
                'deskripsi' => $validated['deskripsi'],
                'nominal' => $validated['nominal'],
            ]);

            RiwayatPerubahan::create([
                'id_pengguna' => $request->user()->id_pengguna,
                'entitas' => 'pengeluaran',
                'record_id' => $pengeluaran->id_pengeluaran,
                'waktu_perubahan' => now(),
                'nilai_sebelum' => $sebelum,
                'nilai_sesudah' => $pengeluaran->fresh()->toArray(),
                'alasan' => $validated['alasan'],
            ]);
        });

        return response()->json([
            'message' => 'Pengeluaran berhasil diperbarui.',
            'data' => $pengeluaran->fresh()
        ]);
    }

    public function cancel(Request $request, $id)
    {
        $validated = $request->validate([
            'alasan' => 'required|string|min:5',
        ]);

        $pengeluaran = Pengeluaran::findOrFail($id);

        if ($pengeluaran->status_pengeluaran === 'dibatalkan') {
            return response()->json([
                'message' => 'Pengeluaran sudah dibatalkan.'
            ], 422);
        }

        DB::transaction(function () use (
            $request,
            $pengeluaran,
            $validated
        ) {
            $sebelum = [
                'status_pengeluaran' => $pengeluaran->status_pengeluaran
            ];

            $pengeluaran->update([
                'status_pengeluaran' => 'dibatalkan'
            ]);

            RiwayatPerubahan::create([
                'id_pengguna' => $request->user()->id_pengguna,
                'entitas' => 'pengeluaran',
                'record_id' => $pengeluaran->id_pengeluaran,
                'waktu_perubahan' => now(),
                'nilai_sebelum' => $sebelum,
                'nilai_sesudah' => [
                    'status_pengeluaran' => 'dibatalkan'
                ],
                'alasan' => $validated['alasan'],
            ]);
        });

        return response()->json([
            'message' => 'Pengeluaran berhasil dibatalkan.',
            'data' => $pengeluaran->fresh()
        ]);
    }
}
