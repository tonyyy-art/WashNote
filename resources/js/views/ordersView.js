import { generateIdempotencyKey, washnoteApi } from '../api/client.js';
import { APP_VIEWS, navigateTo, showToast } from '../state/store.js';
import {
    badgeOperasional,
    badgePembayaran,
    badgePesanan,
    escapeHtml,
    formatDateTimeWib,
    formatRupiah,
    renderErrorAlert,
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

        container.innerHTML = `
            <div class="space-y-6">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 class="text-2xl font-bold tracking-tight text-slate-900">Riwayat & Daftar Pesanan</h1>
                        <p class="mt-0.5 text-sm text-slate-600">Telusuri seluruh pesanan berdasarkan nomor nota, plat nomor, status proses, pembayaran, atau tanggal.</p>
                    </div>
                    <button
                        id="orders-new-btn"
                        type="button"
                        class="inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
                    >
                        + Buat Pesanan
                    </button>
                </div>

                <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <form id="orders-filter-form" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                        <div class="lg:col-span-2">
                            <label class="mb-1 block text-xs font-medium text-slate-600">Pencarian Nota / Plat</label>
                            <input
                                id="ord-search"
                                type="search"
                                value="${escapeHtml(filters.search)}"
                                placeholder="#TRX-... atau plat nomor"
                                class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label class="mb-1 block text-xs font-medium text-slate-600">Status Pesanan</label>
                            <select id="ord-status" class="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none">
                                <option value="">Semua</option>
                                <option value="berjalan" ${filters.status_pesanan === 'berjalan' ? 'selected' : ''}>Berjalan</option>
                                <option value="selesai" ${filters.status_pesanan === 'selesai' ? 'selected' : ''}>Selesai</option>
                                <option value="dibatalkan" ${filters.status_pesanan === 'dibatalkan' ? 'selected' : ''}>Dibatalkan</option>
                            </select>
                        </div>
                        <div>
                            <label class="mb-1 block text-xs font-medium text-slate-600">Pembayaran</label>
                            <select id="ord-pay" class="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none">
                                <option value="">Semua</option>
                                <option value="belum_dibayar" ${filters.status_pembayaran === 'belum_dibayar' ? 'selected' : ''}>Belum Dibayar</option>
                                <option value="sudah_dibayar" ${filters.status_pembayaran === 'sudah_dibayar' ? 'selected' : ''}>Sudah Dibayar</option>
                            </select>
                        </div>
                        <div>
                            <label class="mb-1 block text-xs font-medium text-slate-600">Dari Tanggal</label>
                            <input id="ord-start" type="date" value="${escapeHtml(filters.tanggal_mulai)}" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none" />
                        </div>
                        <div class="flex flex-col justify-end gap-1">
                            <label class="mb-1 block text-xs font-medium text-slate-600">Sampai Tanggal</label>
                            <div class="flex gap-2">
                                <input id="ord-end" type="date" value="${escapeHtml(filters.tanggal_akhir)}" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none" />
                                <button type="submit" class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Cari</button>
                            </div>
                        </div>
                    </form>
                </div>

                ${errorObj ? renderErrorAlert(errorObj) : ''}

                <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    ${isLoading ? `
                        <div class="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
                            <span class="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"></span>
                            Memuat daftar pesanan...
                        </div>
                    ` : items.length === 0 ? `
                        <div class="p-10 text-center text-sm text-slate-500">Tidak ada pesanan yang cocok dengan filter saat ini.</div>
                    ` : `
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
                                <thead class="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                                    <tr>
                                        <th class="px-4 py-3">Nota & Waktu</th>
                                        <th class="px-4 py-3">Kendaraan & Plat</th>
                                        <th class="px-4 py-3">Status Pesanan</th>
                                        <th class="px-4 py-3">Pembayaran</th>
                                        <th class="px-4 py-3 text-right">Total</th>
                                        <th class="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-200 bg-white">
                                    ${items.map((order) => {
                                        const plates = (order.kendaraan || [])
                                            .map((v) => `${escapeHtml(v.nama_kategori_snapshot)}${v.plat_nomor ? ` (${escapeHtml(v.plat_nomor)})` : ''}`)
                                            .join(', ');

                                        return `
                                            <tr class="hover:bg-slate-50">
                                                <td class="px-4 py-3">
                                                    <div class="font-mono font-bold text-slate-900">${escapeHtml(order.nomor_nota || `#${order.id_pesanan}`)}</div>
                                                    <div class="text-xs text-slate-500">${escapeHtml(formatDateTimeWib(order.waktu_pesanan))}</div>
                                                </td>
                                                <td class="px-4 py-3">
                                                    <div class="text-xs font-medium text-slate-800">${plates || '-'}</div>
                                                    ${order.catatan ? `<div class="mt-0.5 text-xs text-slate-500">${escapeHtml(order.catatan)}</div>` : ''}
                                                </td>
                                                <td class="px-4 py-3">${badgePesanan(order.status_pesanan)}</td>
                                                <td class="px-4 py-3">${badgePembayaran(order.pembayaran?.status_pembayaran || 'belum_dibayar')}</td>
                                                <td class="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">${escapeHtml(formatRupiah(order.total_harga))}</td>
                                                <td class="px-4 py-3 text-right">
                                                    <button
                                                        type="button"
                                                        data-view-order="${order.id_pesanan}"
                                                        class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                                    >
                                                        Kelola
                                                    </button>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                        ${ordersPage && ordersPage.last_page > 1 ? `
                            <div class="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                                <span>Halaman ${ordersPage.current_page} dari ${ordersPage.last_page} (Total ${ordersPage.total} pesanan)</span>
                                <div class="flex gap-2">
                                    <button type="button" data-ord-page="${ordersPage.current_page - 1}" ${ordersPage.current_page <= 1 ? 'disabled' : ''} class="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-50">Sebelumnya</button>
                                    <button type="button" data-ord-page="${ordersPage.current_page + 1}" ${ordersPage.current_page >= ordersPage.last_page ? 'disabled' : ''} class="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-50">Berikutnya</button>
                                </div>
                            </div>
                        ` : ''}
                    `}
                </div>
            </div>
        `;

        container.querySelector('#orders-new-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.ORDER_CREATE));
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
                    tab: 'detail',
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
        const noCatalogReady = !isLoadingCatalog && (catalog.kategori_kendaraan.length === 0 || catalog.harga_layanan.length === 0);

        container.innerHTML = `
            <div class="space-y-6">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <button id="create-back-btn" type="button" class="mb-1 text-xs font-semibold text-teal-700 hover:text-teal-900">← Kembali ke Antrean</button>
                        <h1 class="text-2xl font-bold tracking-tight text-slate-900">Buat Pesanan Baru</h1>
                        <p class="mt-0.5 text-sm text-slate-600">Pilih kategori kendaraan, layanan utama dan/atau tambahan berdiri sendiri, serta penyesuaian harga sesuai batas tarif.</p>
                    </div>
                </div>

                ${scheduleStatus ? `
                    <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Status Operasional Saat Ini:</span>
                            ${badgeOperasional(scheduleStatus.status_jam_operasional)}
                        </div>
                        ${(scheduleStatus.warnings || []).length > 0 ? `
                            <p class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">${scheduleStatus.warnings.map((w) => escapeHtml(w)).join(' ')}</p>
                        ` : ''}
                    </div>
                ` : ''}

                ${errorObj ? renderErrorAlert(errorObj) : ''}

                ${holidayConfirmationRequired ? `
                    <div class="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
                        <h3 class="text-sm font-bold text-amber-900">Konfirmasi Operasional Hari Libur</h3>
                        <p class="mt-1 text-xs text-amber-800">Hari ini tercatat sebagai hari libur operasional. Konfirmasikan apabila Anda tetap ingin memproses pesanan ini.</p>
                        <div class="mt-3 flex gap-2">
                            <button id="confirm-holiday-submit-btn" type="button" class="rounded-xl bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800">
                                Konfirmasi & Simpan Pesanan
                            </button>
                        </div>
                    </div>
                ` : ''}

                ${isLoadingCatalog ? `
                    <div class="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500">
                        <span class="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"></span>
                        Memuat katalog kategori & tarif aktif...
                    </div>
                ` : noCatalogReady ? `
                    <div class="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                        <p class="font-semibold">Katalog layanan aktif belum siap.</p>
                        <p class="mt-1 text-xs">Pastikan Owner sudah mengaktifkan minimal 1 Kategori Kendaraan, Layanan, dan Tarif Harga Layanan sebelum membuat pesanan.</p>
                    </div>
                ` : `
                    <form id="create-order-form" class="grid gap-6 lg:grid-cols-3">
                        <div class="space-y-4 lg:col-span-2">
                            ${vehicles.map((veh, vIdx) => renderVehicleBuilder(veh, vIdx)).join('')}

                            <button
                                id="add-vehicle-btn"
                                type="button"
                                class="flex w-full items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-teal-700 hover:border-teal-500 hover:bg-teal-50/40"
                            >
                                + Tambah Kendaraan Lain dalam Pesanan Ini
                            </button>

                            <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <label for="create-order-catatan" class="block text-sm font-semibold text-slate-800">Catatan Pesanan (Opsional)</label>
                                <textarea
                                    id="create-order-catatan"
                                    rows="2"
                                    placeholder="Contoh: Pelanggan menunggu di ruang tunggu, hindari semprot bagian kelistrikan"
                                    class="mt-2 block w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
                                >${escapeHtml(catatan)}</textarea>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <div class="sticky top-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <h2 class="text-base font-bold text-slate-900">Ringkasan Tagihan</h2>
                                <dl class="mt-4 space-y-2.5 border-b border-slate-200 pb-4 text-sm">
                                    <div class="flex justify-between text-slate-600">
                                        <dt>Jumlah Kendaraan</dt>
                                        <dd class="font-semibold text-slate-900 tabular-nums">${vehicles.length}</dd>
                                    </div>
                                    <div class="flex justify-between text-slate-600">
                                        <dt>Subtotal Layanan Utama</dt>
                                        <dd class="font-semibold text-slate-900 tabular-nums">${escapeHtml(formatRupiah(preview.subtotalUtama))}</dd>
                                    </div>
                                    <div class="flex justify-between text-slate-600">
                                        <dt>Subtotal Layanan Tambahan</dt>
                                        <dd class="font-semibold text-slate-900 tabular-nums">${escapeHtml(formatRupiah(preview.subtotalTambahan))}</dd>
                                    </div>
                                </dl>
                                <div class="mt-4 flex items-center justify-between">
                                    <span class="text-sm font-bold text-slate-900">Total Tagihan</span>
                                    <span class="text-xl font-bold text-teal-700 tabular-nums">${escapeHtml(formatRupiah(preview.total))}</span>
                                </div>

                                ${scheduleStatus?.perlu_konfirmasi_hari_libur ? `
                                    <label class="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                        <input id="create-order-holiday-confirm" type="checkbox" ${konfirmasiHariLibur ? 'checked' : ''} class="mt-0.5 rounded border-amber-400 text-amber-700 focus:ring-amber-600" />
                                        <span>Saya mengonfirmasi pembuatan pesanan pada hari libur operasional.</span>
                                    </label>
                                ` : ''}

                                <button
                                    type="submit"
                                    ${isSubmitting ? 'disabled' : ''}
                                    class="mt-5 flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-60"
                                >
                                    ${isSubmitting ? 'Menyimpan Pesanan...' : 'Simpan Pesanan'}
                                </button>
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
            <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 class="text-sm font-bold text-slate-900">Kendaraan #${vIdx + 1}</h3>
                    ${vehicles.length > 1 ? `
                        <button type="button" data-remove-veh="${vIdx}" class="text-xs font-semibold text-rose-600 hover:text-rose-800">Hapus Kendaraan</button>
                    ` : ''}
                </div>

                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                        <label class="mb-1 block text-xs font-semibold text-slate-700">Kategori Kendaraan</label>
                        <select data-veh-cat="${vIdx}" class="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none">
                            ${catalog.kategori_kendaraan.map((kat) => `
                                <option value="${kat.id_kategori_kendaraan}" ${Number(kat.id_kategori_kendaraan) === Number(veh.id_kategori_kendaraan) ? 'selected' : ''}>
                                    ${escapeHtml(kat.nama_kategori)} (${escapeHtml(kat.jenis_kendaraan)})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-semibold text-slate-700">Plat Nomor (Opsional)</label>
                        <input
                            type="text"
                            maxlength="20"
                            data-veh-plat="${vIdx}"
                            value="${escapeHtml(veh.plat_nomor)}"
                            placeholder="Mis. B 1234 XYZ"
                            class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase focus:border-teal-600 focus:outline-none"
                        />
                    </div>
                </div>

                <div class="mt-4 space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Layanan Utama & Tambahan</span>
                        <button
                            type="button"
                            data-add-service="${vIdx}"
                            ${availableTariffs.length === 0 ? 'disabled' : ''}
                            class="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
                        >
                            + Tambah Layanan
                        </button>
                    </div>

                    ${availableTariffs.length === 0 ? `
                        <p class="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Belum ada tarif aktif untuk kategori kendaraan ini.</p>
                    ` : veh.layanan.map((line, lIdx) => {
                        const tariff = availableTariffs.find((t) => Number(t.id_harga) === Number(line.id_harga)) || availableTariffs[0];
                        const basePrice = Number(tariff?.harga_dasar ?? 0);
                        const minPrice = Number(tariff?.batas_bawah ?? 0);
                        const maxPrice = Number(tariff?.batas_atas ?? 0);
                        const activePrice = line.harga_akhir === '' || line.harga_akhir === null ? basePrice : Number(line.harga_akhir);
                        const isAdjusted = Math.abs(activePrice - basePrice) > 0.001;

                        return `
                            <div class="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
                                <div class="grid gap-3 sm:grid-cols-12">
                                    <div class="sm:col-span-6">
                                        <label class="mb-1 block text-xs font-medium text-slate-600">Pilih Layanan</label>
                                        <select data-line-tariff="${vIdx}-${lIdx}" class="block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:border-teal-600 focus:outline-none">
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

                                    <div class="sm:col-span-5">
                                        <label class="mb-1 block text-xs font-medium text-slate-600">
                                            Harga Akhir (Rentang ${escapeHtml(formatRupiah(minPrice))} – ${escapeHtml(formatRupiah(maxPrice))})
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            data-line-price="${vIdx}-${lIdx}"
                                            value="${escapeHtml(line.harga_akhir)}"
                                            class="block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm tabular-nums focus:border-teal-600 focus:outline-none"
                                        />
                                    </div>

                                    <div class="flex items-end justify-end sm:col-span-1">
                                        ${veh.layanan.length > 1 ? `
                                            <button type="button" data-remove-service="${vIdx}-${lIdx}" class="rounded-lg px-2 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50">Hapus</button>
                                        ` : ''}
                                    </div>
                                </div>

                                <div class="mt-2.5">
                                    <input
                                        type="text"
                                        data-line-reason="${vIdx}-${lIdx}"
                                        value="${escapeHtml(line.alasan_penyesuaian)}"
                                        placeholder="${isAdjusted ? 'Wajib diisi karena harga berbeda dari harga dasar' : 'Alasan penyesuaian harga (diisi jika harga akhir diubah)'}"
                                        class="block w-full rounded-lg border ${isAdjusted ? 'border-amber-400 bg-amber-50/70' : 'border-slate-200 bg-white'} px-3 py-1.5 text-xs focus:border-teal-600 focus:outline-none"
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
