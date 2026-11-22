<?php

namespace Tests\Feature\Users;

use App\Models\Pengguna;
use App\Models\RiwayatPerubahan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KasirManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_create_list_filter_and_enforce_case_insensitive_username_uniqueness(): void
    {
        $owner = $this->createOwner();
        $ownerToken = $owner->createToken('owner')->plainTextToken;

        $this->withToken($ownerToken)->postJson('/api/kasir', [
            'nama_lengkap' => 'Siti Aminah',
            'username' => 'Kasir_Siti',
            'password' => 'SandiKasir123!',
        ])->assertStatus(201)
            ->assertJsonPath('data.peran', 'kasir')
            ->assertJsonPath('data.status_aktif', true);

        // Case-insensitive duplicate rejected with 422
        $this->withToken($ownerToken)->postJson('/api/kasir', [
            'nama_lengkap' => 'Siti Duplikat',
            'username' => 'kasir_siti',
            'password' => 'SandiKasir123!',
        ])->assertStatus(422)
            ->assertJsonValidationErrors('username');

        // Role escalation prohibited
        $this->withToken($ownerToken)->postJson('/api/kasir', [
            'nama_lengkap' => 'Palsu',
            'username' => 'palsu_owner',
            'password' => 'SandiKasir123!',
            'peran' => 'owner',
        ])->assertStatus(422);

        // Search and per_page clamping
        $list = $this->withToken($ownerToken)
            ->getJson('/api/kasir?status=active&search=Siti&per_page=100')
            ->assertStatus(200);

        $this->assertSame(50, $list->json('data.per_page'));
        $this->assertCount(1, $list->json('data.data'));
    }

    public function test_kasir_username_cannot_be_mutated_while_unchanged_username_put_stays_compatible(): void
    {
        $owner = $this->createOwner();
        $ownerToken = $owner->createToken('owner')->plainTextToken;

        $kasir = Pengguna::query()->create([
            'nama_lengkap' => 'Kasir Awal',
            'username' => 'kasir02',
            'kata_sandi_hash' => 'SandiKasir123!',
            'peran' => 'kasir',
            'status_aktif' => true,
        ]);

        // Unchanged username in PUT payload remains compatible with existing contract
        $this->withToken($ownerToken)->putJson("/api/kasir/{$kasir->id_pengguna}", [
            'nama_lengkap' => 'Kasir Dua Update',
            'username' => 'kasir02',
        ])->assertStatus(200)
            ->assertJsonPath('data.nama_lengkap', 'Kasir Dua Update')
            ->assertJsonPath('data.username', 'kasir02');

        // Attempting to change username is rejected
        $this->withToken($ownerToken)->putJson("/api/kasir/{$kasir->id_pengguna}", [
            'nama_lengkap' => 'Kasir Dua Update',
            'username' => 'kasir_baru',
        ])->assertStatus(422)
            ->assertJsonValidationErrors('username');
    }

    public function test_deactivating_and_resetting_kasir_password_revokes_all_tokens_and_redacts_audit(): void
    {
        $owner = $this->createOwner();
        $ownerToken = $owner->createToken('owner')->plainTextToken;

        $kasir = Pengguna::query()->create([
            'nama_lengkap' => 'Kasir Target',
            'username' => 'kasir_target',
            'kata_sandi_hash' => 'SandiLama123!',
            'peran' => 'kasir',
            'status_aktif' => true,
        ]);

        $kasirToken1 = $kasir->createToken('dev1')->plainTextToken;
        $kasirToken2 = $kasir->createToken('dev2')->plainTextToken;

        $this->withToken($ownerToken)->patchJson("/api/kasir/{$kasir->id_pengguna}/status", [
            'status_aktif' => false,
            'alasan' => 'Akun tidak lagi digunakan',
        ])->assertStatus(200)
            ->assertJsonPath('data.status_aktif', false)
            ->assertJsonPath('revoked_sessions_count', 2);

        $this->assertSame(0, $kasir->tokens()->count());

        $this->app['auth']->forgetGuards();
        $this->withToken($kasirToken1)->getJson('/api/profile')->assertStatus(401);

        // Reactivate & issue new token then reset password
        $this->withToken($ownerToken)->patchJson("/api/kasir/{$kasir->id_pengguna}/status", [
            'status_aktif' => true,
            'alasan' => 'Karyawan kembali bekerja',
        ])->assertStatus(200);

        $newKasirToken = $kasir->createToken('dev3')->plainTextToken;

        $this->withToken($ownerToken)->putJson("/api/kasir/{$kasir->id_pengguna}/reset-password", [
            'password_baru' => 'PasswordBaru123!',
            'password_baru_confirmation' => 'PasswordBaru123!',
        ])->assertStatus(200)
            ->assertJsonPath('revoked_sessions_count', 1);

        $this->assertSame(0, $kasir->tokens()->count());

        $this->app['auth']->forgetGuards();
        $this->withToken($newKasirToken)->getJson('/api/profile')->assertStatus(401);
        $this->withToken($kasirToken2)->getJson('/api/profile')->assertStatus(401);

        $auditEntries = RiwayatPerubahan::query()
            ->where('entitas', 'pengguna')
            ->where('record_id', $kasir->id_pengguna)
            ->get();

        $allAuditJson = json_encode($auditEntries->toArray(), JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('PasswordBaru123!', $allAuditJson);
        $this->assertStringNotContainsString('kata_sandi_hash', $allAuditJson);
    }

    public function test_owner_account_cannot_be_targeted_via_kasir_endpoints(): void
    {
        $owner = $this->createOwner();
        $ownerToken = $owner->createToken('owner')->plainTextToken;

        $this->withToken($ownerToken)->putJson("/api/kasir/{$owner->id_pengguna}", [
            'nama_lengkap' => 'Hacked',
        ])->assertStatus(404);

        $this->withToken($ownerToken)->patchJson("/api/kasir/{$owner->id_pengguna}/status", [
            'status_aktif' => false,
            'alasan' => 'Tidak valid',
        ])->assertStatus(404);

        $this->withToken($ownerToken)->putJson("/api/kasir/{$owner->id_pengguna}/reset-password", [
            'password_baru' => 'PasswordBaru123!',
            'password_baru_confirmation' => 'PasswordBaru123!',
        ])->assertStatus(404);
    }

    private function createOwner(): Pengguna
    {
        return Pengguna::query()->create([
            'nama_lengkap' => 'Owner Test',
            'username' => 'owner_test',
            'kata_sandi_hash' => 'OwnerPass123!',
            'peran' => 'owner',
            'status_aktif' => true,
        ]);
    }
}
