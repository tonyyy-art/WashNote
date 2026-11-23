import { washnoteApi } from '../api/client.js';
import { APP_VIEWS, isOwner, navigateTo, showToast } from '../state/store.js';
import {
    badgeKendaraan,
    badgeOperasional,
    badgePembayaran,
    badgePesanan,
    escapeHtml,
    formatDateFullIndo,
    formatDateTimeWib,
    formatRupiah,
    renderEmptyState,
    renderErrorAlert,
    renderLoadingState,
    renderPageHeader,
} from '../utils/formatters.js';

export function mountDashboardView(container) {
    let isLoading = true;
    let errorObj = null;
    let ordersPage = null;
    let summary = null;
    let scheduleStatus = null;
    let search = '';
    let paymentFilter = '';
    let currentPage = 1;
    let busyVehicleId = null;

    async function loadDashboard() {
        isLoading = true;
        errorObj = null;
        render();

        try {
            const [ordersRes, statusRes] = await Promise.all([
                washnoteApi.getOrders({
                    scope: 'dashboard',
                    search,
                    status_pembayaran: paymentFilter,
                    page: currentPage,
                    per_page: 10,
                }),
                washnoteApi.getOperatingStatus(),
            ]);

            ordersPage = ordersRes?.data || null;
            summary = ordersRes?.ringkasan || null;
            scheduleStatus = statusRes?.data || null;
        } catch (err) {
            errorObj = err;
        } finally {
            isLoading = false;
            render();
        }
    }

    async function handleVehicleStep(vehicleId, nextStatus, order) {
        if (busyVehicleId !== null) {
            return;
        }

        busyVehicleId = vehicleId;
        render();

        try {
            const payload = {
                status_proses: nextStatus,
            };

            if (order?.version !== undefined && order?.version !== null) {
                payload.expected_version = order.version;
            }

            const res = await washnoteApi.updateVehicleStatus(vehicleId, payload);
            showToast(res?.message || 'Status kendaraan diperbarui.', 'success');
            await loadDashboard();
        } catch (err) {
            if (err.status === 409 && err.errorCode === 'VERSION_CONFLICT') {
                showToast('Data antrean baru diperbarui oleh pengguna lain. Memuat ulang data terbaru.', 'info');
                await loadDashboard();
                return;
            }
            showToast(err.message || 'Gagal memperbarui status kendaraan.', 'error');
        } finally {
            busyVehicleId = null;
            render();
        }
    }

    function render() {
        const items = ordersPage?.data || [];
        const warnings = scheduleStatus?.warnings || [];
        const hasFilter = search !== '' || paymentFilter !== '';

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({
                    title: 'Dashboard Antrean',
                    actionsHtml: `
                        <button id="dash-create-order-btn" type="button" class="wn-btn-primary">
                            + Buat Pesanan
                        </button>
                    `,
                })}

                ${scheduleStatus ? `
                    <div class="wn-card px-4 py-3">
                        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div class="flex flex-wrap items-center gap-2.5">
                                <span class="text-xs font-semibold text-slate-600">${escapeHtml(formatDateFullIndo(scheduleStatus.tanggal))}</span>
                                ${badgeOperasional(scheduleStatus.status_jam_operasional)}
                            </div>
                            <button
                                id="dash-hours-link"
                                type="button"
                                class="text-left text-xs font-semibold text-teal-700 hover:text-teal-900 sm:text-right"
                            >
                                ${isOwner() ? 'Kelola Jam Operasional →' : 'Lihat Jadwal →'}
                            </button>
                        </div>
                        ${warnings.length > 0 ? `
                            <p class="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
                                ${warnings.map((w) => escapeHtml(w)).join(' ')}
                            </p>
                        ` : ''}
                    </div>
                ` : ''}

                ${summary ? `
                    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <div class="wn-card p-4">
                            <p class="text-xs font-medium text-slate-500">Antrean Aktif</p>
                            <p class="mt-1 text-2xl font-bold text-slate-900 tabular-nums">${summary.antrean_aktif_total ?? 0}</p>
                            <p class="mt-1 text-xs text-slate-500">Berjalan ${summary.berjalan_count ?? 0} • Selesai belum bayar ${summary.selesai_belum_dibayar_count ?? 0}</p>
                        </div>
                        <div class="wn-card p-4">
                            <p class="text-xs font-medium text-slate-500">Belum Dibayar</p>
                            <p class="mt-1 text-2xl font-bold text-amber-700 tabular-nums">${summary.belum_dibayar_count ?? 0}</p>
                            <p class="mt-1 text-xs text-slate-500">Menunggu pelunasan</p>
                        </div>
                        <div class="wn-card p-4">
                            <p class="text-xs font-medium text-slate-500">Status Kendaraan Aktif</p>
                            <p class="mt-1 text-lg font-bold text-slate-900 tabular-nums">
                                ${summary.kendaraan_menunggu_count ?? 0} M • ${summary.kendaraan_proses_count ?? 0} P • ${summary.kendaraan_selesai_count ?? 0} S
                            </p>
                            <p class="mt-1 text-xs text-slate-500">Menunggu / Proses / Selesai</p>
                        </div>
                        <div class="wn-card p-4">
                            <p class="text-xs font-medium text-slate-500">Pesanan Hari Ini (WIB)</p>
                            <p class="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">${summary.hari_ini_total_pesanan ?? 0}</p>
                            <p class="mt-1 text-xs text-slate-500">Selesai & lunas: ${summary.hari_ini_selesai_dibayar_count ?? 0}</p>
                        </div>
                    </div>
                ` : ''}

                <div class="wn-card overflow-hidden">
                    <div class="border-b border-slate-200 p-4">
                        <form id="dash-filter-form" class="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                            <div class="flex-1">
                                <input
                                    id="dash-search-input"
                                    type="search"
                                    value="${escapeHtml(search)}"
                                    placeholder="Cari nomor nota (#TRX-...) atau plat nomor..."
                                    class="wn-input"
                                />
                            </div>
                            <div class="sm:w-56">
                                <select id="dash-payment-select" class="wn-select">
                                    <option value="" ${paymentFilter === '' ? 'selected' : ''}>Semua Status Pembayaran</option>
                                    <option value="belum_dibayar" ${paymentFilter === 'belum_dibayar' ? 'selected' : ''}>Belum Dibayar</option>
                                    <option value="sudah_dibayar" ${paymentFilter === 'sudah_dibayar' ? 'selected' : ''}>Sudah Dibayar (Berjalan)</option>
                                </select>
                            </div>
                            <button type="submit" class="wn-btn-dark">
                                Filter
                            </button>
                        </form>
                    </div>

                    ${errorObj && items.length > 0 ? `<div class="p-4">${renderErrorAlert(errorObj)}</div>` : ''}

                    ${isLoading ? renderLoadingState('Memuat antrean aktif...') : errorObj && items.length === 0 ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'error',
                                title: 'Gagal memuat antrean aktif',
                                message: errorObj.message || 'Terjadi kendala saat menghubungi server.',
                                actionsHtml: '<button id="dash-retry-btn" type="button" class="wn-btn-secondary">Coba Lagi</button>',
                            })}
                        </div>
                    ` : items.length === 0 && hasFilter ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'filtered',
                                title: 'Tidak ada antrean yang cocok',
                                message: 'Ubah kata kunci pencarian atau pilih filter status pembayaran lain.',
                                actionsHtml: '<button id="dash-reset-filter-btn" type="button" class="wn-btn-secondary">Reset Filter</button>',
                            })}
                        </div>
                    ` : items.length === 0 ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'empty',
                                title: 'Belum ada antrean aktif',
                                actionsHtml: '<button id="dash-empty-create-btn" type="button" class="wn-btn-primary">+ Buat Pesanan</button>',
                            })}
                        </div>
                    ` : `
                        <div class="divide-y divide-slate-200">
                            ${items.map((order) => renderQueueCard(order, busyVehicleId)).join('')}
                        </div>
                        ${renderPaginationBar(ordersPage)}
                    `}
                </div>
            </div>
        `;

        bindEvents();
    }

    function renderQueueCard(order, activeBusyVehicleId) {
        const payStatus = order.pembayaran?.status_pembayaran || 'belum_dibayar';
        const vehicles = order.kendaraan || [];

        return `
            <div class="p-4 transition hover:bg-slate-50/70">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div class="space-y-1">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="font-mono text-sm font-bold text-slate-900">${escapeHtml(order.nomor_nota || `#${order.id_pesanan}`)}</span>
                            ${badgePesanan(order.status_pesanan)}
                            ${badgePembayaran(payStatus)}
                            ${order.pada_hari_libur ? '<span class="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">Hari Libur</span>' : ''}
                            ${order.di_luar_jam_operasional && !order.pada_hari_libur ? '<span class="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">Luar Jam</span>' : ''}
                        </div>
                        <p class="text-xs text-slate-500">
                            Dibuat: ${escapeHtml(formatDateTimeWib(order.waktu_pesanan))} • Kasir: ${escapeHtml(order.pengguna?.nama_lengkap || '-')}
                        </p>
                        ${order.catatan ? `<p class="text-xs text-slate-700"><span class="font-semibold">Catatan:</span> ${escapeHtml(order.catatan)}</p>` : ''}
                    </div>
                    <div class="flex flex-wrap items-center gap-2 lg:justify-end">
                        <span class="mr-2 text-base font-bold text-slate-900 tabular-nums">${escapeHtml(formatRupiah(order.total_harga))}</span>
                        <button
                            type="button"
                            data-open-order="${order.id_pesanan}"
                            data-open-tab="detail"
                            class="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                            Detail / Edit
                        </button>
                        ${payStatus !== 'sudah_dibayar' ? `
                            <button
                                type="button"
                                data-open-order="${order.id_pesanan}"
                                data-open-tab="payment"
                                class="rounded-xl bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                            >
                                Bayar
                            </button>
                        ` : ''}
                    </div>
                </div>

                <div class="mt-3 grid gap-2 sm:grid-cols-2">
                    ${vehicles.map((veh) => {
                        const isBusy = activeBusyVehicleId === veh.id_kendaraan_pesanan;
                        const servicesSummary = (veh.detail_layanan || [])
                            .map((d) => d.nama_layanan_snapshot || d.harga_layanan?.layanan?.nama_layanan || 'Layanan')
                            .join(', ');

                        return `
                            <div class="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                                <div class="flex items-start justify-between gap-2">
                                    <div>
                                        <p class="text-xs font-semibold text-slate-900">
                                            ${escapeHtml(veh.nama_kategori_snapshot || 'Kendaraan')}
                                            ${veh.plat_nomor ? `<span class="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">${escapeHtml(veh.plat_nomor)}</span>` : '<span class="ml-1 text-[11px] font-normal text-slate-400">(tanpa plat)</span>'}
                                        </p>
                                        <p class="mt-0.5 text-[11px] text-slate-600">${escapeHtml(servicesSummary)}</p>
                                    </div>
                                    ${badgeKendaraan(veh.status_proses)}
                                </div>
                                <div class="flex flex-wrap gap-1.5">
                                    ${['menunggu', 'proses', 'selesai'].map((targetStatus) => {
                                        const isCurrent = veh.status_proses === targetStatus;
                                        const labelMap = { menunggu: 'Menunggu', proses: 'Proses', selesai: 'Selesai' };
                                        return `
                                            <button
                                                type="button"
                                                data-veh-id="${veh.id_kendaraan_pesanan}"
                                                data-veh-status="${targetStatus}"
                                                data-order-id="${order.id_pesanan}"
                                                ${isCurrent || isBusy ? 'disabled' : ''}
                                                class="rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                                                    isCurrent
                                                        ? 'bg-slate-800 text-white'
                                                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50'
                                                }"
                                            >
                                                ${labelMap[targetStatus]}
                                            </button>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function renderPaginationBar(paginator) {
        if (!paginator || (paginator.last_page ?? 1) <= 1) {
            return '';
        }

        return `
            <div class="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                <span>Halaman ${paginator.current_page} dari ${paginator.last_page} (${paginator.total} pesanan aktif)</span>
                <div class="flex gap-2">
                    <button
                        type="button"
                        data-dash-page="${paginator.current_page - 1}"
                        ${paginator.current_page <= 1 ? 'disabled' : ''}
                        class="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                        Sebelumnya
                    </button>
                    <button
                        type="button"
                        data-dash-page="${paginator.current_page + 1}"
                        ${paginator.current_page >= paginator.last_page ? 'disabled' : ''}
                        class="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                        Berikutnya
                    </button>
                </div>
            </div>
        `;
    }

    function bindEvents() {
        container.querySelector('#dash-create-order-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.ORDER_CREATE));
        container.querySelector('#dash-empty-create-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.ORDER_CREATE));
        container.querySelector('#dash-retry-btn')?.addEventListener('click', () => loadDashboard());
        container.querySelector('#dash-reset-filter-btn')?.addEventListener('click', () => {
            search = '';
            paymentFilter = '';
            currentPage = 1;
            loadDashboard();
        });
        container.querySelector('#dash-hours-link')?.addEventListener('click', () => navigateTo(APP_VIEWS.OPERATING_HOURS));

        container.querySelector('#dash-filter-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            search = container.querySelector('#dash-search-input')?.value?.trim() || '';
            paymentFilter = container.querySelector('#dash-payment-select')?.value || '';
            currentPage = 1;
            loadDashboard();
        });

        container.querySelectorAll('[data-open-order]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const orderId = Number(btn.getAttribute('data-open-order'));
                const tab = btn.getAttribute('data-open-tab') || 'detail';
                navigateTo(APP_VIEWS.ORDER_DETAIL, { orderId, tab });
            });
        });

        container.querySelectorAll('[data-veh-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const vehId = Number(btn.getAttribute('data-veh-id'));
                const nextStatus = btn.getAttribute('data-veh-status');
                const orderId = Number(btn.getAttribute('data-order-id'));
                const order = (ordersPage?.data || []).find((item) => Number(item.id_pesanan) === orderId);
                handleVehicleStep(vehId, nextStatus, order);
            });
        });

        container.querySelectorAll('[data-dash-page]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const nextPage = Number(btn.getAttribute('data-dash-page'));
                if (nextPage >= 1 && nextPage <= (ordersPage?.last_page || 1)) {
                    currentPage = nextPage;
                    loadDashboard();
                }
            });
        });
    }

    loadDashboard();
}
