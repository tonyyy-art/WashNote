<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HargaLayanan extends Model
{
    protected $table = 'harga_layanan';

    protected $primaryKey = 'id_harga';

    protected $fillable = [
        'id_layanan',
        'id_kategori_kendaraan',
        'harga_dasar',
        'batas_bawah',
        'batas_atas',
        'status_aktif',
    ];

    protected function casts(): array
    {
        return [
            'harga_dasar' => 'decimal:2',
            'batas_bawah' => 'decimal:2',
            'batas_atas' => 'decimal:2',
            'status_aktif' => 'boolean',
        ];
    }

    public function layanan()
    {
        return $this->belongsTo(
            Layanan::class,
            'id_layanan',
            'id_layanan'
        );
    }

    public function kategoriKendaraan()
    {
        return $this->belongsTo(
            KategoriKendaraan::class,
            'id_kategori_kendaraan',
            'id_kategori_kendaraan'
        );
    }
}
