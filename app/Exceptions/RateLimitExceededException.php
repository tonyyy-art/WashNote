<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class RateLimitExceededException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $retryAfterSeconds,
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error_code' => 'RATE_LIMIT_EXCEEDED',
            'message' => $this->getMessage(),
            'retry_after_seconds' => $this->retryAfterSeconds,
        ], 429, [
            'Retry-After' => (string) $this->retryAfterSeconds,
        ]);
    }
}
