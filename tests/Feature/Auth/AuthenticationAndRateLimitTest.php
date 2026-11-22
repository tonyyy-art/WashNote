<?php

namespace Tests\Feature\Auth;

use App\Models\Pengguna;
use App\Models\RiwayatPerubahan;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthenticationAndRateLimitTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_login_succeeds_case_insensitively_and_returns_existing_contract(): void
    {
        Pengguna::query()->create([
            'nama_lengkap' => 'Kasir Satu',
            'username' => 'KasirSatu',
            'kata_sandi_hash' => 'KasirPass123!',
            'peran' => 'kasir',
            'status_aktif' => true,
        ]);

        $response = $this->postJson('/api/login', [
            'username' => 'kasirsatu',
            'password' => 'KasirPass123!',
        ])->assertStatus(200);

        $response->assertJson([
            'success' => true,
            'message' => 'Login berhasil.',
            'data' => [
                'user' => [
                    'nama_lengkap' => 'Kasir Satu',
                    'username' => 'KasirSatu',
                    'peran' => 'kasir',
                    'status_aktif' => true,
                ],
                'token_type' => 'Bearer',
            ],
        ]);

        $token = (string) $response->json('data.token');
        $this->assertNotEmpty($token);

        $this->withToken($token)
            ->getJson('/api/profile')
            ->assertStatus(200)
            ->assertJsonPath('data.username', 'KasirSatu');
    }

    public function test_login_rejects_client_role_and_remember_me_fields(): void
    {
        $this->postJson('/api/login', [
            'username' => 'owner',
            'password' => 'OwnerPass123!',
            'peran' => 'owner',
        ])->assertStatus(422);

        $this->postJson('/api/login', [
            'username' => 'owner',
            'password' => 'OwnerPass123!',
            'remember_me' => true,
        ])->assertStatus(422);
    }

    public function test_inactive_account_only_reveals_user_inactive_after_password_match(): void
    {
        Pengguna::query()->create([
            'nama_lengkap' => 'Kasir Nonaktif',
            'username' => 'kasir_nonaktif',
            'kata_sandi_hash' => 'Benar12345!',
            'peran' => 'kasir',
            'status_aktif' => false,
        ]);

        // Wrong password returns generic 401
        $this->postJson('/api/login', [
            'username' => 'kasir_nonaktif',
            'password' => 'Salah12345!',
        ])->assertStatus(401)
            ->assertJsonPath('message', 'Username atau password salah.')
            ->assertJsonMissingPath('error_code');

        // Matching password returns explicit USER_INACTIVE notice without issuing token
        $this->postJson('/api/login', [
            'username' => 'kasir_nonaktif',
            'password' => 'Benar12345!',
        ])->assertStatus(401)
            ->assertJsonPath('error_code', 'USER_INACTIVE')
            ->assertJsonPath('message', 'Akun Anda tidak aktif. Silakan hubungi Owner.')
            ->assertJsonMissingPath('data.token');
    }

    public function test_login_rate_limit_5_failures_per_15m_and_ip_burst_20_per_15m_ignore_spoofed_xff(): void
    {
        $t0 = CarbonImmutable::parse('2026-11-21T10:00:00+07:00');
        CarbonImmutable::setTestNow($t0);

        Pengguna::query()->create([
            'nama_lengkap' => 'Kasir RateLimit',
            'username' => 'kasir_rl',
            'kata_sandi_hash' => 'SandiBenar123!',
            'peran' => 'kasir',
            'status_aktif' => true,
        ]);

        for ($i = 1; $i <= 5; $i++) {
            $this->postJson('/api/login', [
                'username' => 'kasir_rl',
                'password' => 'SalahTerus!',
            ], [
                'X-Forwarded-For' => "203.0.113.{$i}",
            ])->assertStatus(401);
        }

        // Attempt #6 blocked even with correct password and spoofed X-Forwarded-For
        $this->postJson('/api/login', [
            'username' => 'kasir_rl',
            'password' => 'SandiBenar123!',
        ], [
            'X-Forwarded-For' => '198.51.100.77',
        ])->assertStatus(429)
            ->assertHeader('Retry-After')
            ->assertJsonPath('error_code', 'RATE_LIMIT_EXCEEDED');

        // Different real IP is unaffected
        $this->withServerVariables(['REMOTE_ADDR' => '10.10.0.50'])
            ->postJson('/api/login', [
                'username' => 'kasir_rl',
                'password' => 'SandiBenar123!',
            ])->assertStatus(200);

        // Advance past 15m -> unlocked on original IP
        CarbonImmutable::setTestNow($t0->addMinutes(15)->addSecond());

        // 20 consecutive successful logins consume IP burst limit
        for ($i = 0; $i < 20; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => '10.20.0.5'])
                ->postJson('/api/login', [
                    'username' => 'kasir_rl',
                    'password' => 'SandiBenar123!',
                ])->assertStatus(200);
        }

        $this->withServerVariables(['REMOTE_ADDR' => '10.20.0.5'])
            ->postJson('/api/login', [
                'username' => 'kasir_rl',
                'password' => 'SandiBenar123!',
            ])->assertStatus(429)
            ->assertJsonPath('error_code', 'RATE_LIMIT_EXCEEDED');
    }

    public function test_inactive_user_cannot_access_protected_routes_with_existing_token(): void
    {
        $kasir = Pengguna::query()->create([
            'nama_lengkap' => 'Kasir Token',
            'username' => 'kasir_token',
            'kata_sandi_hash' => 'SandiBenar123!',
            'peran' => 'kasir',
            'status_aktif' => true,
        ]);

        $token = $kasir->createToken('test-device')->plainTextToken;

        $kasir->update(['status_aktif' => false]);

        $this->withToken($token)
            ->getJson('/api/profile')
            ->assertStatus(401)
            ->assertJsonPath('error_code', 'USER_INACTIVE');
    }

    public function test_user_can_change_own_password_revoking_all_tokens_and_redacting_audit(): void
    {
        $user = Pengguna::query()->create([
            'nama_lengkap' => 'Kasir Ganti Sandi',
            'username' => 'kasir_pwd',
            'kata_sandi_hash' => 'LamaAman123!',
            'peran' => 'kasir',
            'status_aktif' => true,
        ]);

        $token1 = $user->createToken('device-1')->plainTextToken;
        $token2 = $user->createToken('device-2')->plainTextToken;

        // Wrong current password -> 422
        $this->withToken($token1)->putJson('/api/profile/password', [
            'current_password' => 'Salah123!',
            'new_password' => 'BaruAman999!',
            'new_password_confirmation' => 'BaruAman999!',
        ])->assertStatus(422);

        // Valid change revokes all tokens
        $this->withToken($token1)->putJson('/api/profile/password', [
            'current_password' => 'LamaAman123!',
            'new_password' => 'BaruAman999!',
            'new_password_confirmation' => 'BaruAman999!',
        ])->assertStatus(200)
            ->assertJsonPath('data.password_updated', true)
            ->assertJsonPath('data.revoked_sessions_count', 2);

        $this->assertSame(0, $user->tokens()->count());
        $this->assertTrue(Hash::check('BaruAman999!', $user->fresh()->kata_sandi_hash));

        // Reset auth guard cache & verify old tokens no longer work
        $this->app['auth']->forgetGuards();
        $this->withToken($token2)->getJson('/api/profile')->assertStatus(401);

        $audit = RiwayatPerubahan::query()
            ->where('entitas', 'pengguna')
            ->where('record_id', $user->id_pengguna)
            ->latest('id_riwayat')
            ->firstOrFail();

        $encoded = json_encode([$audit->nilai_sebelum, $audit->nilai_sesudah], JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('LamaAman123!', $encoded);
        $this->assertStringNotContainsString('BaruAman999!', $encoded);
        $this->assertStringNotContainsString('kata_sandi_hash', $encoded);
    }
}
