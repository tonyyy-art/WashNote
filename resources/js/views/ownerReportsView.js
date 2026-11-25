import { isAbortError, washnoteApi } from '../api/client.js';
import { createViewMotion } from '../motion/motionSystem.js';
import { APP_VIEWS, navigateBack, navigateTo } from '../state/store.js';
import {
    escapeHtml,
    formatDateIndo,
    formatRupiah,
    renderEmptyState,
    renderErrorAlert,
    renderLoadingState,
    renderPageHeader,
    todayWibDateString,
} from '../utils/formatters.js';

export function mountOwnerReportsView(container) {
    const motion = createViewMotion(container);
    const abortController = new AbortController();
    let isDisposed = false;
    let isLoading = true;
    let errorObj = null;

    const today = todayWibDateString();
    let reportStart = today;
    let reportEnd = today;
    let reportSummary = null;
    let reportDaily = [];

    function shiftWibDate(baseYmd, deltaDays) {
        const dt = new Date(`${baseYmd}T12:00:00+07:00`);
        dt.setDate(dt.getDate() + deltaDays);
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(dt);
    }

    async function loadReports() {
        isLoading = true;
        errorObj = null;
        render();

        let wasAborted = false;
        try {
            const [sumRes, dailyRes] = await Promise.all([
                washnoteApi.getReportSummary({ tanggal_mulai: reportStart, tanggal_akhir: reportEnd }, { signal: abortController.signal }),
                washnoteApi.getReportDaily({ tanggal_mulai: reportStart, tanggal_akhir: reportEnd }, { signal: abortController.signal }),
            ]);

            if (isDisposed) {
                return;
            }

            reportSummary = sumRes?.data || null;
            reportDaily = dailyRes?.data || [];
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

    function renderReportsBody() {
        const hasPeriodActivity = reportDaily.some(
            (d) => Number(d.jumlah_kendaraan ?? 0) > 0 || Number(d.pendapatan ?? 0) > 0 || Number(d.pengeluaran ?? 0) > 0
        );
        const selisih = Number(reportSummary?.keuntungan_bersih ?? 0);
        const selisihSign = selisih > 0 ? '+ ' : selisih < 0 ? '- ' : '';
        const dateLabel =
            reportStart === reportEnd
                ? formatDateIndo(reportStart)
                : `${formatDateIndo(reportStart)} – ${formatDateIndo(reportEnd)}`;

        return `
            <div class="space-y-5">
                <form id="report-filter-form" data-motion-card class="wn-card flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
                    <div class="grid gap-3 sm:grid-cols-3 sm:items-end">
                        <div class="min-w-0">
                            <label for="rep-start" class="wn-label">Tanggal Mulai</label>
                            <input id="rep-start" type="date" required value="${escapeHtml(reportStart)}" class="wn-input" />
                        </div>
                        <div class="min-w-0">
                            <label for="rep-end" class="wn-label">Tanggal Akhir</label>
                            <input id="rep-end" type="date" required value="${escapeHtml(reportEnd)}" class="wn-input" />
                        </div>
                        <button type="submit" class="wn-btn-primary w-full sm:w-auto">Tampilkan</button>
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5">
                        <button type="button" data-rep-preset="today" class="wn-btn-secondary min-h-[40px] sm:min-h-[36px] flex-1 px-3 py-1.5 text-xs sm:flex-none">Hari Ini</button>
                        <button type="button" data-rep-preset="7d" class="wn-btn-secondary min-h-[40px] sm:min-h-[36px] flex-1 px-3 py-1.5 text-xs sm:flex-none">7 Hari</button>
                        <button type="button" data-rep-preset="month" class="wn-btn-secondary min-h-[40px] sm:min-h-[36px] flex-1 px-3 py-1.5 text-xs sm:flex-none">Bulan Ini</button>
                    </div>
                </form>

                ${reportSummary ? `
                    <div class="grid gap-4 lg:grid-cols-3">
                        <div data-motion-card class="wn-card-navy wn-interactive-card flex flex-col justify-between p-5">
                            <div class="flex items-center justify-between gap-2">
                                <p class="text-xs font-medium text-blue-100/90">Selisih Pendapatan & Pengeluaran</p>
                                <span class="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-50">${escapeHtml(dateLabel)}</span>
                            </div>
                            <p class="mt-3 text-2xl font-bold tabular-nums sm:text-3xl">${escapeHtml(`${selisihSign}${formatRupiah(Math.abs(selisih))}`)}</p>
                        </div>

                        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-2">
                            <div data-motion-card class="wn-card wn-interactive-card flex flex-col justify-between p-4">
                                <p class="text-xs font-medium text-ink-muted">Total Pendapatan</p>
                                <p class="mt-2 text-xl font-bold text-success tabular-nums">${escapeHtml(formatRupiah(reportSummary.total_pendapatan))}</p>
                            </div>
                            <div data-motion-card class="wn-card wn-interactive-card flex flex-col justify-between p-4">
                                <p class="text-xs font-medium text-ink-muted">Total Pengeluaran</p>
                                <p class="mt-2 text-xl font-bold text-danger tabular-nums">${escapeHtml(formatRupiah(reportSummary.total_pengeluaran))}</p>
                            </div>
                            <div data-motion-card class="wn-card wn-interactive-card flex flex-col justify-between p-4">
                                <p class="text-xs font-medium text-ink-muted">Jumlah Kendaraan</p>
                                <p class="mt-2 text-xl font-bold text-ink tabular-nums">${reportSummary.jumlah_kendaraan ?? 0}</p>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <div data-motion-reveal class="wn-card overflow-hidden">
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
                        <h2 class="text-sm font-bold text-ink">Rincian Harian</h2>
                        <button id="rep-open-orders-btn" type="button" class="wn-link text-xs">Lihat Rincian Transaksi →</button>
                    </div>
                    ${reportDaily.length === 0 || !hasPeriodActivity ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: reportStart !== today || reportEnd !== today ? 'filtered' : 'empty',
                                title: 'Belum ada aktivitas keuangan pada periode ini',
                                message: `Periode ${dateLabel} belum memiliki transaksi atau pengeluaran.`,
                            })}
                        </div>
                    ` : `
                        <div class="divide-y divide-border-subtle md:hidden">
                            ${reportDaily.map((d) => `
                                <div class="space-y-2 p-4 text-xs">
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="font-bold text-ink">${escapeHtml(formatDateIndo(d.tanggal))}</span>
                                        <span class="rounded-full bg-app-bg px-2.5 py-0.5 font-semibold text-ink-muted tabular-nums">${d.jumlah_kendaraan ?? 0} kendaraan</span>
                                    </div>
                                    <div class="grid grid-cols-3 gap-2 rounded-lg bg-app-bg p-2.5">
                                        <div>
                                            <p class="text-[11px] text-ink-muted">Pendapatan</p>
                                            <p class="font-semibold text-success tabular-nums">${escapeHtml(formatRupiah(d.pendapatan))}</p>
                                        </div>
                                        <div>
                                            <p class="text-[11px] text-ink-muted">Pengeluaran</p>
                                            <p class="font-semibold text-danger tabular-nums">${escapeHtml(formatRupiah(d.pengeluaran))}</p>
                                        </div>
                                        <div class="text-right">
                                            <p class="text-[11px] text-ink-muted">Selisih</p>
                                            <p class="font-bold text-ink tabular-nums">${escapeHtml(formatRupiah(d.keuntungan_bersih))}</p>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="hidden overflow-x-auto md:block">
                            <table class="min-w-full divide-y divide-border-subtle text-left text-sm">
                                <thead class="bg-app-bg text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                    <tr>
                                        <th class="px-4 py-3">Tanggal</th>
                                        <th class="px-4 py-3 text-right">Kendaraan</th>
                                        <th class="px-4 py-3 text-right">Pendapatan</th>
                                        <th class="px-4 py-3 text-right">Pengeluaran</th>
                                        <th class="px-4 py-3 text-right">Selisih</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-border-subtle">
                                    ${reportDaily.map((d) => `
                                        <tr class="hover:bg-app-bg/50">
                                            <td class="px-4 py-3 text-xs font-semibold text-ink">${escapeHtml(formatDateIndo(d.tanggal))}</td>
                                            <td class="px-4 py-3 text-right tabular-nums">${d.jumlah_kendaraan ?? 0}</td>
                                            <td class="px-4 py-3 text-right font-medium text-success tabular-nums">${escapeHtml(formatRupiah(d.pendapatan))}</td>
                                            <td class="px-4 py-3 text-right font-medium text-danger tabular-nums">${escapeHtml(formatRupiah(d.pengeluaran))}</td>
                                            <td class="px-4 py-3 text-right font-bold text-ink tabular-nums">${escapeHtml(formatRupiah(d.keuntungan_bersih))}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    function render() {
        if (isDisposed) {
            return;
        }
        const hasAnyData = Boolean(reportSummary) || reportDaily.length > 0;

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({
                    backBtnId: 'rep-back-btn',
                    title: 'Laporan Keuangan',
                })}

                ${errorObj && hasAnyData ? renderErrorAlert(errorObj) : ''}

                ${isLoading ? `<div class="wn-card">${renderLoadingState('Memuat laporan keuangan...')}</div>` : errorObj && !hasAnyData ? `
                    ${renderEmptyState({
                        kind: 'error',
                        title: 'Gagal memuat laporan keuangan',
                        message: errorObj.message || 'Terjadi kendala saat mengambil laporan.',
                        actionsHtml: '<button id="rep-retry-btn" type="button" class="wn-btn-secondary">Coba Lagi</button>',
                    })}
                ` : renderReportsBody()}
            </div>
        `;

        bindEvents();
        if (!isLoading) {
            motion.refresh();
        }
    }

    function bindEvents() {
        container.querySelector('#rep-back-btn')?.addEventListener('click', () => navigateBack(APP_VIEWS.DASHBOARD));
        container.querySelector('#rep-retry-btn')?.addEventListener('click', loadReports);
        container.querySelector('#rep-open-orders-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.ORDERS));

        container.querySelector('#report-filter-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            reportStart = container.querySelector('#rep-start')?.value || today;
            reportEnd = container.querySelector('#rep-end')?.value || today;
            loadReports();
        });

        container.querySelectorAll('[data-rep-preset]').forEach((btn) =>
            btn.addEventListener('click', () => {
                const preset = btn.getAttribute('data-rep-preset');
                if (preset === 'today') {
                    reportStart = today;
                    reportEnd = today;
                } else if (preset === '7d') {
                    reportStart = shiftWibDate(today, -6);
                    reportEnd = today;
                } else if (preset === 'month') {
                    reportStart = `${today.slice(0, 8)}01`;
                    reportEnd = today;
                }
                loadReports();
            })
        );
    }

    loadReports();

    return () => {
        isDisposed = true;
        abortController.abort();
    };
}
