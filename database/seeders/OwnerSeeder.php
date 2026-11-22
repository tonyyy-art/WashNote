<?php

namespace Database\Seeders;

use App\Models\Pengguna;
use Illuminate\Database\Seeder;

class OwnerSeeder extends Seeder
{
    public function run(): void
    {
        Pengguna::updateOrCreate(
            ['username' => 'owner'],
            [
                'nama_lengkap' => 'Owner WashNote',
                'kata_sandi_hash' => 'WashNote123!',
                'peran' => 'owner',
                'status_aktif' => true,
            ]
        );

        Pengguna::updateOrCreate(
            ['username' => 'Kasir1'],
            [
                'nama_lengkap' => 'Budi Mom',
                'kata_sandi_hash' => 'Budi112233!',
                'peran' => 'kasir',
                'status_aktif' => true,
            ]
        );
    }
}
