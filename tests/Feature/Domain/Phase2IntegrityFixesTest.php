<?php

namespace Tests\Feature\Domain;

use App\Models\HargaLayanan;
use App\Models\KategoriKendaraan;
use App\Models\KategoriPengeluaran;
use App\Models\Layanan;
use App\Models\Pembayaran;
use App\Models\Pengguna;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class Phase2IntegrityFixesTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_jam_operasional_index_orders_weekdays_portably_and_rollback_drops_table(): void
    {
        $owner = $this->createUser('owner');
        $token = $owner->createToken('owner')->plainTextToken;

        $this->withToken($token)->postJson('/api/jam-operasional', [
            'hari' => 'minggu',
            'status_buka' => false,
            'jam_buka' => '08:00',
            'jam_tutup' => '17:00',
        ])->assertStatus(201)
            ->assertJsonPath('data.jam_buka', null)
            ->assertJsonPath('data.jam_tutup', null);

        $this->withToken($token)->postJson('/api/jam-operasional', [
            'hari' => 'senin',
            'status_buka' => true,
            'jam_buka' => '08:00',
            'jam_tutup' => '20:00',
        ])->assertStatus(201);

        $list = $this->withToken($token)->getJson('/api/jam-operasional')->assertStatus(200);
        $this->assertSame(['senin', 'minggu'], array_column($list->json('data'), 'hari'));

        // Verify fixed down() drops jam_operasional cleanly
        Artisan::call('migrate:rollback', [
            '--path' => 'database/migrations/2026_11_21_162312_create_jam_operasionals_table.php',
        ]);
        $this->assertFalse(Schema::hasTable('jam_operasional'));
        Artisan::call('migrate');
        $this->assertTrue(Schema::hasTable('jam_operasional'));
    }

    public function test_kategori_pengeluaran_show_and_status_update_work(): void
    {
        $owner = $this->createUser('owner');
        $token = $owner->createToken('owner')->plainTextToken;

        $created = $this->withToken($token)->postJson('/api/kategori-pengeluaran', [
            'nama_kategori' => 'Bahan Pembersih',
        ])->assertStatus(201);

        $id = $created->json('data.id_kategori_pengeluaran');

        $this->withToken($token)->getJson("/api/kategori-pengeluaran/{$id}")
            ->assertStatus(200)
            ->assertJsonPath('data.nama_kategori', 'Bahan Pembersih');

        $this->withToken($token)->deleteJson("/api/kategori-pengeluaran/{$id}")->assertStatus(200);

        $this->withToken($token)->putJson("/api/kategori-pengeluaran/{$id}", [
            'nama_kategori' => 'Bahan Kimia',
            'status_aktif' => true,
        ])->assertStatus(200)
            ->assertJsonPath('data.status_aktif', true);
    }

    public function test_harga_layanan_allows_new_active_tariff_after_soft_deactivation_and_validates_bounds(): void
    {
        $owner = $this->createUser('owner');
        $token = $owner->createToken('owner')->plainTextToken;

        $kategori = KategoriKendaraan::query()->create([
            'jenis_kendaraan' => 'motor',
            'nama_kategori' => 'Motor Matic',
            'status_aktif' => true,
        ]);

        $layanan = Layanan::query()->create([
            'nama_layanan' => 'Cuci Reguler',
            'status_aktif' => true,
        ]);

        // Invalid bounds -> 422 with errors.harga_dasar
        $this->withToken($token)->postJson('/api/harga-layanan', [
            'id_layanan' => $layanan->id_layanan,
            'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
            'harga_dasar' => 10000,
            'batas_bawah' => 12000,
            'batas_atas' => 20000,
        ])->assertStatus(422)
            ->assertJsonValidationErrors('harga_dasar');

        // Create initial active tariff
        $first = $this->withToken($token)->postJson('/api/harga-layanan', [
            'id_layanan' => $layanan->id_layanan,
            'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
            'harga_dasar' => 15000,
            'batas_bawah' => 12000,
            'batas_atas' => 20000,
        ])->assertStatus(201);

        $firstId = $first->json('data.id_harga');

        // Second active tariff for same (layanan, kategori) fails cleanly with 422 (not 500)
        $this->withToken($token)->postJson('/api/harga-layanan', [
            'id_layanan' => $layanan->id_layanan,
            'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
            'harga_dasar' => 16000,
            'batas_bawah' => 13000,
            'batas_atas' => 21000,
        ])->assertStatus(422);

        // Deactivate first tariff, then creating a new active tariff succeeds
        $this->withToken($token)->deleteJson("/api/harga-layanan/{$firstId}")->assertStatus(200);

        $this->withToken($token)->postJson('/api/harga-layanan', [
            'id_layanan' => $layanan->id_layanan,
            'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
            'harga_dasar' => 16000,
            'batas_bawah' => 13000,
            'batas_atas' => 21000,
        ])->assertStatus(201);
    }

    public function test_pembayaran_records_invoice_revenue_separately_from_tendered_cash_and_reports_accurately(): void
    {
        $owner = $this->createUser('owner');
        $kasir = $this->createUser('kasir');

        $ownerToken = $owner->createToken('owner')->plainTextToken;
        $kasirToken = $kasir->createToken('kasir')->plainTextToken;

        [$harga] = $this->seedCatalogItem(15000);

        Carbon::setTestNow(Carbon::parse('2026-11-21 23:30:00', 'Asia/Jakarta'));

        $orderRes = $this->withToken($kasirToken)
            ->withHeaders(['Idempotency-Key' => 'idem-order-1'])
            ->postJson('/api/pesanan', [
                'kendaraan' => [
                    [
                        'id_kategori_kendaraan' => $harga->id_kategori_kendaraan,
                        'layanan' => [
                            ['id_harga' => $harga->id_harga],
                        ],
                    ],
                ],
            ])->assertStatus(201);

        $orderId = $orderRes->json('data.pesanan.id_pesanan');

        // Idempotent replay matches 201 payload shape and blocks cross-user key reuse
        $this->withToken($kasirToken)
            ->withHeaders(['Idempotency-Key' => 'idem-order-1'])
            ->postJson('/api/pesanan', [
                'kendaraan' => [
                    [
                        'id_kategori_kendaraan' => $harga->id_kategori_kendaraan,
                        'layanan' => [
                            ['id_harga' => $harga->id_harga],
                        ],
                    ],
                ],
            ])->assertStatus(200)
            ->assertJsonPath('data.pesanan.id_pesanan', $orderId)
            ->assertJsonPath('data.total_harga', 15000);

        $this->app['auth']->forgetGuards();
        $this->withToken($ownerToken)
            ->withHeaders(['Idempotency-Key' => 'idem-order-1'])
            ->postJson('/api/pesanan', [
                'kendaraan' => [
                    [
                        'id_kategori_kendaraan' => $harga->id_kategori_kendaraan,
                        'layanan' => [
                            ['id_harga' => $harga->id_harga],
                        ],
                    ],
                ],
            ])->assertStatus(409);

        // Customer tenders Rp 50.000 cash for a Rp 15.000 invoice
        $this->app['auth']->forgetGuards();
        $payRes = $this->withToken($kasirToken)->postJson("/api/pesanan/{$orderId}/pembayaran", [
            'jumlah_dibayar' => 50000,
            'metode_pembayaran' => 'tunai',
        ])->assertStatus(200);

        $payRes->assertJsonPath('total_pesanan', 15000)
            ->assertJsonPath('uang_diterima', 50000)
            ->assertJsonPath('kembalian', 35000);

        $pembayaran = Pembayaran::query()->where('id_pesanan', $orderId)->firstOrFail();
        $this->assertEquals(15000.0, (float) $pembayaran->jumlah_dibayar);
        $this->assertEquals(50000.0, (float) $pembayaran->uang_diterima);
        $this->assertEquals(35000.0, (float) $pembayaran->kembalian);

        // Double pay rejected
        $this->withToken($kasirToken)->postJson("/api/pesanan/{$orderId}/pembayaran", [
            'jumlah_dibayar' => 15000,
            'metode_pembayaran' => 'tunai',
        ])->assertStatus(422);

        // Add active expense on 2026-11-21
        $this->app['auth']->forgetGuards();
        $katExp = KategoriPengeluaran::query()->create(['nama_kategori' => 'Sabun', 'status_aktif' => true]);
        $this->withToken($ownerToken)->postJson('/api/pengeluaran', [
            'id_kategori_pengeluaran' => $katExp->id_kategori_pengeluaran,
            'tanggal_pengeluaran' => '2026-11-21',
            'deskripsi' => 'Beli sabun',
            'nominal' => 5000,
        ])->assertStatus(201);

        // Summary & daily report must show 15.000 revenue (NOT 50.000) on 2026-11-21 WIB
        $summary = $this->withToken($ownerToken)
            ->getJson('/api/laporan?tanggal_mulai=2026-11-21&tanggal_akhir=2026-11-21')
            ->assertStatus(200);

        $this->assertEquals(15000.0, (float) $summary->json('data.total_pendapatan'));
        $this->assertSame(1, $summary->json('data.jumlah_kendaraan'));
        $this->assertEquals(5000.0, (float) $summary->json('data.total_pengeluaran'));
        $this->assertEquals(10000.0, (float) $summary->json('data.keuntungan_bersih'));

        $daily = $this->withToken($ownerToken)
            ->getJson('/api/laporan/harian?tanggal_mulai=2026-11-21&tanggal_akhir=2026-11-21')
            ->assertStatus(200);

        $this->assertCount(1, $daily->json('data'));
        $this->assertSame('2026-11-21', $daily->json('data.0.tanggal'));
        $this->assertEquals(15000.0, (float) $daily->json('data.0.pendapatan'));
        $this->assertSame(1, $daily->json('data.0.jumlah_kendaraan'));
        $this->assertEquals(5000.0, (float) $daily->json('data.0.pengeluaran'));
        $this->assertEquals(10000.0, (float) $daily->json('data.0.keuntungan_bersih'));
    }

    public function test_non_cash_payment_rejects_overpayment_and_expense_supports_patch_cancel(): void
    {
        $owner = $this->createUser('owner');
        $ownerToken = $owner->createToken('owner')->plainTextToken;

        [$harga] = $this->seedCatalogItem(20000);

        $orderRes = $this->withToken($ownerToken)->postJson('/api/pesanan', [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $harga->id_kategori_kendaraan,
                    'layanan' => [
                        ['id_harga' => $harga->id_harga],
                    ],
                ],
            ],
        ])->assertStatus(201);

        $orderId = $orderRes->json('data.pesanan.id_pesanan');

        $this->withToken($ownerToken)->postJson("/api/pesanan/{$orderId}/pembayaran", [
            'jumlah_dibayar' => 25000,
            'metode_pembayaran' => 'qris',
        ])->assertStatus(422);

        $this->withToken($ownerToken)->postJson("/api/pesanan/{$orderId}/pembayaran", [
            'jumlah_dibayar' => 20000,
            'metode_pembayaran' => 'qris',
        ])->assertStatus(200)
            ->assertJsonPath('kembalian', 0);

        // PATCH /pengeluaran/{id}/batal works as documented in README
        $katExp = KategoriPengeluaran::query()->create(['nama_kategori' => 'Listrik', 'status_aktif' => true]);
        $expRes = $this->withToken($ownerToken)->postJson('/api/pengeluaran', [
            'id_kategori_pengeluaran' => $katExp->id_kategori_pengeluaran,
            'tanggal_pengeluaran' => '2026-11-21',
            'deskripsi' => 'Token listrik',
            'nominal' => 100000,
        ])->assertStatus(201);

        $expId = $expRes->json('data.id_pengeluaran');

        $this->withToken($ownerToken)->patchJson("/api/pengeluaran/{$expId}/batal", [
            'alasan' => 'Salah catat nominal',
        ])->assertStatus(200)
            ->assertJsonPath('data.status_pengeluaran', 'dibatalkan');
    }

    private function createUser(string $role): Pengguna
    {
        return Pengguna::query()->create([
            'nama_lengkap' => ucfirst($role).' Test',
            'username' => $role.'_'.uniqid(),
            'kata_sandi_hash' => 'Password123!',
            'peran' => $role,
            'status_aktif' => true,
        ]);
    }

    /**
     * @return array{0: HargaLayanan}
     */
    private function seedCatalogItem(int $price): array
    {
        $kategori = KategoriKendaraan::query()->create([
            'jenis_kendaraan' => 'motor',
            'nama_kategori' => 'Motor Kecil '.uniqid(),
            'status_aktif' => true,
        ]);

        $layanan = Layanan::query()->create([
            'nama_layanan' => 'Cuci Standar '.uniqid(),
            'status_aktif' => true,
        ]);

        $harga = HargaLayanan::query()->create([
            'id_layanan' => $layanan->id_layanan,
            'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
            'harga_dasar' => $price,
            'batas_bawah' => max(0, $price - 3000),
            'batas_atas' => $price + 5000,
            'status_aktif' => true,
        ]);

        return [$harga];
    }
}
