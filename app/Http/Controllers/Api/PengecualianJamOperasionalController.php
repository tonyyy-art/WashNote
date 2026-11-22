<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PengecualianJamOperasional;
use App\Services\Audit\AuditLogService;
use App\Services\Operasional\OperationalHoursService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PengecualianJamOperasionalController extends Controller
{
    public function __construct(
        private readonly OperationalHoursService $operationalHours,
        private readonly AuditLogService $auditLog,
    ) {}

    /**
     * List operating hour exceptions ordered chronologically.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tanggal_mulai' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'tanggal_akhir' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:tanggal_mulai'],
        ]);

        $query = PengecualianJamOperasional::query()->orderBy('tanggal');

        if (! empty($validated['tanggal_mulai'])) {
            $query->whereDate('tanggal', '>=', $validated['tanggal_mulai']);
        }

        if (! empty($validated['tanggal_akhir'])) {
            $query->whereDate('tanggal', '<=', $validated['tanggal_akhir']);
        }

        return response()->json([
            'success' => true,
            'message' => 'Data pengecualian jam operasional berhasil diambil.',
            'data' => $query->get(),
        ]);
    }

    /**
     * Store a date-specific holiday or special hours override.
     */
    public function store(Request $request): JsonResponse
    {
        $this->normalizeJenis($request);

        $validated = $request->validate([
            'tanggal' => ['required', 'date_format:Y-m-d', 'unique:pengecualian_jam_operasional,tanggal'],
            'jenis_pengecualian' => ['required', 'string', 'in:libur,jam_khusus'],
            'jam_buka' => ['nullable', 'required_if:jenis_pengecualian,jam_khusus', 'date_format:H:i'],
            'jam_tutup' => ['nullable', 'required_if:jenis_pengecualian,jam_khusus', 'date_format:H:i'],
            'keterangan' => ['required', 'string', 'min:3', 'max:255'],
        ]);

        $isSpecialHours = $validated['jenis_pengecualian'] === PengecualianJamOperasional::JENIS_JAM_KHUSUS;

        if ($isSpecialHours) {
            $this->operationalHours->assertValidOpenHours(
                (string) $validated['jam_buka'],
                (string) $validated['jam_tutup'],
            );
        }

        try {
            $created = DB::transaction(function () use ($request, $validated, $isSpecialHours): PengecualianJamOperasional {
                $exception = PengecualianJamOperasional::query()->create([
                    'tanggal' => $validated['tanggal'],
                    'jenis_pengecualian' => $validated['jenis_pengecualian'],
                    'jam_buka' => $isSpecialHours ? $validated['jam_buka'] : null,
                    'jam_tutup' => $isSpecialHours ? $validated['jam_tutup'] : null,
                    'keterangan' => trim((string) $validated['keterangan']),
                    'id_pengguna' => $request->user()->id_pengguna,
                ]);

                $this->auditLog->record(
                    actorUserId: $request->user()->id_pengguna,
                    entity: 'pengecualian_jam_operasional',
                    recordId: $exception->id_pengecualian,
                    before: null,
                    after: $exception->toArray(),
                    reason: trim((string) $validated['keterangan']),
                );

                return $exception;
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'tanggal' => ['Pengecualian jam operasional untuk tanggal tersebut sudah ada.'],
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Pengecualian jam operasional berhasil ditambahkan.',
            'data' => $created,
        ], 201);
    }

    /**
     * Update an existing date-specific operating hour exception.
     */
    public function update(Request $request, int|string $id): JsonResponse
    {
        $exception = PengecualianJamOperasional::query()->findOrFail($id);
        $this->normalizeJenis($request);

        $validated = $request->validate([
            'tanggal' => [
                'sometimes',
                'date_format:Y-m-d',
                Rule::unique('pengecualian_jam_operasional', 'tanggal')
                    ->ignore($exception->id_pengecualian, 'id_pengecualian'),
            ],
            'jenis_pengecualian' => ['required', 'string', 'in:libur,jam_khusus'],
            'jam_buka' => ['nullable', 'required_if:jenis_pengecualian,jam_khusus', 'date_format:H:i'],
            'jam_tutup' => ['nullable', 'required_if:jenis_pengecualian,jam_khusus', 'date_format:H:i'],
            'keterangan' => ['required', 'string', 'min:3', 'max:255'],
        ]);

        $isSpecialHours = $validated['jenis_pengecualian'] === PengecualianJamOperasional::JENIS_JAM_KHUSUS;

        if ($isSpecialHours) {
            $this->operationalHours->assertValidOpenHours(
                (string) $validated['jam_buka'],
                (string) $validated['jam_tutup'],
            );
        }

        $updated = DB::transaction(function () use ($request, $id, $validated, $isSpecialHours): PengecualianJamOperasional {
            /** @var PengecualianJamOperasional $locked */
            $locked = PengecualianJamOperasional::query()
                ->where('id_pengecualian', $id)
                ->lockForUpdate()
                ->firstOrFail();

            $sebelum = $locked->toArray();

            $locked->update([
                'tanggal' => $validated['tanggal'] ?? $locked->tanggal,
                'jenis_pengecualian' => $validated['jenis_pengecualian'],
                'jam_buka' => $isSpecialHours ? $validated['jam_buka'] : null,
                'jam_tutup' => $isSpecialHours ? $validated['jam_tutup'] : null,
                'keterangan' => trim((string) $validated['keterangan']),
                'id_pengguna' => $request->user()->id_pengguna,
            ]);

            $fresh = $locked->fresh();

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'pengecualian_jam_operasional',
                recordId: $locked->id_pengecualian,
                before: $sebelum,
                after: $fresh->toArray(),
                reason: trim((string) $validated['keterangan']),
            );

            return $fresh;
        });

        return response()->json([
            'success' => true,
            'message' => 'Pengecualian jam operasional berhasil diperbarui.',
            'data' => $updated,
        ]);
    }

    /**
     * Delete a date-specific operating hour exception with audit trail.
     */
    public function destroy(Request $request, int|string $id): JsonResponse
    {
        DB::transaction(function () use ($request, $id): void {
            /** @var PengecualianJamOperasional $locked */
            $locked = PengecualianJamOperasional::query()
                ->where('id_pengecualian', $id)
                ->lockForUpdate()
                ->firstOrFail();

            $sebelum = $locked->toArray();
            $recordId = $locked->id_pengecualian;

            $locked->delete();

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'pengecualian_jam_operasional',
                recordId: $recordId,
                before: $sebelum,
                after: ['deleted' => true, 'tanggal' => $sebelum['tanggal']],
                reason: 'Penghapusan pengecualian jam operasional',
            );
        });

        return response()->json([
            'success' => true,
            'message' => 'Pengecualian jam operasional berhasil dihapus.',
        ]);
    }

    private function normalizeJenis(Request $request): void
    {
        if ($request->has('jenis_pengecualian') && is_string($request->input('jenis_pengecualian'))) {
            $request->merge([
                'jenis_pengecualian' => mb_strtolower(trim($request->input('jenis_pengecualian'))),
            ]);
        }
    }
}
