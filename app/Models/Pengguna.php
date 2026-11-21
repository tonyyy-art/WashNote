<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Notifications\Notifiable;

class Pengguna extends Authenticatable
{
    use HasApiTokens, Notifiable;

    protected $table = 'pengguna';

    protected $primaryKey = 'id_pengguna';

    protected $fillable = [
        'nama_lengkap',
        'username',
        'kata_sandi_hash',
        'peran',
        'status_aktif',
    ];

    protected $hidden = [
        'kata_sandi_hash',
    ];

    protected $casts = [
        'kata_sandi_hash' => 'hashed',
        'status_aktif' => 'boolean',
    ];

    public function getAuthPassword(): string
    {
        return $this->kata_sandi_hash;
    }
}
