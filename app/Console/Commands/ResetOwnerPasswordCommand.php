<?php

namespace App\Console\Commands;

use App\Services\Cli\OwnerAccountCliService;
use DomainException;
use Illuminate\Console\Command;

class ResetOwnerPasswordCommand extends Command
{
    /**
     * Password CLI flag intentionally omitted so passwords are never passed in shell history.
     */
    protected $signature = 'washnote:reset-owner-password
                            {--username= : Username akun Owner target}
                            {--reason= : Alasan verifikasi identitas Owner di luar aplikasi}';

    protected $description = 'Memulihkan kata sandi akun Owner melalui CLI admin/dev dan mencabut seluruh sesi aktif Owner.';

    public function handle(OwnerAccountCliService $cliService): int
    {
        $usernameOption = $this->option('username');
        $requestedUsername = is_string($usernameOption) && trim($usernameOption) !== ''
            ? trim($usernameOption)
            : null;

        try {
            $targetOwner = $cliService->resolveTargetOwner($requestedUsername);
        } catch (DomainException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $reasonOption = $this->option('reason');
        $reason = is_string($reasonOption) && trim($reasonOption) !== ''
            ? trim($reasonOption)
            : trim((string) $this->ask('Masukkan alasan & bukti verifikasi identitas Owner (minimal 5 karakter)'));

        if (mb_strlen($reason) < 5) {
            $this->error('Alasan pemulihan wajib diisi minimal 5 karakter.');

            return self::FAILURE;
        }

        $confirmed = $this->confirm(
            "Konfirmasi pemulihan kata sandi untuk Owner '{$targetOwner->username}' dan pencabutan semua sesi aktif?",
            false,
        );

        if (! $confirmed) {
            $this->error('Pemulihan kata sandi Owner dibatalkan.');

            return self::FAILURE;
        }

        $newPassword = (string) $this->secret('Masukkan kata sandi baru Owner (minimal 8 karakter)');
        $confirmation = (string) $this->secret('Konfirmasi kata sandi baru Owner');

        if ($newPassword === '' || $newPassword !== $confirmation) {
            $this->error('Konfirmasi kata sandi baru tidak cocok atau kosong.');

            return self::FAILURE;
        }

        try {
            $result = $cliService->recoverOwnerPassword(
                targetOwnerId: $targetOwner->id_pengguna,
                reason: $reason,
                newPassword: $newPassword,
            );
        } catch (DomainException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info(
            "Kata sandi Owner '{$result['user']->username}' berhasil dipulihkan. Sesi aktif yang dicabut: {$result['revoked_sessions_count']}."
        );

        return self::SUCCESS;
    }
}
