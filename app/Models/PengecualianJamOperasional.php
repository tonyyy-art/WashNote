<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PengecualianJamOperasional extends Model
{
    public const string JENIS_LIBUR = 'libur';

    public const string JENIS_JAM_KHUSUS = 'jam_khusus';

    protected $table = 'pengecualian_jam_operasional';

    protected $primaryKey = 'id_pengecualian';

    protected $fillable = [
        'tanggal',
        'jenis_pengecualian',
        'jam_buka',
        'jam_tutup',
        'keterangan',
        'id_pengguna',
    ];

    public function pengguna(): BelongsTo
    {
        return $this->belongsTo(
            Pengguna::class,
            'id_pengguna',
            'id_pengguna'
        );
    }
}
