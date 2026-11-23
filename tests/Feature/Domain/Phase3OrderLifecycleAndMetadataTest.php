<?php

namespace Tests\Feature\Domain;

use App\Models\DetailLayanan;
use App\Models\HargaLayanan;
use App\Models\KategoriKendaraan;
use App\Models\KendaraanPesanan;
use App\Models\Layanan;
use App\Models\Pengguna;
use App\Models\Pesanan;
use App\Models\RiwayatPerubahan;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class Phase3OrderLifecycleAndMetadataTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_order_metadata_nomor_nota_plat_nomor_and_catatan_are_generated_normalized_and_searchable(): void
    {
        $kasir = $this->createUser('kasir');
        $kasirToken = $kasir->createToken('kasir')->plainTextToken;

        [$kategori, , $harga] = $this->seedCatalogTariff('Mobil Kecil', 'Cuci Body', 35000);

        Carbon::setTestNow(Carbon::parse('2026-11-21 10:15:00', 'Asia/Jakarta'));

        $res = $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'nomor_nota' => 'CLIENT-FAKE-999',
            'waktu_pesanan' => '1999-01-01T00:00:00Z',
            'catatan' => '  Jangan semprot area mesin  ',
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'plat_nomor' => '  b  1234  gow  ',
                    'layanan' => [
                        ['id_harga' => $harga->id_harga],
                    ],
                ],
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'plat_nomor' => null,
                    'layanan' => [
                        ['id_harga' => $harga->id_harga],
                    ],
                ],
            ],
        ])->assertStatus(201);

        $orderId = $res->json('data.pesanan.id_pesanan');
        $expectedNota = sprintf('#TRX-20261121-%04d', $orderId);

        $this->assertSame($expectedNota, $res->json('data.pesanan.nomor_nota'));
        $this->assertSame('Jangan semprot area mesin', $res->json('data.pesanan.catatan'));
        $this->assertSame(1, $res->json('data.pesanan.version'));
        $this->assertSame('B 1234 GOW', $res->json('data.pesanan.kendaraan.0.plat_nomor'));
        $this->assertNull($res->json('data.pesanan.kendaraan.1.plat_nomor'));

        // Overlong trimmed plat_nomor rejected cleanly
        $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'plat_nomor' => 'PLAT_TERLALU_PANJANG_12345',
                    'layanan' => [
                        ['id_harga' => $harga->id_harga],
                    ],
                ],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['kendaraan.0.plat_nomor']);

        // Searchable by partial nomor_nota and case-insensitive plat_nomor
        $byPlate = $this->withToken($kasirToken)->getJson('/api/pesanan?search=b 1234 gow')->assertStatus(200);
        $this->assertCount(1, $byPlate->json('data.data'));
        $this->assertSame($orderId, $byPlate->json('data.data.0.id_pesanan'));

        $byNota = $this->withToken($kasirToken)->getJson('/api/pesanan?search=20261121-')->assertStatus(200);
        $this->assertSame($orderId, $byNota->json('data.data.0.id_pesanan'));
    }

    public function test_vehicle_status_updates_atomically_derive_option_b_order_status_and_block_contradictions(): void
    {
        $kasir = $this->createUser('kasir');
        $kasirToken = $kasir->createToken('kasir')->plainTextToken;

        [$kategori, , $harga] = $this->seedCatalogTariff('Motor', 'Cuci Salju', 20000);

        $res = $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'kendaraan' => [
                ['id_kategori_kendaraan' => $kategori->id_kategori_kendaraan, 'layanan' => [['id_harga' => $harga->id_harga]]],
                ['id_kategori_kendaraan' => $kategori->id_kategori_kendaraan, 'layanan' => [['id_harga' => $harga->id_harga]]],
            ],
        ])->assertStatus(201);

        $orderId = $res->json('data.pesanan.id_pesanan');
        $v1Id = $res->json('data.pesanan.kendaraan.0.id_kendaraan_pesanan');
        $v2Id = $res->json('data.pesanan.kendaraan.1.id_kendaraan_pesanan');

        // Contradictory manual order status 'selesai' rejected while vehicles are still menunggu
        $this->withToken($kasirToken)->putJson("/api/pesanan/{$orderId}", [
            'alasan' => 'Paksa selesai padahal belum dicuci',
            'status_pesanan' => 'selesai',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['status_pesanan']);

        // Vehicle 1 -> proses => order remains berjalan
        $this->withToken($kasirToken)->putJson("/api/kendaraan-pesanan/{$v1Id}/status", [
            'status_proses' => 'proses',
        ])->assertStatus(200)
            ->assertJsonPath('pesanan_status', 'berjalan');

        // Vehicle 1 -> selesai, Vehicle 2 still menunggu => order remains berjalan
        $this->withToken($kasirToken)->putJson("/api/kendaraan-pesanan/{$v1Id}/status", [
            'status_proses' => 'selesai',
        ])->assertStatus(200)
            ->assertJsonPath('pesanan_status', 'berjalan');

        // Vehicle 2 -> selesai => ALL vehicles selesai => order atomically becomes selesai
        $this->withToken($kasirToken)->putJson("/api/kendaraan-pesanan/{$v2Id}/status", [
            'status_proses' => 'selesai',
        ])->assertStatus(200)
            ->assertJsonPath('pesanan_status', 'selesai');

        $this->assertSame('selesai', Pesanan::query()->findOrFail($orderId)->status_pesanan);

        // Contradictory manual order status 'berjalan' rejected when all vehicles are selesai
        $this->withToken($kasirToken)->putJson("/api/pesanan/{$orderId}", [
            'alasan' => 'Turunkan status manual bertentangan dengan kendaraan',
            'status_pesanan' => 'berjalan',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['status_pesanan']);

        // Concurrent-style sequential transaction step with stale expected_version returns 409
        $currentVersion = Pesanan::query()->findOrFail($orderId)->version;
        $this->withToken($kasirToken)->putJson("/api/kendaraan-pesanan/{$v2Id}/status", [
            'status_proses' => 'proses',
            'expected_version' => $currentVersion - 1,
        ])->assertStatus(409)
            ->assertJsonPath('error_code', 'VERSION_CONFLICT');

        // Revert Vehicle 2 -> proses using fresh version => order atomically returns to berjalan
        $this->withToken($kasirToken)->putJson("/api/kendaraan-pesanan/{$v2Id}/status", [
            'status_proses' => 'proses',
            'expected_version' => $currentVersion,
        ])->assertStatus(200)
            ->assertJsonPath('pesanan_status', 'berjalan');

        // Concurrent vehicle updates inside explicit transactions derive consistent final order status
        DB::transaction(function () use ($v1Id, $v2Id): void {
            KendaraanPesanan::query()->where('id_kendaraan_pesanan', $v1Id)->update(['status_proses' => 'selesai']);
            KendaraanPesanan::query()->where('id_kendaraan_pesanan', $v2Id)->update(['status_proses' => 'selesai']);
        });

        $this->withToken($kasirToken)->putJson("/api/kendaraan-pesanan/{$v1Id}/status", [
            'status_proses' => 'selesai',
        ])->assertStatus(200)
            ->assertJsonPath('pesanan_status', 'selesai');

        // Cancelled order rejects vehicle status changes
        $this->withToken($kasirToken)->postJson("/api/pesanan/{$orderId}/batal", [
            'alasan_pembatalan' => 'Pelanggan membatalkan transaksi',
        ])->assertStatus(200);

        $this->withToken($kasirToken)->putJson("/api/kendaraan-pesanan/{$v1Id}/status", [
            'status_proses' => 'proses',
        ])->assertStatus(422);
    }

    public function test_order_edit_works_before_and_after_payment_with_version_audit_and_preserves_settled_payment_and_reports(): void
    {
        $kasir = $this->createUser('kasir');
        $owner = $this->createUser('owner');
        $kasirToken = $kasir->createToken('kasir')->plainTextToken;
        $ownerToken = $owner->createToken('owner')->plainTextToken;

        [$kategoriMobil, , $hargaUtama] = $this->seedCatalogTariff('SUV', 'Cuci Premium', 50000, 'utama');
        [, , $hargaAddOn] = $this->seedCatalogTariff('SUV', 'Vacuum Interior', 20000, 'tambahan', $kategoriMobil);

        Carbon::setTestNow(Carbon::parse('2026-11-21 10:00:00', 'Asia/Jakarta'));

        $created = $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'catatan' => 'Catatan awal',
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategoriMobil->id_kategori_kendaraan,
                    'plat_nomor' => 'B 1111 AAA',
                    'layanan' => [
                        ['id_harga' => $hargaUtama->id_harga],
                    ],
                ],
            ],
        ])->assertStatus(201)
            ->assertJsonPath('data.total_harga', 50000);

        $orderId = $created->json('data.pesanan.id_pesanan');
        $vehicleId = $created->json('data.pesanan.kendaraan.0.id_kendaraan_pesanan');

        // Advance vehicle to 'selesai' so order derives 'selesai'
        $this->withToken($kasirToken)->putJson("/api/kendaraan-pesanan/{$vehicleId}/status", [
            'status_proses' => 'selesai',
        ])->assertStatus(200);

        $staleVersion = $created->json('data.pesanan.version'); // 1 (now DB is 2)

        // Stale expected_version rejected with 409
        $this->withToken($kasirToken)->putJson("/api/pesanan/{$orderId}", [
            'expected_version' => $staleVersion,
            'alasan' => 'Tambah layanan tambahan vacuum',
            'kendaraan' => [
                [
                    'id_kendaraan_pesanan' => $vehicleId,
                    'id_kategori_kendaraan' => $kategoriMobil->id_kategori_kendaraan,
                    'layanan' => [
                        ['id_harga' => $hargaUtama->id_harga],
                        ['id_harga' => $hargaAddOn->id_harga],
                    ],
                ],
            ],
        ])->assertStatus(409)
            ->assertJsonPath('error_code', 'VERSION_CONFLICT');

        // Legacy caller omitting expected_version can update pre-payment vehicles/services & preserves existing vehicle status
        $updated = $this->withToken($kasirToken)->putJson("/api/pesanan/{$orderId}", [
            'alasan' => 'Pelanggan tambah layanan vacuum dan tambah motor kedua',
            'catatan' => 'Catatan revisi pra-bayar',
            'kendaraan' => [
                [
                    'id_kendaraan_pesanan' => $vehicleId,
                    'id_kategori_kendaraan' => $kategoriMobil->id_kategori_kendaraan,
                    'plat_nomor' => 'B 1111 AAA',
                    'layanan' => [
                        ['id_harga' => $hargaUtama->id_harga],
                        ['id_harga' => $hargaAddOn->id_harga, 'harga_akhir' => 18000, 'alasan_penyesuaian' => 'Promo bundling'],
                    ],
                ],
                [
                    'id_kategori_kendaraan' => $kategoriMobil->id_kategori_kendaraan,
                    'plat_nomor' => 'd 2222 bbb',
                    'layanan' => [
                        ['id_harga' => $hargaUtama->id_harga],
                    ],
                ],
            ],
        ])->assertStatus(200)
            ->assertJsonPath('subtotal_utama', 100000)
            ->assertJsonPath('subtotal_tambahan', 18000)
            ->assertJsonPath('total_harga', 118000)
            ->assertJsonPath('data.status_pesanan', 'berjalan')
            ->assertJsonPath('data.catatan', 'Catatan revisi pra-bayar');

        // Original vehicle kept 'selesai', added vehicle initialized to 'menunggu' -> order re-derived to 'berjalan'
        $this->assertSame('selesai', $updated->json('data.kendaraan.0.status_proses'));
        $this->assertSame('menunggu', $updated->json('data.kendaraan.1.status_proses'));
        $this->assertSame('D 2222 BBB', $updated->json('data.kendaraan.1.plat_nomor'));

        // Pay order in full via cash (118.000 invoiced, 150.000 tendered -> 32.000 change)
        $this->withToken($kasirToken)->postJson("/api/pesanan/{$orderId}/pembayaran", [
            'jumlah_dibayar' => 150000,
            'metode_pembayaran' => 'tunai',
        ])->assertStatus(200)
            ->assertJsonPath('total_pesanan', 118000)
            ->assertJsonPath('uang_diterima', 150000)
            ->assertJsonPath('kembalian', 32000);

        $secondVehicleId = $updated->json('data.kendaraan.1.id_kendaraan_pesanan');
        $paidVersion = $updated->json('data.version');

        // Paid order service & price edit via PUT /api/pesanan/{id} succeeds for Kasir (with expected_version check & audit)
        $paidEditKasir = $this->withToken($kasirToken)->putJson("/api/pesanan/{$orderId}", [
            'expected_version' => $paidVersion,
            'alasan' => 'Koreksi harga dan tambah layanan vacuum pada kendaraan kedua setelah bayar',
            'catatan' => 'Catatan revisi pasca-bayar kasir',
            'kendaraan' => [
                [
                    'id_kendaraan_pesanan' => $vehicleId,
                    'id_kategori_kendaraan' => $kategoriMobil->id_kategori_kendaraan,
                    'plat_nomor' => 'B 1111 AAA',
                    'layanan' => [
                        ['id_harga' => $hargaUtama->id_harga],
                        ['id_harga' => $hargaAddOn->id_harga, 'harga_akhir' => 18000, 'alasan_penyesuaian' => 'Promo bundling'],
                    ],
                ],
                [
                    'id_kendaraan_pesanan' => $secondVehicleId,
                    'id_kategori_kendaraan' => $kategoriMobil->id_kategori_kendaraan,
                    'plat_nomor' => 'D 2222 BBB',
                    'layanan' => [
                        ['id_harga' => $hargaUtama->id_harga, 'harga_akhir' => 55000, 'alasan_penyesuaian' => 'Penambahan perlakuan noda aspal'],
                        ['id_harga' => $hargaAddOn->id_harga],
                    ],
                ],
            ],
        ])->assertStatus(200)
            ->assertJsonPath('subtotal_utama', 105000)
            ->assertJsonPath('subtotal_tambahan', 38000)
            ->assertJsonPath('total_harga', 143000)
            ->assertJsonPath('data.status_pesanan', 'berjalan')
            ->assertJsonPath('data.catatan', 'Catatan revisi pasca-bayar kasir');

        // Optimistic lock still protects post-payment edits when stale expected_version is sent
        $this->withToken($kasirToken)->putJson("/api/pesanan/{$orderId}", [
            'expected_version' => $paidVersion,
            'alasan' => 'Percobaan edit memakai version lama',
        ])->assertStatus(409)
            ->assertJsonPath('error_code', 'VERSION_CONFLICT');

        // Option B still rejects manual status_pesanan contradicting vehicle statuses on paid orders
        $this->withToken($kasirToken)->putJson("/api/pesanan/{$orderId}", [
            'expected_version' => $paidEditKasir->json('data.version'),
            'alasan' => 'Coba paksa status selesai manual',
            'status_pesanan' => 'selesai',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['status_pesanan']);

        // Owner can also edit paid order services/prices cleanly
        $this->app['auth']->forgetGuards();
        $paidEditOwner = $this->withToken($ownerToken)->putJson("/api/pesanan/{$orderId}", [
            'expected_version' => $paidEditKasir->json('data.version'),
            'alasan' => 'Penyesuaian diskon owner pasca bayar',
            'kendaraan' => [
                [
                    'id_kendaraan_pesanan' => $vehicleId,
                    'id_kategori_kendaraan' => $kategoriMobil->id_kategori_kendaraan,
                    'plat_nomor' => 'B 1111 AAA',
                    'layanan' => [
                        ['id_harga' => $hargaUtama->id_harga],
                        ['id_harga' => $hargaAddOn->id_harga, 'harga_akhir' => 15000, 'alasan_penyesuaian' => 'Diskon owner'],
                    ],
                ],
                [
                    'id_kendaraan_pesanan' => $secondVehicleId,
                    'id_kategori_kendaraan' => $kategoriMobil->id_kategori_kendaraan,
                    'plat_nomor' => 'D 2222 BBB',
                    'layanan' => [
                        ['id_harga' => $hargaUtama->id_harga, 'harga_akhir' => 55000, 'alasan_penyesuaian' => 'Penambahan perlakuan noda aspal'],
                        ['id_harga' => $hargaAddOn->id_harga],
                    ],
                ],
            ],
        ])->assertStatus(200)
            ->assertJsonPath('total_harga', 140000);

        // Payment record, cash change, and settled financial reports remain completely intact (not corrupted)
        $paymentShow = $this->withToken($kasirToken)->getJson("/api/pesanan/{$orderId}/pembayaran")
            ->assertStatus(200);
        $this->assertSame('sudah_dibayar', $paymentShow->json('data.status_pembayaran'));
        $this->assertSame('tunai', $paymentShow->json('data.metode_pembayaran'));
        $this->assertEquals(118000.0, (float) $paymentShow->json('data.jumlah_dibayar'));
        $this->assertEquals(150000.0, (float) $paymentShow->json('data.uang_diterima'));
        $this->assertEquals(32000.0, (float) $paymentShow->json('data.kembalian'));

        // Duplicate settlement attempt remains blocked
        $this->withToken($kasirToken)->postJson("/api/pesanan/{$orderId}/pembayaran", [
            'jumlah_dibayar' => 140000,
            'metode_pembayaran' => 'tunai',
        ])->assertStatus(422);

        $this->app['auth']->forgetGuards();
        $this->withToken($ownerToken)->getJson('/api/laporan?tanggal_mulai=2026-11-21&tanggal_akhir=2026-11-21')
            ->assertStatus(200)
            ->assertJsonPath('data.total_pendapatan', 118000);

        $this->withToken($ownerToken)->getJson('/api/laporan/harian?tanggal_mulai=2026-11-21&tanggal_akhir=2026-11-21')
            ->assertStatus(200)
            ->assertJsonPath('data.0.pendapatan', 118000);

        // FR-33: Kasir and Owner also remain able to update plat_nomor and catatan post-payment via PATCH /metadata with audit
        $this->app['auth']->forgetGuards();
        $currentVersion = $paidEditOwner->json('data.version');

        // Rejected if attempting to pass financial/service field on /metadata
        $this->withToken($kasirToken)->patchJson("/api/pesanan/{$orderId}/metadata", [
            'alasan' => 'Coba sisipkan harga_akhir',
            'catatan' => 'Catatan baru',
            'harga_akhir' => 1000,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['harga_akhir']);

        $metaRes = $this->withToken($kasirToken)->patchJson("/api/pesanan/{$orderId}/metadata", [
            'expected_version' => $currentVersion,
            'alasan' => 'Koreksi salah ketik plat nomor kendaraan kedua',
            'catatan' => 'Catatan pasca bayar diperbarui',
            'kendaraan' => [
                ['id_kendaraan_pesanan' => $secondVehicleId, 'plat_nomor' => 'D 9999 ZZZ'],
            ],
        ])->assertStatus(200)
            ->assertJsonPath('data.catatan', 'Catatan pasca bayar diperbarui')
            ->assertJsonPath('total_harga', 140000);

        $this->assertSame('D 9999 ZZZ', $metaRes->json('data.kendaraan.1.plat_nomor'));
        $this->assertSame($currentVersion + 1, $metaRes->json('data.version'));

        // Verify detail_layanan count (4 lines after post-payment edit) and both edit + metadata audit trails recorded
        $this->assertSame(4, DetailLayanan::query()->count());
        $auditLogs = RiwayatPerubahan::query()
            ->where('entitas', 'pesanan')
            ->where('record_id', $orderId)
            ->orderBy('id_riwayat')
            ->get();

        $paidEditAudit = $auditLogs->firstWhere('alasan', 'Koreksi harga dan tambah layanan vacuum pada kendaraan kedua setelah bayar');
        $this->assertNotNull($paidEditAudit);
        $this->assertSame(118000, $paidEditAudit->nilai_sebelum['total_harga']);
        $this->assertSame(143000, $paidEditAudit->nilai_sesudah['total_harga']);

        $ownerEditAudit = $auditLogs->firstWhere('alasan', 'Penyesuaian diskon owner pasca bayar');
        $this->assertNotNull($ownerEditAudit);
        $this->assertSame(143000, $ownerEditAudit->nilai_sebelum['total_harga']);
        $this->assertSame(140000, $ownerEditAudit->nilai_sesudah['total_harga']);

        $latestAudit = $auditLogs->last();
        $this->assertSame('METADATA_UPDATE', $latestAudit->nilai_sesudah['aksi']);
        $this->assertSame('Koreksi salah ketik plat nomor kendaraan kedua', $latestAudit->alasan);
    }

    private function createUser(string $role): Pengguna
    {
        return Pengguna::query()->create([
            'nama_lengkap' => ucfirst($role).' Lifecycle',
            'username' => $role.'_lc_'.uniqid(),
            'kata_sandi_hash' => 'Password123!',
            'peran' => $role,
            'status_aktif' => true,
        ]);
    }

    /**
     * @return array{0: KategoriKendaraan, 1: Layanan, 2: HargaLayanan}
     */
    private function seedCatalogTariff(
        string $namaKategori,
        string $namaLayanan,
        int $hargaDasar,
        string $tipe = 'utama',
        ?KategoriKendaraan $kategoriOverride = null,
    ): array {
        $kategori = $kategoriOverride ?? KategoriKendaraan::query()->create([
            'jenis_kendaraan' => 'mobil',
            'nama_kategori' => $namaKategori.' '.uniqid(),
            'status_aktif' => true,
        ]);

        $layanan = Layanan::query()->create([
            'nama_layanan' => $namaLayanan.' '.uniqid(),
            'tipe_layanan' => $tipe,
            'status_aktif' => true,
        ]);

        $harga = HargaLayanan::query()->create([
            'id_layanan' => $layanan->id_layanan,
            'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
            'harga_dasar' => $hargaDasar,
            'batas_bawah' => max(0, $hargaDasar - 5000),
            'batas_atas' => $hargaDasar + 15000,
            'status_aktif' => true,
        ]);

        return [$kategori, $layanan, $harga];
    }
}
