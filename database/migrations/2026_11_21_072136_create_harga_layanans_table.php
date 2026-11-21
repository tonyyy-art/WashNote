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
        Schema::create('harga_layanan', function (Blueprint $table) {
            $table->id('id_harga');

            $table->foreignId('id_layanan')
                ->constrained('layanan', 'id_layanan')
                ->restrictOnDelete();

            $table->foreignId('id_kategori_kendaraan')
                ->constrained('kategori_kendaraan', 'id_kategori_kendaraan')
                ->restrictOnDelete();

            $table->decimal('harga_dasar', 12, 2);
            $table->decimal('batas_bawah', 12, 2);
            $table->decimal('batas_atas', 12, 2);

            $table->boolean('status_aktif')->default(true);
            $table->timestamps();

            $table->unique(
                ['id_layanan', 'id_kategori_kendaraan'],
                'harga_layanan_unique'
            );
        });
    }


    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('harga_layanan');
    }
};
