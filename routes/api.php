<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\HargaLayananController;
use App\Http\Controllers\Api\JamOperasionalController;
use App\Http\Controllers\Api\KategoriKendaraanController;
use App\Http\Controllers\Api\KategoriPengeluaranController;
use App\Http\Controllers\Api\LaporanController;
use App\Http\Controllers\Api\LayananController;
use App\Http\Controllers\Api\PembayaranController;
use App\Http\Controllers\Api\PengecualianJamOperasionalController;
use App\Http\Controllers\Api\PengeluaranController;
use App\Http\Controllers\Api\PenggunaController;
use App\Http\Controllers\Api\PesananController;
use App\Http\Controllers\Api\RiwayatPerubahanController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware(['auth:sanctum', 'active.user']);

Route::get('/test', function () {
    return response()->json([
        'success' => true,
        'message' => 'Backend WashNote berhasil terhubung!',
        'application' => 'WashNote API',
    ]);
});

// Login: rate-limit multi-bucket dikelola oleh AuthRateLimitService di AuthController
Route::post('/login', [AuthController::class, 'login']);

// Route yang memerlukan autentikasi dan akun aktif
Route::middleware(['auth:sanctum', 'active.user'])->group(function () {

    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/profile', [AuthController::class, 'profile']);

    Route::put('/profile/password', [AuthController::class, 'changePassword']);

    // Route operasional: Kasir & Owner
    Route::middleware('role:kasir,owner')->group(function () {
        Route::get('/operasional/test', function () {
            return response()->json([
                'success' => true,
                'message' => 'Akses operasional berhasil.',
            ]);
        });

        Route::get('/katalog', [CatalogController::class, 'index']);

        Route::get('/pesanan', [PesananController::class, 'index']);
        Route::post('/pesanan', [PesananController::class, 'store']);
        Route::get('/pesanan/{pesanan}', [PesananController::class, 'show']);
        Route::put('/pesanan/{pesanan}', [PesananController::class, 'update']);
        Route::patch('/pesanan/{pesanan}/metadata', [PesananController::class, 'updateMetadata']);
        Route::post('/pesanan/{pesanan}/batal', [PesananController::class, 'cancel']);

        Route::put('/kendaraan-pesanan/{id}/status', [
            PesananController::class,
            'updateVehicleStatus',
        ]);

        Route::get('/pesanan/{id}/pembayaran', [
            PembayaranController::class,
            'show',
        ]);

        Route::post('/pesanan/{id}/pembayaran', [
            PembayaranController::class,
            'store',
        ]);

        Route::get('/jam-operasional', [
            JamOperasionalController::class,
            'index',
        ]);

        Route::get('/jam-operasional/status', [
            JamOperasionalController::class,
            'status',
        ]);

        Route::get('/jam-operasional/pengecualian', [
            PengecualianJamOperasionalController::class,
            'index',
        ]);
    });

    // Route khusus Owner
    Route::middleware('role:owner')->group(function () {
        Route::get('/owner/test', function () {
            return response()->json([
                'success' => true,
                'message' => 'Akses khusus Owner berhasil.',
            ]);
        });

        Route::apiResource(
            'kategori-kendaraan',
            KategoriKendaraanController::class
        )->parameters([
            'kategori-kendaraan' => 'kategoriKendaraan',
        ]);

        Route::apiResource(
            'layanan',
            LayananController::class
        );

        Route::apiResource(
            'harga-layanan',
            HargaLayananController::class
        )->parameters([
            'harga-layanan' => 'hargaLayanan',
        ]);

        Route::get('/riwayat-perubahan', [
            RiwayatPerubahanController::class,
            'index',
        ]);

        Route::apiResource(
            'kategori-pengeluaran',
            KategoriPengeluaranController::class
        );

        Route::get('/pengeluaran', [
            PengeluaranController::class,
            'index',
        ]);

        Route::post('/pengeluaran', [
            PengeluaranController::class,
            'store',
        ]);

        Route::match(['put', 'patch'], '/pengeluaran/{id}', [
            PengeluaranController::class,
            'update',
        ]);

        Route::match(['post', 'patch'], '/pengeluaran/{id}/batal', [
            PengeluaranController::class,
            'cancel',
        ]);

        Route::post('/jam-operasional/pengecualian', [
            PengecualianJamOperasionalController::class,
            'store',
        ]);

        Route::match(['put', 'patch'], '/jam-operasional/pengecualian/{id}', [
            PengecualianJamOperasionalController::class,
            'update',
        ])->whereNumber('id');

        Route::delete('/jam-operasional/pengecualian/{id}', [
            PengecualianJamOperasionalController::class,
            'destroy',
        ])->whereNumber('id');

        Route::post('/jam-operasional', [
            JamOperasionalController::class,
            'store',
        ]);

        Route::match(['put', 'patch'], '/jam-operasional/{id}', [
            JamOperasionalController::class,
            'update',
        ])->whereNumber('id');

        Route::delete('/jam-operasional/{id}', [
            JamOperasionalController::class,
            'destroy',
        ])->whereNumber('id');

        Route::get('/laporan', [
            LaporanController::class,
            'index',
        ]);

        Route::get('/laporan/harian', [
            LaporanController::class,
            'daily',
        ]);

        Route::get('/kasir', [
            PenggunaController::class,
            'index',
        ]);

        Route::post('/kasir', [
            PenggunaController::class,
            'store',
        ]);

        Route::put('/kasir/{id}', [
            PenggunaController::class,
            'update',
        ])->whereNumber('id');

        Route::patch('/kasir/{id}/status', [
            PenggunaController::class,
            'updateStatus',
        ])->whereNumber('id');

        Route::put('/kasir/{id}/reset-password', [
            PenggunaController::class,
            'resetPassword',
        ])->whereNumber('id');
    });
});
