<?php

namespace Tests\Feature\Cli;

use App\Models\Pengguna;
use App\Models\RiwayatPerubahan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\Console\Exception\InvalidOptionException;
use Tests\TestCase;

class OwnerBootstrapAndRecoveryCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_cli_commands_forbid_password_flag(): void
    {
        try {
            $this->artisan('washnote:bootstrap-owner', [
                '--name' => 'Owner CLI',
                '--username' => 'owner_cli',
                '--password' => 'Rahasia123!',
            ]);
            $this->fail('Expected InvalidOptionException rejecting --password.');
        } catch (InvalidOptionException $e) {
            $this->assertStringContainsString('password', $e->getMessage());
        }

        try {
            $this->artisan('washnote:reset-owner-password', [
                '--username' => 'owner_cli',
                '--password' => 'Rahasia123!',
            ]);
            $this->fail('Expected InvalidOptionException rejecting --password.');
        } catch (InvalidOptionException $e) {
            $this->assertStringContainsString('password', $e->getMessage());
        }
    }

    public function test_bootstrap_owner_creates_initial_owner_and_locks_even_when_inactive(): void
    {
        $this->artisan('washnote:bootstrap-owner')
            ->expectsQuestion('Masukkan nama lengkap Owner', 'Pemilik Galiroso')
            ->expectsQuestion('Masukkan username Owner', 'owner_utama')
            ->expectsQuestion('Masukkan kata sandi Owner (minimal 8 karakter)', 'OwnerRahasia123!')
            ->expectsQuestion('Konfirmasi kata sandi Owner', 'OwnerRahasia123!')
            ->doesntExpectOutputToContain('OwnerRahasia123!')
            ->assertExitCode(0);

        $owner = Pengguna::query()->where('username', 'owner_utama')->firstOrFail();
        $this->assertSame('owner', $owner->peran);
        $this->assertTrue($owner->status_aktif);

        $audit = RiwayatPerubahan::query()
            ->where('entitas', 'pengguna')
            ->where('record_id', $owner->id_pengguna)
            ->firstOrFail();

        $this->assertSame('OWNER_BOOTSTRAP', $audit->nilai_sesudah['aksi'] ?? null);
        $this->assertFalse($audit->nilai_sesudah['actor_is_target_user'] ?? true);

        $this->postJson('/api/login', [
            'username' => 'owner_utama',
            'password' => 'OwnerRahasia123!',
        ])->assertStatus(200);

        // Second bootstrap blocked while active
        $this->artisan('washnote:bootstrap-owner')->assertExitCode(1);

        // Remains locked even if existing owner is deactivated
        $owner->update(['status_aktif' => false]);
        $this->artisan('washnote:bootstrap-owner')->assertExitCode(1);
    }

    public function test_reset_owner_password_requires_reason_confirmation_and_revokes_tokens(): void
    {
        $owner = Pengguna::query()->create([
            'nama_lengkap' => 'Owner Recovery',
            'username' => 'owner_rec',
            'kata_sandi_hash' => 'OwnerLama123!',
            'peran' => 'owner',
            'status_aktif' => true,
        ]);

        $kasir = Pengguna::query()->create([
            'nama_lengkap' => 'Kasir Biasa',
            'username' => 'kasir_non_owner',
            'kata_sandi_hash' => 'KasirPass123!',
            'peran' => 'kasir',
            'status_aktif' => true,
        ]);

        // Reject targeting non-owner
        $this->artisan('washnote:reset-owner-password', [
            '--username' => $kasir->username,
            '--reason' => 'Alasan tidak sah',
        ])->assertExitCode(1);

        $token1 = $owner->createToken('dev1')->plainTextToken;
        $token2 = $owner->createToken('dev2')->plainTextToken;

        // Declining confirmation cancels
        $this->artisan('washnote:reset-owner-password', ['--username' => 'owner_rec'])
            ->expectsQuestion('Masukkan alasan & bukti verifikasi identitas Owner (minimal 5 karakter)', 'Verifikasi telepon')
            ->expectsConfirmation("Konfirmasi pemulihan kata sandi untuk Owner 'owner_rec' dan pencabutan semua sesi aktif?", 'no')
            ->assertExitCode(1);

        // Confirmed recovery revokes all active tokens
        $this->artisan('washnote:reset-owner-password')
            ->expectsQuestion('Masukkan alasan & bukti verifikasi identitas Owner (minimal 5 karakter)', 'Verifikasi tatap muka di outlet')
            ->expectsConfirmation("Konfirmasi pemulihan kata sandi untuk Owner 'owner_rec' dan pencabutan semua sesi aktif?", 'yes')
            ->expectsQuestion('Masukkan kata sandi baru Owner (minimal 8 karakter)', 'OwnerBaruAman99!')
            ->expectsQuestion('Konfirmasi kata sandi baru Owner', 'OwnerBaruAman99!')
            ->expectsOutputToContain('Sesi aktif yang dicabut: 2')
            ->doesntExpectOutputToContain('OwnerBaruAman99!')
            ->assertExitCode(0);

        $this->assertSame(0, $owner->tokens()->count());

        $this->app['auth']->forgetGuards();
        $this->withToken($token1)->getJson('/api/profile')->assertStatus(401);
        $this->withToken($token2)->getJson('/api/profile')->assertStatus(401);

        $this->postJson('/api/login', [
            'username' => 'owner_rec',
            'password' => 'OwnerLama123!',
        ])->assertStatus(401);

        $this->postJson('/api/login', [
            'username' => 'owner_rec',
            'password' => 'OwnerBaruAman99!',
        ])->assertStatus(200);

        $audit = RiwayatPerubahan::query()
            ->where('entitas', 'pengguna')
            ->where('record_id', $owner->id_pengguna)
            ->latest('id_riwayat')
            ->firstOrFail();

        $this->assertSame('OWNER_RECOVERY', $audit->nilai_sesudah['aksi'] ?? null);
        $this->assertFalse($audit->nilai_sesudah['actor_is_target_user'] ?? true);
        $rawAudit = json_encode([$audit->nilai_sebelum, $audit->nilai_sesudah], JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('OwnerBaruAman99!', $rawAudit);
        $this->assertStringNotContainsString('OwnerLama123!', $rawAudit);
    }
}
