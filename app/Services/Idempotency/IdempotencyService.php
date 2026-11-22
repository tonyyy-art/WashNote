<?php

namespace App\Services\Idempotency;

use App\Models\IdempotencyKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class IdempotencyService
{
    public const string SCOPE_CREATE_ORDER = 'CREATE_ORDER';

    public const string SCOPE_PAY_ORDER = 'PAY_ORDER';

    public const string SCOPE_CREATE_EXPENSE = 'CREATE_EXPENSE';

    /**
     * Extract and validate the optional Idempotency-Key request header.
     */
    public function extractKey(Request $request): ?string
    {
        $raw = $request->header('Idempotency-Key');

        if (! is_string($raw)) {
            return null;
        }

        $trimmed = trim($raw);

        if ($trimmed === '') {
            return null;
        }

        if (mb_strlen($trimmed) > 255) {
            throw ValidationException::withMessages([
                'idempotency_key' => ['Header Idempotency-Key maksimal 255 karakter.'],
            ]);
        }

        return $trimmed;
    }

    /**
     * Compute a deterministic SHA-256 hash of a normalized request payload.
     *
     * @param  array<string|int, mixed>  $payload
     */
    public function hashPayload(array $payload): string
    {
        $canonical = $this->canonicalizeValue($payload);

        return hash('sha256', json_encode($canonical, JSON_THROW_ON_ERROR));
    }

    public function findForUser(int $userId, string $scope, string $key): ?IdempotencyKey
    {
        return IdempotencyKey::query()
            ->where('id_pengguna', $userId)
            ->where('scope_operasi', $scope)
            ->where('idempotency_key', $key)
            ->first();
    }

    public function findByScopeAndKey(string $scope, string $key): ?IdempotencyKey
    {
        return IdempotencyKey::query()
            ->where('scope_operasi', $scope)
            ->where('idempotency_key', $key)
            ->first();
    }

    /**
     * Persist a successful response snapshot for future idempotent replays.
     *
     * @param  array<string|int, mixed>  $responseBody
     */
    public function storeRecord(
        int $userId,
        string $scope,
        string $key,
        string $requestHash,
        int $responseStatus,
        array $responseBody,
    ): IdempotencyKey {
        return IdempotencyKey::query()->create([
            'id_pengguna' => $userId,
            'scope_operasi' => $scope,
            'idempotency_key' => $key,
            'request_hash' => $requestHash,
            'response_status' => $responseStatus,
            'response_body' => $responseBody,
        ]);
    }

    public function mismatchResponse(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error_code' => 'IDEMPOTENCY_KEY_REUSE_MISMATCH',
            'message' => 'Idempotency key sudah digunakan dengan payload yang berbeda.',
        ], 422);
    }

    public function conflictResponse(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Idempotency key sudah digunakan.',
        ], 409);
    }

    private function canonicalizeValue(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        if (array_is_list($value)) {
            return array_map(
                fn (mixed $item): mixed => $this->canonicalizeValue($item),
                $value
            );
        }

        $sorted = [];
        $keys = array_keys($value);
        sort($keys, SORT_STRING);

        foreach ($keys as $key) {
            $sorted[$key] = $this->canonicalizeValue($value[$key]);
        }

        return $sorted;
    }
}
