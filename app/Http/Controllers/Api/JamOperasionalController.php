<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\JamOperasional;
use App\Services\Audit\AuditLogService;
use App\Services\Operasional\OperationalHoursService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class JamOperasionalController extends Controller
{
    public function __construct(
        private readonly OperationalHoursService $operationalHours,
        private readonly AuditLogService $auditLog,
    ) {}

    /**
     * List all configured operating hours ordered from Senin to Minggu.
     */
    public function index(): JsonResponse
    {
        $jadwal = JamOperasional::query()
            ->orderByRaw(
                "CASE hari
                    WHEN 'senin' THEN 1
                    WHEN 'selasa' THEN 2
                    WHEN 'rabu' THEN 3
                    WHEN 'kamis' THEN 4
                    WHEN 'jumat' THEN 5
                    WHEN 'sabtu' THEN 6
                    WHEN 'minggu' THEN 7
                    ELSE 8
                END"
            )
            ->get();

        $konfigurasiLengkap = $jadwal->count() >= 7;

        return response()->json([
            'message' => 'Jadwal operasional berhasil diambil.',
            'data' => $jadwal,
            'konfigurasi_lengkap' => $konfigurasiLengkap,
            'peringatan_konfigurasi' => $konfigurasiLengkap
                ? null
                : 'Jadwal operasional mingguan belum lengkap (minimal 7 hari dikonfigurasi).',
        ]);
    }

    /**
     * Return current operating-hours evaluation in `Asia/Jakarta` timezone.
     */
    public function status(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->operationalHours->evaluate(),
        ]);
    }

    /**
     * Store a weekday operating schedule with the 21:00 WIB upper bound and audit log.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'hari' => ['required', 'in:senin,selasa,rabu,kamis,jumat,sabtu,minggu', 'unique:jam_operasional,hari'],
            'status_buka' => ['required', 'boolean'],
            'jam_buka' => ['nullable', 'required_if:status_buka,true,1', 'date_format:H:i'],
            'jam_tutup' => ['nullable', 'required_if:status_buka,true,1', 'date_format:H:i', 'after:jam_buka'],
        ]);

        $isOpen = (bool) $validated['status_buka'];

        if ($isOpen) {
            $this->operationalHours->assertValidOpenHours(
                (string) $validated['jam_buka'],
                (string) $validated['jam_tutup'],
            );
        }

        try {
            $jadwal = DB::transaction(function () use ($request, $validated, $isOpen): JamOperasional {
                $created = JamOperasional::query()->create([
                    'hari' => $validated['hari'],
                    'status_buka' => $isOpen,
                    'jam_buka' => $isOpen ? $validated['jam_buka'] : null,
                    'jam_tutup' => $isOpen ? $validated['jam_tutup'] : null,
                    'id_pengguna' => $request->user()->id_pengguna,
                ]);

                $this->auditLog->record(
                    actorUserId: $request->user()->id_pengguna,
                    entity: 'jam_operasional',
                    recordId: $created->id_jam_operasional,
                    before: null,
                    after: $created->toArray(),
                    reason: "Pengaturan jadwal operasional hari {$created->hari}",
                );

                return $created;
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'hari' => ['Jadwal untuk hari tersebut sudah ada.'],
            ]);
        }

        return response()->json([
            'message' => 'Jadwal berhasil ditambahkan.',
            'data' => $jadwal,
        ], 201);
    }

    /**
     * Update an existing weekday operating schedule with the 21:00 WIB upper bound and audit log.
     */
    public function update(Request $request, int|string $id): JsonResponse
    {
        JamOperasional::query()->findOrFail($id);

        $validated = $request->validate([
            'status_buka' => ['required', 'boolean'],
            'jam_buka' => ['nullable', 'required_if:status_buka,true,1', 'date_format:H:i'],
            'jam_tutup' => ['nullable', 'required_if:status_buka,true,1', 'date_format:H:i', 'after:jam_buka'],
        ]);

        $isOpen = (bool) $validated['status_buka'];

        if ($isOpen) {
            $this->operationalHours->assertValidOpenHours(
                (string) $validated['jam_buka'],
                (string) $validated['jam_tutup'],
            );
        }

        $updated = DB::transaction(function () use ($request, $id, $validated, $isOpen): JamOperasional {
            /** @var JamOperasional $locked */
            $locked = JamOperasional::query()
                ->where('id_jam_operasional', $id)
                ->lockForUpdate()
                ->firstOrFail();

            $sebelum = $locked->toArray();

            $locked->update([
                'status_buka' => $isOpen,
                'jam_buka' => $isOpen ? $validated['jam_buka'] : null,
                'jam_tutup' => $isOpen ? $validated['jam_tutup'] : null,
                'id_pengguna' => $request->user()->id_pengguna,
            ]);

            $fresh = $locked->fresh();

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'jam_operasional',
                recordId: $locked->id_jam_operasional,
                before: $sebelum,
                after: $fresh->toArray(),
                reason: "Pembaruan jadwal operasional hari {$locked->hari}",
            );

            return $fresh;
        });

        return response()->json([
            'message' => 'Jadwal berhasil diperbarui.',
            'data' => $updated,
        ]);
    }

    /**
     * Delete a weekday operating schedule entry with audit trail.
     */
    public function destroy(Request $request, int|string $id): JsonResponse
    {
        DB::transaction(function () use ($request, $id): void {
            /** @var JamOperasional $locked */
            $locked = JamOperasional::query()
                ->where('id_jam_operasional', $id)
                ->lockForUpdate()
                ->firstOrFail();

            $sebelum = $locked->toArray();
            $recordId = $locked->id_jam_operasional;

            $locked->delete();

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'jam_operasional',
                recordId: $recordId,
                before: $sebelum,
                after: ['deleted' => true, 'hari' => $sebelum['hari']],
                reason: "Penghapusan jadwal operasional hari {$sebelum['hari']}",
            );
        });

        return response()->json([
            'message' => 'Jadwal berhasil dihapus.',
        ]);
    }
}
