<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Pesanan extends Model
{
    protected $table = 'pesanan';

    protected $primaryKey = 'id_pesanan';

    protected $fillable = [
        'id_pengguna',
        'waktu_pesanan',
        'status_pesanan',
        'alasan_pembatalan',
        'di_luar_jam_operasional',
        'idempotency_key',
    ];

    protected function casts(): array
    {
        return [
            'waktu_pesanan' => 'datetime',
            'di_luar_jam_operasional' => 'boolean',
        ];
    }

    public function pengguna()
    {
        return $this->belongsTo(
            Pengguna::class,
            'id_pengguna',
            'id_pengguna'
        );
    }

    public function kendaraan()
    {
        return $this->hasMany(
            KendaraanPesanan::class,
            'id_pesanan',
            'id_pesanan'
        );
    }

    public function pembayaran()
    {
        return $this->hasOne(
            Pembayaran::class,
            'id_pesanan',
            'id_pesanan'
        );
    }
}
