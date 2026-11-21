<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiwayatPerubahan extends Model
{
    protected $table = 'riwayat_perubahan';

    protected $primaryKey = 'id_riwayat';

    protected $fillable = [
        'id_pengguna',
        'entitas',
        'record_id',
        'waktu_perubahan',
        'nilai_sebelum',
        'nilai_sesudah',
        'alasan',
    ];

    protected $casts = [
        'waktu_perubahan' => 'datetime',
        'nilai_sebelum' => 'array',
        'nilai_sesudah' => 'array',
    ];

    public function pengguna()
    {
        return $this->belongsTo(Pengguna::class, 'id_pengguna', 'id_pengguna');
    }
}
