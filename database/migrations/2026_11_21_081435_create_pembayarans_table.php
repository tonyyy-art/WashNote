<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{

    public function up(): void
    {
        Schema::create('pembayaran', function (Blueprint $table) {
            $table->id('id_pembayaran');

            $table->foreignId('id_pesanan')
                ->unique()
                ->constrained('pesanan', 'id_pesanan')
                ->cascadeOnDelete();

            $table->decimal('jumlah_dibayar', 12, 2)->nullable();

            $table->string('metode_pembayaran')->nullable();

            $table->string('status_pembayaran')
                ->default('belum_dibayar');

            $table->timestamp('waktu_penerimaan')->nullable();

            $table->timestamps();
        });
    }


    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pembayaran');
    }
};
