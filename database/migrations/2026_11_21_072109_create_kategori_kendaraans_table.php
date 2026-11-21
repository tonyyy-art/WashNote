<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('kategori_kendaraan', function (Blueprint $table) {
            $table->id('id_kategori_kendaraan');
            $table->string('jenis_kendaraan');
            $table->string('nama_kategori');
            $table->boolean('status_aktif')->default(true);
            $table->timestamps();

            $table->unique(
                ['jenis_kendaraan', 'nama_kategori'],
                'kategori_kendaraan_unique'
            );
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kategori_kendaraan');
    }
};
