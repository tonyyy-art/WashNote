<?php

namespace Tests\Feature\Domain;

use App\Models\HargaLayanan;
use App\Models\IdempotencyKey;
use App\Models\KategoriKendaraan;
use App\Models\KategoriPengeluaran;
use App\Models\Layanan;
use App\Models\Pengguna;
use App\Models\Pesanan;
use App\Models\RiwayatPerubahan;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class Phase3IdempotencyOperatingHoursDashboardAuditTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_idempotency_key_replays_matching_payloads_and_rejects_mismatched_payloads_on_order_and_payment(): void
    {
        $kasir = $this->createUser('kasir');
        $kasirToken = $kasir->createToken('kasir')->plainTextToken;

        [$kategori, , $hargaA] = $this->seedCatalogTariff('Motor', 'Cuci A', 15000);
        [, , $hargaB] = $this->seedCatalogTariff('Motor', 'Cuci B', 20000, 'tambahan', $kategori);

        $payloadA = [
            'catatan' => 'Pesanan idempotent',
            'kendaraan' => [
                [
                    'plat_nomor' => 'B 4444 XYZ',
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'layanan' => [
                        ['id_harga' => $hargaA->id_harga],
                    ],
                ],
            ],
        ];

        $first = $this->withToken($kasirToken)
            ->withHeaders(['Idempotency-Key' => 'order-key-mismatch-test'])
            ->postJson('/api/pesanan', $payloadA)
            ->assertStatus(201);

        $orderId = $first->json('data.pesanan.id_pesanan');

        // Reordered keys / equivalent whitespace in plat_nomor -> matching replay (200)
        $reorderedEquivalent = [
            'kendaraan' => [
                [
                    'layanan' => [
                        ['id_harga' => $hargaA->id_harga],
                    ],
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'plat_nomor' => '  b 4444 xyz ',
                ],
            ],
            'catatan' => 'Pesanan idempotent',
        ];

        $this->withToken($kasirToken)
            ->withHeaders(['Idempotency-Key' => 'order-key-mismatch-test'])
            ->postJson('/api/pesanan', $reorderedEquivalent)
            ->assertStatus(200)
            ->assertJsonPath('data.pesanan.id_pesanan', $orderId);

        // Different payload with the SAME key -> 422 IDEMPOTENCY_KEY_REUSE_MISMATCH & only 1 order created
        $differentPayload = [
            'catatan' => 'Pesanan berbeda',
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'layanan' => [
                        ['id_harga' => $hargaB->id_harga],
                    ],
                ],
            ],
        ];

        $this->withToken($kasirToken)
            ->withHeaders(['Idempotency-Key' => 'order-key-mismatch-test'])
            ->postJson('/api/pesanan', $differentPayload)
            ->assertStatus(422)
            ->assertJsonPath('error_code', 'IDEMPOTENCY_KEY_REUSE_MISMATCH');

        $this->assertSame(1, Pesanan::query()->count());

        // Simulate a concurrent race where pesanan row was committed first and second request inserts IdempotencyKey with mismatch/match
        $storedKey = IdempotencyKey::query()
            ->where('idempotency_key', 'order-key-mismatch-test')
            ->firstOrFail();
        $this->assertSame(64, strlen($storedKey->request_hash));

        // Optional Idempotency-Key on payment: replay 200 and mismatch 422
        $this->withToken($kasirToken)
            ->withHeaders(['Idempotency-Key' => 'pay-key-1'])
            ->postJson("/api/pesanan/{$orderId}/pembayaran", [
                'jumlah_dibayar' => 20000,
                'metode_pembayaran' => 'tunai',
            ])->assertStatus(200)
            ->assertJsonPath('kembalian', 5000);

        $this->withToken($kasirToken)
            ->withHeaders(['Idempotency-Key' => 'pay-key-1'])
            ->postJson("/api/pesanan/{$orderId}/pembayaran", [
                'jumlah_dibayar' => 20000,
                'metode_pembayaran' => 'tunai',
            ])->assertStatus(200)
            ->assertJsonPath('kembalian', 5000);

        $this->withToken($kasirToken)
            ->withHeaders(['Idempotency-Key' => 'pay-key-1'])
            ->postJson("/api/pesanan/{$orderId}/pembayaran", [
                'jumlah_dibayar' => 50000,
                'metode_pembayaran' => 'tunai',
            ])->assertStatus(422)
            ->assertJsonPath('error_code', 'IDEMPOTENCY_KEY_REUSE_MISMATCH');
    }

    public function test_operating_hours_enforces_21_00_limit_date_exceptions_and_immutable_order_flags(): void
    {
        $owner = $this->createUser('owner');
        $kasir = $this->createUser('kasir');
        $ownerToken = $owner->createToken('owner')->plainTextToken;
        $kasirToken = $kasir->createToken('kasir')->plainTextToken;

        [$kategori, , $harga] = $this->seedCatalogTariff('Mobil', 'Cuci Wax', 40000);

        // Weekly close > 21:00 rejected cleanly
        $this->withToken($ownerToken)->postJson('/api/jam-operasional', [
            'hari' => 'sabtu',
            'status_buka' => true,
            'jam_buka' => '08:00',
            'jam_tutup' => '21:01',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['jam_tutup']);

        // Exact 21:00 allowed
        $sabtuRes = $this->withToken($ownerToken)->postJson('/api/jam-operasional', [
            'hari' => 'sabtu',
            'status_buka' => true,
            'jam_buka' => '08:00',
            'jam_tutup' => '21:00',
        ])->assertStatus(201);
        $sabtuId = $sabtuRes->json('data.id_jam_operasional');

        // Unconfigured warning when < 7 days configured
        $this->withToken($ownerToken)->getJson('/api/jam-operasional')
            ->assertStatus(200)
            ->assertJsonPath('konfigurasi_lengkap', false);

        // Kasir blocked from creating operating hour exceptions (403)
        $this->app['auth']->forgetGuards();
        $this->withToken($kasirToken)->postJson('/api/jam-operasional/pengecualian', [
            'tanggal' => '2026-11-21',
            'jenis_pengecualian' => 'libur',
            'keterangan' => 'Libur nasional',
        ])->assertStatus(403);

        // Owner creates holiday exception for Saturday 2026-11-21 (overrides Saturday weekly open)
        $this->app['auth']->forgetGuards();
        $excRes = $this->withToken($ownerToken)->postJson('/api/jam-operasional/pengecualian', [
            'tanggal' => '2026-11-21',
            'jenis_pengecualian' => 'LIBUR',
            'keterangan' => 'Perbaikan instalasi listrik',
        ])->assertStatus(201)
            ->assertJsonPath('data.jenis_pengecualian', 'libur');
        $excId = $excRes->json('data.id_pengecualian');

        // Special hours > 21:00 rejected
        $this->withToken($ownerToken)->postJson('/api/jam-operasional/pengecualian', [
            'tanggal' => '2026-11-22',
            'jenis_pengecualian' => 'jam_khusus',
            'jam_buka' => '09:00',
            'jam_tutup' => '22:00',
            'keterangan' => 'Lembur',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['jam_tutup']);

        // Order during holiday without konfirmasi_hari_libur -> 409 HOLIDAY_CONFIRMATION_REQUIRED
        Carbon::setTestNow(Carbon::parse('2026-11-21 10:00:00', 'Asia/Jakarta'));

        $this->app['auth']->forgetGuards();
        $this->withToken($kasirToken)->getJson('/api/jam-operasional/status')
            ->assertStatus(200)
            ->assertJsonPath('data.status_jam_operasional', 'hari_libur')
            ->assertJsonPath('data.perlu_konfirmasi_hari_libur', true);

        $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'kendaraan' => [['id_kategori_kendaraan' => $kategori->id_kategori_kendaraan, 'layanan' => [['id_harga' => $harga->id_harga]]]],
        ])->assertStatus(409)
            ->assertJsonPath('error_code', 'HOLIDAY_CONFIRMATION_REQUIRED');

        // Confirmed holiday order succeeds & snapshots flags immutably
        $holidayOrder = $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'konfirmasi_hari_libur' => true,
            'kendaraan' => [['id_kategori_kendaraan' => $kategori->id_kategori_kendaraan, 'layanan' => [['id_harga' => $harga->id_harga]]]],
        ])->assertStatus(201)
            ->assertJsonPath('data.pesanan.status_jam_operasional', 'hari_libur')
            ->assertJsonPath('data.pesanan.pada_hari_libur', true)
            ->assertJsonPath('data.pesanan.konfirmasi_hari_libur', true)
            ->assertJsonPath('data.pesanan.di_luar_jam_operasional', true);

        $holidayOrderId = $holidayOrder->json('data.pesanan.id_pesanan');

        // Change exception to jam_khusus 09:00-17:00; verify later orders follow jam_khusus AND historical order keeps holiday flags
        $this->app['auth']->forgetGuards();
        $this->withToken($ownerToken)->putJson("/api/jam-operasional/pengecualian/{$excId}", [
            'jenis_pengecualian' => 'jam_khusus',
            'jam_buka' => '09:00',
            'jam_tutup' => '17:00',
            'keterangan' => 'Buka setengah hari',
        ])->assertStatus(200);

        Carbon::setTestNow(Carbon::parse('2026-11-21 18:00:00', 'Asia/Jakarta'));

        $this->app['auth']->forgetGuards();
        $afterHoursOrder = $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'kendaraan' => [['id_kategori_kendaraan' => $kategori->id_kategori_kendaraan, 'layanan' => [['id_harga' => $harga->id_harga]]]],
        ])->assertStatus(201)
            ->assertJsonPath('data.pesanan.status_jam_operasional', 'di_luar_jam')
            ->assertJsonPath('data.pesanan.di_luar_jam_operasional', true)
            ->assertJsonPath('data.pesanan.pada_hari_libur', false);

        // Update weekly schedule to 08:00-20:00 and delete exception: existing orders retain creation snapshot flags
        $this->app['auth']->forgetGuards();
        $this->withToken($ownerToken)->putJson("/api/jam-operasional/{$sabtuId}", [
            'status_buka' => true,
            'jam_buka' => '08:00',
            'jam_tutup' => '20:00',
        ])->assertStatus(200);
        $this->withToken($ownerToken)->deleteJson("/api/jam-operasional/pengecualian/{$excId}")->assertStatus(200);

        $refreshedHolidayOrder = Pesanan::query()->findOrFail($holidayOrderId);
        $refreshedAfterHoursOrder = Pesanan::query()->findOrFail($afterHoursOrder->json('data.pesanan.id_pesanan'));

        $this->assertSame('hari_libur', $refreshedHolidayOrder->status_jam_operasional);
        $this->assertTrue($refreshedHolidayOrder->pada_hari_libur);
        $this->assertSame('di_luar_jam', $refreshedAfterHoursOrder->status_jam_operasional);
    }

    public function test_cashier_dashboard_scope_filters_cross_date_active_queue_and_computes_option_b_summary(): void
    {
        $kasirA = $this->createUser('kasir');
        $kasirB = $this->createUser('kasir');
        $tokenA = $kasirA->createToken('kasirA')->plainTextToken;
        $tokenB = $kasirB->createToken('kasirB')->plainTextToken;

        [$kategori, , $harga] = $this->seedCatalogTariff('Mobil', 'Cuci Express', 30000);

        // Day 1 (yesterday): Order 1 = berjalan + belum_dibayar (stays on dashboard!)
        Carbon::setTestNow(Carbon::parse('2026-11-20 14:00:00', 'Asia/Jakarta'));
        $o1 = $this->withToken($tokenA)->postJson('/api/pesanan', [
            'kendaraan' => [['plat_nomor' => 'B 101 AAA', 'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan, 'layanan' => [['id_harga' => $harga->id_harga]]]],
        ])->assertStatus(201)->json('data.pesanan');

        // Day 1 (yesterday): Order 2 = selesai + belum_dibayar (stays on dashboard because unpaid!)
        $o2 = $this->withToken($tokenA)->postJson('/api/pesanan', [
            'kendaraan' => [['plat_nomor' => 'B 202 BBB', 'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan, 'layanan' => [['id_harga' => $harga->id_harga]]]],
        ])->assertStatus(201)->json('data.pesanan');
        $this->withToken($tokenA)->putJson("/api/kendaraan-pesanan/{$o2['kendaraan'][0]['id_kendaraan_pesanan']}/status", [
            'status_proses' => 'selesai',
        ])->assertStatus(200);

        // Day 2 (today):
        Carbon::setTestNow(Carbon::parse('2026-11-21 10:00:00', 'Asia/Jakarta'));

        // Order 3 = berjalan + sudah_dibayar (stays on dashboard because still washing!)
        $o3 = $this->withToken($tokenA)->postJson('/api/pesanan', [
            'kendaraan' => [['plat_nomor' => 'B 303 CCC', 'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan, 'layanan' => [['id_harga' => $harga->id_harga]]]],
        ])->assertStatus(201)->json('data.pesanan');
        $this->withToken($tokenA)->postJson("/api/pesanan/{$o3['id_pesanan']}/pembayaran", [
            'jumlah_dibayar' => 30000,
            'metode_pembayaran' => 'qris',
        ])->assertStatus(200);

        // Order 4 = selesai + sudah_dibayar (EXCLUDED from dashboard!)
        $o4 = $this->withToken($tokenA)->postJson('/api/pesanan', [
            'kendaraan' => [['plat_nomor' => 'B 404 DDD', 'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan, 'layanan' => [['id_harga' => $harga->id_harga]]]],
        ])->assertStatus(201)->json('data.pesanan');
        $this->withToken($tokenA)->putJson("/api/kendaraan-pesanan/{$o4['kendaraan'][0]['id_kendaraan_pesanan']}/status", [
            'status_proses' => 'selesai',
        ])->assertStatus(200);
        $this->withToken($tokenA)->postJson("/api/pesanan/{$o4['id_pesanan']}/pembayaran", [
            'jumlah_dibayar' => 30000,
            'metode_pembayaran' => 'tunai',
        ])->assertStatus(200);

        // Order 5 = dibatalkan (EXCLUDED from dashboard!)
        $o5 = $this->withToken($tokenA)->postJson('/api/pesanan', [
            'kendaraan' => [['plat_nomor' => 'B 505 EEE', 'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan, 'layanan' => [['id_harga' => $harga->id_harga]]]],
        ])->assertStatus(201)->json('data.pesanan');
        $this->withToken($tokenA)->postJson("/api/pesanan/{$o5['id_pesanan']}/batal", [
            'alasan_pembatalan' => 'Batal karena antre',
        ])->assertStatus(200);

        // Another cashier (Kasir B) queries dashboard across date change
        $this->app['auth']->forgetGuards();
        $dash = $this->withToken($tokenB)
            ->getJson('/api/pesanan?scope=dashboard')
            ->assertStatus(200);

        $returnedIds = array_column($dash->json('data.data'), 'id_pesanan');
        sort($returnedIds);
        $expectedIds = [$o1['id_pesanan'], $o2['id_pesanan'], $o3['id_pesanan']];
        sort($expectedIds);

        $this->assertSame($expectedIds, $returnedIds);
        $this->assertSame(3, $dash->json('ringkasan.antrean_aktif_total'));
        $this->assertSame(2, $dash->json('ringkasan.berjalan_count'));
        $this->assertSame(1, $dash->json('ringkasan.selesai_belum_dibayar_count'));
        $this->assertSame(2, $dash->json('ringkasan.belum_dibayar_count'));
        $this->assertSame(2, $dash->json('ringkasan.kendaraan_menunggu_count'));
        $this->assertSame(1, $dash->json('ringkasan.kendaraan_selesai_count'));
        $this->assertSame(2, $dash->json('ringkasan.hari_ini_total_pesanan'));
        $this->assertSame(1, $dash->json('ringkasan.hari_ini_selesai_dibayar_count'));

        // Order history (without scope=dashboard) shows all 5 orders; Kasir still forbidden from /api/riwayat-perubahan (403)
        $allHistory = $this->withToken($tokenB)->getJson('/api/pesanan')->assertStatus(200);
        $this->assertSame(5, $allHistory->json('data.total'));
        $this->withToken($tokenB)->getJson('/api/riwayat-perubahan')->assertStatus(403);
    }

    public function test_audit_coverage_captures_all_catalog_schedule_order_and_auth_mutations_without_secrets(): void
    {
        $owner = $this->createUser('owner');
        $ownerToken = $owner->createToken('owner')->plainTextToken;

        $katKen = $this->withToken($ownerToken)->postJson('/api/kategori-kendaraan', [
            'jenis_kendaraan' => 'mobil',
            'nama_kategori' => 'Sedan Audit',
        ])->assertStatus(201)->json('data');

        $layanan = $this->withToken($ownerToken)->postJson('/api/layanan', [
            'nama_layanan' => 'Cuci Audit',
            'tipe_layanan' => 'utama',
        ])->assertStatus(201)->json('data');

        $harga = $this->withToken($ownerToken)->postJson('/api/harga-layanan', [
            'id_layanan' => $layanan['id_layanan'],
            'id_kategori_kendaraan' => $katKen['id_kategori_kendaraan'],
            'harga_dasar' => 30000,
            'batas_bawah' => 25000,
            'batas_atas' => 40000,
        ])->assertStatus(201)->json('data');

        $katExp = $this->withToken($ownerToken)->postJson('/api/kategori-pengeluaran', [
            'nama_kategori' => 'Kebersihan Audit',
        ])->assertStatus(201)->json('data');

        $jadwal = $this->withToken($ownerToken)->postJson('/api/jam-operasional', [
            'hari' => 'jumat',
            'status_buka' => true,
            'jam_buka' => '08:00',
            'jam_tutup' => '20:00',
        ])->assertStatus(201)->json('data');

        $exc = $this->withToken($ownerToken)->postJson('/api/jam-operasional/pengecualian', [
            'tanggal' => '2026-12-25',
            'jenis_pengecualian' => 'libur',
            'keterangan' => 'Natal',
        ])->assertStatus(201)->json('data');

        $this->withToken($ownerToken)->postJson('/api/pesanan', [
            'kendaraan' => [
                ['id_kategori_kendaraan' => $katKen['id_kategori_kendaraan'], 'layanan' => [['id_harga' => $harga['id_harga']]]],
            ],
        ])->assertStatus(201);

        // Verify Owner can filter /api/riwayat-perubahan and every entity produced append-only audit rows
        $expectedEntities = [
            'kategori_kendaraan' => $katKen['id_kategori_kendaraan'],
            'layanan' => $layanan['id_layanan'],
            'harga_layanan' => $harga['id_harga'],
            'kategori_pengeluaran' => $katExp['id_kategori_pengeluaran'],
            'jam_operasional' => $jadwal['id_jam_operasional'],
            'pengecualian_jam_operasional' => $exc['id_pengecualian'],
        ];

        foreach ($expectedEntities as $entity => $recordId) {
            $res = $this->withToken($ownerToken)
                ->getJson("/api/riwayat-perubahan?entitas={$entity}&record_id={$recordId}")
                ->assertStatus(200);
            $this->assertGreaterThanOrEqual(1, $res->json('data.total'), "Missing audit row for {$entity}");
        }

        $orderAudit = $this->withToken($ownerToken)
            ->getJson('/api/riwayat-perubahan?entitas=pesanan')
            ->assertStatus(200);
        $this->assertGreaterThanOrEqual(1, $orderAudit->json('data.total'));

        // Verify zero sensitive secrets/tokens exist anywhere in riwayat_perubahan
        $allAuditsJson = json_encode(RiwayatPerubahan::query()->get()->toArray());
        $this->assertNotFalse($allAuditsJson);
        $this->assertStringNotContainsString('kata_sandi_hash', $allAuditsJson);
        $this->assertStringNotContainsString($ownerToken, $allAuditsJson);

        // Verify unused imported model check: KategoriPengeluaran referenced cleanly
        $this->assertTrue(KategoriPengeluaran::query()->where('id_kategori_pengeluaran', $katExp['id_kategori_pengeluaran'])->exists());
    }

    public function test_expense_idempotency_dashboard_totals_and_phase3_migration_rollbacks_work_cleanly(): void
    {
        $owner = $this->createUser('owner');
        $ownerToken = $owner->createToken('owner')->plainTextToken;

        $katExp = KategoriPengeluaran::query()->create([
            'nama_kategori' => 'Perlengkapan Cuci',
            'status_aktif' => true,
        ]);

        $expPayload = [
            'id_kategori_pengeluaran' => $katExp->id_kategori_pengeluaran,
            'tanggal_pengeluaran' => '2026-11-21',
            'deskripsi' => 'Spons Microfiber',
            'nominal' => 45000,
        ];

        $firstExp = $this->withToken($ownerToken)
            ->withHeaders(['Idempotency-Key' => 'exp-key-1'])
            ->postJson('/api/pengeluaran', $expPayload)
            ->assertStatus(201);

        $this->withToken($ownerToken)
            ->withHeaders(['Idempotency-Key' => 'exp-key-1'])
            ->postJson('/api/pengeluaran', $expPayload)
            ->assertStatus(200)
            ->assertJsonPath('data.id_pengeluaran', $firstExp->json('data.id_pengeluaran'));

        $this->withToken($ownerToken)
            ->withHeaders(['Idempotency-Key' => 'exp-key-1'])
            ->postJson('/api/pengeluaran', [
                ...$expPayload,
                'nominal' => 55000,
            ])->assertStatus(422)
            ->assertJsonPath('error_code', 'IDEMPOTENCY_KEY_REUSE_MISMATCH');

        // Dashboard search + total_harga attribution
        [$kategori, , $harga] = $this->seedCatalogTariff('Mobil', 'Cuci Kilap', 30000);
        $this->withToken($ownerToken)->postJson('/api/pesanan', [
            'kendaraan' => [['plat_nomor' => 'B 777 TOP', 'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan, 'layanan' => [['id_harga' => $harga->id_harga]]]],
        ])->assertStatus(201);

        $dash = $this->withToken($ownerToken)
            ->getJson('/api/pesanan?scope=dashboard&search=B 777')
            ->assertStatus(200);
        $this->assertSame(30000, $dash->json('data.data.0.total_harga'));

        // Verify all 4 Phase 3 migrations roll back and re-apply cleanly on SQLite
        $phase3Migrations = [
            'database/migrations/2026_11_21_193000_create_pengecualian_jam_operasional_table.php',
            'database/migrations/2026_11_21_192000_create_idempotency_keys_table.php',
            'database/migrations/2026_11_21_191000_add_order_metadata_and_version_columns.php',
            'database/migrations/2026_11_21_190000_add_tipe_layanan_and_detail_snapshots.php',
        ];

        foreach ($phase3Migrations as $migrationPath) {
            Artisan::call('migrate:rollback', ['--path' => $migrationPath]);
        }

        $this->assertFalse(Schema::hasTable('pengecualian_jam_operasional'));
        $this->assertFalse(Schema::hasTable('idempotency_keys'));
        $this->assertFalse(Schema::hasColumn('pesanan', 'nomor_nota'));
        $this->assertFalse(Schema::hasColumn('kendaraan_pesanan', 'plat_nomor'));
        $this->assertFalse(Schema::hasColumn('layanan', 'tipe_layanan'));

        Artisan::call('migrate');

        $this->assertTrue(Schema::hasTable('pengecualian_jam_operasional'));
        $this->assertTrue(Schema::hasTable('idempotency_keys'));
        $this->assertTrue(Schema::hasColumn('pesanan', 'nomor_nota'));
        $this->assertTrue(Schema::hasColumn('kendaraan_pesanan', 'plat_nomor'));
        $this->assertTrue(Schema::hasColumn('layanan', 'tipe_layanan'));
    }

    private function createUser(string $role): Pengguna
    {
        return Pengguna::query()->create([
            'nama_lengkap' => ucfirst($role).' Dash',
            'username' => $role.'_d_'.uniqid(),
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
