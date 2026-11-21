<?php

namespace Tests\Feature\Domain;

use App\Models\HargaLayanan;
use App\Models\KategoriKendaraan;
use App\Models\Layanan;
use App\Models\Pengguna;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class FrontendAndCatalogIntegrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_spa_shell_renders_without_hijacking_api_404_routes(): void
    {
        $createdManifest = false;
        $manifestDir = public_path('build');
        $manifestPath = $manifestDir.DIRECTORY_SEPARATOR.'manifest.json';

        if (! File::exists($manifestPath)) {
            File::ensureDirectoryExists($manifestDir);
            File::put($manifestPath, json_encode([
                'resources/css/app.css' => ['file' => 'assets/app.css', 'src' => 'resources/css/app.css', 'isEntry' => true],
                'resources/js/app.js' => ['file' => 'assets/app.js', 'src' => 'resources/js/app.js', 'isEntry' => true],
            ], JSON_THROW_ON_ERROR));
            $createdManifest = true;
        }

        try {
            $this->get('/')
                ->assertStatus(200)
                ->assertSee('WashNote — GALIROSO WASH POS', false)
                ->assertSee('id="app"', false);

            $this->get('/pesanan-antrean')
                ->assertStatus(200)
                ->assertSee('id="app"', false);

            $this->getJson('/api/route-yang-tidak-ada')
                ->assertStatus(404)
                ->assertHeader('Content-Type', 'application/json');
        } finally {
            if ($createdManifest && File::exists($manifestPath)) {
                File::delete($manifestPath);
            }
        }
    }

    public function test_katalog_endpoint_allows_kasir_and_owner_and_filters_inactive_entries(): void
    {
        $this->getJson('/api/katalog')->assertStatus(401);

        $kasir = Pengguna::query()->create([
            'nama_lengkap' => 'Kasir Katalog',
            'username' => 'kasir_katalog',
            'kata_sandi_hash' => 'Password123!',
            'peran' => 'kasir',
            'status_aktif' => true,
        ]);

        $owner = Pengguna::query()->create([
            'nama_lengkap' => 'Owner Katalog',
            'username' => 'owner_katalog',
            'kata_sandi_hash' => 'Password123!',
            'peran' => 'owner',
            'status_aktif' => true,
        ]);

        $activeKat = KategoriKendaraan::query()->create([
            'jenis_kendaraan' => 'mobil',
            'nama_kategori' => 'Sedan Aktif',
            'status_aktif' => true,
        ]);

        $inactiveKat = KategoriKendaraan::query()->create([
            'jenis_kendaraan' => 'mobil',
            'nama_kategori' => 'Sedan Nonaktif',
            'status_aktif' => false,
        ]);

        $activeMain = Layanan::query()->create([
            'nama_layanan' => 'Cuci Salju',
            'tipe_layanan' => 'utama',
            'status_aktif' => true,
        ]);

        $activeAddOn = Layanan::query()->create([
            'nama_layanan' => 'Semir Ban',
            'tipe_layanan' => 'tambahan',
            'status_aktif' => true,
        ]);

        $inactiveService = Layanan::query()->create([
            'nama_layanan' => 'Layanan Nonaktif',
            'tipe_layanan' => 'utama',
            'status_aktif' => false,
        ]);

        $activeHarga = HargaLayanan::query()->create([
            'id_layanan' => $activeMain->id_layanan,
            'id_kategori_kendaraan' => $activeKat->id_kategori_kendaraan,
            'harga_dasar' => 30000,
            'batas_bawah' => 25000,
            'batas_atas' => 45000,
            'status_aktif' => true,
        ]);

        // Inactive tariff, inactive service tariff, and inactive category tariff must be excluded
        HargaLayanan::query()->create([
            'id_layanan' => $activeAddOn->id_layanan,
            'id_kategori_kendaraan' => $activeKat->id_kategori_kendaraan,
            'harga_dasar' => 10000,
            'batas_bawah' => 5000,
            'batas_atas' => 15000,
            'status_aktif' => false,
        ]);

        HargaLayanan::query()->create([
            'id_layanan' => $inactiveService->id_layanan,
            'id_kategori_kendaraan' => $activeKat->id_kategori_kendaraan,
            'harga_dasar' => 20000,
            'batas_bawah' => 15000,
            'batas_atas' => 25000,
            'status_aktif' => true,
        ]);

        HargaLayanan::query()->create([
            'id_layanan' => $activeMain->id_layanan,
            'id_kategori_kendaraan' => $inactiveKat->id_kategori_kendaraan,
            'harga_dasar' => 35000,
            'batas_bawah' => 30000,
            'batas_atas' => 40000,
            'status_aktif' => true,
        ]);

        foreach ([$kasir, $owner] as $user) {
            $this->app['auth']->forgetGuards();
            $token = $user->createToken('katalog-test')->plainTextToken;

            $res = $this->withToken($token)->getJson('/api/katalog')->assertStatus(200);
            $this->assertSame([$activeKat->id_kategori_kendaraan], array_column($res->json('data.kategori_kendaraan'), 'id_kategori_kendaraan'));
            $this->assertCount(2, $res->json('data.layanan'));
            $this->assertSame([$activeHarga->id_harga], array_column($res->json('data.harga_layanan'), 'id_harga'));
            $this->assertSame('utama', $res->json('data.harga_layanan.0.layanan.tipe_layanan'));
        }
    }
}
