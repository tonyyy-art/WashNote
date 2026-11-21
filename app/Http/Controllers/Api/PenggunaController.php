<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pengguna;
use App\Models\RiwayatPerubahan;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PenggunaController extends Controller
{
    // Melihat daftar akun kasir
    public function index()
    {
        $kasir = Pengguna::where('peran', 'kasir')
            ->select(
                'id_pengguna',
                'nama_lengkap',
                'username',
                'peran',
                'status_aktif',
                'created_at'
            )
            ->latest()
            ->paginate(10);

        return response()->json([
            'message' => 'Data kasir berhasil diambil.',
            'data' => $kasir
        ]);
    }

    // Membuat akun kasir
    public function store(Request $request)
    {
        $validated = $request->validate([
            'nama_lengkap' => 'required|string|max:255',
            'username' => 'required|string|max:100|unique:pengguna,username',
            'password' => 'required|string|min:8',
        ]);

        DB::transaction(function () use (
            $request,
            $validated,
            &$kasir
        ) {
            $kasir = Pengguna::create([
                'nama_lengkap' => $validated['nama_lengkap'],
                'username' => $validated['username'],
                'kata_sandi_hash' => $validated['password'],
                'peran' => 'kasir',
                'status_aktif' => true,
            ]);

            RiwayatPerubahan::create([
                'id_pengguna' => $request->user()->id_pengguna,
                'entitas' => 'pengguna',
                'record_id' => $kasir->id_pengguna,
                'waktu_perubahan' => now(),
                'nilai_sebelum' => null,
                'nilai_sesudah' => [
                    'nama_lengkap' => $kasir->nama_lengkap,
                    'username' => $kasir->username,
                    'peran' => $kasir->peran,
                    'status_aktif' => $kasir->status_aktif,
                ],
                'alasan' => 'Pembuatan akun kasir',
            ]);
        });

        return response()->json([
            'message' => 'Akun kasir berhasil dibuat.',
            'data' => $kasir
        ], 201);
    }

    // Mengubah informasi akun kasir
    public function update(Request $request, $id)
    {
        $kasir = Pengguna::where('peran', 'kasir')
            ->findOrFail($id);

        $validated = $request->validate([
            'nama_lengkap' => 'required|string|max:255',
            'username' => 'required|string|max:100|unique:pengguna,username,' . $id . ',id_pengguna',
        ]);

        DB::transaction(function () use (
            $request,
            $kasir,
            $validated
        ) {
            $sebelum = [
                'nama_lengkap' => $kasir->nama_lengkap,
                'username' => $kasir->username,
            ];

            $kasir->update($validated);

            RiwayatPerubahan::create([
                'id_pengguna' => $request->user()->id_pengguna,
                'entitas' => 'pengguna',
                'record_id' => $kasir->id_pengguna,
                'waktu_perubahan' => now(),
                'nilai_sebelum' => $sebelum,
                'nilai_sesudah' => [
                    'nama_lengkap' => $kasir->nama_lengkap,
                    'username' => $kasir->username,
                ],
                'alasan' => 'Perubahan informasi akun kasir',
            ]);
        });

        return response()->json([
            'message' => 'Data kasir berhasil diperbarui.',
            'data' => $kasir->fresh()
        ]);
    }

    // Mengaktifkan atau menonaktifkan akun
    public function updateStatus(Request $request, $id)
    {
        $kasir = Pengguna::where('peran', 'kasir')
            ->findOrFail($id);

        $validated = $request->validate([
            'status_aktif' => 'required|boolean',
            'alasan' => 'required|string|min:5|max:1000',
        ]);

        DB::transaction(function () use (
            $request,
            $kasir,
            $validated
        ) {
            $sebelum = [
                'status_aktif' => $kasir->status_aktif,
            ];

            $kasir->update([
                'status_aktif' => $validated['status_aktif'],
            ]);

            RiwayatPerubahan::create([
                'id_pengguna' => $request->user()->id_pengguna,
                'entitas' => 'pengguna',
                'record_id' => $kasir->id_pengguna,
                'waktu_perubahan' => now(),
                'nilai_sebelum' => $sebelum,
                'nilai_sesudah' => [
                    'status_aktif' => $kasir->status_aktif,
                ],
                'alasan' => $validated['alasan'],
            ]);
        });

        return response()->json([
            'message' => 'Status akun kasir berhasil diperbarui.',
            'data' => $kasir->fresh()
        ]);
    }

    // Mereset password kasir
    public function resetPassword(Request $request, $id)
    {
        $kasir = Pengguna::where('peran', 'kasir')
            ->findOrFail($id);

        $validated = $request->validate([
            'password_baru' => 'required|string|min:8|confirmed',
        ]);

        DB::transaction(function () use (
            $request,
            $kasir,
            $validated
        ) {
            $kasir->update([
                'kata_sandi_hash' => $validated['password_baru'],
            ]);

            RiwayatPerubahan::create([
                'id_pengguna' => $request->user()->id_pengguna,
                'entitas' => 'pengguna',
                'record_id' => $kasir->id_pengguna,
                'waktu_perubahan' => now(),
                'nilai_sebelum' => null,
                'nilai_sesudah' => [
                    'password_diubah' => true,
                ],
                'alasan' => 'Reset password akun kasir',
            ]);
        });

        return response()->json([
            'message' => 'Password kasir berhasil direset.'
        ]);
    }
}
