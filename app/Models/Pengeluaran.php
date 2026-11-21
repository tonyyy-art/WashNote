<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Pengeluaran extends Model
{
    protected $table = 'pengeluaran';

    protected $primaryKey = 'id_pengeluaran';

    protected $fillable = [
        'id_pengguna',
        'id_kategori_pengeluaran',
        'tanggal_pengeluaran',
        'deskripsi',
        'nominal',
        'status_pengeluaran',
    ];

    protected $casts = [
        'tanggal_pengeluaran' => 'date',
        'nominal' => 'decimal:2',
    ];

    public function pengguna()
    {
        return $this->belongsTo(
            Pengguna::class,
            'id_pengguna',
            'id_pengguna'
        );
    }

    public function kategori()
    {
        return $this->belongsTo(
            KategoriPengeluaran::class,
            'id_kategori_pengeluaran',
            'id_kategori_pengeluaran'
        );
    }
}
