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
        Schema::create('riwayat_perubahan', function (Blueprint $table) {
            $table->id('id_riwayat');

            $table->foreignId('id_pengguna')
                ->constrained('pengguna', 'id_pengguna')
                ->restrictOnDelete();

            $table->string('entitas');
            $table->unsignedBigInteger('record_id');
            $table->timestamp('waktu_perubahan');

            $table->json('nilai_sebelum')->nullable();
            $table->json('nilai_sesudah')->nullable();

            $table->text('alasan')->nullable();

            $table->timestamps();
        });
    }
    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('riwayat_perubahan');
    }
};
