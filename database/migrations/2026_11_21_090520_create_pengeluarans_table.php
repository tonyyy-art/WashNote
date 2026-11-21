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
        Schema::create('pengeluaran', function (Blueprint $table) {
            $table->id('id_pengeluaran');

            $table->foreignId('id_pengguna')
                ->constrained('pengguna', 'id_pengguna')
                ->restrictOnDelete();

            $table->foreignId('id_kategori_pengeluaran')
                ->constrained(
                    'kategori_pengeluaran',
                    'id_kategori_pengeluaran'
                )
                ->restrictOnDelete();

            $table->date('tanggal_pengeluaran');
            $table->text('deskripsi');
            $table->decimal('nominal', 12, 2);

            $table->string('status_pengeluaran')
                ->default('aktif');

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pengeluaran');
    }
};
