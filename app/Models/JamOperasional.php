<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JamOperasional extends Model
{
    protected $table = 'jam_operasional';

    protected $primaryKey = 'id_jam_operasional';

    protected $fillable = [
        'hari',
        'status_buka',
        'jam_buka',
        'jam_tutup',
        'id_pengguna',
    ];

    protected $casts = [
        'status_buka' => 'boolean',
    ];

    public function pengguna()
    {
        return $this->belongsTo(
            Pengguna::class,
            'id_pengguna',
            'id_pengguna'
        );
    }
}
