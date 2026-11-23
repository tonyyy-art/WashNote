import { generateIdempotencyKey, washnoteApi } from '../api/client.js';
import { APP_VIEWS, isOwner, navigateTo, showToast } from '../state/store.js';
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

export function mountOrdersListView(container) {
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

        try {
            const res = await washnoteApi.getOrders({
                scope: 'all',
                ...filters,
                per_page: 10,
            });
            ordersPage = res?.data || null;
        } catch (err) {
            errorObj = err;
        } finally {
            isLoading = false;
            render();
        }
    }

    function render() {
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
                    title: 'Riwayat & Daftar Pesanan',
                    actionsHtml: '<button id="orders-new-btn" type="button" class="wn-btn-primary">+ Buat Pesanan</button>',
                })}

                <div class="wn-card p-4">
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

                <div class="wn-card overflow-hidden">
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
                                    <div class="space-y-2.5 p-4">
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
                                                    class="inline-flex min-h-[36px] flex-1 items-center justify-center rounded-lg border border-primary-border bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary hover:bg-blue-100"
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
                                                            class="rounded-lg border border-primary-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary-soft"
                                                        >
                                                            Ubah
                                                        </button>
                                                    ` : ''}
                                                    ${!isCancelled && !isPaid ? `
                                                        <button
                                                            type="button"
                                                            data-view-order="${order.id_pesanan}"
                                                            data-view-tab="payment"
                                                            class="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover"
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
}

export function mountOrderCreateView(container) {
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

    function buildDefaultVehicle() {
        const firstKat = catalog.kategori_kendaraan[0];
        const katId = firstKat ? Number(firstKat.id_kategori_kendaraan) : '';
        const matchingTariffs = katId ? tariffsForCategory(katId) : [];
        const firstTariff = matchingTariffs[0];

        return {
            id_kategori_kendaraan: katId,
            plat_nomor: '',
            layanan: firstTariff
                ? [
                      {
                          id_harga: Number(firstTariff.id_harga),
                          harga_akhir: Number(firstTariff.harga_dasar),
                          alasan_penyesuaian: '',
                      },
                  ]
                : [],
        };
    }

    function calculateTotalsPreview() {
        let subtotalUtama = 0;
        let subtotalTambahan = 0;

        for (const veh of vehicles) {
            for (const item of veh.layanan) {
                const tariff = catalog.harga_layanan.find((t) => Number(t.id_harga) === Number(item.id_harga));
                const tipe = tariff?.layanan?.tipe_layanan || 'utama';
                const nominal = Number(item.harga_akhir ?? tariff?.harga_dasar ?? 0);

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

        try {
            const [catRes, schedRes] = await Promise.all([washnoteApi.getCatalog(), washnoteApi.getOperatingStatus()]);
            catalog = catRes?.data || { kategori_kendaraan: [], layanan: [], harga_layanan: [] };
            scheduleStatus = schedRes?.data || null;

            if (vehicles.length === 0) {
                vehicles = [buildDefaultVehicle()];
            }
        } catch (err) {
            errorObj = err;
        } finally {
            isLoadingCatalog = false;
            render();
        }
    }

    async function submitOrder(forceHolidayConfirm = null) {
        if (isSubmitting) {
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
                    const hargaAkhir = item.harga_akhir === '' || item.harga_akhir === null ? hargaDasar : Number(item.harga_akhir);
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
            const res = await washnoteApi.createOrder(payload, currentIdempotencyKey);
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
            });
        } catch (err) {
            if (err.status === 409 && err.errorCode === 'HOLIDAY_CONFIRMATION_REQUIRED') {
                holidayConfirmationRequired = true;
            }
            errorObj = err;
            isSubmitting = false;
            render();
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
            const platEl = container.querySelector(`[data-veh-plat="${vIdx}"]`);
            if (platEl) {
                veh.plat_nomor = platEl.value;
            }

            veh.layanan.forEach((line, lIdx) => {
                const priceEl = container.querySelector(`[data-line-price="${vIdx}-${lIdx}"]`);
                const reasonEl = container.querySelector(`[data-line-reason="${vIdx}-${lIdx}"]`);
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
        const preview = calculateTotalsPreview();
        const noCatalogReady = !isLoadingCatalog && !errorObj && (catalog.kategori_kendaraan.length === 0 || catalog.harga_layanan.length === 0);
        const showOperationalAlert =
            scheduleStatus &&
            (scheduleStatus.status_jam_operasional !== 'dalam_jam' ||
                scheduleStatus.perlu_konfirmasi_hari_libur ||
                (scheduleStatus.warnings || []).length > 0);
        const ownerMode = isOwner();

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({
                    backBtnId: 'create-back-btn',
                    backLabel: '← Kembali ke Antrean',
                    title: 'Buat Pesanan Baru',
                })}

                ${showOperationalAlert ? `
                    <div class="wn-card px-4 py-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-xs font-semibold text-slate-600">Status Operasional:</span>
                            ${badgeOperasional(scheduleStatus.status_jam_operasional)}
                        </div>
                        ${(scheduleStatus.warnings || []).length > 0 ? `
                            <p class="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">${scheduleStatus.warnings.map((w) => escapeHtml(w)).join(' ')}</p>
                        ` : ''}
                    </div>
                ` : ''}

                ${errorObj && (!isLoadingCatalog && catalog.kategori_kendaraan.length > 0) ? renderErrorAlert(errorObj) : ''}

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
                            : '<button id="create-go-dash-btn" type="button" class="wn-btn-secondary">Kembali ke Dashboard</button><button id="create-reload-catalog-btn" type="button" class="wn-btn-secondary">Muat Ulang</button>',
                    })}
                ` : `
                    <form id="create-order-form" class="grid gap-6 lg:grid-cols-3">
                        <div class="space-y-4 lg:col-span-2">
                            ${vehicles.map((veh, vIdx) => renderVehicleBuilder(veh, vIdx)).join('')}

                            <button
                                id="add-vehicle-btn"
                                type="button"
                                class="flex min-h-[44px] w-full items-center justify-center rounded-2xl border-2 border-dashed border-border-subtle bg-surface px-4 py-3 text-sm font-semibold text-primary transition hover:border-primary hover:bg-primary-soft/50"
                            >
                                + Tambah Kendaraan Lain dalam Pesanan Ini
                            </button>

                            <div class="wn-card p-4 shadow-xs sm:p-5">
                                <label for="create-order-catatan" class="wn-label text-sm">Catatan Pesanan (Opsional)</label>
                                <textarea
                                    id="create-order-catatan"
                                    rows="2"
                                    placeholder="Contoh: Pelanggan menunggu di ruang tunggu, hindari semprot bagian kelistrikan"
                                    class="wn-textarea"
                                >${escapeHtml(catatan)}</textarea>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <div class="wn-card p-5 lg:sticky lg:top-6">
                                <h2 class="text-base font-bold text-ink">Ringkasan Pesanan</h2>
                                <dl class="mt-4 space-y-2.5 border-b border-border-subtle pb-4 text-sm">
                                    <div class="flex justify-between text-ink-muted">
                                        <dt>Jumlah Kendaraan</dt>
                                        <dd class="font-semibold text-ink tabular-nums">${vehicles.length}</dd>
                                    </div>
                                    <div class="flex justify-between text-ink-muted">
                                        <dt>Subtotal Layanan Utama</dt>
                                        <dd class="font-semibold text-ink tabular-nums">${escapeHtml(formatRupiah(preview.subtotalUtama))}</dd>
                                    </div>
                                    <div class="flex justify-between text-ink-muted">
                                        <dt>Subtotal Layanan Tambahan</dt>
                                        <dd class="font-semibold text-ink tabular-nums">${escapeHtml(formatRupiah(preview.subtotalTambahan))}</dd>
                                    </div>
                                </dl>
                                <div class="mt-4 flex items-center justify-between">
                                    <span class="text-sm font-bold text-ink">Total Tagihan</span>
                                    <span class="text-xl font-bold text-primary tabular-nums">${escapeHtml(formatRupiah(preview.total))}</span>
                                </div>

                                <p class="mt-3 rounded-lg bg-app-bg px-3 py-2 text-xs text-ink-muted">
                                    Pesanan baru tercatat berstatus <strong>Belum Dibayar</strong>; pelunasan dilakukan di halaman Detail Pesanan.
                                </p>

                                ${scheduleStatus?.perlu_konfirmasi_hari_libur ? `
                                    <label class="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
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
    }

    function renderVehicleBuilder(veh, vIdx) {
        const availableTariffs = tariffsForCategory(veh.id_kategori_kendaraan);
        const mainTariffs = availableTariffs.filter((t) => (t.layanan?.tipe_layanan || 'utama') === 'utama');
        const addOnTariffs = availableTariffs.filter((t) => t.layanan?.tipe_layanan === 'tambahan');

        return `
            <div class="wn-card p-4 shadow-xs sm:p-5">
                <div class="flex items-center justify-between border-b border-border-subtle pb-3">
                    <h3 class="text-sm font-bold text-ink">Kendaraan #${vIdx + 1}</h3>
                    ${vehicles.length > 1 ? `
                        <button type="button" data-remove-veh="${vIdx}" class="inline-flex min-h-[32px] items-center rounded-md px-2 text-xs font-semibold text-danger hover:bg-red-50">Hapus Kendaraan</button>
                    ` : ''}
                </div>

                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                        <label class="wn-label">Kategori Kendaraan <span class="text-danger">*</span></label>
                        <select data-veh-cat="${vIdx}" class="wn-select">
                            ${catalog.kategori_kendaraan.map((kat) => `
                                <option value="${kat.id_kategori_kendaraan}" ${Number(kat.id_kategori_kendaraan) === Number(veh.id_kategori_kendaraan) ? 'selected' : ''}>
                                    ${escapeHtml(kat.nama_kategori)} (${escapeHtml(kat.jenis_kendaraan)})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="wn-label">Plat Nomor <span class="font-normal text-ink-muted">(Opsional)</span></label>
                        <input
                            type="text"
                            maxlength="20"
                            data-veh-plat="${vIdx}"
                            value="${escapeHtml(veh.plat_nomor)}"
                            placeholder="Mis. B 1234 XYZ"
                            class="wn-input uppercase"
                        />
                    </div>
                </div>

                <div class="mt-4 space-y-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Layanan Utama & Tambahan</span>
                        <button
                            type="button"
                            data-add-service="${vIdx}"
                            ${availableTariffs.length === 0 ? 'disabled' : ''}
                            class="inline-flex min-h-[34px] items-center rounded-lg border border-primary-border bg-primary-soft px-3 py-1 text-xs font-semibold text-primary hover:bg-blue-100 disabled:opacity-50"
                        >
                            + Tambah Layanan
                        </button>
                    </div>

                    ${availableTariffs.length === 0 ? `
                        <p class="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Belum ada tarif aktif untuk kategori kendaraan ini.</p>
                    ` : veh.layanan.map((line, lIdx) => {
                        const tariff = availableTariffs.find((t) => Number(t.id_harga) === Number(line.id_harga)) || availableTariffs[0];
                        const basePrice = Number(tariff?.harga_dasar ?? 0);
                        const minPrice = Number(tariff?.batas_bawah ?? 0);
                        const maxPrice = Number(tariff?.batas_atas ?? 0);
                        const activePrice = line.harga_akhir === '' || line.harga_akhir === null ? basePrice : Number(line.harga_akhir);
                        const isAdjusted = Math.abs(activePrice - basePrice) > 0.001;

                        return `
                            <div class="rounded-xl border border-border-subtle bg-app-bg/75 p-3.5">
                                <div class="grid gap-3 md:grid-cols-12">
                                    <div class="md:col-span-6">
                                        <label class="wn-label">Pilih Layanan <span class="text-danger">*</span></label>
                                        <select data-line-tariff="${vIdx}-${lIdx}" class="wn-select">
                                            ${mainTariffs.length > 0 ? `<optgroup label="Layanan Utama">${mainTariffs.map((t) => `
                                                <option value="${t.id_harga}" ${Number(t.id_harga) === Number(line.id_harga) ? 'selected' : ''}>
                                                    [Utama] ${escapeHtml(t.layanan?.nama_layanan)} — ${escapeHtml(formatRupiah(t.harga_dasar))}
                                                </option>
                                            `).join('')}</optgroup>` : ''}
                                            ${addOnTariffs.length > 0 ? `<optgroup label="Layanan Tambahan (Add-On)">${addOnTariffs.map((t) => `
                                                <option value="${t.id_harga}" ${Number(t.id_harga) === Number(line.id_harga) ? 'selected' : ''}>
                                                    [Tambahan] ${escapeHtml(t.layanan?.nama_layanan)} — ${escapeHtml(formatRupiah(t.harga_dasar))}
                                                </option>
                                            `).join('')}</optgroup>` : ''}
                                        </select>
                                    </div>

                                    <div class="md:col-span-5">
                                        <label class="wn-label">
                                            Harga Akhir <span class="text-danger">*</span> <span class="font-normal text-ink-muted">(${escapeHtml(formatRupiah(minPrice))} – ${escapeHtml(formatRupiah(maxPrice))})</span>
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            data-line-price="${vIdx}-${lIdx}"
                                            value="${escapeHtml(line.harga_akhir)}"
                                            class="wn-input tabular-nums"
                                        />
                                    </div>

                                    <div class="flex items-end justify-end md:col-span-1">
                                        ${veh.layanan.length > 1 ? `
                                            <button type="button" data-remove-service="${vIdx}-${lIdx}" class="min-h-[36px] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-red-50">Hapus</button>
                                        ` : ''}
                                    </div>
                                </div>

                                <div class="mt-2.5">
                                    <input
                                        type="text"
                                        data-line-reason="${vIdx}-${lIdx}"
                                        value="${escapeHtml(line.alasan_penyesuaian)}"
                                        placeholder="${isAdjusted ? 'Wajib diisi karena harga berbeda dari harga dasar' : 'Alasan penyesuaian harga (diisi jika harga akhir diubah)'}"
                                        class="block min-h-[36px] w-full rounded-lg border ${isAdjusted ? 'border-amber-400 bg-amber-50/70' : 'border-border-subtle bg-surface'} px-3 py-1.5 text-xs text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                                    />
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function bindCreateEvents() {
        container.querySelector('#create-back-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.DASHBOARD));
        container.querySelector('#create-cancel-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.DASHBOARD));
        container.querySelector('#create-go-dash-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.DASHBOARD));
        container.querySelector('#create-open-catalog-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.OWNER_CATALOG));
        container.querySelector('#create-reload-catalog-btn')?.addEventListener('click', () => loadInitialData());

        container.querySelector('#add-vehicle-btn')?.addEventListener('click', () => {
            syncInputsFromDom();
            vehicles.push(buildDefaultVehicle());
            render();
        });

        container.querySelectorAll('[data-remove-veh]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncInputsFromDom();
                const idx = Number(btn.getAttribute('data-remove-veh'));
                vehicles.splice(idx, 1);
                render();
            });
        });

        container.querySelectorAll('[data-veh-cat]').forEach((select) => {
            select.addEventListener('change', () => {
                syncInputsFromDom();
                const vIdx = Number(select.getAttribute('data-veh-cat'));
                const nextKat = Number(select.value);
                const matching = tariffsForCategory(nextKat);
                vehicles[vIdx].id_kategori_kendaraan = nextKat;
                vehicles[vIdx].layanan = matching[0]
                    ? [{ id_harga: Number(matching[0].id_harga), harga_akhir: Number(matching[0].harga_dasar), alasan_penyesuaian: '' }]
                    : [];
                render();
            });
        });

        container.querySelectorAll('[data-add-service]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncInputsFromDom();
                const vIdx = Number(btn.getAttribute('data-add-service'));
                const matching = tariffsForCategory(vehicles[vIdx].id_kategori_kendaraan);
                if (matching.length > 0) {
                    const unused = matching.find(
                        (m) => !vehicles[vIdx].layanan.some((l) => Number(l.id_harga) === Number(m.id_harga))
                    ) || matching[0];
                    vehicles[vIdx].layanan.push({
                        id_harga: Number(unused.id_harga),
                        harga_akhir: Number(unused.harga_dasar),
                        alasan_penyesuaian: '',
                    });
                    render();
                }
            });
        });

        container.querySelectorAll('[data-remove-service]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncInputsFromDom();
                const [vIdx, lIdx] = btn.getAttribute('data-remove-service').split('-').map(Number);
                vehicles[vIdx].layanan.splice(lIdx, 1);
                render();
            });
        });

        container.querySelectorAll('[data-line-tariff]').forEach((select) => {
            select.addEventListener('change', () => {
                syncInputsFromDom();
                const [vIdx, lIdx] = select.getAttribute('data-line-tariff').split('-').map(Number);
                const nextHargaId = Number(select.value);
                const tariff = catalog.harga_layanan.find((t) => Number(t.id_harga) === nextHargaId);
                vehicles[vIdx].layanan[lIdx].id_harga = nextHargaId;
                vehicles[vIdx].layanan[lIdx].harga_akhir = tariff ? Number(tariff.harga_dasar) : '';
                vehicles[vIdx].layanan[lIdx].alasan_penyesuaian = '';
                render();
            });
        });

        container.querySelectorAll('[data-line-price]').forEach((input) => {
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
}
