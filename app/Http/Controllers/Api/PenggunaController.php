<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pengguna;
use App\Services\Audit\AuditLogService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PenggunaController extends Controller
{
    public function __construct(
        private readonly AuditLogService $auditLog,
    ) {}

    /**
     * List kasir accounts with optional status/search filters and bounded pagination.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', 'in:all,active,inactive'],
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1'],
        ]);

        $defaultPerPage = (int) config('washnote.kasir_per_page_default', 10);
        $maxPerPage = (int) config('washnote.kasir_per_page_max', 50);
        $perPage = min($maxPerPage, max(1, (int) ($validated['per_page'] ?? $defaultPerPage)));

        $query = Pengguna::query()
            ->where('peran', 'kasir')
            ->select(
                'id_pengguna',
                'nama_lengkap',
                'username',
                'peran',
                'status_aktif',
                'created_at',
            );

        $status = (string) ($validated['status'] ?? 'all');

        if ($status === 'active') {
            $query->where('status_aktif', true);
        } elseif ($status === 'inactive') {
            $query->where('status_aktif', false);
        }

        $search = trim((string) ($validated['search'] ?? ''));

        if ($search !== '') {
            $escaped = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($search));
            $pattern = '%'.$escaped.'%';

            $query->where(static function (Builder $subQuery) use ($pattern): void {
                $subQuery
                    ->whereRaw("LOWER(nama_lengkap) LIKE ? ESCAPE '!'", [$pattern])
                    ->orWhereRaw("LOWER(username) LIKE ? ESCAPE '!'", [$pattern]);
            });
        }

        $kasir = $query
            ->latest()
            ->orderByDesc('id_pengguna')
            ->paginate($perPage);

        return response()->json([
            'message' => 'Data kasir berhasil diambil.',
            'data' => $kasir,
        ]);
    }

    /**
     * Create a new kasir account with server-enforced role and case-insensitive username uniqueness.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'nama_lengkap' => ['required', 'string', 'min:2', 'max:255'],
            'username' => ['required', 'string', 'min:3', 'max:100', 'regex:/^[a-zA-Z0-9._-]+$/'],
            'password' => ['required', 'string', 'min:8', 'max:128'],
            'password_confirmation' => ['sometimes', 'string', 'same:password'],
            'peran' => ['prohibited'],
            'role' => ['prohibited'],
        ]);

        $trimmedName = trim((string) $validated['nama_lengkap']);
        $trimmedUsername = trim((string) $validated['username']);

        $exists = Pengguna::query()
            ->whereRaw('LOWER(username) = ?', [mb_strtolower($trimmedUsername)])
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'username' => ['Username sudah digunakan.'],
            ]);
        }

        try {
            $kasir = DB::transaction(function () use ($request, $trimmedName, $trimmedUsername, $validated): Pengguna {
                $created = Pengguna::query()->create([
                    'nama_lengkap' => $trimmedName,
                    'username' => $trimmedUsername,
                    'kata_sandi_hash' => (string) $validated['password'],
                    'peran' => 'kasir',
                    'status_aktif' => true,
                ]);

                $this->auditLog->record(
                    actorUserId: $request->user()->id_pengguna,
                    entity: 'pengguna',
                    recordId: $created->id_pengguna,
                    before: null,
                    after: [
                        'nama_lengkap' => $created->nama_lengkap,
                        'username' => $created->username,
                        'peran' => $created->peran,
                        'status_aktif' => $created->status_aktif,
                    ],
                    reason: 'Pembuatan akun kasir',
                );

                return $created;
            });
        } catch (UniqueConstraintViolationException $e) {
            throw ValidationException::withMessages([
                'username' => ['Username sudah digunakan.'],
            ]);
        }

        return response()->json([
            'message' => 'Akun kasir berhasil dibuat.',
            'data' => $kasir,
        ], 201);
    }

    /**
     * Update mutable kasir profile (`nama_lengkap` only; `username` is immutable).
     */
    public function update(Request $request, int|string $id): JsonResponse
    {
        $validated = $request->validate([
            'nama_lengkap' => ['required', 'string', 'min:2', 'max:255'],
            'username' => ['sometimes', 'string', 'max:100'],
            'peran' => ['prohibited'],
            'role' => ['prohibited'],
        ]);

        $kasir = DB::transaction(function () use ($request, $id, $validated): Pengguna {
            /** @var Pengguna $target */
            $target = Pengguna::query()
                ->where('peran', 'kasir')
                ->where('id_pengguna', $id)
                ->lockForUpdate()
                ->firstOrFail();

            if (
                array_key_exists('username', $validated)
                && trim((string) $validated['username']) !== $target->username
            ) {
                throw ValidationException::withMessages([
                    'username' => ['Username akun kasir tidak dapat diubah.'],
                ]);
            }

            $sebelum = [
                'nama_lengkap' => $target->nama_lengkap,
                'username' => $target->username,
            ];

            $target->update([
                'nama_lengkap' => trim((string) $validated['nama_lengkap']),
            ]);

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'pengguna',
                recordId: $target->id_pengguna,
                before: $sebelum,
                after: [
                    'nama_lengkap' => $target->nama_lengkap,
                    'username' => $target->username,
                ],
                reason: 'Perubahan informasi akun kasir',
            );

            return $target->fresh();
        });

        return response()->json([
            'message' => 'Data kasir berhasil diperbarui.',
            'data' => $kasir,
        ]);
    }

    /**
     * Activate or deactivate a kasir account, revoking all active tokens on deactivation.
     */
    public function updateStatus(Request $request, int|string $id): JsonResponse
    {
        $validated = $request->validate([
            'status_aktif' => ['required', 'boolean'],
            'alasan' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        $result = DB::transaction(function () use ($request, $id, $validated): array {
            /** @var Pengguna $kasir */
            $kasir = Pengguna::query()
                ->where('peran', 'kasir')
                ->where('id_pengguna', $id)
                ->lockForUpdate()
                ->firstOrFail();

            $sebelum = [
                'status_aktif' => $kasir->status_aktif,
            ];

            $nextStatus = (bool) $validated['status_aktif'];

            $kasir->update([
                'status_aktif' => $nextStatus,
            ]);

            $revokedSessionsCount = 0;

            if (! $nextStatus) {
                $revokedSessionsCount = (int) $kasir->tokens()->delete();
            }

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'pengguna',
                recordId: $kasir->id_pengguna,
                before: $sebelum,
                after: [
                    'status_aktif' => $kasir->status_aktif,
                    'revoked_sessions_count' => $revokedSessionsCount,
                ],
                reason: trim((string) $validated['alasan']),
            );

            return [
                'kasir' => $kasir->fresh(),
                'revoked_sessions_count' => $revokedSessionsCount,
            ];
        });

        return response()->json([
            'message' => 'Status akun kasir berhasil diperbarui.',
            'data' => $result['kasir'],
            'revoked_sessions_count' => $result['revoked_sessions_count'],
        ]);
    }

    /**
     * Reset a kasir account password and revoke all active tokens immediately.
     */
    public function resetPassword(Request $request, int|string $id): JsonResponse
    {
        $validated = $request->validate([
            'password_baru' => ['required', 'string', 'min:8', 'max:128', 'confirmed'],
        ]);

        $revokedCount = DB::transaction(function () use ($request, $id, $validated): int {
            /** @var Pengguna $kasir */
            $kasir = Pengguna::query()
                ->where('peran', 'kasir')
                ->where('id_pengguna', $id)
                ->lockForUpdate()
                ->firstOrFail();

            $kasir->update([
                'kata_sandi_hash' => (string) $validated['password_baru'],
            ]);

            $revokedSessionsCount = (int) $kasir->tokens()->delete();

            $this->auditLog->record(
                actorUserId: $request->user()->id_pengguna,
                entity: 'pengguna',
                recordId: $kasir->id_pengguna,
                before: null,
                after: [
                    'password_diubah' => true,
                    'revoked_sessions_count' => $revokedSessionsCount,
                ],
                reason: 'Reset password akun kasir',
            );

            return $revokedSessionsCount;
        });

        return response()->json([
            'message' => 'Password kasir berhasil direset.',
            'revoked_sessions_count' => $revokedCount,
        ]);
    }
}
