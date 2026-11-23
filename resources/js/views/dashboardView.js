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
    iconSvg,
    renderEmptyState,
    renderErrorAlert,
    renderLoadingState,
    renderPageHeader,
    renderPaginationBar,
    todayWibDateString,
} from '../utils/formatters.js';

export function mountDashboardView(container) {
    let isLoading = true;
    let errorObj = null;
    let ordersPage = null;
    let summary = null;
    let scheduleStatus = null;
    let ownerTodayFinance = null;
    let search = '';
    let paymentFilter = '';
    let currentPage = 1;
    let busyVehicleId = null;

    async function loadDashboard() {
        isLoading = true;
        errorObj = null;
        render();

        try {
            const today = todayWibDateString();
            const requests = [
                washnoteApi.getOrders({
                    scope: 'dashboard',
                    search,
                    status_pembayaran: paymentFilter,
                    page: currentPage,
                    per_page: 10,
                }),
                washnoteApi.getOperatingStatus(),
            ];

            if (isOwner()) {
                requests.push(washnoteApi.getReportSummary({ tanggal_mulai: today, tanggal_akhir: today }));
            }

            const [ordersRes, statusRes, reportRes] = await Promise.all(requests);

            ordersPage = ordersRes?.data || null;
            summary = ordersRes?.ringkasan || null;
            scheduleStatus = statusRes?.data || null;
            ownerTodayFinance = reportRes?.data || null;
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

    function renderOwnerFinancialOverview() {
        if (!isOwner() || !ownerTodayFinance) {
            return '';
        }

        const selisih = Number(ownerTodayFinance.keuntungan_bersih ?? 0);
        const selisihPrefix = selisih > 0 ? '+ ' : selisih < 0 ? '- ' : '';

        return `
            <div class="grid gap-4 xl:grid-cols-3">
                <div class="wn-card p-5 xl:col-span-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <h2 class="text-sm font-bold text-ink">Ringkasan Finansial Hari Ini (WIB)</h2>
                        <span class="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary">Berdasarkan Transaksi Lunas</span>
                    </div>

                    <div class="mt-3 grid gap-3 sm:grid-cols-3">
                        <div class="rounded-xl border border-border-subtle bg-app-bg p-3.5">
                            <p class="text-xs font-medium text-ink-muted">Pendapatan</p>
                            <p class="mt-1 whitespace-nowrap text-lg font-bold text-success tabular-nums">${escapeHtml(formatRupiah(ownerTodayFinance.total_pendapatan))}</p>
                        </div>
                        <div class="rounded-xl border border-border-subtle bg-app-bg p-3.5">
                            <p class="text-xs font-medium text-ink-muted">Pengeluaran Aktif</p>
                            <p class="mt-1 whitespace-nowrap text-lg font-bold text-danger tabular-nums">${escapeHtml(formatRupiah(ownerTodayFinance.total_pengeluaran))}</p>
                        </div>
                        <div class="wn-card-navy p-3.5">
                            <p class="text-xs font-medium text-blue-100/90">Selisih Pendapatan & Pengeluaran</p>
                            <p class="mt-1 whitespace-nowrap text-lg font-bold tabular-nums">${escapeHtml(`${selisihPrefix}${formatRupiah(Math.abs(selisih))}`)}</p>
                        </div>
                    </div>
                </div>

                <div class="wn-card flex flex-col justify-between p-5">
                    <div class="flex items-center justify-between">
                        <h2 class="text-sm font-bold text-ink">Pintasan Manajemen</h2>
                    </div>
                    <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
                        <button type="button" data-dash-nav="${APP_VIEWS.ORDERS}" class="wn-btn-secondary min-w-0 justify-start gap-2 px-3 text-xs">
                            ${iconSvg('receipt', 'h-3.5 w-3.5 text-primary')}
                            <span class="truncate">Riwayat</span>
                        </button>
                        <button type="button" data-dash-nav="${APP_VIEWS.OWNER_FINANCE}" class="wn-btn-secondary min-w-0 justify-start gap-2 px-3 text-xs">
                            ${iconSvg('chart', 'h-3.5 w-3.5 text-primary')}
                            <span class="truncate">Laporan</span>
                        </button>
                        <button type="button" data-dash-nav="${APP_VIEWS.OWNER_CATALOG}" class="wn-btn-secondary min-w-0 justify-start gap-2 px-3 text-xs">
                            ${iconSvg('tag', 'h-3.5 w-3.5 text-primary')}
                            <span class="truncate">Katalog</span>
                        </button>
                        <button type="button" data-dash-nav="${APP_VIEWS.OWNER_STAFF}" class="wn-btn-secondary min-w-0 justify-start gap-2 px-3 text-xs">
                            ${iconSvg('users', 'h-3.5 w-3.5 text-primary')}
                            <span class="truncate">Akun Kasir</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function render() {
        const items = ordersPage?.data || [];
        const warnings = scheduleStatus?.warnings || [];
        const hasFilter = search !== '' || paymentFilter !== '';
        const ownerMode = isOwner();

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({
                    title: ownerMode ? 'Beranda Owner' : 'Beranda Kasir',
                    actionsHtml: `
                        <button id="dash-create-order-btn" type="button" class="wn-btn-primary gap-1.5">
                            ${iconSvg('plus', 'h-4 w-4')}
                            <span>Buat Pesanan</span>
                        </button>
                    `,
                })}

                ${scheduleStatus ? `
                    <div class="wn-card px-4 py-3">
                        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div class="flex flex-wrap items-center gap-2.5">
                                <span class="text-xs font-semibold text-ink-muted">${escapeHtml(formatDateFullIndo(scheduleStatus.tanggal))}</span>
                                ${badgeOperasional(scheduleStatus.status_jam_operasional)}
                            </div>
                            <button
                                id="dash-hours-link"
                                type="button"
                                class="wn-link inline-flex min-h-[32px] items-center text-left text-xs sm:text-right"
                            >
                                ${ownerMode ? 'Kelola Jam Operasional →' : 'Lihat Jadwal →'}
                            </button>
                        </div>
                        ${warnings.length > 0 ? `
                            <p class="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
                                ${warnings.map((w) => escapeHtml(w)).join(' ')}
                            </p>
                        ` : ''}
                    </div>
                ` : ''}

                ${renderOwnerFinancialOverview()}

                ${summary ? `
                    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <div class="wn-card min-w-0 p-3.5 sm:p-4">
                            <div class="flex items-center justify-between gap-1 text-xs font-medium text-ink-muted">
                                <span>Antrean Aktif</span>
                                <span class="rounded-lg bg-app-bg p-1.5 text-brand-navy">${iconSvg('clock', 'h-4 w-4')}</span>
                            </div>
                            <p class="mt-2 text-2xl font-bold text-ink tabular-nums">${summary.antrean_aktif_total ?? 0}</p>
                            <p class="mt-1 text-xs text-ink-muted">Berjalan ${summary.berjalan_count ?? 0} • Selesai belum bayar ${summary.selesai_belum_dibayar_count ?? 0}</p>
                        </div>
                        <div class="wn-card min-w-0 p-3.5 sm:p-4">
                            <div class="flex items-center justify-between gap-1 text-xs font-medium text-ink-muted">
                                <span>Belum Dibayar</span>
                                <span class="rounded-lg bg-amber-50 p-1.5 text-warning">${iconSvg('wallet', 'h-4 w-4')}</span>
                            </div>
                            <p class="mt-2 text-2xl font-bold text-warning tabular-nums">${summary.belum_dibayar_count ?? 0}</p>
                            <p class="mt-1 text-xs text-ink-muted">Menunggu pelunasan</p>
                        </div>
                        <div class="wn-card min-w-0 p-3.5 sm:p-4">
                            <div class="flex items-center justify-between gap-1 text-xs font-medium text-ink-muted">
                                <span>Kendaraan Aktif</span>
                                <span class="rounded-lg bg-primary-soft p-1.5 text-primary">${iconSvg('car', 'h-4 w-4')}</span>
                            </div>
                            <p class="mt-2 text-lg font-bold text-ink tabular-nums">
                                ${summary.kendaraan_menunggu_count ?? 0} M • ${summary.kendaraan_proses_count ?? 0} P • ${summary.kendaraan_selesai_count ?? 0} S
                            </p>
                            <p class="mt-1 text-xs text-ink-muted">Menunggu / Proses / Selesai</p>
                        </div>
                        <div class="wn-card min-w-0 p-3.5 sm:p-4">
                            <div class="flex items-center justify-between gap-1 text-xs font-medium text-ink-muted">
                                <span>Pesanan Hari Ini (WIB)</span>
                                <span class="rounded-lg bg-green-50 p-1.5 text-success">${iconSvg('receipt', 'h-4 w-4')}</span>
                            </div>
                            <p class="mt-2 text-2xl font-bold text-success tabular-nums">${summary.hari_ini_total_pesanan ?? 0}</p>
                            <p class="mt-1 text-xs text-ink-muted">Selesai & lunas: ${summary.hari_ini_selesai_dibayar_count ?? 0}</p>
                        </div>
                    </div>
                ` : ''}

                <div class="wn-card overflow-hidden">
                    <div class="border-b border-border-subtle p-4">
                        <div class="mb-3 flex items-center justify-between">
                            <h2 class="text-sm font-bold text-ink">Antrean Aktif</h2>
                        </div>
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
                            <div class="sm:w-64">
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
                        <div class="divide-y divide-border-subtle">
                            ${items.map((order) => renderQueueCard(order, busyVehicleId)).join('')}
                        </div>
                        ${renderPaginationBar(ordersPage, 'data-dash-page', 'pesanan aktif')}
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
            <div class="p-4 transition hover:bg-app-bg/60">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div class="min-w-0 space-y-1">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="font-mono text-sm font-bold text-ink">${escapeHtml(order.nomor_nota || `#${order.id_pesanan}`)}</span>
                            ${badgePesanan(order.status_pesanan)}
                            ${badgePembayaran(payStatus)}
                            ${order.pada_hari_libur ? '<span class="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-danger">Hari Libur</span>' : ''}
                            ${order.di_luar_jam_operasional && !order.pada_hari_libur ? '<span class="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-warning">Luar Jam</span>' : ''}
                        </div>
                        <p class="text-xs text-ink-muted">
                            Dibuat: ${escapeHtml(formatDateTimeWib(order.waktu_pesanan))} • Kasir: ${escapeHtml(order.pengguna?.nama_lengkap || '-')}
                        </p>
                        ${order.catatan ? `<p class="text-xs text-ink"><span class="font-semibold">Catatan:</span> ${escapeHtml(order.catatan)}</p>` : ''}
                    </div>
                    <div class="flex flex-wrap items-center gap-2 lg:justify-end">
                        <span class="mr-2 text-base font-bold text-ink tabular-nums">${escapeHtml(formatRupiah(order.total_harga))}</span>
                        <button
                            type="button"
                            data-open-order="${order.id_pesanan}"
                            data-open-tab="detail"
                            class="inline-flex min-h-[36px] items-center rounded-xl border border-border-subtle bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-app-bg"
                        >
                            Detail / Edit
                        </button>
                        ${payStatus !== 'sudah_dibayar' ? `
                            <button
                                type="button"
                                data-open-order="${order.id_pesanan}"
                                data-open-tab="payment"
                                class="inline-flex min-h-[36px] items-center rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-hover"
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
                            <div class="flex flex-col justify-between gap-2.5 rounded-xl border border-border-subtle bg-app-bg/70 p-3">
                                <div class="flex items-start justify-between gap-2">
                                    <div class="min-w-0">
                                        <p class="text-xs font-semibold text-ink">
                                            ${escapeHtml(veh.nama_kategori_snapshot || 'Kendaraan')}
                                            ${veh.plat_nomor ? `<span class="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-ink">${escapeHtml(veh.plat_nomor)}</span>` : '<span class="ml-1 text-[11px] font-normal text-ink-muted">(tanpa plat)</span>'}
                                        </p>
                                        <p class="mt-0.5 text-[11px] text-ink-muted">${escapeHtml(servicesSummary)}</p>
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
                                                class="min-h-[34px] rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                                                    isCurrent
                                                        ? 'bg-brand-navy text-white'
                                                        : 'border border-border-subtle bg-surface text-ink hover:bg-primary-soft disabled:opacity-50'
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
        container.querySelectorAll('[data-dash-nav]').forEach((btn) => {
            btn.addEventListener('click', () => navigateTo(btn.getAttribute('data-dash-nav')));
        });

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
