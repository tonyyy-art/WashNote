<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('layanan', function (Blueprint $table): void {
            $table->string('tipe_layanan', 20)->default('utama')->after('nama_layanan');
        });

        Schema::table('detail_layanan', function (Blueprint $table): void {
            $table->string('nama_layanan_snapshot', 150)->nullable()->after('id_harga');
            $table->string('tipe_layanan_snapshot', 20)->nullable()->after('nama_layanan_snapshot');
        });
    }

    public function down(): void
    {
        Schema::table('detail_layanan', function (Blueprint $table): void {
            $table->dropColumn(['nama_layanan_snapshot', 'tipe_layanan_snapshot']);
        });

        Schema::table('layanan', function (Blueprint $table): void {
            $table->dropColumn('tipe_layanan');
        });
    }
};
