<?php

namespace Tests\Feature\Auth;

use App\Models\KategoriKendaraan;
use App\Models\KategoriPengeluaran;
use App\Models\Layanan;
use App\Models\Pengguna;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthorizationRbacTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_requests_return_401(): void
    {
        $endpoints = [
            ['GET', '/api/profile'],
            ['PUT', '/api/profile/password'],
            ['GET', '/api/pesanan'],
            ['GET', '/api/kasir'],
            ['GET', '/api/pengeluaran'],
            ['GET', '/api/laporan?tanggal_mulai=2026-11-01&tanggal_akhir=2026-11-21'],
            ['GET', '/api/riwayat-perubahan'],
        ];

        foreach ($endpoints as [$method, $uri]) {
            $this->json($method, $uri)->assertStatus(401);
        }
    }

    public function test_kasir_is_blocked_with_403_from_all_owner_only_endpoints(): void
    {
        $kasir = Pengguna::query()->create([
            'nama_lengkap' => 'Kasir RBAC',
            'username' => 'kasir_rbac',
            'kata_sandi_hash' => 'KasirPass123!',
            'peran' => 'kasir',
            'status_aktif' => true,
        ]);

        $kategoriPengeluaran = KategoriPengeluaran::query()->create([
            'nama_kategori' => 'Sabun',
            'status_aktif' => true,
        ]);

        $kategoriKendaraan = KategoriKendaraan::query()->create([
            'jenis_kendaraan' => 'motor',
            'nama_kategori' => 'Motor Kecil',
            'status_aktif' => true,
        ]);

        $layanan = Layanan::query()->create([
            'nama_layanan' => 'Cuci Reguler',
            'status_aktif' => true,
        ]);

        $kasirToken = $kasir->createToken('kasir-test')->plainTextToken;

        $ownerOnlyEndpoints = [
            ['GET', '/api/owner/test', []],
            ['GET', '/api/riwayat-perubahan', []],
            ['GET', '/api/kategori-kendaraan', []],
            ['POST', '/api/kategori-kendaraan', ['jenis_kendaraan' => 'mobil', 'nama_kategori' => 'SUV']],
            ['GET', "/api/kategori-kendaraan/{$kategoriKendaraan->id_kategori_kendaraan}", []],
            ['GET', '/api/layanan', []],
            ['POST', '/api/layanan', ['nama_layanan' => 'Wax']],
            ['GET', "/api/layanan/{$layanan->id_layanan}", []],
            ['GET', '/api/harga-layanan', []],
            ['GET', '/api/kategori-pengeluaran', []],
            ['GET', "/api/kategori-pengeluaran/{$kategoriPengeluaran->id_kategori_pengeluaran}", []],
            ['POST', '/api/kategori-pengeluaran', ['nama_kategori' => 'Listrik']],
            ['GET', '/api/pengeluaran', []],
            ['POST', '/api/pengeluaran', [
                'id_kategori_pengeluaran' => $kategoriPengeluaran->id_kategori_pengeluaran,
                'tanggal_pengeluaran' => '2026-11-21',
                'deskripsi' => 'Test',
                'nominal' => 50000,
            ]],
            ['POST', '/api/jam-operasional', ['hari' => 'senin', 'status_buka' => true, 'jam_buka' => '08:00', 'jam_tutup' => '17:00']],
            ['GET', '/api/laporan?tanggal_mulai=2026-11-01&tanggal_akhir=2026-11-21', []],
            ['GET', '/api/laporan/harian?tanggal_mulai=2026-11-01&tanggal_akhir=2026-11-21', []],
            ['GET', '/api/kasir', []],
            ['POST', '/api/kasir', ['nama_lengkap' => 'Kasir Baru', 'username' => 'kasir_baru', 'password' => 'KasirAman123!']],
            ['PUT', "/api/kasir/{$kasir->id_pengguna}", ['nama_lengkap' => 'Ubah']],
            ['PATCH', "/api/kasir/{$kasir->id_pengguna}/status", ['status_aktif' => false, 'alasan' => 'Alasan test']],
            ['PUT', "/api/kasir/{$kasir->id_pengguna}/reset-password", ['password_baru' => 'BaruAman123!', 'password_baru_confirmation' => 'BaruAman123!']],
        ];

        foreach ($ownerOnlyEndpoints as [$method, $uri, $payload]) {
            $this->withToken($kasirToken)
                ->json($method, $uri, $payload)
                ->assertStatus(403)
                ->assertJsonPath('message', 'Anda tidak memiliki hak akses.');
        }
    }

    public function test_kasir_and_owner_can_access_operational_endpoints(): void
    {
        $kasir = Pengguna::query()->create([
            'nama_lengkap' => 'Kasir Ops',
            'username' => 'kasir_ops',
            'kata_sandi_hash' => 'KasirPass123!',
            'peran' => 'kasir',
            'status_aktif' => true,
        ]);

        $owner = Pengguna::query()->create([
            'nama_lengkap' => 'Owner Ops',
            'username' => 'owner_ops',
            'kata_sandi_hash' => 'OwnerPass123!',
            'peran' => 'owner',
            'status_aktif' => true,
        ]);

        foreach ([$kasir, $owner] as $user) {
            $this->app['auth']->forgetGuards();
            $token = $user->createToken('ops-token')->plainTextToken;
            $this->withToken($token)->getJson('/api/operasional/test')->assertStatus(200);
            $this->withToken($token)->getJson('/api/pesanan')->assertStatus(200);
            $this->withToken($token)->getJson('/api/jam-operasional')->assertStatus(200);
        }
    }
}
