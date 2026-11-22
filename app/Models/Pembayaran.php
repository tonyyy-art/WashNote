<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Pembayaran extends Model
{
    protected $table = 'pembayaran';

    protected $primaryKey = 'id_pembayaran';

    protected $fillable = [
        'id_pesanan',
        'jumlah_dibayar',
        'uang_diterima',
        'kembalian',
        'metode_pembayaran',
        'status_pembayaran',
        'waktu_penerimaan',
    ];

    protected function casts(): array
    {
        return [
            'jumlah_dibayar' => 'decimal:2',
            'uang_diterima' => 'decimal:2',
            'kembalian' => 'decimal:2',
            'waktu_penerimaan' => 'datetime',
        ];
    }

    public function pesanan(): BelongsTo
    {
        return $this->belongsTo(
            Pesanan::class,
            'id_pesanan',
            'id_pesanan'
        );
    }
}
