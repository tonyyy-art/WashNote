<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('harga_layanan', function (Blueprint $table): void {
            // Ensure FK columns stay indexed before dropping the global unique constraint (required by MySQL).
            $table->index(['id_layanan', 'id_kategori_kendaraan'], 'harga_layanan_lookup_idx');
            $table->dropUnique('harga_layanan_unique');
        });

        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement(
                'CREATE UNIQUE INDEX uq_harga_layanan_aktif ON harga_layanan (id_layanan, id_kategori_kendaraan) WHERE status_aktif = TRUE'
            );
        } elseif ($driver === 'sqlite') {
            DB::statement(
                'CREATE UNIQUE INDEX uq_harga_layanan_aktif ON harga_layanan (id_layanan, id_kategori_kendaraan) WHERE status_aktif = 1'
            );
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if (in_array($driver, ['pgsql', 'sqlite'], true)) {
            DB::statement('DROP INDEX IF EXISTS uq_harga_layanan_aktif');
        }

        Schema::table('harga_layanan', function (Blueprint $table): void {
            $table->unique(['id_layanan', 'id_kategori_kendaraan'], 'harga_layanan_unique');
            $table->dropIndex('harga_layanan_lookup_idx');
        });
    }
};
