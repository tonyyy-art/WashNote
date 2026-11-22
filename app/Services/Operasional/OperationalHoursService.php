<?php

namespace App\Services\Operasional;

use App\Models\JamOperasional;
use App\Models\PengecualianJamOperasional;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Validation\ValidationException;

class OperationalHoursService
{
    public const string STATUS_DALAM_JAM = 'dalam_jam';

    public const string STATUS_DI_LUAR_JAM = 'di_luar_jam';

    public const string STATUS_HARI_LIBUR = 'hari_libur';

    public const string STATUS_BELUM_DIKONFIGURASI = 'belum_dikonfigurasi';

    public const string MAX_CLOSING_TIME = '21:00:00';

    /**
     * @var array<int, string>
     */
    public const array HARI_MAP = [
        1 => 'senin',
        2 => 'selasa',
        3 => 'rabu',
        4 => 'kamis',
        5 => 'jumat',
        6 => 'sabtu',
        7 => 'minggu',
    ];

    /**
     * Normalize `H:i` or `H:i:s` string to `H:i:s`.
     */
    public function normalizeTimeToHis(?string $time): ?string
    {
        if ($time === null || trim($time) === '') {
            return null;
        }

        return Carbon::parse($time)->format('H:i:s');
    }

    /**
     * Enforce non-crossing-midnight rule and the SRS 21:00 WIB closing limit.
     */
    public function assertValidOpenHours(string $jamBuka, string $jamTutup): void
    {
        $buka = $this->normalizeTimeToHis($jamBuka);
        $tutup = $this->normalizeTimeToHis($jamTutup);

        if ($buka === null || $tutup === null || $buka >= $tutup) {
            throw ValidationException::withMessages([
                'jam_tutup' => ['Jam tutup harus lebih besar dari jam buka.'],
            ]);
        }

        if ($tutup > self::MAX_CLOSING_TIME) {
            throw ValidationException::withMessages([
                'jam_tutup' => ['Jam tutup operasional maksimal pukul 21:00 WIB.'],
            ]);
        }
    }

    /**
     * Evaluate operating hours for the given moment in `Asia/Jakarta` (`WIB`).
     *
     * @return array{
     *     status_jam_operasional: string,
     *     di_luar_jam_operasional: bool,
     *     pada_hari_libur: bool,
     *     perlu_konfirmasi_hari_libur: bool,
     *     konfigurasi_lengkap: bool,
     *     tanggal: string,
     *     hari: string,
     *     waktu_wib: string,
     *     sumber_aturan: string,
     *     warnings: array<int, string>
     * }
     */
    public function evaluate(?CarbonInterface $moment = null): array
    {
        $wib = ($moment ? Carbon::instance($moment) : now())->copy()->setTimezone('Asia/Jakarta');
        $tanggal = $wib->toDateString();
        $hari = self::HARI_MAP[$wib->dayOfWeekIso];
        $waktuSekarang = $wib->format('H:i:s');

        $configuredCount = JamOperasional::query()->count();
        $konfigurasiLengkap = $configuredCount >= 7;

        /** @var PengecualianJamOperasional|null $exception */
        $exception = PengecualianJamOperasional::query()
            ->whereDate('tanggal', $tanggal)
            ->first();

        if ($exception !== null) {
            if ($exception->jenis_pengecualian === PengecualianJamOperasional::JENIS_LIBUR) {
                return [
                    'status_jam_operasional' => self::STATUS_HARI_LIBUR,
                    'di_luar_jam_operasional' => true,
                    'pada_hari_libur' => true,
                    'perlu_konfirmasi_hari_libur' => true,
                    'konfigurasi_lengkap' => $konfigurasiLengkap,
                    'tanggal' => $tanggal,
                    'hari' => $hari,
                    'waktu_wib' => $waktuSekarang,
                    'sumber_aturan' => 'pengecualian',
                    'warnings' => [
                        sprintf('Tanggal %s merupakan hari libur operasional (%s).', $tanggal, $exception->keterangan),
                    ],
                ];
            }

            $jamBuka = $this->normalizeTimeToHis($exception->jam_buka);
            $jamTutup = $this->normalizeTimeToHis($exception->jam_tutup);
            $isWithin = $jamBuka !== null
                && $jamTutup !== null
                && $waktuSekarang >= $jamBuka
                && $waktuSekarang <= $jamTutup;

            return [
                'status_jam_operasional' => $isWithin ? self::STATUS_DALAM_JAM : self::STATUS_DI_LUAR_JAM,
                'di_luar_jam_operasional' => ! $isWithin,
                'pada_hari_libur' => false,
                'perlu_konfirmasi_hari_libur' => false,
                'konfigurasi_lengkap' => $konfigurasiLengkap,
                'tanggal' => $tanggal,
                'hari' => $hari,
                'waktu_wib' => $waktuSekarang,
                'sumber_aturan' => 'pengecualian',
                'warnings' => $isWithin
                    ? []
                    : [sprintf('Pesanan dibuat di luar jam operasional khusus (%s).', $exception->keterangan)],
            ];
        }

        /** @var JamOperasional|null $jadwal */
        $jadwal = JamOperasional::query()
            ->where('hari', $hari)
            ->first();

        if ($jadwal === null) {
            return [
                'status_jam_operasional' => self::STATUS_BELUM_DIKONFIGURASI,
                'di_luar_jam_operasional' => true,
                'pada_hari_libur' => false,
                'perlu_konfirmasi_hari_libur' => false,
                'konfigurasi_lengkap' => $konfigurasiLengkap,
                'tanggal' => $tanggal,
                'hari' => $hari,
                'waktu_wib' => $waktuSekarang,
                'sumber_aturan' => 'tidak_ada',
                'warnings' => ['Jadwal operasional hari ini belum dikonfigurasi oleh Owner.'],
            ];
        }

        if (! $jadwal->status_buka) {
            return [
                'status_jam_operasional' => self::STATUS_DI_LUAR_JAM,
                'di_luar_jam_operasional' => true,
                'pada_hari_libur' => false,
                'perlu_konfirmasi_hari_libur' => false,
                'konfigurasi_lengkap' => $konfigurasiLengkap,
                'tanggal' => $tanggal,
                'hari' => $hari,
                'waktu_wib' => $waktuSekarang,
                'sumber_aturan' => 'jadwal_mingguan',
                'warnings' => ["Hari {$hari} sedang tutup berdasarkan jadwal mingguan."],
            ];
        }

        $jamBuka = $this->normalizeTimeToHis($jadwal->jam_buka);
        $jamTutup = $this->normalizeTimeToHis($jadwal->jam_tutup);
        $isWithin = $jamBuka !== null
            && $jamTutup !== null
            && $waktuSekarang >= $jamBuka
            && $waktuSekarang <= $jamTutup;

        return [
            'status_jam_operasional' => $isWithin ? self::STATUS_DALAM_JAM : self::STATUS_DI_LUAR_JAM,
            'di_luar_jam_operasional' => ! $isWithin,
            'pada_hari_libur' => false,
            'perlu_konfirmasi_hari_libur' => false,
            'konfigurasi_lengkap' => $konfigurasiLengkap,
            'tanggal' => $tanggal,
            'hari' => $hari,
            'waktu_wib' => $waktuSekarang,
            'sumber_aturan' => 'jadwal_mingguan',
            'warnings' => $isWithin ? [] : ['Pesanan dibuat di luar jam operasional reguler.'],
        ];
    }
}
