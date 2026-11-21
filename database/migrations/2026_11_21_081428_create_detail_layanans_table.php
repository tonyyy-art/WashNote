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
        Schema::create('detail_layanan', function (Blueprint $table) {
            $table->id('id_detail_layanan');

            $table->foreignId('id_kendaraan_pesanan')
                ->constrained(
                    'kendaraan_pesanan',
                    'id_kendaraan_pesanan'
                )
                ->cascadeOnDelete();

            $table->foreignId('id_harga')
                ->constrained('harga_layanan', 'id_harga')
                ->restrictOnDelete();

            $table->decimal('harga_dasar_snapshot', 12, 2);

            $table->decimal('harga_akhir', 12, 2);

            $table->text('alasan_penyesuaian')->nullable();

            $table->timestamps();
        });
    }


    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('detail_layanan');
    }
};
