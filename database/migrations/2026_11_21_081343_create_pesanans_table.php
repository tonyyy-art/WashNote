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
        Schema::create('pesanan', function (Blueprint $table) {
            $table->id('id_pesanan');

            $table->foreignId('id_pengguna')
                ->constrained('pengguna', 'id_pengguna')
                ->restrictOnDelete();

            $table->timestamp('waktu_pesanan');

            $table->string('status_pesanan')->default('berjalan');

            $table->text('alasan_pembatalan')->nullable();

            $table->boolean('di_luar_jam_operasional')
                ->default(false);

            // Mencegah transaksi ganda saat request diulang
            $table->string('idempotency_key')
                ->nullable()
                ->unique();

            $table->timestamps();
        });
    }


    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pesanan');
    }
};
