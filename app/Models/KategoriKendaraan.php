<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KategoriKendaraan extends Model
{
    protected $table = 'kategori_kendaraan';

    protected $primaryKey = 'id_kategori_kendaraan';

    protected $fillable = [
        'jenis_kendaraan',
        'nama_kategori',
        'status_aktif',
    ];

    protected function casts(): array
    {
        return [
            'status_aktif' => 'boolean',
        ];
    }

    public function hargaLayanan()
    {
        return $this->hasMany(
            HargaLayanan::class,
            'id_kategori_kendaraan',
            'id_kategori_kendaraan'
        );
    }
}
