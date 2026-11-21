<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KendaraanPesanan extends Model
{
    protected $table = 'kendaraan_pesanan';

    protected $primaryKey = 'id_kendaraan_pesanan';

    protected $fillable = [
        'id_pesanan',
        'id_kategori_kendaraan',
        'nama_kategori_snapshot',
        'status_proses',
    ];

    public function pesanan()
    {
        return $this->belongsTo(
            Pesanan::class,
            'id_pesanan',
            'id_pesanan'
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

    public function detailLayanan()
    {
        return $this->hasMany(
            DetailLayanan::class,
            'id_kendaraan_pesanan',
            'id_kendaraan_pesanan'
        );
    }
}
