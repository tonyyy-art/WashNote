<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pengguna;
use App\Services\Audit\AuditLogService;
use App\Services\Auth\AuthRateLimitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use SensitiveParameter;

class AuthController extends Controller
{
    private static ?string $dummyTimingHash = null;

    public function __construct(
        private readonly AuthRateLimitService $rateLimiter,
        private readonly AuditLogService $auditLog,
    ) {}

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
            'peran' => ['prohibited'],
            'role' => ['prohibited'],
            'remember_me' => ['prohibited'],
        ]);

        $username = trim((string) $validated['username']);
        $password = (string) $validated['password'];
        $clientIp = (string) ($request->ip() ?? 'unknown');

        $this->rateLimiter->ensureLoginNotRateLimited($username, $clientIp);
        $this->rateLimiter->recordLoginRequestForIpBurst($clientIp);

        /** @var Pengguna|null $pengguna */
        $pengguna = Pengguna::query()
            ->whereRaw('LOWER(username) = ?', [mb_strtolower($username)])
            ->first();

        $passwordMatches = $pengguna !== null
            ? Hash::check($password, $pengguna->kata_sandi_hash)
            : $this->verifyDummyPassword($password);

        if (! $passwordMatches || $pengguna === null) {
            $this->rateLimiter->recordLoginFailure($username, $clientIp);

            return response()->json([
                'success' => false,
                'message' => 'Username atau password salah.',
            ], 401);
        }

        if (! $pengguna->status_aktif) {
            return response()->json([
                'success' => false,
                'error_code' => 'USER_INACTIVE',
                'message' => 'Akun Anda tidak aktif. Silakan hubungi Owner.',
            ], 401);
        }

        $this->rateLimiter->clearLoginFailures($username, $clientIp);

        $token = $pengguna->createToken('washnote-mobile')->plainTextToken;

        return response()->json([
            'success' => true,
            'message' => 'Login berhasil.',
            'data' => [
                'user' => [
                    'id_pengguna' => $pengguna->id_pengguna,
                    'nama_lengkap' => $pengguna->nama_lengkap,
                    'username' => $pengguna->username,
                    'peran' => $pengguna->peran,
                    'status_aktif' => $pengguna->status_aktif,
                ],
                'token' => $token,
                'token_type' => 'Bearer',
            ],
        ], 200);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json([
            'success' => true,
            'message' => 'Logout berhasil.',
        ]);
    }

    public function profile(Request $request): JsonResponse
    {
        /** @var Pengguna $pengguna */
        $pengguna = $request->user();

        return response()->json([
            'success' => true,
            'data' => [
                'id_pengguna' => $pengguna->id_pengguna,
                'nama_lengkap' => $pengguna->nama_lengkap,
                'username' => $pengguna->username,
                'peran' => $pengguna->peran,
                'status_aktif' => $pengguna->status_aktif,
            ],
        ]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'new_password' => ['required', 'string', 'min:8', 'max:128', 'confirmed', 'different:current_password'],
        ]);

        /** @var Pengguna $caller */
        $caller = $request->user();
        $currentPassword = (string) $validated['current_password'];
        $newPassword = (string) $validated['new_password'];

        if (! Hash::check($currentPassword, $caller->kata_sandi_hash)) {
            throw ValidationException::withMessages([
                'current_password' => ['Kata sandi saat ini tidak sesuai.'],
            ]);
        }

        $revokedCount = DB::transaction(function () use ($caller, $newPassword): int {
            /** @var Pengguna $user */
            $user = Pengguna::query()
                ->where('id_pengguna', $caller->id_pengguna)
                ->lockForUpdate()
                ->firstOrFail();

            $user->kata_sandi_hash = $newPassword;
            $user->save();

            $revokedSessionsCount = (int) $user->tokens()->delete();

            $this->auditLog->record(
                actorUserId: $user->id_pengguna,
                entity: 'pengguna',
                recordId: $user->id_pengguna,
                before: [
                    'id_pengguna' => $user->id_pengguna,
                    'username' => $user->username,
                    'peran' => $user->peran,
                ],
                after: [
                    'aksi' => 'PASSWORD_CHANGE',
                    'id_pengguna' => $user->id_pengguna,
                    'username' => $user->username,
                    'peran' => $user->peran,
                    'password_updated' => true,
                    'revoked_sessions_count' => $revokedSessionsCount,
                ],
                reason: 'Perubahan kata sandi oleh pemilik akun',
            );

            return $revokedSessionsCount;
        });

        return response()->json([
            'success' => true,
            'message' => 'Password berhasil diubah. Silakan login kembali.',
            'data' => [
                'password_updated' => true,
                'revoked_sessions_count' => $revokedCount,
            ],
        ]);
    }

    private function verifyDummyPassword(#[SensitiveParameter] string $password): bool
    {
        self::$dummyTimingHash ??= Hash::make('washnote-dummy-timing-guard-placeholder-v1');

        return Hash::check($password, self::$dummyTimingHash);
    }
}
