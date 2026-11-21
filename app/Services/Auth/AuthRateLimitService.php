<?php

namespace App\Services\Auth;

use App\Exceptions\RateLimitExceededException;
use Illuminate\Cache\RateLimiter;

class AuthRateLimitService
{
    public function __construct(
        private readonly RateLimiter $limiter,
    ) {}

    /**
     * Enforce both the secondary IP burst limit and primary failed-login limit.
     *
     * @throws RateLimitExceededException
     */
    public function ensureLoginNotRateLimited(string $username, string $clientIp): void
    {
        $ipBurstKey = $this->loginIpBurstKey($clientIp);
        $loginFailKey = $this->loginFailureKey($username, $clientIp);

        $ipBurstMax = max(1, (int) config('washnote.login_ip_burst_max_attempts', 20));
        $loginFailMax = max(1, (int) config('washnote.login_max_attempts', 5));

        $waitSeconds = [];

        if ($this->limiter->tooManyAttempts($ipBurstKey, $ipBurstMax)) {
            $waitSeconds[] = max(1, $this->limiter->availableIn($ipBurstKey));
        }

        if ($this->limiter->tooManyAttempts($loginFailKey, $loginFailMax)) {
            $waitSeconds[] = max(1, $this->limiter->availableIn($loginFailKey));
        }

        if ($waitSeconds !== []) {
            throw new RateLimitExceededException(
                message: 'Terlalu banyak percobaan login. Silakan coba lagi nanti.',
                retryAfterSeconds: max($waitSeconds),
            );
        }
    }

    /**
     * Record every POST /login attempt against the secondary IP burst counter (not reset on success).
     */
    public function recordLoginRequestForIpBurst(string $clientIp): void
    {
        $decaySeconds = max(60, (int) config('washnote.login_ip_burst_decay_minutes', 15) * 60);

        $this->limiter->hit($this->loginIpBurstKey($clientIp), $decaySeconds);
    }

    /**
     * Record a failed login attempt against the account+IP counter.
     */
    public function recordLoginFailure(string $username, string $clientIp): void
    {
        $decaySeconds = max(60, (int) config('washnote.login_decay_minutes', 15) * 60);

        $this->limiter->hit($this->loginFailureKey($username, $clientIp), $decaySeconds);
    }

    /**
     * Clear the account+IP failed-login counter after an active user logs in successfully.
     */
    public function clearLoginFailures(string $username, string $clientIp): void
    {
        $this->limiter->clear($this->loginFailureKey($username, $clientIp));
    }

    public function loginIpBurstKey(string $clientIp): string
    {
        return 'washnote:rl:login:ip:'.hash('sha256', $this->normalizeIp($clientIp));
    }

    public function loginFailureKey(string $username, string $clientIp): string
    {
        return 'washnote:rl:login:fail:'.hash('sha256', $this->normalizeUsername($username).'|'.$this->normalizeIp($clientIp));
    }

    private function normalizeUsername(string $username): string
    {
        return mb_strtolower(trim($username));
    }

    private function normalizeIp(string $clientIp): string
    {
        $trimmed = trim($clientIp);

        return $trimmed !== '' ? $trimmed : 'unknown';
    }
}
