<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Layanan extends Model
{
    public const string TIPE_UTAMA = 'utama';

    public const string TIPE_TAMBAHAN = 'tambahan';

    protected $table = 'layanan';

    protected $primaryKey = 'id_layanan';

    protected $fillable = [
        'nama_layanan',
        'tipe_layanan',
        'deskripsi',
        'status_aktif',
    ];

    protected function casts(): array
    {
        return [
            'status_aktif' => 'boolean',
        ];
    }

    public function hargaLayanan(): HasMany
    {
        return $this->hasMany(
            HargaLayanan::class,
            'id_layanan',
            'id_layanan'
        );
    }
}
