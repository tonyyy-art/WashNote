<?php

namespace App\Services\Cli;

use App\Models\Pengguna;
use App\Services\Audit\AuditLogService;
use DomainException;
use Illuminate\Support\Facades\DB;
use SensitiveParameter;

class OwnerAccountCliService
{
    private const int BOOTSTRAP_LOCK_KEY = 921020261;

    private const string ROLE_OWNER = 'owner';

    public function __construct(
        private readonly AuditLogService $auditLog,
    ) {}

    public function hasAnyOwner(): bool
    {
        return Pengguna::query()
            ->where('peran', self::ROLE_OWNER)
            ->exists();
    }

    /**
     * Create the sole initial owner account via CLI, locked once any owner exists (active or inactive).
     *
     * @throws DomainException
     */
    public function bootstrapOwner(
        string $namaLengkap,
        string $username,
        #[SensitiveParameter] string $password,
    ): Pengguna {
        $trimmedName = trim($namaLengkap);
        $trimmedUsername = trim($username);

        $this->assertValidProfile($trimmedName, $trimmedUsername);
        $this->assertValidPassword($password);

        return DB::transaction(function () use ($trimmedName, $trimmedUsername, $password): Pengguna {
            if (DB::getDriverName() === 'pgsql') {
                DB::statement('SELECT pg_advisory_xact_lock(?)', [self::BOOTSTRAP_LOCK_KEY]);
            }

            if ($this->hasAnyOwner()) {
                throw new DomainException('Bootstrap ditolak: akun Owner sudah ada (aktif maupun nonaktif).');
            }

            $usernameTaken = Pengguna::query()
                ->whereRaw('LOWER(username) = ?', [mb_strtolower($trimmedUsername)])
                ->exists();

            if ($usernameTaken) {
                throw new DomainException("Username '{$trimmedUsername}' sudah digunakan oleh akun lain.");
            }

            $owner = Pengguna::query()->create([
                'nama_lengkap' => $trimmedName,
                'username' => $trimmedUsername,
                'kata_sandi_hash' => $password,
                'peran' => self::ROLE_OWNER,
                'status_aktif' => true,
            ]);

            $this->auditLog->record(
                actorUserId: $owner->id_pengguna,
                entity: 'pengguna',
                recordId: $owner->id_pengguna,
                before: null,
                after: [
                    'aksi' => 'OWNER_BOOTSTRAP',
                    'execution_context' => 'CLI_SERVER_OPERATOR',
                    'actor_attribution_mode' => 'TARGET_FK_CONSTRAINT_ONLY',
                    'actor_is_target_user' => false,
                    'target_user_id' => $owner->id_pengguna,
                    'target_username' => $owner->username,
                    'target_peran' => $owner->peran,
                    'nama_lengkap' => $owner->nama_lengkap,
                    'status_aktif' => $owner->status_aktif,
                ],
                reason: 'Bootstrap akun Owner awal via CLI washnote:bootstrap-owner oleh operator server.',
            );

            return $owner;
        });
    }

    /**
     * Locate target owner account for CLI password recovery (strictly `peran = 'owner'`).
     *
     * @throws DomainException
     */
    public function resolveTargetOwner(?string $username = null): Pengguna
    {
        $trimmed = $username !== null ? trim($username) : '';

        if ($trimmed !== '') {
            /** @var Pengguna|null $candidate */
            $candidate = Pengguna::query()
                ->whereRaw('LOWER(username) = ?', [mb_strtolower($trimmed)])
                ->first();

            if ($candidate === null) {
                throw new DomainException("Akun Owner dengan username '{$trimmed}' tidak ditemukan.");
            }

            if ($candidate->peran !== self::ROLE_OWNER) {
                throw new DomainException("Pemulihan CLI ditolak: '{$trimmed}' bukan akun owner.");
            }

            return $candidate;
        }

        $owners = Pengguna::query()
            ->where('peran', self::ROLE_OWNER)
            ->orderBy('id_pengguna')
            ->get();

        if ($owners->isEmpty()) {
            throw new DomainException('Belum ada akun Owner terdaftar. Jalankan washnote:bootstrap-owner terlebih dahulu.');
        }

        if ($owners->count() > 1) {
            throw new DomainException('Terdapat lebih dari satu akun Owner. Tentukan --username secara eksplisit.');
        }

        return $owners->first();
    }

    /**
     * Reset owner password via server CLI, revoking all active Sanctum tokens and recording sanitized audit trail.
     *
     * @return array{user: Pengguna, revoked_sessions_count: int}
     *
     * @throws DomainException
     */
    public function recoverOwnerPassword(
        int $targetOwnerId,
        string $reason,
        #[SensitiveParameter] string $newPassword,
    ): array {
        $trimmedReason = trim($reason);

        if (mb_strlen($trimmedReason) < 5) {
            throw new DomainException('Alasan pemulihan wajib diisi minimal 5 karakter.');
        }

        $this->assertValidPassword($newPassword);

        return DB::transaction(function () use ($targetOwnerId, $trimmedReason, $newPassword): array {
            /** @var Pengguna|null $owner */
            $owner = Pengguna::query()
                ->where('id_pengguna', $targetOwnerId)
                ->where('peran', self::ROLE_OWNER)
                ->lockForUpdate()
                ->first();

            if ($owner === null) {
                throw new DomainException('Akun Owner target tidak ditemukan.');
            }

            $beforeSnapshot = [
                'target_user_id' => $owner->id_pengguna,
                'target_username' => $owner->username,
                'target_peran' => $owner->peran,
                'status_aktif' => $owner->status_aktif,
            ];

            $owner->kata_sandi_hash = $newPassword;
            $owner->save();

            $revokedSessionsCount = (int) $owner->tokens()->delete();

            $this->auditLog->record(
                actorUserId: $owner->id_pengguna,
                entity: 'pengguna',
                recordId: $owner->id_pengguna,
                before: $beforeSnapshot,
                after: [
                    'aksi' => 'OWNER_RECOVERY',
                    'execution_context' => 'CLI_ADMIN_OPERATOR',
                    'actor_attribution_mode' => 'TARGET_FK_CONSTRAINT_ONLY',
                    'actor_is_target_user' => false,
                    'target_user_id' => $owner->id_pengguna,
                    'target_username' => $owner->username,
                    'target_peran' => $owner->peran,
                    'status_aktif' => $owner->status_aktif,
                    'password_updated' => true,
                    'revoked_sessions_count' => $revokedSessionsCount,
                ],
                reason: $trimmedReason,
            );

            return [
                'user' => $owner,
                'revoked_sessions_count' => $revokedSessionsCount,
            ];
        });
    }

    private function assertValidProfile(string $namaLengkap, string $username): void
    {
        $nameLength = mb_strlen($namaLengkap);

        if ($nameLength < 2 || $nameLength > 120) {
            throw new DomainException('Nama lengkap harus terdiri dari 2 sampai 120 karakter.');
        }

        $usernameLength = mb_strlen($username);

        if ($usernameLength < 3 || $usernameLength > 60 || preg_match('/^[a-zA-Z0-9._-]+$/', $username) !== 1) {
            throw new DomainException('Username harus 3-60 karakter (huruf, angka, titik, garis bawah, atau tanda hubung).');
        }
    }

    private function assertValidPassword(#[SensitiveParameter] string $password): void
    {
        $length = mb_strlen($password);

        if ($length < 8 || $length > 128) {
            throw new DomainException('Kata sandi harus terdiri dari 8 sampai 128 karakter.');
        }
    }
}
