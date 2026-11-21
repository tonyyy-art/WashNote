<?php

namespace App\Console\Commands;

use App\Services\Cli\OwnerAccountCliService;
use DomainException;
use Illuminate\Console\Command;

class BootstrapOwnerCommand extends Command
{
    /**
     * Password CLI flag intentionally omitted so passwords are never passed in shell history.
     */
    protected $signature = 'washnote:bootstrap-owner
                            {--name= : Nama lengkap Owner}
                            {--username= : Username unik Owner}';

    protected $description = 'Membuat akun Owner pertama secara aman melalui CLI interaktif (sekali pakai).';

    public function handle(OwnerAccountCliService $cliService): int
    {
        if ($cliService->hasAnyOwner()) {
            $this->error('Bootstrap ditolak: akun Owner sudah terdaftar pada sistem (aktif maupun nonaktif).');

            return self::FAILURE;
        }

        $nameInput = $this->option('name');
        $name = is_string($nameInput) && trim($nameInput) !== ''
            ? trim($nameInput)
            : trim((string) $this->ask('Masukkan nama lengkap Owner'));

        $usernameInput = $this->option('username');
        $username = is_string($usernameInput) && trim($usernameInput) !== ''
            ? trim($usernameInput)
            : trim((string) $this->ask('Masukkan username Owner'));

        $password = (string) $this->secret('Masukkan kata sandi Owner (minimal 8 karakter)');
        $confirmation = (string) $this->secret('Konfirmasi kata sandi Owner');

        if ($password === '' || $password !== $confirmation) {
            $this->error('Konfirmasi kata sandi tidak cocok atau kosong.');

            return self::FAILURE;
        }

        try {
            $owner = $cliService->bootstrapOwner(
                namaLengkap: $name,
                username: $username,
                password: $password,
            );
        } catch (DomainException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info("Akun Owner berhasil dibuat (id_pengguna: {$owner->id_pengguna}, username: {$owner->username}, peran: {$owner->peran}).");

        return self::SUCCESS;
    }
}
