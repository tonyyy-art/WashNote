<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class RiwayatPerubahan extends Model
{
    protected $table = 'riwayat_perubahan';

    protected $primaryKey = 'id_riwayat';

    protected $fillable = [
        'id_pengguna',
        'entitas',
        'record_id',
        'waktu_perubahan',
        'nilai_sebelum',
        'nilai_sesudah',
        'alasan',
    ];

    protected $casts = [
        'waktu_perubahan' => 'datetime',
        'nilai_sebelum' => 'array',
        'nilai_sesudah' => 'array',
    ];

    protected static function booted(): void
    {
        static::updating(static function (): bool {
            throw new LogicException('riwayat_perubahan bersifat append-only dan tidak dapat diubah.');
        });

        static::deleting(static function (): bool {
            throw new LogicException('riwayat_perubahan bersifat append-only dan tidak dapat dihapus.');
        });
    }

    public function pengguna(): BelongsTo
    {
        return $this->belongsTo(Pengguna::class, 'id_pengguna', 'id_pengguna');
    }
}
