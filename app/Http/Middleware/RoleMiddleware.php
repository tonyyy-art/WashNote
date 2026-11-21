<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RoleMiddleware
{
    public function handle(
        Request $request,
        Closure $next,
        string ...$roles
    ): Response {
        $pengguna = $request->user();

        // Pastikan pengguna sudah login
        if (!$pengguna) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
            ], 401);
        }

        // Periksa apakah role diizinkan
        if (!in_array($pengguna->peran, $roles, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki hak akses.',
            ], 403);
        }

        return $next($request);
    }
}
