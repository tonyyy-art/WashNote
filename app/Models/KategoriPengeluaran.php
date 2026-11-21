<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KategoriPengeluaran extends Model
{
    protected $table = 'kategori_pengeluaran';

    protected $primaryKey = 'id_kategori_pengeluaran';

    protected $fillable = [
        'nama_kategori',
        'status_aktif',
    ];

    protected $casts = [
        'status_aktif' => 'boolean',
    ];

    public function pengeluaran()
    {
        return $this->hasMany(
            Pengeluaran::class,
            'id_kategori_pengeluaran',
            'id_kategori_pengeluaran'
        );
    }
}
