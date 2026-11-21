<?php

namespace Tests\Unit\Audit;

use App\Models\Pengguna;
use App\Services\Audit\AuditLogService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use LogicException;
use Tests\TestCase;

class AuditLogServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_audit_log_strips_sensitive_credential_and_token_keys_recursively(): void
    {
        $service = new AuditLogService;

        $sanitized = $service->sanitizePayload([
            'username' => 'kasir01',
            'password' => 'Rahasia123!',
            'kata_sandi_hash' => '$2y$12$example',
            'nested' => [
                'token' => 'bearer-secret',
                'password_baru' => 'Baru123!',
                'nama_lengkap' => 'Kasir Satu',
            ],
        ]);

        $this->assertSame([
            'username' => 'kasir01',
            'nested' => [
                'nama_lengkap' => 'Kasir Satu',
            ],
        ], $sanitized);
    }

    public function test_riwayat_perubahan_model_blocks_updates_and_deletes(): void
    {
        $user = Pengguna::query()->create([
            'nama_lengkap' => 'Owner Audit',
            'username' => 'owner_audit',
            'kata_sandi_hash' => 'OwnerPass123!',
            'peran' => 'owner',
            'status_aktif' => true,
        ]);

        $service = new AuditLogService;
        $entry = $service->record(
            actorUserId: $user->id_pengguna,
            entity: 'pengguna',
            recordId: $user->id_pengguna,
            before: null,
            after: ['username' => 'owner_audit'],
            reason: 'Uji append-only',
        );

        try {
            $entry->update(['alasan' => 'Diubah']);
            $this->fail('Expected LogicException when updating RiwayatPerubahan.');
        } catch (LogicException $e) {
            $this->assertStringContainsString('append-only', $e->getMessage());
        }

        try {
            $entry->delete();
            $this->fail('Expected LogicException when deleting RiwayatPerubahan.');
        } catch (LogicException $e) {
            $this->assertStringContainsString('append-only', $e->getMessage());
        }
    }
}
