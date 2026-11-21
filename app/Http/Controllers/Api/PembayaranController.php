<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pembayaran;
use App\Models\Pesanan;
use App\Services\Audit\AuditLogService;
use App\Services\Idempotency\IdempotencyService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PembayaranController extends Controller
{
    public function __construct(
        private readonly AuditLogService $auditLog,
        private readonly IdempotencyService $idempotency,
    ) {}

    /**
     * Show payment details for a given order.
     */
    public function show(int|string $id): JsonResponse
    {
        $pesanan = Pesanan::with('pembayaran')
            ->findOrFail($id);

        return response()->json([
            'message' => 'Data pembayaran berhasil diambil',
            'data' => $pesanan->pembayaran,
        ]);
    }

    /**
     * Record full payment for an order under a row lock, storing invoice revenue and cash change separately.
     */
    public function store(Request $request, int|string $id): JsonResponse
    {
        $key = $this->idempotency->extractKey($request);

        $validated = $request->validate([
            'jumlah_dibayar' => ['required', 'numeric', 'min:0.01'],
            'metode_pembayaran' => ['required', 'in:tunai,qris,transfer'],
        ]);

        $callerId = (int) $request->user()->id_pengguna;
        $requestHash = $this->idempotency->hashPayload([
            'id_pesanan' => (string) $id,
            'jumlah_dibayar' => round((float) $validated['jumlah_dibayar'], 2),
            'metode_pembayaran' => (string) $validated['metode_pembayaran'],
        ]);

        if ($key !== null) {
            $existingKey = $this->idempotency->findForUser(
                $callerId,
                IdempotencyService::SCOPE_PAY_ORDER,
                $key,
            );

            if ($existingKey !== null) {
                if ($existingKey->request_hash !== $requestHash) {
                    return $this->idempotency->mismatchResponse();
                }

                return response()->json($existingKey->response_body, $existingKey->response_status);
            }
        }

        try {
            $outcome = DB::transaction(function () use ($request, $id, $validated, $key, $callerId, $requestHash): array {
                /** @var Pesanan $pesanan */
                $pesanan = Pesanan::query()
                    ->where('id_pesanan', $id)
                    ->lockForUpdate()
                    ->firstOrFail();

                if ($pesanan->status_pesanan === Pesanan::STATUS_DIBATALKAN) {
                    return [
                        'error' => true,
                        'status' => 422,
                        'payload' => [
                            'message' => 'Pesanan yang dibatalkan tidak dapat dibayar.',
                        ],
                    ];
                }

                /** @var Pembayaran $pembayaran */
                $pembayaran = Pembayaran::query()
                    ->where('id_pesanan', $pesanan->id_pesanan)
                    ->lockForUpdate()
                    ->firstOrFail();

                if ($pembayaran->status_pembayaran === 'sudah_dibayar') {
                    return [
                        'error' => true,
                        'status' => 422,
                        'payload' => [
                            'message' => 'Pesanan sudah dibayar.',
                        ],
                    ];
                }

                $pesanan->load('kendaraan.detailLayanan');

                $total = round((float) $pesanan->kendaraan
                    ->flatMap->detailLayanan
                    ->sum('harga_akhir'), 2);

                $uangDiterima = round((float) $validated['jumlah_dibayar'], 2);

                if ($uangDiterima < $total) {
                    return [
                        'error' => true,
                        'status' => 422,
                        'payload' => [
                            'message' => 'Nominal pembayaran kurang dari total pesanan.',
                            'total_pesanan' => $total,
                        ],
                    ];
                }

                if ($validated['metode_pembayaran'] !== 'tunai' && $uangDiterima > $total) {
                    return [
                        'error' => true,
                        'status' => 422,
                        'payload' => [
                            'message' => 'Pembayaran non-tunai harus sesuai dengan total pesanan.',
                            'total_pesanan' => $total,
                        ],
                    ];
                }

                $kembalian = round($uangDiterima - $total, 2);

                $sebelum = [
                    'status_pembayaran' => $pembayaran->status_pembayaran,
                    'jumlah_dibayar' => $pembayaran->jumlah_dibayar,
                    'uang_diterima' => $pembayaran->uang_diterima,
                    'kembalian' => $pembayaran->kembalian,
                ];

                $pembayaran->update([
                    'jumlah_dibayar' => $total,
                    'uang_diterima' => $uangDiterima,
                    'kembalian' => $kembalian,
                    'metode_pembayaran' => $validated['metode_pembayaran'],
                    'status_pembayaran' => 'sudah_dibayar',
                    'waktu_penerimaan' => now(),
                ]);

                $fresh = $pembayaran->fresh();

                $this->auditLog->record(
                    actorUserId: $request->user()->id_pengguna,
                    entity: 'pembayaran',
                    recordId: $fresh->id_pembayaran,
                    before: $sebelum,
                    after: [
                        'jumlah_dibayar' => $fresh->jumlah_dibayar,
                        'uang_diterima' => $fresh->uang_diterima,
                        'kembalian' => $fresh->kembalian,
                        'metode_pembayaran' => $fresh->metode_pembayaran,
                        'status_pembayaran' => $fresh->status_pembayaran,
                        'waktu_penerimaan' => $fresh->waktu_penerimaan,
                    ],
                    reason: 'Pencatatan pembayaran pesanan',
                );

                $responsePayload = [
                    'message' => 'Pembayaran berhasil dicatat.',
                    'data' => $fresh->toArray(),
                    'total_pesanan' => $total,
                    'uang_diterima' => $uangDiterima,
                    'kembalian' => $kembalian,
                ];

                if ($key !== null) {
                    $this->idempotency->storeRecord(
                        userId: $callerId,
                        scope: IdempotencyService::SCOPE_PAY_ORDER,
                        key: $key,
                        requestHash: $requestHash,
                        responseStatus: 200,
                        responseBody: $responsePayload,
                    );
                }

                return [
                    'error' => false,
                    'payload' => $responsePayload,
                ];
            });
        } catch (UniqueConstraintViolationException $e) {
            if ($key !== null) {
                $existingKey = $this->idempotency->findForUser(
                    $callerId,
                    IdempotencyService::SCOPE_PAY_ORDER,
                    $key,
                );

                if ($existingKey !== null) {
                    if ($existingKey->request_hash !== $requestHash) {
                        return $this->idempotency->mismatchResponse();
                    }

                    return response()->json($existingKey->response_body, $existingKey->response_status);
                }
            }

            throw $e;
        }

        if ($outcome['error']) {
            return response()->json($outcome['payload'], $outcome['status']);
        }

        return response()->json($outcome['payload'], 200);
    }
}
