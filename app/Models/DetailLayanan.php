<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DetailLayanan extends Model
{
    protected $table = 'detail_layanan';

    protected $primaryKey = 'id_detail_layanan';

    protected $fillable = [
        'id_kendaraan_pesanan',
        'id_harga',
        'nama_layanan_snapshot',
        'tipe_layanan_snapshot',
        'harga_dasar_snapshot',
        'harga_akhir',
        'alasan_penyesuaian',
    ];

    protected function casts(): array
    {
        return [
            'harga_dasar_snapshot' => 'decimal:2',
            'harga_akhir' => 'decimal:2',
        ];
    }

    public function kendaraanPesanan(): BelongsTo
    {
        return $this->belongsTo(
            KendaraanPesanan::class,
            'id_kendaraan_pesanan',
            'id_kendaraan_pesanan'
        );
    }

    public function hargaLayanan(): BelongsTo
    {
        return $this->belongsTo(
            HargaLayanan::class,
            'id_harga',
            'id_harga'
        );
    }
}
