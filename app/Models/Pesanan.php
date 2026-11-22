<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Pesanan extends Model
{
    public const string STATUS_BERJALAN = 'berjalan';

    public const string STATUS_SELESAI = 'selesai';

    public const string STATUS_DIBATALKAN = 'dibatalkan';

    protected $table = 'pesanan';

    protected $primaryKey = 'id_pesanan';

    protected $fillable = [
        'nomor_nota',
        'id_pengguna',
        'waktu_pesanan',
        'status_pesanan',
        'alasan_pembatalan',
        'catatan',
        'di_luar_jam_operasional',
        'status_jam_operasional',
        'pada_hari_libur',
        'konfirmasi_hari_libur',
        'idempotency_key',
        'version',
    ];

    protected function casts(): array
    {
        return [
            'waktu_pesanan' => 'datetime',
            'di_luar_jam_operasional' => 'boolean',
            'pada_hari_libur' => 'boolean',
            'konfirmasi_hari_libur' => 'boolean',
            'version' => 'integer',
        ];
    }

    public function pengguna(): BelongsTo
    {
        return $this->belongsTo(
            Pengguna::class,
            'id_pengguna',
            'id_pengguna'
        );
    }

    public function kendaraan(): HasMany
    {
        return $this->hasMany(
            KendaraanPesanan::class,
            'id_pesanan',
            'id_pesanan'
        );
    }

    public function pembayaran(): HasOne
    {
        return $this->hasOne(
            Pembayaran::class,
            'id_pesanan',
            'id_pesanan'
        );
    }
}
