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
        Schema::create('kendaraan_pesanan', function (Blueprint $table) {
            $table->id('id_kendaraan_pesanan');

            $table->foreignId('id_pesanan')
                ->constrained('pesanan', 'id_pesanan')
                ->cascadeOnDelete();

            $table->foreignId('id_kategori_kendaraan')
                ->constrained('kategori_kendaraan', 'id_kategori_kendaraan')
                ->restrictOnDelete();

            // Menyimpan nama kategori saat transaksi dibuat
            $table->string('nama_kategori_snapshot');

            $table->string('status_proses')->default('menunggu');

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kendaraan_pesanan');
    }
};
