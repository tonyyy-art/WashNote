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
    let metadataAlasan = '';
    let metadataCatatan = '';
    let metadataPlates = {};
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
        metadataCatatan = order.catatan || '';
        metadataPlates = {};

        editVehicles = (order.kendaraan || []).map((v) => {
            metadataPlates[v.id_kendaraan_pesanan] = v.plat_nomor || '';

            return {
                id_kendaraan_pesanan: Number(v.id_kendaraan_pesanan),
                id_kategori_kendaraan: Number(v.id_kategori_kendaraan),
                plat_nomor: v.plat_nomor || '',
                layanan: (v.detail_layanan || []).map((d) => ({
                    id_harga: Number(d.id_harga),
                    harga_akhir: Number(d.harga_akhir),
                    alasan_penyesuaian: d.alasan_penyesuaian || '',
                })),
            };
        });
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

    async function handlePrePaymentEditSubmit() {
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

    async function handleMetadataSubmit() {
        if (isSubmitting || !order) {
            return;
        }

        const catInput = container.querySelector('#meta-catatan');
        const reasonInput = container.querySelector('#meta-alasan');
        if (catInput) {
            metadataCatatan = catInput.value;
        }
        if (reasonInput) {
            metadataAlasan = reasonInput.value;
        }

        (order.kendaraan || []).forEach((v) => {
            const platEl = container.querySelector(`[data-meta-plat="${v.id_kendaraan_pesanan}"]`);
            if (platEl) {
                metadataPlates[v.id_kendaraan_pesanan] = platEl.value;
            }
        });

        isSubmitting = true;
        errorObj = null;
        render();

        try {
            const res = await washnoteApi.updateOrderMetadata(order.id_pesanan, {
                expected_version: order.version,
                alasan: metadataAlasan.trim(),
                catatan: metadataCatatan.trim() !== '' ? metadataCatatan.trim() : null,
                kendaraan: (order.kendaraan || []).map((v) => ({
                    id_kendaraan_pesanan: Number(v.id_kendaraan_pesanan),
                    plat_nomor: (metadataPlates[v.id_kendaraan_pesanan] || '').trim() || null,
                })),
            });
            metadataAlasan = '';
            showToast(res?.message || 'Metadata pesanan diperbarui.', 'success');
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
                <div class="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500">
                    <span class="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"></span>
                    Memuat detail pesanan...
                </div>
            `;
            return;
        }

        if (!order) {
            container.innerHTML = `
                <div class="space-y-4">
                    <button id="detail-back-orders" type="button" class="text-xs font-semibold text-teal-700 hover:text-teal-900">← Kembali ke Daftar Pesanan</button>
                    ${errorObj ? renderErrorAlert(errorObj) : '<div class="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Pesanan tidak ditemukan.</div>'}
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
                        <button id="detail-back-orders" type="button" class="mb-1 text-xs font-semibold text-teal-700 hover:text-teal-900">← Kembali ke Daftar Pesanan</button>
                        <div class="flex flex-wrap items-center gap-2.5">
                            <h1 class="font-mono text-2xl font-bold text-slate-900">${escapeHtml(order.nomor_nota || `#${order.id_pesanan}`)}</h1>
                            ${badgePesanan(order.status_pesanan)}
                            ${badgePembayaran(order.pembayaran?.status_pembayaran || 'belum_dibayar')}
                            ${order.status_jam_operasional ? badgeOperasional(order.status_jam_operasional) : ''}
                        </div>
                        <p class="mt-1 text-xs text-slate-500">
                            Waktu Pesanan: ${escapeHtml(formatDateTimeWib(order.waktu_pesanan))} • Dibuat oleh: ${escapeHtml(order.pengguna?.nama_lengkap || '-')}
                        </p>
                    </div>
                    <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
                        <p class="text-xs text-slate-500">Total Tagihan</p>
                        <p class="text-xl font-bold text-teal-700 tabular-nums">${escapeHtml(formatRupiah(totals.total_harga))}</p>
                        <p class="text-[11px] text-slate-500">Utama ${escapeHtml(formatRupiah(totals.subtotal_utama))} • Tambahan ${escapeHtml(formatRupiah(totals.subtotal_tambahan))}</p>
                    </div>
                </div>

                ${errorObj ? renderErrorAlert(errorObj) : ''}

                <div class="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                    ${[
                        ['detail', 'Status & Rincian'],
                        ['edit', isPaid ? 'Edit Metadata & Status (Sudah Dibayar)' : 'Edit Pesanan'],
                        ['payment', 'Pembayaran'],
                        ['cancel', 'Batalkan Pesanan'],
                    ].map(([tabId, label]) => `
                        <button
                            type="button"
                            data-detail-tab="${tabId}"
                            class="rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                                activeTab === tabId ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
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
                    <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Catatan Pesanan</p>
                        <p class="mt-1 text-sm text-slate-800">${escapeHtml(order.catatan)}</p>
                    </div>
                ` : ''}

                ${isCancelled && order.alasan_pembatalan ? `
                    <div class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                        <p class="font-semibold">Pesanan Dibatalkan</p>
                        <p class="mt-1 text-xs">Alasan: ${escapeHtml(order.alasan_pembatalan)}</p>
                    </div>
                ` : ''}

                <div class="rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs text-sky-900">
                    Status keseluruhan pesanan (<strong>Berjalan</strong> atau <strong>Selesai</strong>) diturunkan otomatis dari status cucian setiap kendaraan di bawah ini.
                </div>

                <div class="grid gap-4 lg:grid-cols-2">
                    ${(order.kendaraan || []).map((veh, idx) => `
                        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                                <div>
                                    <h3 class="text-sm font-bold text-slate-900">
                                        Kendaraan #${idx + 1}: ${escapeHtml(veh.nama_kategori_snapshot)}
                                    </h3>
                                    <p class="mt-0.5 font-mono text-xs text-slate-600">
                                        Plat Nomor: ${veh.plat_nomor ? escapeHtml(veh.plat_nomor) : '<span class="italic text-slate-400">Tidak dicantumkan</span>'}
                                    </p>
                                </div>
                                ${badgeKendaraan(veh.status_proses)}
                            </div>

                            <ul class="mt-3 space-y-2">
                                ${(veh.detail_layanan || []).map((det) => `
                                    <li class="flex items-start justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                                        <div>
                                            <span class="font-semibold text-slate-800">${escapeHtml(det.nama_layanan_snapshot || det.harga_layanan?.layanan?.nama_layanan || 'Layanan')}</span>
                                            <span class="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">${escapeHtml(det.tipe_layanan_snapshot || det.harga_layanan?.layanan?.tipe_layanan || 'utama')}</span>
                                            ${det.alasan_penyesuaian ? `<p class="mt-0.5 text-[11px] text-amber-700">Penyesuaian: ${escapeHtml(det.alasan_penyesuaian)}</p>` : ''}
                                        </div>
                                        <div class="text-right tabular-nums">
                                            <p class="font-bold text-slate-900">${escapeHtml(formatRupiah(det.harga_akhir))}</p>
                                            ${Number(det.harga_akhir) !== Number(det.harga_dasar_snapshot) ? `<p class="text-[10px] text-slate-400 line-through">${escapeHtml(formatRupiah(det.harga_dasar_snapshot))}</p>` : ''}
                                        </div>
                                    </li>
                                `).join('')}
                            </ul>

                            ${!isCancelled ? `
                                <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                                    <span class="mr-1 text-xs font-medium text-slate-500">Ubah Proses:</span>
                                    ${['menunggu', 'proses', 'selesai'].map((st) => {
                                        const active = veh.status_proses === st;
                                        const labelMap = { menunggu: 'Menunggu', proses: 'Proses', selesai: 'Selesai' };
                                        return `
                                            <button
                                                type="button"
                                                data-detail-veh-status="${veh.id_kendaraan_pesanan}"
                                                data-next-status="${st}"
                                                ${active || isSubmitting ? 'disabled' : ''}
                                                class="rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                                    active
                                                        ? 'bg-teal-700 text-white'
                                                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50'
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
            return '<div class="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Pesanan yang telah dibatalkan tidak dapat diedit.</div>';
        }

        if (isPaid) {
            return `
                <div class="space-y-4">
                    <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                        <p class="font-bold">Pesanan Sudah Dibayar — Mode Edit Metadata & Status</p>
                        <p class="mt-1">Anda tetap dapat mengubah <strong>plat nomor</strong> dan <strong>catatan pesanan</strong> dengan alasan audit (serta memperbarui status cucian tiap kendaraan di tab Status & Rincian). Perubahan rincian layanan atau nominal harga setelah pembayaran dikunci oleh kebijakan backend untuk menjaga akurasi kas.</p>
                    </div>

                    <form id="metadata-edit-form" class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 class="text-base font-bold text-slate-900">Perbarui Plat Nomor & Catatan</h3>
                        <div class="grid gap-3 sm:grid-cols-2">
                            ${(order.kendaraan || []).map((v, idx) => `
                                <div>
                                    <label class="mb-1 block text-xs font-semibold text-slate-700">Plat Nomor Kendaraan #${idx + 1} (${escapeHtml(v.nama_kategori_snapshot)})</label>
                                    <input
                                        type="text"
                                        maxlength="20"
                                        data-meta-plat="${v.id_kendaraan_pesanan}"
                                        value="${escapeHtml(metadataPlates[v.id_kendaraan_pesanan] ?? '')}"
                                        placeholder="Opsional"
                                        class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase focus:border-teal-600 focus:outline-none"
                                    />
                                </div>
                            `).join('')}
                        </div>

                        <div>
                            <label for="meta-catatan" class="mb-1 block text-xs font-semibold text-slate-700">Catatan Pesanan</label>
                            <textarea id="meta-catatan" rows="2" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none">${escapeHtml(metadataCatatan)}</textarea>
                        </div>

                        <div>
                            <label for="meta-alasan" class="mb-1 block text-xs font-semibold text-slate-700">Alasan Perubahan (Wajib untuk Audit, min. 5 karakter)</label>
                            <input id="meta-alasan" type="text" required minlength="5" value="${escapeHtml(metadataAlasan)}" placeholder="Contoh: Koreksi typo huruf akhir plat nomor" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none" />
                        </div>

                        <button type="submit" ${isSubmitting ? 'disabled' : ''} class="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
                            ${isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan Metadata'}
                        </button>
                    </form>
                </div>
            `;
        }

        return `
            <form id="prepay-edit-form" class="space-y-4">
                <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between">
                        <h3 class="text-base font-bold text-slate-900">Edit Kendaraan, Layanan & Harga (Pra-Bayar)</h3>
                        <button type="button" id="edit-add-veh-btn" class="rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100">+ Tambah Kendaraan</button>
                    </div>

                    <div class="mt-4 space-y-4">
                        ${editVehicles.map((veh, vIdx) => {
                            const existingIds = veh.layanan.map((l) => Number(l.id_harga));
                            const options = tariffOptionsForVehicle(veh.id_kategori_kendaraan, existingIds);

                            return `
                                <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                                    <div class="flex items-center justify-between border-b border-slate-200 pb-2">
                                        <span class="text-xs font-bold uppercase text-slate-700">Kendaraan #${vIdx + 1}</span>
                                        ${editVehicles.length > 1 ? `<button type="button" data-edit-remove-veh="${vIdx}" class="text-xs font-semibold text-rose-600 hover:text-rose-800">Hapus Kendaraan</button>` : ''}
                                    </div>
                                    <div class="mt-3 grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <label class="mb-1 block text-xs font-medium text-slate-600">Kategori Kendaraan</label>
                                            <select data-edit-cat="${vIdx}" class="block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm">
                                                ${catalog.kategori_kendaraan.map((kat) => `
                                                    <option value="${kat.id_kategori_kendaraan}" ${Number(kat.id_kategori_kendaraan) === Number(veh.id_kategori_kendaraan) ? 'selected' : ''}>
                                                        ${escapeHtml(kat.nama_kategori)}
                                                    </option>
                                                `).join('')}
                                            </select>
                                        </div>
                                        <div>
                                            <label class="mb-1 block text-xs font-medium text-slate-600">Plat Nomor</label>
                                            <input type="text" maxlength="20" data-edit-plat="${vIdx}" value="${escapeHtml(veh.plat_nomor)}" class="block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm uppercase" />
                                        </div>
                                    </div>

                                    <div class="mt-3 space-y-2">
                                        <div class="flex items-center justify-between">
                                            <span class="text-xs font-semibold text-slate-600">Layanan</span>
                                            <button type="button" data-edit-add-line="${vIdx}" class="text-xs font-semibold text-teal-700 hover:text-teal-900">+ Tambah Layanan</button>
                                        </div>
                                        ${veh.layanan.map((line, lIdx) => {
                                            const t = options.find((o) => Number(o.id_harga) === Number(line.id_harga)) || options[0];
                                            return `
                                                <div class="rounded-lg border border-slate-200 bg-white p-3">
                                                    <div class="grid gap-2 sm:grid-cols-12">
                                                        <div class="sm:col-span-6">
                                                            <select data-edit-tariff="${vIdx}-${lIdx}" class="block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs">
                                                                ${options.map((opt) => `
                                                                    <option value="${opt.id_harga}" ${Number(opt.id_harga) === Number(line.id_harga) ? 'selected' : ''}>
                                                                        [${escapeHtml(opt.layanan?.tipe_layanan || 'utama')}] ${escapeHtml(opt.layanan?.nama_layanan || 'Layanan')} (${escapeHtml(formatRupiah(opt.harga_dasar))})
                                                                    </option>
                                                                `).join('')}
                                                            </select>
                                                        </div>
                                                        <div class="sm:col-span-4">
                                                            <input type="number" min="0" step="1" data-edit-price="${vIdx}-${lIdx}" value="${escapeHtml(line.harga_akhir)}" title="Rentang ${t ? `${t.batas_bawah} - ${t.batas_atas}` : ''}" class="block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs tabular-nums" />
                                                        </div>
                                                        <div class="flex justify-end sm:col-span-2">
                                                            ${veh.layanan.length > 1 ? `<button type="button" data-edit-remove-line="${vIdx}-${lIdx}" class="text-xs font-semibold text-rose-600">Hapus</button>` : ''}
                                                        </div>
                                                    </div>
                                                    <input type="text" data-edit-line-reason="${vIdx}-${lIdx}" value="${escapeHtml(line.alasan_penyesuaian)}" placeholder="Alasan penyesuaian harga (wajib jika harga akhir != harga dasar)" class="mt-2 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <div class="mt-4 space-y-3 border-t border-slate-200 pt-4">
                        <div>
                            <label for="edit-order-catatan" class="mb-1 block text-xs font-semibold text-slate-700">Catatan Pesanan</label>
                            <textarea id="edit-order-catatan" rows="2" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">${escapeHtml(editCatatan)}</textarea>
                        </div>
                        <div>
                            <label for="edit-order-alasan" class="mb-1 block text-xs font-semibold text-slate-700">Alasan Edit Pesanan (Wajib, min. 5 karakter)</label>
                            <input id="edit-order-alasan" type="text" required minlength="5" value="${escapeHtml(editAlasan)}" placeholder="Contoh: Pelanggan menambah layanan semir ban sebelum bayar" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                        </div>
                        <button type="submit" ${isSubmitting ? 'disabled' : ''} class="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
                            ${isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan Pesanan'}
                        </button>
                    </div>
                </div>
            </form>
        `;
    }

    function renderPaymentTab(isCancelled, isPaid) {
        if (isCancelled) {
            return '<div class="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Pesanan yang telah dibatalkan tidak dapat menerima pembayaran.</div>';
        }

        if (isPaid) {
            const p = order.pembayaran;
            return `
                <div class="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 class="text-base font-bold text-slate-900">Bukti Pembayaran Lunas</h3>
                        ${badgePembayaran(p.status_pembayaran)}
                    </div>
                    <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <div><dt class="text-xs text-slate-500">Metode Pembayaran</dt><dd class="font-semibold uppercase text-slate-900">${escapeHtml(p.metode_pembayaran)}</dd></div>
                        <div><dt class="text-xs text-slate-500">Waktu Penerimaan</dt><dd class="font-semibold text-slate-900">${escapeHtml(formatDateTimeWib(p.waktu_penerimaan))}</dd></div>
                        <div><dt class="text-xs text-slate-500">Pendapatan Tagihan (Omzet)</dt><dd class="font-bold text-emerald-700 tabular-nums">${escapeHtml(formatRupiah(p.jumlah_dibayar))}</dd></div>
                        <div><dt class="text-xs text-slate-500">Uang Diterima</dt><dd class="font-semibold text-slate-900 tabular-nums">${escapeHtml(formatRupiah(p.uang_diterima ?? p.jumlah_dibayar))}</dd></div>
                        <div><dt class="text-xs text-slate-500">Kembalian</dt><dd class="font-semibold text-slate-900 tabular-nums">${escapeHtml(formatRupiah(p.kembalian ?? 0))}</dd></div>
                    </dl>
                </div>
            `;
        }

        return `
            <form id="payment-form" class="max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                    <h3 class="text-base font-bold text-slate-900">Catat Pembayaran Penuh</h3>
                    <p class="mt-1 text-xs text-slate-500">Total tagihan wajib dilunasi sekaligus sebesar <strong class="text-slate-900">${escapeHtml(formatRupiah(totals.total_harga))}</strong>. Pembayaran non-tunai (QRIS/Transfer) harus tepat sebesar total tagihan.</p>
                </div>

                <div>
                    <label for="pay-method" class="mb-1 block text-xs font-semibold text-slate-700">Metode Pembayaran</label>
                    <select id="pay-method" class="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm">
                        <option value="tunai">Tunai (Cash)</option>
                        <option value="qris">QRIS</option>
                        <option value="transfer">Transfer Bank</option>
                    </select>
                </div>

                <div>
                    <label for="pay-amount" class="mb-1 block text-xs font-semibold text-slate-700">Nominal Diterima (Rp)</label>
                    <input id="pay-amount" type="number" min="1" step="1" required value="${Number(totals.total_harga)}" class="block w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold tabular-nums" />
                    <p id="pay-change-preview" class="mt-1.5 text-xs font-medium text-teal-700">Kembalian: Rp 0</p>
                </div>

                <button type="submit" ${isSubmitting ? 'disabled' : ''} class="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
                    ${isSubmitting ? 'Memproses Pembayaran...' : 'Konfirmasi Pembayaran Penuh'}
                </button>
            </form>
        `;
    }

    function renderCancelTab(isCancelled) {
        if (isCancelled) {
            return '<div class="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Pesanan ini sudah berstatus dibatalkan.</div>';
        }

        return `
            <form id="cancel-order-form" class="max-w-lg space-y-4 rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
                <div>
                    <h3 class="text-base font-bold text-rose-800">Batalkan Pesanan (Soft Void)</h3>
                    <p class="mt-1 text-xs text-slate-600">Pesanan tidak dihapus permanen, melainkan ditandai sebagai <strong>Dibatalkan</strong> beserta catatan audit wajib.</p>
                </div>
                <div>
                    <label for="cancel-reason" class="mb-1 block text-xs font-semibold text-slate-700">Alasan Pembatalan (Wajib, min. 5 karakter)</label>
                    <textarea id="cancel-reason" rows="3" required minlength="5" placeholder="Jelaskan alasan pembatalan pesanan..." class="block w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm">${escapeHtml(cancelReason)}</textarea>
                </div>
                <button type="submit" ${isSubmitting ? 'disabled' : ''} class="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60">
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

        container.querySelector('#metadata-edit-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            handleMetadataSubmit();
        });

        container.querySelector('#prepay-edit-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            handlePrePaymentEditSubmit();
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
                    previewEl.textContent =
                        amount > total
                            ? `Pembayaran non-tunai (${method.toUpperCase()}) tidak boleh melebihi total tagihan.`
                            : `Nominal pas ${formatRupiah(total)} (kembalian Rp 0).`;
                } else {
                    const diff = amount - total;
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
