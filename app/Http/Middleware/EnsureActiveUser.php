<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $pengguna = $request->user();

        if (! $pengguna) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
            ], 401);
        }

        if (! $pengguna->status_aktif) {
            return response()->json([
                'success' => false,
                'error_code' => 'USER_INACTIVE',
                'message' => 'Akun Anda tidak aktif. Silakan hubungi Owner.',
            ], 401);
        }

        return $next($request);
    }
}
