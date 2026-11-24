import { generateIdempotencyKey, washnoteApi } from '../api/client.js';
import { createViewMotion, scrollToElement } from '../motion/motionSystem.js';
import { APP_VIEWS, navigateBack, showToast, state } from '../state/store.js';
import {
    badgeKendaraan,
    badgeOperasional,
    badgePembayaran,
    badgePesanan,
    escapeHtml,
    formatDateTimeWib,
    formatRupiah,
    iconSvg,
    renderBackButton,
    renderErrorAlert,
} from '../utils/formatters.js';
import {
    ensureLineUid,
    parseOrderValidationError,
    renderOrderErrorSummary,
    renderVehicleServiceCard,
} from '../utils/orderFormHelpers.js';

export function mountOrderDetailView(container, orderId) {
    const motion = createViewMotion(container);
    let isLoading = true;
    let isSubmitting = false;
    let errorObj = null;
    let order = null;
    let totals = { subtotal_utama: 0, subtotal_tambahan: 0, total_harga: 0 };
    let catalog = { kategori_kendaraan: [], layanan: [], harga_layanan: [] };
    let activeTab = state.selectedOrderInitialTab || 'detail';
    let paymentIdempotencyKey = generateIdempotencyKey();

    // Edit state copies initialized when loading order
    let editCatatan = '';
    let editAlasan = '';
    let editVehicles = [];
    const expandedEditLines = new Set();
    let cancelReason = '';

    async function loadOrder() {
        isLoading = true;
        errorObj = null;
        render();

        try {
            const [orderRes, catRes] = await Promise.all([washnoteApi.getOrder(orderId), washnoteApi.getCatalog()]);
            order = orderRes?.data?.pesanan || null;
            totals = {
                subtotal_utama: orderRes?.data?.subtotal_utama ?? 0,
                subtotal_tambahan: orderRes?.data?.subtotal_tambahan ?? 0,
                total_harga: orderRes?.data?.total_harga ?? 0,
            };
            catalog = catRes?.data || { kategori_kendaraan: [], layanan: [], harga_layanan: [] };
            hydrateEditModels();
        } catch (err) {
            errorObj = err;
        } finally {
            isLoading = false;
            render();
            motion.runIntro();
        }
    }

    function hydrateEditModels() {
        if (!order) {
            return;
        }

        expandedEditLines.clear();
        editCatatan = order.catatan || '';

        editVehicles = (order.kendaraan || []).map((v) => ({
            id_kendaraan_pesanan: Number(v.id_kendaraan_pesanan),
            id_kategori_kendaraan: Number(v.id_kategori_kendaraan),
            plat_nomor: v.plat_nomor || '',
            layanan: (v.detail_layanan || []).map((d) => {
                const line = {
                    id_harga: Number(d.id_harga),
                    harga_akhir: Number(d.harga_akhir),
                    alasan_penyesuaian: d.alasan_penyesuaian || '',
                };
                ensureLineUid(line);
                return line;
            }),
        }));
    }

    function collectOrderSnapshotTariffs() {
        const extra = [];
        for (const veh of order?.kendaraan || []) {
            for (const det of veh.detail_layanan || []) {
                if (det.harga_layanan) {
                    extra.push(det.harga_layanan);
                }
            }
        }
        return extra;
    }

    function tariffsForCategory(kategoriId) {
        return (catalog.harga_layanan || []).filter((h) => Number(h.id_kategori_kendaraan) === Number(kategoriId));
    }

    function tariffOptionsForVehicle(kategoriId, currentIdHargaList = []) {
        const list = [...tariffsForCategory(kategoriId)];

        for (const veh of order?.kendaraan || []) {
            for (const det of veh.detail_layanan || []) {
                if (
                    currentIdHargaList.includes(Number(det.id_harga)) &&
                    !list.some((t) => Number(t.id_harga) === Number(det.id_harga)) &&
                    det.harga_layanan
                ) {
                    list.push(det.harga_layanan);
                }
            }
        }

        return list;
    }

    async function handleVehicleStatusChange(vehicleId, nextStatus) {
        if (isSubmitting || !order) {
            return;
        }

        isSubmitting = true;
        errorObj = null;
        render();

        try {
            const res = await washnoteApi.updateVehicleStatus(vehicleId, {
                status_proses: nextStatus,
                expected_version: order.version,
            });
            showToast(res?.message || 'Status kendaraan diperbarui.', 'success');
            await loadOrder();
        } catch (err) {
            if (err.status === 409 && err.errorCode === 'VERSION_CONFLICT') {
                showToast('Pesanan baru saja diubah oleh pengguna lain. Data dimuat ulang.', 'info');
                await loadOrder();
                return;
            }
            errorObj = err;
        } finally {
            isSubmitting = false;
            render();
        }
    }

    async function handleOrderEditSubmit() {
        if (isSubmitting || !order) {
            return;
        }

        syncEditDom();
        isSubmitting = true;
        errorObj = null;
        render();

        try {
            const payload = {
                expected_version: order.version,
                alasan: editAlasan.trim(),
                catatan: editCatatan.trim() !== '' ? editCatatan.trim() : null,
                kendaraan: editVehicles.map((veh) => {
                    const entry = {
                        id_kategori_kendaraan: Number(veh.id_kategori_kendaraan),
                        plat_nomor: veh.plat_nomor.trim() !== '' ? veh.plat_nomor.trim() : null,
                        layanan: veh.layanan.map((line) => {
                            const lineObj = {
                                id_harga: Number(line.id_harga),
                                harga_akhir: Number(line.harga_akhir),
                            };
                            if (line.alasan_penyesuaian && line.alasan_penyesuaian.trim() !== '') {
                                lineObj.alasan_penyesuaian = line.alasan_penyesuaian.trim();
                            }
                            return lineObj;
                        }),
                    };

                    if (veh.id_kendaraan_pesanan) {
                        entry.id_kendaraan_pesanan = Number(veh.id_kendaraan_pesanan);
                    }

                    return entry;
                }),
            };

            const res = await washnoteApi.updateOrder(order.id_pesanan, payload);
            editAlasan = '';
            showToast(res?.message || 'Pesanan berhasil diperbarui.', 'success');
            activeTab = 'detail';
            await loadOrder();
        } catch (err) {
            if (err.status === 409 && err.errorCode === 'VERSION_CONFLICT') {
                showToast('Pesanan berubah karena pembaruan lain. Data terbaru dimuat ulang.', 'info');
                await loadOrder();
                return;
            }
            errorObj = err;
        } finally {
            isSubmitting = false;
            render();
            if (errorObj && container.querySelector('[data-inline-error="true"]')) {
                scrollToElement('[data-inline-error="true"]');
            }
        }
    }

    async function handlePaymentSubmit() {
        if (isSubmitting || !order) {
            return;
        }

        const method = container.querySelector('#pay-method')?.value || 'tunai';
        const amount = Number(container.querySelector('#pay-amount')?.value || 0);

        isSubmitting = true;
        errorObj = null;
        render();

        try {
            const res = await washnoteApi.storePayment(
                order.id_pesanan,
                {
                    metode_pembayaran: method,
                    jumlah_dibayar: amount,
                },
                paymentIdempotencyKey
            );
            paymentIdempotencyKey = generateIdempotencyKey();
            showToast(
                `${res?.message || 'Pembayaran tercatat.'} Kembalian: ${formatRupiah(res?.kembalian ?? 0)}`,
                'success'
            );
            await loadOrder();
        } catch (err) {
            errorObj = err;
        } finally {
            isSubmitting = false;
            render();
        }
    }

    async function handleCancelSubmit() {
        if (isSubmitting || !order) {
            return;
        }

        const input = container.querySelector('#cancel-reason');
        if (input) {
            cancelReason = input.value;
        }

        isSubmitting = true;
        errorObj = null;
        render();

        try {
            const res = await washnoteApi.cancelOrder(order.id_pesanan, {
                alasan_pembatalan: cancelReason.trim(),
                expected_version: order.version,
            });
            cancelReason = '';
            showToast(res?.message || 'Pesanan dibatalkan.', 'success');
            activeTab = 'detail';
            await loadOrder();
        } catch (err) {
            if (err.status === 409 && err.errorCode === 'VERSION_CONFLICT') {
                showToast('Pesanan baru diperbarui pengguna lain. Data dimuat ulang.', 'info');
                await loadOrder();
                return;
            }
            errorObj = err;
        } finally {
            isSubmitting = false;
            render();
        }
    }

    function syncEditDom() {
        const catInput = container.querySelector('#edit-order-catatan');
        const reasonInput = container.querySelector('#edit-order-alasan');
        if (catInput) {
            editCatatan = catInput.value;
        }
        if (reasonInput) {
            editAlasan = reasonInput.value;
        }

        editVehicles.forEach((veh, vIdx) => {
            const platEl = container.querySelector(`[data-edit-plat="${vIdx}"]`);
            if (platEl) {
                veh.plat_nomor = platEl.value;
            }
            veh.layanan.forEach((line, lIdx) => {
                const priceEl = container.querySelector(`[data-edit-price="${vIdx}-${lIdx}"]`);
                const reasonEl = container.querySelector(`[data-edit-reason="${vIdx}-${lIdx}"]`);
                if (priceEl) {
                    line.harga_akhir = priceEl.value;
                }
                if (reasonEl) {
                    line.alasan_penyesuaian = reasonEl.value;
                }
            });
        });
    }

    function render() {
        if (isLoading && !order) {
            container.innerHTML = `
                <div data-motion-state class="flex items-center justify-center gap-2 rounded-2xl border border-border-subtle bg-surface p-12 text-sm text-ink-muted">
                    <span class="h-5 w-5 animate-spin rounded-full border-2 border-brand-navy border-t-transparent"></span>
                    Memuat detail pesanan...
                </div>
            `;
            return;
        }

        if (!order) {
            container.innerHTML = `
                <div class="space-y-4">
                    <div>${renderBackButton({ id: 'detail-back-orders' })}</div>
                    ${errorObj ? renderErrorAlert(errorObj) : '<div class="wn-card p-6 text-sm text-ink-muted">Pesanan tidak ditemukan.</div>'}
                </div>
            `;
            container.querySelector('#detail-back-orders')?.addEventListener('click', () => navigateBack(APP_VIEWS.ORDERS));
            return;
        }

        const isCancelled = order.status_pesanan === 'dibatalkan';
        const isPaid = order.pembayaran?.status_pembayaran === 'sudah_dibayar';
        const parsedOrderErr = activeTab === 'edit' ? parseOrderValidationError(errorObj, editVehicles, catalog, collectOrderSnapshotTariffs()) : null;

        container.innerHTML = `
            <div class="space-y-6">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                        <div class="mb-2">${renderBackButton({ id: 'detail-back-orders' })}</div>
                        <div class="flex flex-wrap items-center gap-2.5">
                            <h1 class="font-mono text-2xl font-bold text-ink">${escapeHtml(order.nomor_nota || `#${order.id_pesanan}`)}</h1>
                            ${badgePesanan(order.status_pesanan)}
                            ${badgePembayaran(order.pembayaran?.status_pembayaran || 'belum_dibayar')}
                            ${order.status_jam_operasional && order.status_jam_operasional !== 'dalam_jam' ? badgeOperasional(order.status_jam_operasional) : ''}
                        </div>
                        <p class="mt-1 text-xs text-ink-muted">
                            ${escapeHtml(formatDateTimeWib(order.waktu_pesanan))} • Kasir: ${escapeHtml(order.pengguna?.nama_lengkap || '-')}
                        </p>
                    </div>
                    <div data-motion-card class="wn-card px-4 py-3 text-left sm:text-right">
                        <p class="text-xs text-ink-muted">Total Tagihan</p>
                        <p class="text-xl font-bold text-brand-navy tabular-nums">${escapeHtml(formatRupiah(totals.total_harga))}</p>
                        <p class="text-[11px] text-ink-muted">Utama ${escapeHtml(formatRupiah(totals.subtotal_utama))} • Tambahan ${escapeHtml(formatRupiah(totals.subtotal_tambahan))}</p>
                    </div>
                </div>

                ${errorObj ? (parsedOrderErr ? renderOrderErrorSummary(parsedOrderErr) : renderErrorAlert(errorObj)) : ''}

                <div class="flex flex-wrap gap-2 border-b border-border-subtle pb-2">
                    ${[
                        ['detail', 'Status & Rincian'],
                        ['edit', 'Edit Pesanan'],
                        ['payment', 'Pembayaran'],
                        ['cancel', 'Batalkan Pesanan'],
                    ].map(([tabId, label]) => `
                        <button
                            type="button"
                            data-detail-tab="${tabId}"
                            class="min-h-[38px] rounded-xl px-3.5 py-2 text-xs font-semibold transition active:scale-[0.985] ${
                                activeTab === tabId ? 'bg-brand-navy text-white shadow-xs' : 'bg-surface text-ink-muted ring-1 ring-border-subtle hover:bg-app-bg hover:text-ink'
                            }"
                        >
                            ${escapeHtml(label)}
                        </button>
                    `).join('')}
                </div>

                <div data-motion-tabpanel>
                    ${activeTab === 'detail' ? renderDetailTab(isCancelled) : ''}
                    ${activeTab === 'edit' ? renderEditTab(isCancelled, isPaid, parsedOrderErr) : ''}
                    ${activeTab === 'payment' ? renderPaymentTab(isCancelled, isPaid) : ''}
                    ${activeTab === 'cancel' ? renderCancelTab(isCancelled) : ''}
                </div>
            </div>
        `;

        bindDetailEvents(isPaid);
        motion.refresh();
    }

    function renderDetailTab(isCancelled) {
        return `
            <div class="space-y-4">
                ${order.catatan ? `
                    <div class="wn-card p-4 shadow-xs">
                        <p class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Catatan Pesanan</p>
                        <p class="mt-1 text-sm text-ink">${escapeHtml(order.catatan)}</p>
                    </div>
                ` : ''}

                ${isCancelled && order.alasan_pembatalan ? `
                    <div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                        <p class="font-semibold">Pesanan Dibatalkan</p>
                        <p class="mt-1 text-xs">Alasan: ${escapeHtml(order.alasan_pembatalan)}</p>
                    </div>
                ` : ''}

                <p class="text-xs text-ink-muted">Status pesanan mengikuti status cucian setiap kendaraan di bawah ini.</p>

                <div class="grid gap-4 lg:grid-cols-2">
                    ${(order.kendaraan || []).map((veh, idx) => `
                        <div class="wn-card p-4 shadow-xs sm:p-5">
                            <div class="flex items-start justify-between gap-2 border-b border-border-subtle pb-3">
                                <div>
                                    <h3 class="text-sm font-bold text-ink">
                                        Kendaraan #${idx + 1}: ${escapeHtml(veh.nama_kategori_snapshot)}
                                    </h3>
                                    <p class="mt-0.5 font-mono text-xs text-ink-muted">
                                        Plat Nomor: ${veh.plat_nomor ? escapeHtml(veh.plat_nomor) : '<span class="italic text-ink-muted/75">Tidak dicantumkan</span>'}
                                    </p>
                                </div>
                                ${badgeKendaraan(veh.status_proses)}
                            </div>

                            <ul class="mt-3 space-y-2">
                                ${(veh.detail_layanan || []).map((det) => `
                                    <li class="flex items-start justify-between gap-2 rounded-xl border border-border-subtle/60 bg-app-bg px-3 py-2 text-xs">
                                        <div>
                                            <span class="font-semibold text-ink">${escapeHtml(det.nama_layanan_snapshot || det.harga_layanan?.layanan?.nama_layanan || 'Layanan')}</span>
                                            <span class="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink">${escapeHtml(det.tipe_layanan_snapshot || det.harga_layanan?.layanan?.tipe_layanan || 'utama')}</span>
                                            ${det.alasan_penyesuaian ? `<p class="mt-0.5 text-[11px] text-warning">Penyesuaian: ${escapeHtml(det.alasan_penyesuaian)}</p>` : ''}
                                        </div>
                                        <div class="text-right tabular-nums">
                                            <p class="font-bold text-ink">${escapeHtml(formatRupiah(det.harga_akhir))}</p>
                                            ${Number(det.harga_akhir) !== Number(det.harga_dasar_snapshot) ? `<p class="text-[10px] text-ink-muted line-through">${escapeHtml(formatRupiah(det.harga_dasar_snapshot))}</p>` : ''}
                                        </div>
                                    </li>
                                `).join('')}
                            </ul>

                            ${!isCancelled ? `
                                <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                                    <span class="mr-1 text-xs font-medium text-ink-muted">Ubah Proses:</span>
                                    ${['menunggu', 'proses', 'selesai'].map((st) => {
                                        const active = veh.status_proses === st;
                                        const labelMap = { menunggu: 'Menunggu', proses: 'Proses', selesai: 'Selesai' };
                                        return `
                                            <button
                                                type="button"
                                                data-detail-veh-status="${veh.id_kendaraan_pesanan}"
                                                data-next-status="${st}"
                                                ${active || isSubmitting ? 'disabled' : ''}
                                                class="min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97] ${
                                                    active
                                                        ? st === 'proses'
                                                            ? 'bg-process text-white'
                                                            : st === 'selesai'
                                                              ? 'bg-success text-white'
                                                              : 'bg-brand-navy text-white'
                                                        : 'border border-border-subtle bg-surface text-ink hover:bg-app-bg disabled:opacity-50'
                                                }"
                                            >
                                                ${labelMap[st]}
                                            </button>
                                        `;
                                    }).join('')}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderEditTab(isCancelled, isPaid, parsedError = null) {
        if (isCancelled) {
            return '<div class="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">Pesanan yang telah dibatalkan tidak dapat diedit.</div>';
        }

        return `
            <form id="order-edit-form" novalidate class="space-y-4">
                ${isPaid ? `
                    <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                        <p class="font-bold">Pesanan Sudah Dibayar — Edit Penuh Diizinkan</p>
                        <p class="mt-1">Perubahan kendaraan, layanan, harga akhir, plat nomor, atau catatan wajib disertai alasan audit.</p>
                    </div>
                ` : ''}

                <div class="space-y-4">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <h3 class="text-base font-bold text-ink">Kendaraan, Layanan & Harga</h3>
                        <button type="button" id="edit-add-veh-btn" class="inline-flex min-h-[38px] items-center rounded-xl border border-accent-border bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent transition active:scale-[0.98] hover:bg-teal-100/70">+ Tambah Kendaraan</button>
                    </div>

                    ${editVehicles.map((veh, vIdx) => {
                        const existingIds = veh.layanan.map((l) => Number(l.id_harga));
                        return renderVehicleServiceCard({
                            veh,
                            vIdx,
                            totalVehicles: editVehicles.length,
                            categories: catalog.kategori_kendaraan,
                            availableTariffs: tariffOptionsForVehicle(veh.id_kategori_kendaraan, existingIds),
                            expandedLines: expandedEditLines,
                            parsedError,
                            prefix: 'edit',
                            compactCard: true,
                        });
                    }).join('')}

                    <div class="wn-card space-y-3.5 p-4 sm:p-5">
                        <div>
                            <label for="edit-order-catatan" class="wn-label">Catatan Pesanan</label>
                            <textarea id="edit-order-catatan" rows="2" class="wn-textarea ${parsedError?.topErrors?.catatan ? 'wn-textarea-error' : ''}">${escapeHtml(editCatatan)}</textarea>
                            ${parsedError?.topErrors?.catatan ? `<p class="wn-error-inline" data-inline-error="true">${iconSvg('alertCircle', 'mt-0.5 h-3.5 w-3.5')}<span>${escapeHtml(parsedError.topErrors.catatan)}</span></p>` : ''}
                        </div>
                        <div>
                            <label for="edit-order-alasan" class="wn-label">Alasan Edit Pesanan <span class="text-danger">*</span> <span class="font-normal text-ink-muted">(Min. 5 karakter)</span></label>
                            <input id="edit-order-alasan" type="text" required minlength="5" value="${escapeHtml(editAlasan)}" placeholder="Contoh: Tambah layanan semir ban atau koreksi harga" class="wn-input ${parsedError?.topErrors?.alasan ? 'wn-input-error' : ''}" />
                            ${parsedError?.topErrors?.alasan ? `<p class="wn-error-inline" data-inline-error="true">${iconSvg('alertCircle', 'mt-0.5 h-3.5 w-3.5')}<span>${escapeHtml(parsedError.topErrors.alasan)}</span></p>` : ''}
                        </div>
                        <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary w-full py-2.5 sm:w-auto">
                            ${isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan Pesanan'}
                        </button>
                    </div>
                </div>
            </form>
        `;
    }

    function renderPaymentTab(isCancelled, isPaid) {
        if (isCancelled) {
            return '<div class="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">Pesanan yang telah dibatalkan tidak dapat menerima pembayaran.</div>';
        }

        if (isPaid) {
            const p = order.pembayaran;
            return `
                <div class="rounded-2xl border border-green-200 bg-surface p-6 shadow-xs">
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
                        <h3 class="text-base font-bold text-ink">Bukti Pembayaran Lunas</h3>
                        ${badgePembayaran(p.status_pembayaran)}
                    </div>
                    <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <div><dt class="text-xs text-ink-muted">Metode Pembayaran</dt><dd class="font-semibold uppercase text-ink">${escapeHtml(p.metode_pembayaran)}</dd></div>
                        <div><dt class="text-xs text-ink-muted">Waktu Penerimaan</dt><dd class="font-semibold text-ink">${escapeHtml(formatDateTimeWib(p.waktu_penerimaan))}</dd></div>
                        <div><dt class="text-xs text-ink-muted">Pendapatan Tagihan (Omzet)</dt><dd class="font-bold text-success tabular-nums">${escapeHtml(formatRupiah(p.jumlah_dibayar))}</dd></div>
                        <div><dt class="text-xs text-ink-muted">Uang Diterima</dt><dd class="font-semibold text-ink tabular-nums">${escapeHtml(formatRupiah(p.uang_diterima ?? p.jumlah_dibayar))}</dd></div>
                        <div><dt class="text-xs text-ink-muted">Kembalian</dt><dd class="font-semibold text-ink tabular-nums">${escapeHtml(formatRupiah(p.kembalian ?? 0))}</dd></div>
                    </dl>
                </div>
            `;
        }

        return `
            <form id="payment-form" class="wn-card max-w-lg space-y-4 p-5 shadow-xs sm:p-6">
                <div>
                    <h3 class="text-base font-bold text-ink">Catat Pembayaran Penuh</h3>
                    <p class="mt-1 text-xs text-ink-muted">Total tagihan wajib dilunasi sekaligus sebesar <strong class="text-ink">${escapeHtml(formatRupiah(totals.total_harga))}</strong>. Pembayaran non-tunai (QRIS/Transfer) harus tepat sebesar total tagihan.</p>
                </div>

                <div>
                    <label for="pay-method" class="wn-label">Metode Pembayaran</label>
                    <select id="pay-method" class="wn-select">
                        <option value="tunai">Tunai (Cash)</option>
                        <option value="qris">QRIS</option>
                        <option value="transfer">Transfer Bank</option>
                    </select>
                </div>

                <div>
                    <label for="pay-amount" class="wn-label">Nominal Diterima (Rp)</label>
                    <input id="pay-amount" type="number" min="1" step="1" required value="${Number(totals.total_harga)}" class="wn-input font-semibold tabular-nums" />
                    <p id="pay-change-preview" class="mt-1.5 text-xs font-medium text-accent">Kembalian: Rp 0</p>
                </div>

                <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary w-full py-2.5">
                    ${isSubmitting ? 'Memproses Pembayaran...' : 'Konfirmasi Pembayaran Penuh'}
                </button>
            </form>
        `;
    }

    function renderCancelTab(isCancelled) {
        if (isCancelled) {
            return '<div class="wn-card p-5 text-sm text-ink-muted">Pesanan ini sudah berstatus dibatalkan.</div>';
        }

        return `
            <form id="cancel-order-form" class="max-w-lg space-y-4 rounded-2xl border border-red-200 bg-surface p-5 shadow-xs sm:p-6">
                <div>
                    <h3 class="text-base font-bold text-danger">Batalkan Pesanan (Soft Void)</h3>
                    <p class="mt-1 text-xs text-ink-muted">Pesanan tidak dihapus permanen, melainkan ditandai sebagai <strong>Dibatalkan</strong> beserta catatan audit wajib.</p>
                </div>
                <div>
                    <label for="cancel-reason" class="wn-label">Alasan Pembatalan (Wajib, min. 5 karakter)</label>
                    <textarea id="cancel-reason" rows="3" required minlength="5" placeholder="Jelaskan alasan pembatalan pesanan..." class="wn-textarea">${escapeHtml(cancelReason)}</textarea>
                </div>
                <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-danger w-full sm:w-auto">
                    ${isSubmitting ? 'Membatalkan...' : 'Batalkan Pesanan'}
                </button>
            </form>
        `;
    }

    function bindDetailEvents(isPaid) {
        container.querySelector('#detail-back-orders')?.addEventListener('click', () => navigateBack(APP_VIEWS.ORDERS));

        container.querySelectorAll('[data-detail-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                activeTab = btn.getAttribute('data-detail-tab');
                errorObj = null;
                render();
                motion.animateTabPanel();
            });
        });

        container.querySelectorAll('[data-detail-veh-status]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const vehId = Number(btn.getAttribute('data-detail-veh-status'));
                const nextStatus = btn.getAttribute('data-next-status');
                handleVehicleStatusChange(vehId, nextStatus);
            });
        });

        container.querySelector('#order-edit-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            handleOrderEditSubmit();
        });

        container.querySelector('#edit-add-veh-btn')?.addEventListener('click', () => {
            syncEditDom();
            const firstKat = catalog.kategori_kendaraan[0];
            const katId = firstKat ? Number(firstKat.id_kategori_kendaraan) : 0;
            const matching = tariffsForCategory(katId);
            const firstMain = matching.find((t) => (t.layanan?.tipe_layanan || 'utama') === 'utama') || matching[0];
            const firstLine = firstMain
                ? { id_harga: Number(firstMain.id_harga), harga_akhir: Number(firstMain.harga_dasar), alasan_penyesuaian: '' }
                : null;
            if (firstLine) {
                ensureLineUid(firstLine);
            }
            editVehicles.push({
                id_kendaraan_pesanan: null,
                id_kategori_kendaraan: katId,
                plat_nomor: '',
                layanan: firstLine ? [firstLine] : [],
            });
            render();
        });

        container.querySelectorAll('[data-edit-remove-veh]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncEditDom();
                editVehicles.splice(Number(btn.getAttribute('data-edit-remove-veh')), 1);
                render();
            });
        });

        container.querySelectorAll('[data-edit-cat]').forEach((sel) => {
            sel.addEventListener('change', () => {
                syncEditDom();
                const vIdx = Number(sel.getAttribute('data-edit-cat'));
                const nextKat = Number(sel.value);
                const matching = tariffsForCategory(nextKat);
                const firstMain = matching.find((t) => (t.layanan?.tipe_layanan || 'utama') === 'utama') || matching[0];
                const firstLine = firstMain
                    ? { id_harga: Number(firstMain.id_harga), harga_akhir: Number(firstMain.harga_dasar), alasan_penyesuaian: '' }
                    : null;
                if (firstLine) {
                    ensureLineUid(firstLine);
                }
                editVehicles[vIdx].id_kategori_kendaraan = nextKat;
                editVehicles[vIdx].layanan = firstLine ? [firstLine] : [];
                render();
            });
        });

        container.querySelectorAll('[data-edit-pick-main], [data-edit-pick-addon]').forEach((sel) => {
            sel.addEventListener('change', () => {
                const chosen = Number(sel.value);
                if (!chosen) {
                    return;
                }
                const vIdx = Number(sel.getAttribute('data-edit-pick-main') ?? sel.getAttribute('data-edit-pick-addon'));
                syncEditDom();
                const existingIds = editVehicles[vIdx].layanan.map((l) => Number(l.id_harga));
                const options = tariffOptionsForVehicle(editVehicles[vIdx].id_kategori_kendaraan, existingIds);
                const tariff = options.find((o) => Number(o.id_harga) === chosen);
                if (tariff) {
                    const line = {
                        id_harga: Number(tariff.id_harga),
                        harga_akhir: Number(tariff.harga_dasar),
                        alasan_penyesuaian: '',
                    };
                    ensureLineUid(line);
                    editVehicles[vIdx].layanan.push(line);
                    render();
                }
            });
        });

        container.querySelectorAll('[data-edit-toggle-price]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncEditDom();
                const [vIdx, lIdx] = btn.getAttribute('data-edit-toggle-price').split('-').map(Number);
                const line = editVehicles[vIdx]?.layanan?.[lIdx];
                if (!line) {
                    return;
                }
                const uid = ensureLineUid(line);
                if (expandedEditLines.has(uid)) {
                    expandedEditLines.delete(uid);
                } else {
                    expandedEditLines.add(uid);
                }
                render();
            });
        });

        container.querySelectorAll('[data-edit-remove-service]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncEditDom();
                const [vIdx, lIdx] = btn.getAttribute('data-edit-remove-service').split('-').map(Number);
                const removed = editVehicles[vIdx].layanan.splice(lIdx, 1)[0];
                if (removed?._uid) {
                    expandedEditLines.delete(removed._uid);
                }
                render();
            });
        });

        container.querySelectorAll('[data-edit-price]').forEach((input) => {
            input.addEventListener('change', () => {
                syncEditDom();
                render();
            });
        });

        if (!isPaid) {
            const methodEl = container.querySelector('#pay-method');
            const amountEl = container.querySelector('#pay-amount');
            const previewEl = container.querySelector('#pay-change-preview');

            const updatePayPreview = () => {
                if (!methodEl || !amountEl || !previewEl) {
                    return;
                }
                const method = methodEl.value;
                const amount = Number(amountEl.value || 0);
                const total = Number(totals.total_harga || 0);

                if (method !== 'tunai') {
                    const isInvalidNonCash = Math.abs(amount - total) > 0.001;
                    previewEl.className = `mt-1.5 text-xs font-medium ${isInvalidNonCash ? 'text-danger' : 'text-accent'}`;
                    previewEl.textContent =
                        amount > total
                            ? `Pembayaran non-tunai (${method.toUpperCase()}) tidak boleh melebihi total tagihan.`
                            : amount < total
                              ? `Nominal masih kurang ${formatRupiah(total - amount)}.`
                              : `Nominal pas ${formatRupiah(total)} (kembalian Rp 0).`;
                } else {
                    const diff = amount - total;
                    previewEl.className = `mt-1.5 text-xs font-medium ${diff < 0 ? 'text-danger' : 'text-accent'}`;
                    previewEl.textContent =
                        diff < 0
                            ? `Nominal masih kurang ${formatRupiah(Math.abs(diff))}.`
                            : `Kembalian: ${formatRupiah(diff)}`;
                }
            };

            methodEl?.addEventListener('change', () => {
                if (methodEl.value !== 'tunai' && amountEl) {
                    amountEl.value = String(Number(totals.total_harga || 0));
                }
                updatePayPreview();
            });
            amountEl?.addEventListener('input', updatePayPreview);
            updatePayPreview();

            container.querySelector('#payment-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                handlePaymentSubmit();
            });
        }

        container.querySelector('#cancel-order-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            handleCancelSubmit();
        });
    }

    loadOrder();
}
