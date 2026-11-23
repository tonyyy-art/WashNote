import { generateIdempotencyKey, washnoteApi } from '../api/client.js';
import { APP_VIEWS, navigateTo, showToast, state } from '../state/store.js';
import {
    badgeKendaraan,
    badgeOperasional,
    badgePembayaran,
    badgePesanan,
    escapeHtml,
    formatDateTimeWib,
    formatRupiah,
    renderErrorAlert,
} from '../utils/formatters.js';

export function mountOrderDetailView(container, orderId) {
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
        }
    }

    function hydrateEditModels() {
        if (!order) {
            return;
        }

        editCatatan = order.catatan || '';

        editVehicles = (order.kendaraan || []).map((v) => ({
            id_kendaraan_pesanan: Number(v.id_kendaraan_pesanan),
            id_kategori_kendaraan: Number(v.id_kategori_kendaraan),
            plat_nomor: v.plat_nomor || '',
            layanan: (v.detail_layanan || []).map((d) => ({
                id_harga: Number(d.id_harga),
                harga_akhir: Number(d.harga_akhir),
                alasan_penyesuaian: d.alasan_penyesuaian || '',
            })),
        }));
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
                const reasonEl = container.querySelector(`[data-edit-line-reason="${vIdx}-${lIdx}"]`);
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
                <div class="flex items-center justify-center gap-2 rounded-2xl border border-border-subtle bg-surface p-12 text-sm text-ink-muted">
                    <span class="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
                    Memuat detail pesanan...
                </div>
            `;
            return;
        }

        if (!order) {
            container.innerHTML = `
                <div class="space-y-4">
                    <button id="detail-back-orders" type="button" class="wn-link inline-flex min-h-[32px] items-center text-xs">← Kembali ke Daftar Pesanan</button>
                    ${errorObj ? renderErrorAlert(errorObj) : '<div class="wn-card p-6 text-sm text-ink-muted">Pesanan tidak ditemukan.</div>'}
                </div>
            `;
            container.querySelector('#detail-back-orders')?.addEventListener('click', () => navigateTo(APP_VIEWS.ORDERS));
            return;
        }

        const isCancelled = order.status_pesanan === 'dibatalkan';
        const isPaid = order.pembayaran?.status_pembayaran === 'sudah_dibayar';

        container.innerHTML = `
            <div class="space-y-6">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <button id="detail-back-orders" type="button" class="wn-link mb-1 inline-flex min-h-[32px] items-center text-xs">← Kembali ke Daftar Pesanan</button>
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
                    <div class="wn-card px-4 py-3 text-left sm:text-right">
                        <p class="text-xs text-ink-muted">Total Tagihan</p>
                        <p class="text-xl font-bold text-primary tabular-nums">${escapeHtml(formatRupiah(totals.total_harga))}</p>
                        <p class="text-[11px] text-ink-muted">Utama ${escapeHtml(formatRupiah(totals.subtotal_utama))} • Tambahan ${escapeHtml(formatRupiah(totals.subtotal_tambahan))}</p>
                    </div>
                </div>

                ${errorObj ? renderErrorAlert(errorObj) : ''}

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
                            class="min-h-[38px] rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                                activeTab === tabId ? 'bg-brand-navy text-white shadow-xs' : 'bg-surface text-ink-muted ring-1 ring-border-subtle hover:bg-app-bg hover:text-ink'
                            }"
                        >
                            ${escapeHtml(label)}
                        </button>
                    `).join('')}
                </div>

                ${activeTab === 'detail' ? renderDetailTab(isCancelled) : ''}
                ${activeTab === 'edit' ? renderEditTab(isCancelled, isPaid) : ''}
                ${activeTab === 'payment' ? renderPaymentTab(isCancelled, isPaid) : ''}
                ${activeTab === 'cancel' ? renderCancelTab(isCancelled) : ''}
            </div>
        `;

        bindDetailEvents(isPaid);
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
                                                class="min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                                    active
                                                        ? 'bg-primary text-white'
                                                        : 'border border-border-subtle bg-surface text-ink hover:bg-primary-soft disabled:opacity-50'
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

    function renderEditTab(isCancelled, isPaid) {
        if (isCancelled) {
            return '<div class="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">Pesanan yang telah dibatalkan tidak dapat diedit.</div>';
        }

        return `
            <form id="order-edit-form" class="space-y-4">
                ${isPaid ? `
                    <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                        <p class="font-bold">Pesanan Sudah Dibayar — Edit Penuh Tetap Diizinkan</p>
                        <p class="mt-1">Anda dapat mengubah kendaraan, layanan, harga akhir, plat nomor, maupun catatan beserta alasan audit wajib. Catatan transaksi pembayaran yang sudah tercatat dan laporan keuangan omzet tetap dijaga utuh.</p>
                    </div>
                ` : ''}

                <div class="wn-card p-4 shadow-xs sm:p-5">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <h3 class="text-base font-bold text-ink">Edit Kendaraan, Layanan & Harga</h3>
                        <button type="button" id="edit-add-veh-btn" class="inline-flex min-h-[36px] items-center rounded-xl border border-primary-border bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary hover:bg-blue-100">+ Tambah Kendaraan</button>
                    </div>

                    <div class="mt-4 space-y-4">
                        ${editVehicles.map((veh, vIdx) => {
                            const existingIds = veh.layanan.map((l) => Number(l.id_harga));
                            const options = tariffOptionsForVehicle(veh.id_kategori_kendaraan, existingIds);

                            return `
                                <div class="rounded-xl border border-border-subtle bg-app-bg/70 p-4">
                                    <div class="flex items-center justify-between border-b border-border-subtle pb-2">
                                        <span class="text-xs font-bold uppercase text-ink">Kendaraan #${vIdx + 1}</span>
                                        ${editVehicles.length > 1 ? `<button type="button" data-edit-remove-veh="${vIdx}" class="inline-flex min-h-[32px] items-center rounded-md px-2 text-xs font-semibold text-danger hover:bg-red-50">Hapus Kendaraan</button>` : ''}
                                    </div>
                                    <div class="mt-3 grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <label class="wn-label">Kategori Kendaraan</label>
                                            <select data-edit-cat="${vIdx}" class="wn-select">
                                                ${catalog.kategori_kendaraan.map((kat) => `
                                                    <option value="${kat.id_kategori_kendaraan}" ${Number(kat.id_kategori_kendaraan) === Number(veh.id_kategori_kendaraan) ? 'selected' : ''}>
                                                        ${escapeHtml(kat.nama_kategori)}
                                                    </option>
                                                `).join('')}
                                            </select>
                                        </div>
                                        <div>
                                            <label class="wn-label">Plat Nomor</label>
                                            <input type="text" maxlength="20" data-edit-plat="${vIdx}" value="${escapeHtml(veh.plat_nomor)}" class="wn-input uppercase" />
                                        </div>
                                    </div>

                                    <div class="mt-3 space-y-2.5">
                                        <div class="flex flex-wrap items-center justify-between gap-2">
                                            <span class="text-xs font-semibold text-ink-muted">Layanan</span>
                                            <button type="button" data-edit-add-line="${vIdx}" class="wn-link inline-flex min-h-[32px] items-center rounded-md px-2 text-xs hover:bg-primary-soft">+ Tambah Layanan</button>
                                        </div>
                                        ${veh.layanan.map((line, lIdx) => {
                                            const t = options.find((o) => Number(o.id_harga) === Number(line.id_harga)) || options[0];
                                            return `
                                                <div class="rounded-lg border border-border-subtle bg-surface p-3">
                                                    <div class="grid gap-3 md:grid-cols-12">
                                                        <div class="md:col-span-6">
                                                            <label class="wn-label">Pilih Layanan</label>
                                                            <select data-edit-tariff="${vIdx}-${lIdx}" class="wn-select text-xs">
                                                                ${options.map((opt) => `
                                                                    <option value="${opt.id_harga}" ${Number(opt.id_harga) === Number(line.id_harga) ? 'selected' : ''}>
                                                                        [${escapeHtml(opt.layanan?.tipe_layanan || 'utama')}] ${escapeHtml(opt.layanan?.nama_layanan || 'Layanan')} (${escapeHtml(formatRupiah(opt.harga_dasar))})
                                                                    </option>
                                                                `).join('')}
                                                            </select>
                                                        </div>
                                                        <div class="md:col-span-4">
                                                            <label class="wn-label">
                                                                Harga Akhir
                                                                ${t ? `<span class="font-normal text-ink-muted">(${escapeHtml(formatRupiah(t.batas_bawah))} – ${escapeHtml(formatRupiah(t.batas_atas))})</span>` : ''}
                                                            </label>
                                                            <input type="number" min="0" step="1" data-edit-price="${vIdx}-${lIdx}" value="${escapeHtml(line.harga_akhir)}" class="wn-input text-xs tabular-nums" />
                                                        </div>
                                                        <div class="flex items-end justify-end md:col-span-2">
                                                            ${veh.layanan.length > 1 ? `<button type="button" data-edit-remove-line="${vIdx}-${lIdx}" class="min-h-[36px] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-red-50">Hapus</button>` : ''}
                                                        </div>
                                                    </div>
                                                    <div class="mt-2.5">
                                                        <input type="text" data-edit-line-reason="${vIdx}-${lIdx}" value="${escapeHtml(line.alasan_penyesuaian)}" placeholder="Alasan penyesuaian harga (wajib jika harga akhir != harga dasar)" class="wn-input min-h-[36px] py-1.5 text-xs" />
                                                    </div>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <div class="mt-4 space-y-3 border-t border-border-subtle pt-4">
                        <div>
                            <label for="edit-order-catatan" class="wn-label">Catatan Pesanan</label>
                            <textarea id="edit-order-catatan" rows="2" class="wn-textarea">${escapeHtml(editCatatan)}</textarea>
                        </div>
                        <div>
                            <label for="edit-order-alasan" class="wn-label">Alasan Edit Pesanan (Wajib, min. 5 karakter)</label>
                            <input id="edit-order-alasan" type="text" required minlength="5" value="${escapeHtml(editAlasan)}" placeholder="Contoh: Pelanggan menambah layanan semir ban atau koreksi harga" class="wn-input" />
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
                    <p id="pay-change-preview" class="mt-1.5 text-xs font-medium text-primary">Kembalian: Rp 0</p>
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
        container.querySelector('#detail-back-orders')?.addEventListener('click', () => navigateTo(APP_VIEWS.ORDERS));

        container.querySelectorAll('[data-detail-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                activeTab = btn.getAttribute('data-detail-tab');
                errorObj = null;
                render();
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
            const firstTariff = tariffsForCategory(katId)[0];
            editVehicles.push({
                id_kendaraan_pesanan: null,
                id_kategori_kendaraan: katId,
                plat_nomor: '',
                layanan: firstTariff
                    ? [{ id_harga: Number(firstTariff.id_harga), harga_akhir: Number(firstTariff.harga_dasar), alasan_penyesuaian: '' }]
                    : [],
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
                editVehicles[vIdx].id_kategori_kendaraan = nextKat;
                editVehicles[vIdx].layanan = matching[0]
                    ? [{ id_harga: Number(matching[0].id_harga), harga_akhir: Number(matching[0].harga_dasar), alasan_penyesuaian: '' }]
                    : [];
                render();
            });
        });

        container.querySelectorAll('[data-edit-add-line]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncEditDom();
                const vIdx = Number(btn.getAttribute('data-edit-add-line'));
                const matching = tariffsForCategory(editVehicles[vIdx].id_kategori_kendaraan);
                if (matching[0]) {
                    editVehicles[vIdx].layanan.push({
                        id_harga: Number(matching[0].id_harga),
                        harga_akhir: Number(matching[0].harga_dasar),
                        alasan_penyesuaian: '',
                    });
                    render();
                }
            });
        });

        container.querySelectorAll('[data-edit-remove-line]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncEditDom();
                const [vIdx, lIdx] = btn.getAttribute('data-edit-remove-line').split('-').map(Number);
                editVehicles[vIdx].layanan.splice(lIdx, 1);
                render();
            });
        });

        container.querySelectorAll('[data-edit-tariff]').forEach((sel) => {
            sel.addEventListener('change', () => {
                syncEditDom();
                const [vIdx, lIdx] = sel.getAttribute('data-edit-tariff').split('-').map(Number);
                const idHarga = Number(sel.value);
                const tariff = catalog.harga_layanan.find((t) => Number(t.id_harga) === idHarga);
                editVehicles[vIdx].layanan[lIdx].id_harga = idHarga;
                editVehicles[vIdx].layanan[lIdx].harga_akhir = tariff ? Number(tariff.harga_dasar) : 0;
                editVehicles[vIdx].layanan[lIdx].alasan_penyesuaian = '';
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
                    previewEl.className = `mt-1.5 text-xs font-medium ${isInvalidNonCash ? 'text-danger' : 'text-primary'}`;
                    previewEl.textContent =
                        amount > total
                            ? `Pembayaran non-tunai (${method.toUpperCase()}) tidak boleh melebihi total tagihan.`
                            : amount < total
                              ? `Nominal masih kurang ${formatRupiah(total - amount)}.`
                              : `Nominal pas ${formatRupiah(total)} (kembalian Rp 0).`;
                } else {
                    const diff = amount - total;
                    previewEl.className = `mt-1.5 text-xs font-medium ${diff < 0 ? 'text-danger' : 'text-primary'}`;
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
