<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pengguna;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $pengguna = Pengguna::where(
            'username',
            $request->username
        )->first();

        // Periksa akun dan password
        if (
            !$pengguna ||
            !$pengguna->status_aktif ||
            !Hash::check(
                $request->password,
                $pengguna->kata_sandi_hash
            )
        ) {
            return response()->json([
                'success' => false,
                'message' => 'Username atau password salah.',
            ], 401);
        }

        // Buat token Sanctum
        $token = $pengguna->createToken('washnote-mobile')->plainTextToken;

        return response()->json([
            'success' => true,
            'message' => 'Login berhasil.',
            'data' => [
                'user' => [
                    'id_pengguna' => $pengguna->id_pengguna,
                    'nama_lengkap' => $pengguna->nama_lengkap,
                    'username' => $pengguna->username,
                    'peran' => $pengguna->peran,
                ],
                'token' => $token,
                'token_type' => 'Bearer',
            ],
        ], 200);
    }

    // LOGOUT
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'success' => true,
            'message' => 'Logout berhasil.',
        ]);
    }

    // PROFILE
    public function profile(Request $request)
    {
        $pengguna = $request->user();

        return response()->json([
            'success' => true,
            'data' => [
                'id_pengguna' => $pengguna->id_pengguna,
                'nama_lengkap' => $pengguna->nama_lengkap,
                'username' => $pengguna->username,
                'peran' => $pengguna->peran,
            ],
        ]);
    }
}
