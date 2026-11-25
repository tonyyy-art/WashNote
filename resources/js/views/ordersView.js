import { generateIdempotencyKey, isAbortError, washnoteApi } from '../api/client.js';
import { createViewMotion, scrollToElement } from '../motion/motionSystem.js';
import { APP_VIEWS, isOwner, navigateBack, navigateTo, showToast } from '../state/store.js';
import {
    badgeOperasional,
    badgePembayaran,
    badgePesanan,
    escapeHtml,
    formatDateTimeWib,
    formatRupiah,
    renderEmptyState,
    renderErrorAlert,
    renderLoadingState,
    renderPageHeader,
    renderPaginationBar,
} from '../utils/formatters.js';
import {
    ensureLineUid,
    parseOrderValidationError,
    renderOrderErrorSummary,
    renderVehicleServiceCard,
} from '../utils/orderFormHelpers.js';

export function mountOrdersListView(container) {
    const motion = createViewMotion(container);
    const abortController = new AbortController();
    let isDisposed = false;
    let isLoading = true;
    let errorObj = null;
    let ordersPage = null;
    let filters = {
        search: '',
        status_pesanan: '',
        status_pembayaran: '',
        tanggal_mulai: '',
        tanggal_akhir: '',
        page: 1,
    };

    async function loadOrders() {
        isLoading = true;
        errorObj = null;
        render();

        let wasAborted = false;
        try {
            const res = await washnoteApi.getOrders(
                {
                    scope: 'all',
                    ...filters,
                    per_page: 10,
                },
                { signal: abortController.signal }
            );
            if (isDisposed) {
                return;
            }
            ordersPage = res?.data || null;
        } catch (err) {
            if (isDisposed || isAbortError(err)) {
                wasAborted = true;
                return;
            }
            errorObj = err;
        } finally {
            isLoading = false;
            if (!isDisposed && !wasAborted) {
                render();
                motion.runIntro();
            }
        }
    }

    function render() {
        if (isDisposed) {
            return;
        }
        const items = ordersPage?.data || [];
        const hasFilter =
            filters.search !== '' ||
            filters.status_pesanan !== '' ||
            filters.status_pembayaran !== '' ||
            filters.tanggal_mulai !== '' ||
            filters.tanggal_akhir !== '';

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({
                    backBtnId: 'orders-back-btn',
                    title: 'Riwayat & Daftar Pesanan',
                    actionsHtml: '<button id="orders-new-btn" type="button" class="wn-btn-primary w-full sm:w-auto">+ Buat Pesanan</button>',
                })}

                <div data-motion-card class="wn-card p-4">
                    <form id="orders-filter-form" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
                        <div class="sm:col-span-2 lg:col-span-2">
                            <label for="ord-search" class="wn-label">Nota / Plat Nomor</label>
                            <input
                                id="ord-search"
                                type="search"
                                value="${escapeHtml(filters.search)}"
                                placeholder="#TRX-... atau plat nomor"
                                class="wn-input"
                            />
                        </div>
                        <div>
                            <label for="ord-status" class="wn-label">Status Pesanan</label>
                            <select id="ord-status" class="wn-select">
                                <option value="">Semua</option>
                                <option value="berjalan" ${filters.status_pesanan === 'berjalan' ? 'selected' : ''}>Berjalan</option>
                                <option value="selesai" ${filters.status_pesanan === 'selesai' ? 'selected' : ''}>Selesai</option>
                                <option value="dibatalkan" ${filters.status_pesanan === 'dibatalkan' ? 'selected' : ''}>Dibatalkan</option>
                            </select>
                        </div>
                        <div>
                            <label for="ord-pay" class="wn-label">Pembayaran</label>
                            <select id="ord-pay" class="wn-select">
                                <option value="">Semua</option>
                                <option value="belum_dibayar" ${filters.status_pembayaran === 'belum_dibayar' ? 'selected' : ''}>Belum Dibayar</option>
                                <option value="sudah_dibayar" ${filters.status_pembayaran === 'sudah_dibayar' ? 'selected' : ''}>Sudah Dibayar</option>
                            </select>
                        </div>
                        <div>
                            <label for="ord-start" class="wn-label">Dari Tanggal</label>
                            <input id="ord-start" type="date" value="${escapeHtml(filters.tanggal_mulai)}" class="wn-input" />
                        </div>
                        <div class="flex flex-col gap-2 sm:flex-row sm:items-end lg:flex-col lg:items-stretch">
                            <div class="flex-1">
                                <label for="ord-end" class="wn-label">Sampai Tanggal</label>
                                <input id="ord-end" type="date" value="${escapeHtml(filters.tanggal_akhir)}" class="wn-input" />
                            </div>
                        </div>
                        <div class="sm:col-span-2 lg:col-span-6 lg:flex lg:justify-end">
                            <button type="submit" class="wn-btn-dark w-full sm:w-auto">Cari Pesanan</button>
                        </div>
                    </form>
                </div>

                ${errorObj && items.length > 0 ? renderErrorAlert(errorObj) : ''}

                <div data-motion-reveal class="wn-card overflow-hidden">
                    ${isLoading ? renderLoadingState('Memuat daftar pesanan...') : errorObj && items.length === 0 ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'error',
                                title: 'Gagal memuat riwayat pesanan',
                                message: errorObj.message || 'Terjadi kendala saat mengambil data.',
                                actionsHtml: '<button id="orders-retry-btn" type="button" class="wn-btn-secondary">Coba Lagi</button>',
                            })}
                        </div>
                    ` : items.length === 0 && hasFilter ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'filtered',
                                title: 'Pesanan tidak ditemukan',
                                message: 'Ubah kata kunci, rentang tanggal, atau status filter.',
                                actionsHtml: '<button id="orders-reset-filter-btn" type="button" class="wn-btn-secondary">Reset Filter</button>',
                            })}
                        </div>
                    ` : items.length === 0 ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'empty',
                                title: 'Belum ada pesanan tercatat',
                                actionsHtml: '<button id="orders-empty-new-btn" type="button" class="wn-btn-primary">+ Buat Pesanan</button>',
                            })}
                        </div>
                    ` : `
                        <div class="divide-y divide-border-subtle md:hidden">
                            ${items.map((order) => {
                                const isCancelled = order.status_pesanan === 'dibatalkan';
                                const isPaid = order.pembayaran?.status_pembayaran === 'sudah_dibayar';
                                const plates = (order.kendaraan || [])
                                    .map((v) => `${escapeHtml(v.nama_kategori_snapshot)}${v.plat_nomor ? ` (${escapeHtml(v.plat_nomor)})` : ''}`)
                                    .join(', ');

                                return `
                                    <div class="wn-interactive-card space-y-2.5 p-4">
                                        <div class="flex items-start justify-between gap-2">
                                            <div>
                                                <div class="font-mono text-sm font-bold ${isCancelled ? 'text-ink-muted line-through' : 'text-ink'}">${escapeHtml(order.nomor_nota || `#${order.id_pesanan}`)}</div>
                                                <div class="text-xs text-ink-muted">${escapeHtml(formatDateTimeWib(order.waktu_pesanan))}</div>
                                            </div>
                                            <div class="text-right font-bold tabular-nums ${isCancelled ? 'text-ink-muted line-through' : 'text-ink'}">${escapeHtml(formatRupiah(order.total_harga))}</div>
                                        </div>
                                        <div class="flex flex-wrap items-center gap-1.5">
                                            ${badgePesanan(order.status_pesanan)}
                                            ${badgePembayaran(order.pembayaran?.status_pembayaran || 'belum_dibayar')}
                                        </div>
                                        <div class="text-xs font-medium text-ink">${plates || '-'}</div>
                                        ${order.catatan ? `<div class="text-xs text-ink-muted">${escapeHtml(order.catatan)}</div>` : ''}
                                        ${isCancelled && order.alasan_pembatalan ? `<div class="text-xs font-medium text-danger">Alasan batal: ${escapeHtml(order.alasan_pembatalan)}</div>` : ''}
                                        <div class="flex flex-wrap gap-2 pt-1">
                                            <button
                                                type="button"
                                                data-view-order="${order.id_pesanan}"
                                                data-view-tab="detail"
                                                class="wn-btn-secondary min-h-[36px] flex-1 px-3 py-1.5 text-xs"
                                            >
                                                Detail
                                            </button>
                                            ${!isCancelled ? `
                                                <button
                                                    type="button"
                                                    data-view-order="${order.id_pesanan}"
                                                    data-view-tab="edit"
                                                    class="inline-flex min-h-[36px] flex-1 items-center justify-center rounded-lg border border-accent-border bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent transition active:scale-[0.985] hover:bg-teal-100/70"
                                                >
                                                    Ubah
                                                </button>
                                            ` : ''}
                                            ${!isCancelled && !isPaid ? `
                                                <button
                                                    type="button"
                                                    data-view-order="${order.id_pesanan}"
                                                    data-view-tab="payment"
                                                    class="wn-btn-primary min-h-[36px] flex-1 px-3 py-1.5 text-xs"
                                                >
                                                    Bayar
                                                </button>
                                            ` : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div class="hidden overflow-x-auto md:block">
                            <table class="min-w-full divide-y divide-border-subtle text-left text-sm">
                                <thead class="bg-app-bg text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                    <tr>
                                        <th class="px-4 py-3">Nota & Waktu</th>
                                        <th class="px-4 py-3">Kendaraan & Plat</th>
                                        <th class="px-4 py-3">Status Pesanan</th>
                                        <th class="px-4 py-3">Pembayaran</th>
                                        <th class="px-4 py-3 text-right">Total</th>
                                        <th class="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-border-subtle bg-surface">
                                    ${items.map((order) => {
                                        const isCancelled = order.status_pesanan === 'dibatalkan';
                                        const isPaid = order.pembayaran?.status_pembayaran === 'sudah_dibayar';
                                        const plates = (order.kendaraan || [])
                                            .map((v) => `${escapeHtml(v.nama_kategori_snapshot)}${v.plat_nomor ? ` (${escapeHtml(v.plat_nomor)})` : ''}`)
                                            .join(', ');

                                        return `
                                            <tr class="hover:bg-app-bg/50">
                                                <td class="px-4 py-3">
                                                    <div class="font-mono font-bold ${isCancelled ? 'text-ink-muted line-through' : 'text-ink'}">${escapeHtml(order.nomor_nota || `#${order.id_pesanan}`)}</div>
                                                    <div class="text-xs text-ink-muted">${escapeHtml(formatDateTimeWib(order.waktu_pesanan))}</div>
                                                </td>
                                                <td class="px-4 py-3">
                                                    <div class="text-xs font-medium text-ink">${plates || '-'}</div>
                                                    ${order.catatan ? `<div class="mt-0.5 text-xs text-ink-muted">${escapeHtml(order.catatan)}</div>` : ''}
                                                    ${isCancelled && order.alasan_pembatalan ? `<div class="mt-1 text-xs font-medium text-danger">Alasan batal: ${escapeHtml(order.alasan_pembatalan)}</div>` : ''}
                                                </td>
                                                <td class="px-4 py-3">${badgePesanan(order.status_pesanan)}</td>
                                                <td class="px-4 py-3">${badgePembayaran(order.pembayaran?.status_pembayaran || 'belum_dibayar')}</td>
                                                <td class="px-4 py-3 text-right font-bold tabular-nums ${isCancelled ? 'text-ink-muted line-through' : 'text-ink'}">${escapeHtml(formatRupiah(order.total_harga))}</td>
                                                <td class="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                                                    <button
                                                        type="button"
                                                        data-view-order="${order.id_pesanan}"
                                                        data-view-tab="detail"
                                                        class="rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-app-bg"
                                                    >
                                                        Detail
                                                    </button>
                                                    ${!isCancelled ? `
                                                        <button
                                                            type="button"
                                                            data-view-order="${order.id_pesanan}"
                                                            data-view-tab="edit"
                                                            class="rounded-lg border border-accent-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent-soft"
                                                        >
                                                            Ubah
                                                        </button>
                                                    ` : ''}
                                                    ${!isCancelled && !isPaid ? `
                                                        <button
                                                            type="button"
                                                            data-view-order="${order.id_pesanan}"
                                                            data-view-tab="payment"
                                                            class="rounded-lg bg-brand-navy px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-navy-hover"
                                                        >
                                                            Bayar
                                                        </button>
                                                    ` : ''}
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                        ${renderPaginationBar(ordersPage, 'data-ord-page', 'pesanan')}
                    `}
                </div>
            </div>
        `;

        container.querySelector('#orders-back-btn')?.addEventListener('click', () => navigateBack(APP_VIEWS.DASHBOARD));
        container.querySelector('#orders-new-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.ORDER_CREATE));
        container.querySelector('#orders-empty-new-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.ORDER_CREATE));
        container.querySelector('#orders-retry-btn')?.addEventListener('click', loadOrders);
        container.querySelector('#orders-reset-filter-btn')?.addEventListener('click', () => {
            filters = { search: '', status_pesanan: '', status_pembayaran: '', tanggal_mulai: '', tanggal_akhir: '', page: 1 };
            loadOrders();
        });
        container.querySelector('#orders-filter-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            filters.search = container.querySelector('#ord-search')?.value?.trim() || '';
            filters.status_pesanan = container.querySelector('#ord-status')?.value || '';
            filters.status_pembayaran = container.querySelector('#ord-pay')?.value || '';
            filters.tanggal_mulai = container.querySelector('#ord-start')?.value || '';
            filters.tanggal_akhir = container.querySelector('#ord-end')?.value || '';
            filters.page = 1;
            loadOrders();
        });

        container.querySelectorAll('[data-view-order]').forEach((btn) => {
            btn.addEventListener('click', () => {
                navigateTo(APP_VIEWS.ORDER_DETAIL, {
                    orderId: Number(btn.getAttribute('data-view-order')),
                    tab: btn.getAttribute('data-view-tab') || 'detail',
                });
            });
        });

        container.querySelectorAll('[data-ord-page]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const next = Number(btn.getAttribute('data-ord-page'));
                if (next >= 1 && next <= (ordersPage?.last_page || 1)) {
                    filters.page = next;
                    loadOrders();
                }
            });
        });
    }

    loadOrders();

    return () => {
        isDisposed = true;
        abortController.abort();
    };
}

export function mountOrderCreateView(container) {
    const motion = createViewMotion(container);
    const abortController = new AbortController();
    let isDisposed = false;
    let isLoadingCatalog = true;
    let isSubmitting = false;
    let errorObj = null;
    let holidayConfirmationRequired = false;
    let catalog = { kategori_kendaraan: [], layanan: [], harga_layanan: [] };
    let scheduleStatus = null;
    let catatan = '';
    let konfirmasiHariLibur = false;
    let currentIdempotencyKey = generateIdempotencyKey();
    let lastSubmittedSignature = null;

    let vehicles = [];
    const expandedPriceLines = new Set();

    function resetKeyIfPayloadChanged() {
        const sig = JSON.stringify({ catatan, vehicles });
        if (lastSubmittedSignature !== null && sig !== lastSubmittedSignature) {
            currentIdempotencyKey = generateIdempotencyKey();
            lastSubmittedSignature = null;
        }
    }

    function tariffsForCategory(kategoriId) {
        return (catalog.harga_layanan || []).filter((h) => Number(h.id_kategori_kendaraan) === Number(kategoriId));
    }

    function makeServiceLineFromTariff(tariff) {
        const line = {
            id_harga: Number(tariff.id_harga),
            harga_akhir: Number(tariff.harga_dasar),
            alasan_penyesuaian: '',
        };
        ensureLineUid(line);
        return line;
    }

    function buildDefaultVehicle() {
        const firstKat = catalog.kategori_kendaraan[0];
        const katId = firstKat ? Number(firstKat.id_kategori_kendaraan) : '';
        const matchingTariffs = katId ? tariffsForCategory(katId) : [];
        const firstMain = matchingTariffs.find((t) => (t.layanan?.tipe_layanan || 'utama') === 'utama') || matchingTariffs[0];

        return {
            id_kategori_kendaraan: katId,
            plat_nomor: '',
            layanan: firstMain ? [makeServiceLineFromTariff(firstMain)] : [],
        };
    }

    function calculateTotalsPreview() {
        let subtotalUtama = 0;
        let subtotalTambahan = 0;

        for (const veh of vehicles) {
            for (const item of veh.layanan) {
                const tariff = catalog.harga_layanan.find((t) => Number(t.id_harga) === Number(item.id_harga));
                const tipe = tariff?.layanan?.tipe_layanan || 'utama';
                const rawVal = Number(item.harga_akhir ?? tariff?.harga_dasar ?? 0);
                const nominal = item.harga_akhir === '' || item.harga_akhir === null || Number.isNaN(rawVal)
                    ? Number(tariff?.harga_dasar ?? 0)
                    : rawVal;

                if (tipe === 'tambahan') {
                    subtotalTambahan += nominal;
                } else {
                    subtotalUtama += nominal;
                }
            }
        }

        return {
            subtotalUtama,
            subtotalTambahan,
            total: subtotalUtama + subtotalTambahan,
        };
    }

    async function loadInitialData() {
        isLoadingCatalog = true;
        errorObj = null;
        render();

        let wasAborted = false;
        try {
            const [catRes, schedRes] = await Promise.all([
                washnoteApi.getCatalog({ signal: abortController.signal }),
                washnoteApi.getOperatingStatus({ signal: abortController.signal }),
            ]);
            if (isDisposed) {
                return;
            }
            catalog = catRes?.data || { kategori_kendaraan: [], layanan: [], harga_layanan: [] };
            scheduleStatus = schedRes?.data || null;

            if (vehicles.length === 0) {
                vehicles = [buildDefaultVehicle()];
            }
        } catch (err) {
            if (isDisposed || isAbortError(err)) {
                wasAborted = true;
                return;
            }
            errorObj = err;
        } finally {
            isLoadingCatalog = false;
            if (!isDisposed && !wasAborted) {
                render();
                motion.runIntro();
            }
        }
    }

    async function submitOrder(forceHolidayConfirm = null) {
        if (isDisposed || isSubmitting) {
            return;
        }

        syncInputsFromDom();
        resetKeyIfPayloadChanged();

        const useHolidayConfirm = forceHolidayConfirm !== null ? forceHolidayConfirm : konfirmasiHariLibur;

        const payload = {
            catatan: catatan.trim() !== '' ? catatan.trim() : null,
            konfirmasi_hari_libur: Boolean(useHolidayConfirm),
            kendaraan: vehicles.map((veh) => ({
                id_kategori_kendaraan: Number(veh.id_kategori_kendaraan),
                plat_nomor: veh.plat_nomor.trim() !== '' ? veh.plat_nomor.trim() : null,
                layanan: veh.layanan.map((item) => {
                    const tariff = catalog.harga_layanan.find((t) => Number(t.id_harga) === Number(item.id_harga));
                    const hargaDasar = Number(tariff?.harga_dasar ?? 0);
                    const hargaAkhir =
                        item.harga_akhir === '' || item.harga_akhir === null ? hargaDasar : Number(item.harga_akhir);
                    const entry = {
                        id_harga: Number(item.id_harga),
                        harga_akhir: hargaAkhir,
                    };

                    if (item.alasan_penyesuaian && item.alasan_penyesuaian.trim() !== '') {
                        entry.alasan_penyesuaian = item.alasan_penyesuaian.trim();
                    }

                    return entry;
                }),
            })),
        };

        lastSubmittedSignature = JSON.stringify({ catatan, vehicles });
        isSubmitting = true;
        errorObj = null;
        holidayConfirmationRequired = false;
        render();

        try {
            const res = await washnoteApi.createOrder(payload, currentIdempotencyKey, { signal: abortController.signal });
            if (isDisposed) {
                return;
            }
            const createdOrder = res?.data?.pesanan;
            const warnings = res?.warnings || [];
            showToast(
                warnings.length > 0
                    ? `Pesanan ${createdOrder?.nomor_nota || ''} dibuat (${warnings[0]}).`
                    : `Pesanan ${createdOrder?.nomor_nota || ''} berhasil dibuat.`,
                warnings.length > 0 ? 'info' : 'success'
            );

            navigateTo(APP_VIEWS.ORDER_DETAIL, {
                orderId: Number(createdOrder.id_pesanan),
                tab: 'detail',
                replaceUrl: true,
            });
        } catch (err) {
            if (isDisposed || isAbortError(err)) {
                return;
            }
            if (err.status === 409 && err.errorCode === 'HOLIDAY_CONFIRMATION_REQUIRED') {
                holidayConfirmationRequired = true;
            }
            errorObj = err;
            isSubmitting = false;
            render();
            if (container.querySelector('[data-inline-error="true"]')) {
                scrollToElement('[data-inline-error="true"]');
            }
        }
    }

    function syncInputsFromDom() {
        const noteEl = container.querySelector('#create-order-catatan');
        if (noteEl) {
            catatan = noteEl.value;
        }

        const holidayCheckbox = container.querySelector('#create-order-holiday-confirm');
        if (holidayCheckbox) {
            konfirmasiHariLibur = holidayCheckbox.checked;
        }

        vehicles.forEach((veh, vIdx) => {
            const platEl = container.querySelector(`[data-create-plat="${vIdx}"]`);
            if (platEl) {
                veh.plat_nomor = platEl.value;
            }

            veh.layanan.forEach((line, lIdx) => {
                const priceEl = container.querySelector(`[data-create-price="${vIdx}-${lIdx}"]`);
                const reasonEl = container.querySelector(`[data-create-reason="${vIdx}-${lIdx}"]`);
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
        if (isDisposed) {
            return;
        }
        const preview = calculateTotalsPreview();
        const noCatalogReady = !isLoadingCatalog && !errorObj && (catalog.kategori_kendaraan.length === 0 || catalog.harga_layanan.length === 0);
        const showOperationalAlert =
            scheduleStatus &&
            (scheduleStatus.status_jam_operasional !== 'dalam_jam' ||
                scheduleStatus.perlu_konfirmasi_hari_libur);
        const ownerMode = isOwner();
        const parsedError = parseOrderValidationError(errorObj, vehicles, catalog);

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({
                    backBtnId: 'create-back-btn',
                    title: 'Buat Pesanan Baru',
                })}

                ${showOperationalAlert ? `
                    <div class="wn-card flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-xs font-semibold text-ink-muted">Operasional:</span>
                            ${badgeOperasional(scheduleStatus.status_jam_operasional)}
                        </div>
                        ${scheduleStatus.perlu_konfirmasi_hari_libur ? '<span class="text-xs font-medium text-warning">Perlu konfirmasi hari libur sebelum simpan.</span>' : ''}
                    </div>
                ` : ''}

                ${parsedError.hasError && !isLoadingCatalog && catalog.kategori_kendaraan.length > 0 ? renderOrderErrorSummary(parsedError) : ''}

                ${holidayConfirmationRequired ? `
                    <div class="rounded-xl border border-amber-300 bg-amber-50 p-4">
                        <h3 class="text-sm font-bold text-amber-900">Konfirmasi Hari Libur</h3>
                        <p class="mt-1 text-xs text-amber-800">Hari ini tercatat sebagai hari libur operasional. Lanjutkan hanya jika pesanan tetap diproses.</p>
                        <div class="mt-3 flex gap-2">
                            <button id="confirm-holiday-submit-btn" type="button" class="rounded-lg bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-800">
                                Konfirmasi & Simpan Pesanan
                            </button>
                        </div>
                    </div>
                ` : ''}

                ${isLoadingCatalog ? `
                    <div class="wn-card">${renderLoadingState('Memuat katalog & tarif aktif...')}</div>
                ` : errorObj && catalog.kategori_kendaraan.length === 0 ? `
                    ${renderEmptyState({
                        kind: 'error',
                        title: 'Gagal memuat katalog layanan',
                        message: errorObj.message || 'Katalog tidak dapat diambil dari server.',
                        actionsHtml: '<button id="create-reload-catalog-btn" type="button" class="wn-btn-secondary">Coba Lagi</button>',
                    })}
                ` : noCatalogReady ? `
                    ${renderEmptyState({
                        kind: 'prerequisite',
                        title: 'Katalog layanan aktif belum siap',
                        message: ownerMode
                            ? 'Tambahkan dan aktifkan minimal 1 kategori kendaraan, layanan, dan tarif terlebih dahulu.'
                            : 'Hubungi Owner untuk mengaktifkan kategori kendaraan, layanan, dan tarif terlebih dahulu.',
                        actionsHtml: ownerMode
                            ? '<button id="create-open-catalog-btn" type="button" class="wn-btn-primary">Buka Katalog & Tarif</button><button id="create-reload-catalog-btn" type="button" class="wn-btn-secondary">Muat Ulang</button>'
                            : '<button id="create-go-dash-btn" type="button" class="wn-btn-secondary">Kembali</button><button id="create-reload-catalog-btn" type="button" class="wn-btn-secondary">Muat Ulang</button>',
                    })}
                ` : `
                    <form id="create-order-form" novalidate class="grid gap-6 lg:grid-cols-3">
                        <div class="min-w-0 space-y-4 lg:col-span-2">
                            ${vehicles.map((veh, vIdx) => renderVehicleServiceCard({
                                veh,
                                vIdx,
                                totalVehicles: vehicles.length,
                                categories: catalog.kategori_kendaraan,
                                availableTariffs: tariffsForCategory(veh.id_kategori_kendaraan),
                                expandedLines: expandedPriceLines,
                                parsedError,
                                prefix: 'create',
                            })).join('')}

                            <button
                                id="add-vehicle-btn"
                                type="button"
                                class="flex min-h-[44px] w-full items-center justify-center rounded-2xl border-2 border-dashed border-border-subtle bg-surface px-4 py-3 text-sm font-semibold text-accent transition active:scale-[0.99] hover:border-accent hover:bg-accent-soft/40"
                            >
                                + Tambah Kendaraan
                            </button>

                            <div class="wn-card p-4 shadow-xs sm:p-5">
                                <label for="create-order-catatan" class="wn-label text-sm">Catatan Pesanan (Opsional)</label>
                                <textarea
                                    id="create-order-catatan"
                                    rows="2"
                                    placeholder="Contoh: Pelanggan menunggu di ruang tunggu"
                                    class="wn-textarea ${parsedError.topErrors?.catatan ? 'wn-textarea-error' : ''}"
                                >${escapeHtml(catatan)}</textarea>
                                ${parsedError.topErrors?.catatan ? `<p class="wn-error-inline" data-inline-error="true">${escapeHtml(parsedError.topErrors.catatan)}</p>` : ''}
                            </div>
                        </div>

                        <div class="min-w-0 space-y-4">
                            <div data-motion-card class="wn-card p-5 lg:sticky lg:top-6">
                                <h2 class="text-base font-bold text-ink">Ringkasan Pesanan</h2>
                                <dl class="mt-4 space-y-2.5 border-b border-border-subtle pb-4 text-sm">
                                    <div class="flex justify-between text-ink-muted">
                                        <dt>Jumlah Kendaraan</dt>
                                        <dd class="font-semibold text-ink tabular-nums">${vehicles.length}</dd>
                                    </div>
                                    <div class="flex justify-between text-ink-muted">
                                        <dt>Layanan Utama</dt>
                                        <dd class="font-semibold text-ink tabular-nums">${escapeHtml(formatRupiah(preview.subtotalUtama))}</dd>
                                    </div>
                                    <div class="flex justify-between text-ink-muted">
                                        <dt>Layanan Tambahan</dt>
                                        <dd class="font-semibold text-ink tabular-nums">${escapeHtml(formatRupiah(preview.subtotalTambahan))}</dd>
                                    </div>
                                </dl>
                                <div class="mt-4 flex items-center justify-between">
                                    <span class="text-sm font-bold text-ink">Total Tagihan</span>
                                    <span class="text-xl font-bold text-brand-navy tabular-nums">${escapeHtml(formatRupiah(preview.total))}</span>
                                </div>

                                ${parsedError.hasError ? `
                                    <p class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-danger">
                                        Terdapat kesalahan input. Periksa kolom bertanda merah sebelum menyimpan.
                                    </p>
                                ` : `
                                    <p class="mt-3 rounded-lg bg-app-bg px-3 py-2 text-xs text-ink-muted">
                                        Pembayaran dicatat di halaman Detail Pesanan.
                                    </p>
                                `}

                                ${scheduleStatus?.perlu_konfirmasi_hari_libur ? `
                                    <label for="create-order-holiday-confirm" class="mt-3 flex min-h-[40px] items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                        <input id="create-order-holiday-confirm" type="checkbox" ${konfirmasiHariLibur ? 'checked' : ''} class="wn-checkbox mt-0.5" />
                                        <span>Saya mengonfirmasi pembuatan pesanan pada hari libur operasional.</span>
                                    </label>
                                ` : ''}

                                <div class="mt-5 space-y-2">
                                    <button
                                        type="submit"
                                        ${isSubmitting ? 'disabled' : ''}
                                        class="wn-btn-primary w-full py-2.5"
                                    >
                                        ${isSubmitting ? 'Menyimpan Pesanan...' : 'Simpan Pesanan'}
                                    </button>
                                    <button id="create-cancel-btn" type="button" class="wn-btn-secondary w-full">
                                        Batal
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                `}
            </div>
        `;

        bindCreateEvents();
        if (!isLoadingCatalog) {
            motion.refresh();
        }
    }

    function addServiceByTariffId(vIdx, idHarga) {
        const tariff = tariffsForCategory(vehicles[vIdx].id_kategori_kendaraan).find(
            (t) => Number(t.id_harga) === Number(idHarga)
        );
        if (!tariff) {
            return;
        }
        vehicles[vIdx].layanan.push(makeServiceLineFromTariff(tariff));
    }

    function bindCreateEvents() {
        container.querySelector('#create-back-btn')?.addEventListener('click', () => navigateBack(APP_VIEWS.DASHBOARD));
        container.querySelector('#create-cancel-btn')?.addEventListener('click', () => navigateBack(APP_VIEWS.DASHBOARD));
        container.querySelector('#create-go-dash-btn')?.addEventListener('click', () => navigateBack(APP_VIEWS.DASHBOARD));
        container.querySelector('#create-open-catalog-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.OWNER_CATALOG));
        container.querySelector('#create-reload-catalog-btn')?.addEventListener('click', () => loadInitialData());

        container.querySelector('#add-vehicle-btn')?.addEventListener('click', () => {
            syncInputsFromDom();
            vehicles.push(buildDefaultVehicle());
            render();
        });

        container.querySelectorAll('[data-create-remove-veh]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncInputsFromDom();
                const idx = Number(btn.getAttribute('data-create-remove-veh'));
                vehicles.splice(idx, 1);
                render();
            });
        });

        container.querySelectorAll('[data-create-cat]').forEach((select) => {
            select.addEventListener('change', () => {
                syncInputsFromDom();
                const vIdx = Number(select.getAttribute('data-create-cat'));
                const nextKat = Number(select.value);
                const matching = tariffsForCategory(nextKat);
                const firstMain = matching.find((t) => (t.layanan?.tipe_layanan || 'utama') === 'utama') || matching[0];
                vehicles[vIdx].id_kategori_kendaraan = nextKat;
                vehicles[vIdx].layanan = firstMain ? [makeServiceLineFromTariff(firstMain)] : [];
                render();
            });
        });

        container.querySelectorAll('[data-create-pick-main], [data-create-pick-addon]').forEach((select) => {
            select.addEventListener('change', () => {
                const chosen = Number(select.value);
                if (!chosen) {
                    return;
                }
                const vIdx = Number(select.getAttribute('data-create-pick-main') ?? select.getAttribute('data-create-pick-addon'));
                syncInputsFromDom();
                addServiceByTariffId(vIdx, chosen);
                render();
            });
        });

        container.querySelectorAll('[data-create-toggle-price]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncInputsFromDom();
                const [vIdx, lIdx] = btn.getAttribute('data-create-toggle-price').split('-').map(Number);
                const line = vehicles[vIdx]?.layanan?.[lIdx];
                if (!line) {
                    return;
                }
                const uid = ensureLineUid(line);
                if (expandedPriceLines.has(uid)) {
                    expandedPriceLines.delete(uid);
                } else {
                    expandedPriceLines.add(uid);
                }
                render();
            });
        });

        container.querySelectorAll('[data-create-remove-service]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncInputsFromDom();
                const [vIdx, lIdx] = btn.getAttribute('data-create-remove-service').split('-').map(Number);
                const removed = vehicles[vIdx].layanan.splice(lIdx, 1)[0];
                if (removed?._uid) {
                    expandedPriceLines.delete(removed._uid);
                }
                render();
            });
        });

        container.querySelectorAll('[data-create-price]').forEach((input) => {
            input.addEventListener('change', () => {
                syncInputsFromDom();
                render();
            });
        });

        container.querySelector('#create-order-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            submitOrder();
        });

        container.querySelector('#confirm-holiday-submit-btn')?.addEventListener('click', () => {
            submitOrder(true);
        });
    }

    loadInitialData();

    return () => {
        isDisposed = true;
        abortController.abort();
    };
}
