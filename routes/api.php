<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\HargaLayananController;
use App\Http\Controllers\Api\KategoriKendaraanController;
use App\Http\Controllers\Api\LayananController;
use App\Http\Controllers\Api\PesananController;
use App\Http\Controllers\Api\RiwayatPerubahanController;
use App\Http\Controllers\Api\PembayaranController;
use App\Http\Controllers\Api\KategoriPengeluaranController;
use App\Http\Controllers\Api\PengeluaranController;
use App\Http\Controllers\Api\JamOperasionalController;
use App\Http\Controllers\Api\LaporanController;
use App\Http\Controllers\Api\PenggunaController;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::get('/test', function () {
    return response()->json([
        'success' => true,
        'message' => 'Backend WashNote berhasil terhubung!',
        'application' => 'WashNote API',
    ]);
});

// Login: tidak memerlukan token
Route::post('/login', [AuthController::class, 'login'])
    ->middleware('throttle:5,1');

// Route yang memerlukan autentikasi
Route::middleware('auth:sanctum')->group(function () {

    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/profile', [AuthController::class, 'profile']);

    Route::middleware('role:kasir,owner')->group(function () {
        Route::get('/operasional/test', function () {
            return response()->json([
                'success' => true,
                'message' => 'Akses operasional berhasil.',
            ]);
        });
    });

    // Hanya Owner
    Route::middleware('role:owner')->group(function () {
        Route::get('/owner/test', function () {
            return response()->json([
                'success' => true,
                'message' => 'Akses khusus Owner berhasil.',
            ]);
        });
    });

    Route::middleware(['auth:sanctum', 'role:owner'])->group(function () {

        Route::apiResource(
            'kategori-kendaraan',
            KategoriKendaraanController::class
        )->parameters([
            'kategori-kendaraan' => 'kategoriKendaraan'
        ]);

        Route::apiResource(
            'layanan',
            LayananController::class
        );

        Route::apiResource(
            'harga-layanan',
            HargaLayananController::class
        )->parameters([
            'harga-layanan' => 'hargaLayanan'
        ]);
    });

    Route::middleware([
        'auth:sanctum',
        'role:kasir,owner'
    ])->group(function () {

        Route::get('/pesanan', [PesananController::class, 'index']);

        Route::post('/pesanan', [PesananController::class, 'store']);

        Route::get('/pesanan/{pesanan}', [PesananController::class, 'show']);
    });

    Route::get('/riwayat-perubahan', [
        RiwayatPerubahanController::class,
        'index'
    ]);

    Route::post('/pesanan/{pesanan}/batal', [
        PesananController::class,
        'cancel'
    ]);

    // Edit status pesanan
    Route::put('/pesanan/{pesanan}', [
        PesananController::class,
        'update'
    ]);

    // Update status proses kendaraan
    Route::put('/kendaraan-pesanan/{id}/status', [
        PesananController::class,
        'updateVehicleStatus'
    ]);

    // Melihat pembayaran
    Route::get('/pesanan/{id}/pembayaran', [
        PembayaranController::class,
        'show'
    ]);

    // Mencatat pembayaran
    Route::post('/pesanan/{id}/pembayaran', [
        PembayaranController::class,
        'store'
    ]);

    // Kategori pengeluaran
    Route::apiResource(
        'kategori-pengeluaran',
        KategoriPengeluaranController::class
    );

    // Pengeluaran
    Route::get('/pengeluaran', [
        PengeluaranController::class,
        'index'
    ]);

    Route::post('/pengeluaran', [
        PengeluaranController::class,
        'store'
    ]);

    Route::put('/pengeluaran/{id}', [
        PengeluaranController::class,
        'update'
    ]);

    Route::post('/pengeluaran/{id}/batal', [
        PengeluaranController::class,
        'cancel'
    ]);

    Route::middleware(['auth:sanctum', 'role:owner'])->group(function () {

        Route::post('/jam-operasional', [
            JamOperasionalController::class,
            'store'
        ]);

        Route::put('/jam-operasional/{id}', [
            JamOperasionalController::class,
            'update'
        ]);

        Route::delete('/jam-operasional/{id}', [
            JamOperasionalController::class,
            'destroy'
        ]);
    });

    Route::middleware([
        'auth:sanctum',
        'role:kasir,owner'
    ])->group(function () {

        Route::get('/jam-operasional', [
            JamOperasionalController::class,
            'index'
        ]);
    });

    // Laporan keuangan
    Route::get('/laporan', [
        LaporanController::class,
        'index'
    ]);

    // Laporan harian
    Route::get('/laporan/harian', [
        LaporanController::class,
        'daily'
    ]);

    Route::get('/kasir', [
        PenggunaController::class,
        'index'
    ]);

    Route::post('/kasir', [
        PenggunaController::class,
        'store'
    ]);

    Route::put('/kasir/{id}', [
        PenggunaController::class,
        'update'
    ]);

    Route::patch('/kasir/{id}/status', [
        PenggunaController::class,
        'updateStatus'
    ]);

    Route::put('/kasir/{id}/reset-password', [
        PenggunaController::class,
        'resetPassword'
    ]);
});
