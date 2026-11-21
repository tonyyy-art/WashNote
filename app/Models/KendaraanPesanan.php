<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KendaraanPesanan extends Model
{
    public const string STATUS_MENUNGGU = 'menunggu';

    public const string STATUS_PROSES = 'proses';

    public const string STATUS_SELESAI = 'selesai';

    protected $table = 'kendaraan_pesanan';

    protected $primaryKey = 'id_kendaraan_pesanan';

    protected $fillable = [
        'id_pesanan',
        'id_kategori_kendaraan',
        'nama_kategori_snapshot',
        'plat_nomor',
        'status_proses',
    ];

    public function pesanan(): BelongsTo
    {
        return $this->belongsTo(
            Pesanan::class,
            'id_pesanan',
            'id_pesanan'
        );
    }

    public function kategoriKendaraan(): BelongsTo
    {
        return $this->belongsTo(
            KategoriKendaraan::class,
            'id_kategori_kendaraan',
            'id_kategori_kendaraan'
        );
    }

    public function detailLayanan(): HasMany
    {
        return $this->hasMany(
            DetailLayanan::class,
            'id_kendaraan_pesanan',
            'id_kendaraan_pesanan'
        );
    }
}
