<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pesanan', function (Blueprint $table): void {
            $table->string('nomor_nota', 40)->nullable()->unique()->after('id_pesanan');
            $table->text('catatan')->nullable()->after('alasan_pembatalan');
            $table->string('status_jam_operasional', 30)->nullable()->after('di_luar_jam_operasional');
            $table->boolean('pada_hari_libur')->default(false)->after('status_jam_operasional');
            $table->boolean('konfirmasi_hari_libur')->default(false)->after('pada_hari_libur');
            $table->unsignedInteger('version')->default(1)->after('idempotency_key');
        });

        Schema::table('kendaraan_pesanan', function (Blueprint $table): void {
            $table->string('plat_nomor', 20)->nullable()->after('nama_kategori_snapshot');
            $table->index('plat_nomor', 'idx_kendaraan_pesanan_plat');
        });

        $existingOrders = DB::table('pesanan')
            ->whereNull('nomor_nota')
            ->select(['id_pesanan', 'waktu_pesanan'])
            ->get();

        foreach ($existingOrders as $order) {
            $datePart = $order->waktu_pesanan !== null
                ? Carbon::parse((string) $order->waktu_pesanan)->timezone('Asia/Jakarta')->format('Ymd')
                : now('Asia/Jakarta')->format('Ymd');

            DB::table('pesanan')
                ->where('id_pesanan', $order->id_pesanan)
                ->update([
                    'nomor_nota' => sprintf('#TRX-%s-%04d', $datePart, (int) $order->id_pesanan),
                ]);
        }
    }

    public function down(): void
    {
        Schema::table('kendaraan_pesanan', function (Blueprint $table): void {
            $table->dropIndex('idx_kendaraan_pesanan_plat');
            $table->dropColumn('plat_nomor');
        });

        Schema::table('pesanan', function (Blueprint $table): void {
            $table->dropUnique(['nomor_nota']);
            $table->dropColumn([
                'nomor_nota',
                'catatan',
                'status_jam_operasional',
                'pada_hari_libur',
                'konfirmasi_hari_libur',
                'version',
            ]);
        });
    }
};
