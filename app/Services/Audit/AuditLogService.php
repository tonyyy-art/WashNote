<?php

namespace App\Services\Audit;

use App\Models\RiwayatPerubahan;
use Carbon\CarbonInterface;

class AuditLogService
{
    /**
     * Sensitive credential and token keys that must never enter audit snapshots.
     *
     * @var array<int, string>
     */
    private const array FORBIDDEN_KEYS = [
        'kata_sandi',
        'kata_sandi_hash',
        'password',
        'password_confirmation',
        'password_baru',
        'password_baru_confirmation',
        'current_password',
        'new_password',
        'new_password_confirmation',
        'refresh_token',
        'refresh_token_hash',
        'access_token',
        'plain_text_token',
        'api_token',
        'authorization',
        'bearer',
        'token',
        'secret',
    ];

    /**
     * Record an append-only audit entry in `riwayat_perubahan` with sensitive keys stripped.
     *
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>  $after
     */
    public function record(
        int $actorUserId,
        string $entity,
        int $recordId,
        ?array $before,
        array $after,
        ?string $reason = null,
        ?CarbonInterface $timestamp = null,
    ): RiwayatPerubahan {
        $sanitizedBefore = $before === null ? null : $this->sanitizePayload($before);
        $sanitizedAfter = $this->sanitizePayload($after);

        return RiwayatPerubahan::query()->create([
            'id_pengguna' => $actorUserId,
            'entitas' => $entity,
            'record_id' => $recordId,
            'waktu_perubahan' => $timestamp ?? now(),
            'nilai_sebelum' => $sanitizedBefore,
            'nilai_sesudah' => $sanitizedAfter,
            'alasan' => $reason,
        ]);
    }

    /**
     * Recursively remove sensitive credential and token fields from audit payloads.
     *
     * @param  array<string|int, mixed>  $payload
     * @return array<string|int, mixed>
     */
    public function sanitizePayload(array $payload): array
    {
        $sanitized = [];

        foreach ($payload as $key => $value) {
            if (is_string($key) && in_array(mb_strtolower($key), self::FORBIDDEN_KEYS, true)) {
                continue;
            }

            if (is_array($value)) {
                $sanitized[$key] = $this->sanitizePayload($value);

                continue;
            }

            $sanitized[$key] = $value;
        }

        return $sanitized;
    }
}
