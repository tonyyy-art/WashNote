<?php

namespace Tests\Feature\Domain;

use App\Models\DetailLayanan;
use App\Models\HargaLayanan;
use App\Models\KategoriKendaraan;
use App\Models\Layanan;
use App\Models\Pengguna;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class Phase3PricingAndAddOnsTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_manage_and_filter_layanan_by_tipe_layanan(): void
    {
        $owner = $this->createUser('owner');
        $ownerToken = $owner->createToken('owner')->plainTextToken;

        $defaultMain = $this->withToken($ownerToken)->postJson('/api/layanan', [
            'nama_layanan' => 'Cuci Reguler',
            'status_aktif' => true,
        ])->assertStatus(201)
            ->assertJsonPath('data.tipe_layanan', 'utama');

        $addOn = $this->withToken($ownerToken)->postJson('/api/layanan', [
            'nama_layanan' => 'Semir Ban Premium',
            'tipe_layanan' => 'TAMBAHAN',
            'status_aktif' => true,
        ])->assertStatus(201)
            ->assertJsonPath('data.tipe_layanan', 'tambahan');

        $inactiveMain = $this->withToken($ownerToken)->postJson('/api/layanan', [
            'nama_layanan' => 'Cuci Nonaktif',
            'tipe_layanan' => 'utama',
            'status_aktif' => false,
        ])->assertStatus(201);

        $this->withToken($ownerToken)->postJson('/api/layanan', [
            'nama_layanan' => 'Layanan Salah',
            'tipe_layanan' => 'vip',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['tipe_layanan']);

        $addOnId = $addOn->json('data.id_layanan');
        $defaultMainId = $defaultMain->json('data.id_layanan');
        $inactiveMainId = $inactiveMain->json('data.id_layanan');

        $filteredAddOns = $this->withToken($ownerToken)
            ->getJson('/api/layanan?tipe_layanan=TAMBAHAN')
            ->assertStatus(200);
        $this->assertSame([$addOnId], array_column($filteredAddOns->json('data'), 'id_layanan'));

        $filteredActiveMain = $this->withToken($ownerToken)
            ->getJson('/api/layanan?tipe_layanan=utama&status_aktif=true')
            ->assertStatus(200);
        $this->assertSame([$defaultMainId], array_column($filteredActiveMain->json('data'), 'id_layanan'));

        $filteredInactive = $this->withToken($ownerToken)
            ->getJson('/api/layanan?status_aktif=false')
            ->assertStatus(200);
        $this->assertSame([$inactiveMainId], array_column($filteredInactive->json('data'), 'id_layanan'));

        $this->withToken($ownerToken)
            ->getJson('/api/layanan?status_aktif=invalid')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status_aktif']);

        // Updating without tipe_layanan preserves the stored value
        $this->withToken($ownerToken)->putJson("/api/layanan/{$addOnId}", [
            'nama_layanan' => 'Semir Ban Super',
            'status_aktif' => true,
        ])->assertStatus(200)
            ->assertJsonPath('data.tipe_layanan', 'tambahan');

        // Updating tipe_layanan explicitly persists the new value
        $this->withToken($ownerToken)->putJson("/api/layanan/{$addOnId}", [
            'nama_layanan' => 'Paket Semir Utama',
            'tipe_layanan' => 'utama',
            'status_aktif' => true,
        ])->assertStatus(200)
            ->assertJsonPath('data.tipe_layanan', 'utama');
    }

    public function test_order_omitting_harga_akhir_defaults_to_harga_dasar_and_preserves_snapshots(): void
    {
        $owner = $this->createUser('owner');
        $kasir = $this->createUser('kasir');
        $ownerToken = $owner->createToken('owner')->plainTextToken;
        $kasirToken = $kasir->createToken('kasir')->plainTextToken;

        [$kategori, $layanan, $harga] = $this->seedTariff(
            namaKategori: 'Motor Matic',
            namaLayanan: 'Cuci Kilat',
            tipeLayanan: 'utama',
            hargaDasar: 20000,
            batasBawah: 15000,
            batasAtas: 30000,
        );

        $orderRes = $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'layanan' => [
                        ['id_harga' => $harga->id_harga],
                    ],
                ],
            ],
        ])->assertStatus(201)
            ->assertJsonPath('data.subtotal_utama', 20000)
            ->assertJsonPath('data.subtotal_tambahan', 0)
            ->assertJsonPath('data.total_harga', 20000);

        $orderId = $orderRes->json('data.pesanan.id_pesanan');
        /** @var DetailLayanan $detail */
        $detail = DetailLayanan::query()->firstOrFail();

        $this->assertSame('Cuci Kilat', $detail->nama_layanan_snapshot);
        $this->assertSame('utama', $detail->tipe_layanan_snapshot);
        $this->assertSame('20000.00', (string) $detail->harga_dasar_snapshot);
        $this->assertSame('20000.00', (string) $detail->harga_akhir);
        $this->assertNull($detail->alasan_penyesuaian);

        // Owner later edits service metadata and rotates active tariff
        $this->app['auth']->forgetGuards();

        $this->withToken($ownerToken)->putJson("/api/layanan/{$layanan->id_layanan}", [
            'nama_layanan' => 'Cuci Sultan',
            'tipe_layanan' => 'tambahan',
            'status_aktif' => true,
        ])->assertStatus(200);

        $this->withToken($ownerToken)->putJson("/api/harga-layanan/{$harga->id_harga}", [
            'id_layanan' => $layanan->id_layanan,
            'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
            'harga_dasar' => 35000,
            'batas_bawah' => 30000,
            'batas_atas' => 45000,
            'status_aktif' => false,
        ])->assertStatus(200);

        $this->app['auth']->forgetGuards();

        // Historical order snapshots and totals remain immutable
        $showRes = $this->withToken($kasirToken)
            ->getJson("/api/pesanan/{$orderId}")
            ->assertStatus(200)
            ->assertJsonPath('data.subtotal_utama', 20000)
            ->assertJsonPath('data.subtotal_tambahan', 0)
            ->assertJsonPath('data.total_harga', 20000);

        $detailData = $showRes->json('data.pesanan.kendaraan.0.detail_layanan.0');
        $this->assertSame('Cuci Kilat', $detailData['nama_layanan_snapshot']);
        $this->assertSame('utama', $detailData['tipe_layanan_snapshot']);
        $this->assertSame('20000.00', $detailData['harga_dasar_snapshot']);
        $this->assertSame('20000.00', $detailData['harga_akhir']);
    }

    public function test_flexible_harga_akhir_enforces_bounds_and_mandatory_reason_on_adjustment(): void
    {
        $kasir = $this->createUser('kasir');
        $kasirToken = $kasir->createToken('kasir')->plainTextToken;

        [$kategori, , $harga] = $this->seedTariff(
            namaKategori: 'Mobil MPV',
            namaLayanan: 'Cuci Exterior',
            tipeLayanan: 'utama',
            hargaDasar: 25000,
            batasBawah: 20000,
            batasAtas: 35000,
        );

        // Adjusted without reason -> 422
        $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'layanan' => [
                        [
                            'id_harga' => $harga->id_harga,
                            'harga_akhir' => 22000,
                        ],
                    ],
                ],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['kendaraan.0.layanan.0.alasan_penyesuaian']);

        // Adjusted with whitespace-only reason -> 422
        $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'layanan' => [
                        [
                            'id_harga' => $harga->id_harga,
                            'harga_akhir' => 28000,
                            'alasan_penyesuaian' => '   ',
                        ],
                    ],
                ],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['kendaraan.0.layanan.0.alasan_penyesuaian']);

        // Below batas_bawah -> 422
        $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'layanan' => [
                        [
                            'id_harga' => $harga->id_harga,
                            'harga_akhir' => 19000,
                            'alasan_penyesuaian' => 'Diskon berlebihan',
                        ],
                    ],
                ],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['kendaraan.0.layanan.0.harga_akhir']);

        // Above batas_atas -> 422
        $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'layanan' => [
                        [
                            'id_harga' => $harga->id_harga,
                            'harga_akhir' => 36000,
                            'alasan_penyesuaian' => 'Lumpur ekstrem',
                        ],
                    ],
                ],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['kendaraan.0.layanan.0.harga_akhir']);

        // Equal to harga_dasar without reason -> succeeds with null reason
        $unchangedRes = $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'layanan' => [
                        [
                            'id_harga' => $harga->id_harga,
                            'harga_akhir' => 25000,
                        ],
                    ],
                ],
            ],
        ])->assertStatus(201)
            ->assertJsonPath('data.total_harga', 25000);

        $this->assertNull($unchangedRes->json('data.pesanan.kendaraan.0.detail_layanan.0.alasan_penyesuaian'));

        // Adjusted within [batas_bawah, batas_atas] with valid reason -> succeeds and payment matches adjusted amount
        $adjustedRes = $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'layanan' => [
                        [
                            'id_harga' => $harga->id_harga,
                            'harga_akhir' => 22000,
                            'alasan_penyesuaian' => '  Langganan minggu ini  ',
                        ],
                    ],
                ],
            ],
        ])->assertStatus(201)
            ->assertJsonPath('data.total_harga', 22000);

        $adjustedOrderId = $adjustedRes->json('data.pesanan.id_pesanan');
        $this->assertSame(
            'Langganan minggu ini',
            $adjustedRes->json('data.pesanan.kendaraan.0.detail_layanan.0.alasan_penyesuaian')
        );

        $this->withToken($kasirToken)->postJson("/api/pesanan/{$adjustedOrderId}/pembayaran", [
            'jumlah_dibayar' => 22000,
            'metode_pembayaran' => 'qris',
        ])->assertStatus(200)
            ->assertJsonPath('data.status_pembayaran', 'sudah_dibayar')
            ->assertJsonPath('data.jumlah_dibayar', '22000.00');
    }

    public function test_standalone_and_combined_tambahan_services_compute_subtotals_and_replay_cleanly(): void
    {
        $kasir = $this->createUser('kasir');
        $kasirToken = $kasir->createToken('kasir')->plainTextToken;

        [$kategori, , $hargaUtama] = $this->seedTariff(
            namaKategori: 'Sedan',
            namaLayanan: 'Cuci Salju',
            tipeLayanan: 'utama',
            hargaDasar: 30000,
            batasBawah: 25000,
            batasAtas: 40000,
        );

        [, , $hargaTambahan] = $this->seedTariff(
            namaKategori: 'Sedan',
            namaLayanan: 'Fogging Interior',
            tipeLayanan: 'tambahan',
            hargaDasar: 10000,
            batasBawah: 5000,
            batasAtas: 15000,
            kategoriOverride: $kategori,
        );

        // Standalone add-on order without any 'utama' service is permitted
        $this->withToken($kasirToken)->postJson('/api/pesanan', [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'layanan' => [
                        [
                            'id_harga' => $hargaTambahan->id_harga,
                            'harga_akhir' => 12000,
                            'alasan_penyesuaian' => 'Aroma khusus kabin',
                        ],
                    ],
                ],
            ],
        ])->assertStatus(201)
            ->assertJsonPath('data.subtotal_utama', 0)
            ->assertJsonPath('data.subtotal_tambahan', 12000)
            ->assertJsonPath('data.total_harga', 12000);

        // Multi-vehicle mixed utama + tambahan order with idempotency replay
        $payload = [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'layanan' => [
                        ['id_harga' => $hargaUtama->id_harga],
                        ['id_harga' => $hargaTambahan->id_harga],
                    ],
                ],
                [
                    'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
                    'layanan' => [
                        [
                            'id_harga' => $hargaUtama->id_harga,
                            'harga_akhir' => 27500,
                            'alasan_penyesuaian' => 'Diskon member',
                        ],
                    ],
                ],
            ],
        ];

        $created = $this->withToken($kasirToken)
            ->withHeaders(['Idempotency-Key' => 'p3-addon-order-1'])
            ->postJson('/api/pesanan', $payload)
            ->assertStatus(201)
            ->assertJsonPath('data.subtotal_utama', 57500)
            ->assertJsonPath('data.subtotal_tambahan', 10000)
            ->assertJsonPath('data.total_harga', 67500);

        $orderId = $created->json('data.pesanan.id_pesanan');

        $this->withToken($kasirToken)
            ->getJson("/api/pesanan/{$orderId}")
            ->assertStatus(200)
            ->assertJsonPath('data.subtotal_utama', 57500)
            ->assertJsonPath('data.subtotal_tambahan', 10000)
            ->assertJsonPath('data.total_harga', 67500);

        $this->withToken($kasirToken)
            ->withHeaders(['Idempotency-Key' => 'p3-addon-order-1'])
            ->postJson('/api/pesanan', $payload)
            ->assertStatus(200)
            ->assertJsonPath('data.pesanan.id_pesanan', $orderId)
            ->assertJsonPath('data.subtotal_utama', 57500)
            ->assertJsonPath('data.subtotal_tambahan', 10000)
            ->assertJsonPath('data.total_harga', 67500);
    }

    public function test_multi_vehicle_order_store_and_update_preload_categories_and_tariffs_without_n_plus_one(): void
    {
        $kasir = $this->createUser('kasir');
        $kasirToken = $kasir->createToken('kasir')->plainTextToken;

        [$kategoriSedan, , $tarifSedanUtama] = $this->seedTariff(
            namaKategori: 'Sedan Batch',
            namaLayanan: 'Cuci Salju Batch',
            tipeLayanan: 'utama',
            hargaDasar: 35000,
            batasBawah: 30000,
            batasAtas: 45000,
        );

        [, , $tarifSedanAddon] = $this->seedTariff(
            namaKategori: 'Sedan Batch',
            namaLayanan: 'Fogging Batch',
            tipeLayanan: 'tambahan',
            hargaDasar: 15000,
            batasBawah: 10000,
            batasAtas: 20000,
            kategoriOverride: $kategoriSedan,
        );

        [$kategoriMpv, , $tarifMpvUtama] = $this->seedTariff(
            namaKategori: 'MPV Batch',
            namaLayanan: 'Cuci Salju MPV',
            tipeLayanan: 'utama',
            hargaDasar: 45000,
            batasBawah: 40000,
            batasAtas: 55000,
        );

        $singleVehiclePayload = [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategoriSedan->id_kategori_kendaraan,
                    'plat_nomor' => 'B9001AA',
                    'layanan' => [
                        ['id_harga' => $tarifSedanUtama->id_harga],
                    ],
                ],
            ],
        ];

        $multiVehiclePayload = [
            'kendaraan' => [
                [
                    'id_kategori_kendaraan' => $kategoriSedan->id_kategori_kendaraan,
                    'plat_nomor' => 'B1001AA',
                    'layanan' => [
                        ['id_harga' => $tarifSedanUtama->id_harga],
                        ['id_harga' => $tarifSedanAddon->id_harga],
                    ],
                ],
                [
                    'id_kategori_kendaraan' => $kategoriMpv->id_kategori_kendaraan,
                    'plat_nomor' => 'B1002BB',
                    'layanan' => [
                        ['id_harga' => $tarifMpvUtama->id_harga],
                    ],
                ],
                [
                    'id_kategori_kendaraan' => $kategoriSedan->id_kategori_kendaraan,
                    'plat_nomor' => 'B1003CC',
                    'layanan' => [
                        ['id_harga' => $tarifSedanUtama->id_harga],
                        ['id_harga' => $tarifSedanAddon->id_harga],
                    ],
                ],
                [
                    'id_kategori_kendaraan' => $kategoriMpv->id_kategori_kendaraan,
                    'plat_nomor' => 'B1004DD',
                    'layanan' => [
                        ['id_harga' => $tarifMpvUtama->id_harga],
                    ],
                ],
                [
                    'id_kategori_kendaraan' => $kategoriSedan->id_kategori_kendaraan,
                    'plat_nomor' => 'B1005EE',
                    'layanan' => [
                        ['id_harga' => $tarifSedanUtama->id_harga],
                        ['id_harga' => $tarifSedanAddon->id_harga],
                    ],
                ],
            ],
        ];

        $countEntitySelects = static function (array $queryLog, string $table): int {
            return collect($queryLog)
                ->pluck('query')
                ->filter(static fn (string $sql): bool => str_contains(strtolower($sql), 'select ')
                    && ! str_contains(strtolower($sql), 'count(')
                    && str_contains($sql, $table))
                ->count();
        };

        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->withToken($kasirToken)->postJson('/api/pesanan', $singleVehiclePayload)->assertStatus(201);
        $singleStoreLog = DB::getQueryLog();
        DB::disableQueryLog();

        DB::enableQueryLog();
        DB::flushQueryLog();
        $created = $this->withToken($kasirToken)
            ->postJson('/api/pesanan', $multiVehiclePayload)
            ->assertStatus(201);
        $multiStoreLog = DB::getQueryLog();
        DB::disableQueryLog();

        $this->assertSame(
            $countEntitySelects($singleStoreLog, 'kategori_kendaraan'),
            $countEntitySelects($multiStoreLog, 'kategori_kendaraan')
        );
        $this->assertSame(
            $countEntitySelects($singleStoreLog, 'harga_layanan'),
            $countEntitySelects($multiStoreLog, 'harga_layanan')
        );
        $this->assertLessThanOrEqual(2, $countEntitySelects($multiStoreLog, 'kategori_kendaraan'));
        $this->assertLessThanOrEqual(2, $countEntitySelects($multiStoreLog, 'harga_layanan'));

        $orderId = $created->json('data.pesanan.id_pesanan');

        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->withToken($kasirToken)
            ->putJson("/api/pesanan/{$orderId}", [
                ...$singleVehiclePayload,
                'alasan' => 'Ubah menjadi satu kendaraan',
            ])
            ->assertStatus(200);
        $singleUpdateLog = DB::getQueryLog();
        DB::disableQueryLog();

        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->withToken($kasirToken)
            ->putJson("/api/pesanan/{$orderId}", [
                ...$multiVehiclePayload,
                'alasan' => 'Ubah kembali ke multi kendaraan',
            ])
            ->assertStatus(200);
        $multiUpdateLog = DB::getQueryLog();
        DB::disableQueryLog();

        $this->assertSame(
            $countEntitySelects($singleUpdateLog, 'kategori_kendaraan'),
            $countEntitySelects($multiUpdateLog, 'kategori_kendaraan')
        );
        $this->assertSame(
            $countEntitySelects($singleUpdateLog, 'harga_layanan'),
            $countEntitySelects($multiUpdateLog, 'harga_layanan')
        );
        $this->assertLessThanOrEqual(3, $countEntitySelects($multiUpdateLog, 'kategori_kendaraan'));
        $this->assertLessThanOrEqual(3, $countEntitySelects($multiUpdateLog, 'harga_layanan'));
    }

    public function test_daily_financial_report_rejects_excessive_date_range_and_groups_multi_day_totals_accurately(): void
    {
        $owner = $this->createUser('owner');
        $ownerToken = $owner->createToken('owner')->plainTextToken;
        $kasir = $this->createUser('kasir');
        $kasirToken = $kasir->createToken('kasir')->plainTextToken;

        $this->withToken($ownerToken)
            ->getJson('/api/laporan/harian?tanggal_mulai=2025-01-01&tanggal_akhir=2026-01-05')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tanggal_akhir']);

        [, , $tarif] = $this->seedTariff(
            namaKategori: 'SUV Daily',
            namaLayanan: 'Cuci Komplit Daily',
            tipeLayanan: 'utama',
            hargaDasar: 40000,
            batasBawah: 35000,
            batasAtas: 50000,
        );

        $expCatId = $this->withToken($ownerToken)
            ->postJson('/api/kategori-pengeluaran', [
                'nama_kategori' => 'Operasional Harian Test',
                'status_aktif' => true,
            ])
            ->assertStatus(201)
            ->json('data.id_kategori_pengeluaran');

        config([
            'app.timezone' => 'Asia/Jakarta',
            'washnote.business_timezone' => 'Asia/Jakarta',
        ]);

        try {
            Carbon::setTestNow(Carbon::parse('2026-11-20 10:00:00', 'Asia/Jakarta'));

            $order1Id = $this->withToken($kasirToken)->postJson('/api/pesanan', [
                'kendaraan' => [
                    [
                        'id_kategori_kendaraan' => $tarif->id_kategori_kendaraan,
                        'layanan' => [['id_harga' => $tarif->id_harga]],
                    ],
                ],
            ])->assertStatus(201)->json('data.pesanan.id_pesanan');

            $this->withToken($kasirToken)->postJson("/api/pesanan/{$order1Id}/pembayaran", [
                'jumlah_dibayar' => 40000,
                'metode_pembayaran' => 'tunai',
            ])->assertStatus(200);

            Carbon::setTestNow(Carbon::parse('2026-11-21 14:30:00', 'Asia/Jakarta'));

            $order2Id = $this->withToken($kasirToken)->postJson('/api/pesanan', [
                'kendaraan' => [
                    [
                        'id_kategori_kendaraan' => $tarif->id_kategori_kendaraan,
                        'layanan' => [['id_harga' => $tarif->id_harga]],
                    ],
                    [
                        'id_kategori_kendaraan' => $tarif->id_kategori_kendaraan,
                        'layanan' => [['id_harga' => $tarif->id_harga]],
                    ],
                ],
            ])->assertStatus(201)->json('data.pesanan.id_pesanan');

            $this->withToken($kasirToken)->postJson("/api/pesanan/{$order2Id}/pembayaran", [
                'jumlah_dibayar' => 80000,
                'metode_pembayaran' => 'qris',
            ])->assertStatus(200);
        } finally {
            Carbon::setTestNow();
        }

        $this->withToken($ownerToken)->postJson('/api/pengeluaran', [
            'id_kategori_pengeluaran' => $expCatId,
            'tanggal_pengeluaran' => '2026-11-20',
            'deskripsi' => 'Sabun cuci day 1',
            'nominal' => 15000,
        ])->assertStatus(201);

        $this->withToken($ownerToken)->postJson('/api/pengeluaran', [
            'id_kategori_pengeluaran' => $expCatId,
            'tanggal_pengeluaran' => '2026-11-21',
            'deskripsi' => 'Listrik day 2',
            'nominal' => 25000,
        ])->assertStatus(201);

        $this->app['auth']->forgetGuards();

        $daily = $this->withToken($ownerToken)
            ->getJson('/api/laporan/harian?tanggal_mulai=2026-11-20&tanggal_akhir=2026-11-21')
            ->assertStatus(200);

        $this->assertCount(2, $daily->json('data'));
        $daily->assertJsonPath('data.0.tanggal', '2026-11-20')
            ->assertJsonPath('data.0.jumlah_kendaraan', 1)
            ->assertJsonPath('data.1.tanggal', '2026-11-21')
            ->assertJsonPath('data.1.jumlah_kendaraan', 2);

        $this->assertEquals(40000.0, (float) $daily->json('data.0.pendapatan'));
        $this->assertEquals(15000.0, (float) $daily->json('data.0.pengeluaran'));
        $this->assertEquals(25000.0, (float) $daily->json('data.0.keuntungan_bersih'));

        $this->assertEquals(80000.0, (float) $daily->json('data.1.pendapatan'));
        $this->assertEquals(25000.0, (float) $daily->json('data.1.pengeluaran'));
        $this->assertEquals(55000.0, (float) $daily->json('data.1.keuntungan_bersih'));
    }

    private function createUser(string $role): Pengguna
    {
        return Pengguna::query()->create([
            'nama_lengkap' => ucfirst($role).' P3',
            'username' => $role.'_p3_'.uniqid(),
            'kata_sandi_hash' => 'Password123!',
            'peran' => $role,
            'status_aktif' => true,
        ]);
    }

    /**
     * @return array{0: KategoriKendaraan, 1: Layanan, 2: HargaLayanan}
     */
    private function seedTariff(
        string $namaKategori,
        string $namaLayanan,
        string $tipeLayanan,
        float $hargaDasar,
        float $batasBawah,
        float $batasAtas,
        ?KategoriKendaraan $kategoriOverride = null,
    ): array {
        $kategori = $kategoriOverride ?? KategoriKendaraan::query()->create([
            'jenis_kendaraan' => 'mobil',
            'nama_kategori' => $namaKategori.' '.uniqid(),
            'status_aktif' => true,
        ]);

        $layanan = Layanan::query()->create([
            'nama_layanan' => $namaLayanan,
            'tipe_layanan' => $tipeLayanan,
            'status_aktif' => true,
        ]);

        $harga = HargaLayanan::query()->create([
            'id_layanan' => $layanan->id_layanan,
            'id_kategori_kendaraan' => $kategori->id_kategori_kendaraan,
            'harga_dasar' => $hargaDasar,
            'batas_bawah' => $batasBawah,
            'batas_atas' => $batasAtas,
            'status_aktif' => true,
        ]);

        return [$kategori, $layanan, $harga];
    }
}
