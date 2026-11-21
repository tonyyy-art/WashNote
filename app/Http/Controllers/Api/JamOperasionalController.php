<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JamOperasional;
use Illuminate\Http\Request;

class JamOperasionalController extends Controller
{
    // Melihat seluruh jadwal operasional
    public function index()
    {
        return response()->json([
            'message' => 'Jadwal operasional berhasil diambil.',
            'data' => JamOperasional::orderByRaw(
                "FIELD(hari, 'senin', 'selasa', 'rabu',
                'kamis', 'jumat', 'sabtu', 'minggu')"
            )->get()
        ]);
    }

    // Menambahkan jadwal operasional
    public function store(Request $request)
    {
        $validated = $request->validate([
            'hari' => 'required|in:senin,selasa,rabu,kamis,jumat,sabtu,minggu|unique:jam_operasional,hari',
            'status_buka' => 'required|boolean',
            'jam_buka' => 'nullable|required_if:status_buka,1|date_format:H:i',
            'jam_tutup' => 'nullable|required_if:status_buka,1|date_format:H:i|after:jam_buka',
        ]);

        $jadwal = JamOperasional::create([
            ...$validated,
            'id_pengguna' => $request->user()->id_pengguna,
        ]);

        return response()->json([
            'message' => 'Jadwal berhasil ditambahkan.',
            'data' => $jadwal
        ], 201);
    }

    // Mengubah jadwal operasional
    public function update(Request $request, $id)
    {
        $jadwal = JamOperasional::findOrFail($id);

        $validated = $request->validate([
            'status_buka' => 'required|boolean',
            'jam_buka' => 'nullable|required_if:status_buka,1|date_format:H:i',
            'jam_tutup' => 'nullable|required_if:status_buka,1|date_format:H:i|after:jam_buka',
        ]);

        $jadwal->update([
            ...$validated,
            'id_pengguna' => $request->user()->id_pengguna,
        ]);

        return response()->json([
            'message' => 'Jadwal berhasil diperbarui.',
            'data' => $jadwal
        ]);
    }

    // Menghapus jadwal
    public function destroy($id)
    {
        $jadwal = JamOperasional::findOrFail($id);
        $jadwal->delete();

        return response()->json([
            'message' => 'Jadwal berhasil dihapus.'
        ]);
    }
}
