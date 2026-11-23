import { generateIdempotencyKey, washnoteApi } from '../api/client.js';
import { showToast } from '../state/store.js';
import {
    badgeStatusAktif,
    escapeHtml,
    formatDateIndo,
    formatDateOnly,
    formatRupiah,
    renderEmptyState,
    renderErrorAlert,
    renderLoadingState,
    renderPageHeader,
    renderPaginationBar,
    todayWibDateString,
} from '../utils/formatters.js';

export function mountOwnerFinanceView(container) {
    let activeTab = 'reports';
    let isLoading = true;
    let isSubmitting = false;
    let errorObj = null;

    const today = todayWibDateString();
    let reportStart = today;
    let reportEnd = today;
    let reportSummary = null;
    let reportDaily = [];

    let expenseCategories = [];
    let expensesPage = null;
    let currentExpPage = 1;
    let expenseStatusFilter = 'all';
    let expIdempotencyKey = generateIdempotencyKey();
    let editingExpId = null;
    let cancellingExpId = null;
    let editingExpCatId = null;

    async function loadAll() {
        isLoading = true;
        errorObj = null;
        render();

        try {
            const [sumRes, dailyRes, expCatRes, expRes] = await Promise.all([
                washnoteApi.getReportSummary({ tanggal_mulai: reportStart, tanggal_akhir: reportEnd }),
                washnoteApi.getReportDaily({ tanggal_mulai: reportStart, tanggal_akhir: reportEnd }),
                washnoteApi.getExpenseCategories(),
                washnoteApi.getExpenses({ page: currentExpPage }),
            ]);

            reportSummary = sumRes?.data || null;
            reportDaily = dailyRes?.data || [];
            expenseCategories = expCatRes?.data || [];
            expensesPage = expRes?.data || null;
        } catch (err) {
            errorObj = err;
        } finally {
            isLoading = false;
            render();
        }
    }

    function render() {
        const hasAnyData = Boolean(reportSummary) || reportDaily.length > 0 || expenseCategories.length > 0 || (expensesPage?.data || []).length > 0;

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({ title: 'Pengeluaran & Laporan' })}

                ${errorObj && hasAnyData ? renderErrorAlert(errorObj) : ''}

                <div class="flex flex-wrap gap-2 border-b border-border-subtle pb-2">
                    ${[
                        ['reports', 'Laporan Harian'],
                        ['expenses', 'Pengeluaran'],
                        ['categories', 'Kategori Pengeluaran'],
                    ].map(([tab, label]) => `
                        <button type="button" data-fin-tab="${tab}" class="min-h-[38px] rounded-lg px-3.5 py-2 text-xs font-semibold transition ${activeTab === tab ? 'bg-brand-navy text-white shadow-xs' : 'bg-surface text-ink-muted ring-1 ring-border-subtle hover:bg-app-bg hover:text-ink'}">
                            ${escapeHtml(label)}
                        </button>
                    `).join('')}
                </div>

                ${isLoading ? `<div class="wn-card">${renderLoadingState('Memuat data keuangan...')}</div>` : errorObj && !hasAnyData ? `
                    ${renderEmptyState({
                        kind: 'error',
                        title: 'Gagal memuat data keuangan',
                        message: errorObj.message || 'Terjadi kendala saat mengambil laporan.',
                        actionsHtml: '<button id="fin-retry-btn" type="button" class="wn-btn-secondary">Coba Lagi</button>',
                    })}
                ` : ''}
                ${!isLoading && !(errorObj && !hasAnyData) && activeTab === 'reports' ? renderReportsTab() : ''}
                ${!isLoading && !(errorObj && !hasAnyData) && activeTab === 'expenses' ? renderExpensesTab() : ''}
                ${!isLoading && !(errorObj && !hasAnyData) && activeTab === 'categories' ? renderExpenseCategoriesTab() : ''}
            </div>
        `;

        bindEvents();
    }

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

    function renderReportsTab() {
        const hasPeriodActivity = reportDaily.some(
            (d) => Number(d.jumlah_kendaraan ?? 0) > 0 || Number(d.pendapatan ?? 0) > 0 || Number(d.pengeluaran ?? 0) > 0
        );
        const selisih = Number(reportSummary?.keuntungan_bersih ?? 0);
        const selisihSign = selisih > 0 ? '+ ' : selisih < 0 ? '- ' : '';

        return `
            <div class="space-y-5">
                <form id="report-filter-form" class="wn-card flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
                    <div class="grid gap-3 sm:grid-cols-3 sm:items-end">
                        <div>
                            <label for="rep-start" class="wn-label">Tanggal Mulai</label>
                            <input id="rep-start" type="date" required value="${escapeHtml(reportStart)}" class="wn-input" />
                        </div>
                        <div>
                            <label for="rep-end" class="wn-label">Tanggal Akhir</label>
                            <input id="rep-end" type="date" required value="${escapeHtml(reportEnd)}" class="wn-input" />
                        </div>
                        <button type="submit" class="wn-btn-primary w-full sm:w-auto">Tampilkan Laporan</button>
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5">
                        <button type="button" data-rep-preset="today" class="wn-btn-secondary min-h-[36px] flex-1 px-3 py-1.5 text-xs sm:flex-none">Hari Ini</button>
                        <button type="button" data-rep-preset="7d" class="wn-btn-secondary min-h-[36px] flex-1 px-3 py-1.5 text-xs sm:flex-none">7 Hari</button>
                        <button type="button" data-rep-preset="month" class="wn-btn-secondary min-h-[36px] flex-1 px-3 py-1.5 text-xs sm:flex-none">Bulan Ini</button>
                    </div>
                </form>

                ${reportSummary ? `
                    <div class="grid gap-4 lg:grid-cols-3">
                        <div class="wn-card-navy p-5">
                            <p class="text-xs font-medium text-blue-100/90">Selisih Pendapatan & Pengeluaran</p>
                            <p class="mt-2 text-2xl font-bold tabular-nums">${escapeHtml(`${selisihSign}${formatRupiah(Math.abs(selisih))}`)}</p>
                            <p class="mt-1 text-xs text-blue-100/80">Pendapatan lunas dikurangi pengeluaran aktif (${escapeHtml(formatDateIndo(reportStart))} – ${escapeHtml(formatDateIndo(reportEnd))})</p>
                        </div>

                        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-2">
                            <div class="wn-card p-4">
                                <p class="text-xs font-medium text-ink-muted">Total Pendapatan</p>
                                <p class="mt-2 text-xl font-bold text-success tabular-nums">${escapeHtml(formatRupiah(reportSummary.total_pendapatan))}</p>
                                <p class="mt-1 text-xs text-ink-muted">Berdasarkan pembayaran lunas</p>
                            </div>
                            <div class="wn-card p-4">
                                <p class="text-xs font-medium text-ink-muted">Total Pengeluaran Aktif</p>
                                <p class="mt-2 text-xl font-bold text-danger tabular-nums">${escapeHtml(formatRupiah(reportSummary.total_pengeluaran))}</p>
                                <p class="mt-1 text-xs text-ink-muted">Pengeluaran batal dikecualikan</p>
                            </div>
                            <div class="wn-card p-4">
                                <p class="text-xs font-medium text-ink-muted">Jumlah Kendaraan</p>
                                <p class="mt-2 text-xl font-bold text-ink tabular-nums">${reportSummary.jumlah_kendaraan ?? 0}</p>
                                <p class="mt-1 text-xs text-ink-muted">Transaksi aktif non-batal</p>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <div class="wn-card overflow-hidden">
                    <div class="border-b border-border-subtle px-4 py-3 text-sm font-bold text-ink">Rincian Harian (WIB)</div>
                    ${reportDaily.length === 0 || !hasPeriodActivity ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: reportStart !== today || reportEnd !== today ? 'filtered' : 'empty',
                                title: 'Belum ada aktivitas keuangan pada periode ini',
                                message: `Periode ${formatDateIndo(reportStart)} – ${formatDateIndo(reportEnd)} belum memiliki transaksi atau pengeluaran.`,
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

    function renderExpensesTab() {
        const allRows = expensesPage?.data || [];
        const rows = allRows.filter((exp) => {
            if (expenseStatusFilter === 'aktif') {
                return exp.status_pengeluaran !== 'dibatalkan';
            }
            if (expenseStatusFilter === 'dibatalkan') {
                return exp.status_pengeluaran === 'dibatalkan';
            }
            return true;
        });
        const activeCategories = expenseCategories.filter((c) => c.status_aktif);
        const editing = editingExpId ? allRows.find((r) => Number(r.id_pengeluaran) === Number(editingExpId)) : null;
        const cancelling = cancellingExpId ? allRows.find((r) => Number(r.id_pengeluaran) === Number(cancellingExpId)) : null;

        return `
            <div class="grid gap-6 lg:grid-cols-3">
                <div class="wn-card overflow-hidden lg:col-span-2">
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
                        <div class="inline-flex flex-wrap gap-1 rounded-lg bg-app-bg p-1 text-xs font-semibold">
                            ${[
                                ['all', `Semua (${allRows.length})`],
                                ['aktif', `Aktif (${allRows.filter((r) => r.status_pengeluaran !== 'dibatalkan').length})`],
                                ['dibatalkan', `Dibatalkan (${allRows.filter((r) => r.status_pengeluaran === 'dibatalkan').length})`],
                            ].map(([st, label]) => `
                                <button type="button" data-exp-status="${st}" class="min-h-[32px] rounded-md px-3 py-1 transition ${expenseStatusFilter === st ? 'bg-surface text-ink shadow-xs' : 'text-ink-muted hover:text-ink'}">
                                    ${escapeHtml(label)}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    ${allRows.length === 0 ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'empty',
                                title: 'Belum ada catatan pengeluaran',
                            })}
                        </div>
                    ` : rows.length === 0 ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'filtered',
                                title: 'Tidak ada pengeluaran pada status ini',
                                actionsHtml: '<button type="button" data-exp-status="all" class="wn-btn-secondary text-xs">Tampilkan Semua</button>',
                            })}
                        </div>
                    ` : `
                        <div class="divide-y divide-border-subtle md:hidden">
                            ${rows.map((exp) => {
                                const isVoid = exp.status_pengeluaran === 'dibatalkan';
                                return `
                                    <div class="space-y-2 p-4">
                                        <div class="flex items-start justify-between gap-2">
                                            <div class="min-w-0">
                                                <div class="font-semibold ${isVoid ? 'text-ink-muted line-through' : 'text-ink'}">${escapeHtml(exp.deskripsi)}</div>
                                                <div class="text-xs text-ink-muted">${escapeHtml(formatDateIndo(exp.tanggal_pengeluaran))} • ${escapeHtml(exp.kategori?.nama_kategori || '-')} • ${escapeHtml(exp.pengguna?.nama_lengkap || '-')}</div>
                                            </div>
                                            <div class="text-right font-bold tabular-nums ${isVoid ? 'text-ink-muted line-through' : 'text-danger'}">
                                                ${isVoid ? escapeHtml(formatRupiah(exp.nominal)) : `- ${escapeHtml(formatRupiah(exp.nominal))}`}
                                            </div>
                                        </div>
                                        <div class="flex flex-wrap items-center justify-between gap-2">
                                            ${isVoid ? '<span class="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-danger ring-1 ring-inset ring-red-600/20">Dibatalkan</span>' : badgeStatusAktif(true)}
                                            ${!isVoid ? `
                                                <div class="flex flex-wrap gap-2">
                                                    <button type="button" data-edit-exp="${exp.id_pengeluaran}" class="wn-link inline-flex min-h-[34px] items-center rounded-md border border-primary-border bg-primary-soft px-3 text-xs">Ubah</button>
                                                    <button type="button" data-cancel-exp="${exp.id_pengeluaran}" class="inline-flex min-h-[34px] items-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-danger hover:bg-red-100">Batalkan</button>
                                                </div>
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
                                        <th class="px-4 py-3">Tanggal & Deskripsi</th>
                                        <th class="px-4 py-3">Kategori</th>
                                        <th class="px-4 py-3 text-right">Nominal</th>
                                        <th class="px-4 py-3">Status</th>
                                        <th class="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-border-subtle">
                                    ${rows.map((exp) => {
                                        const isVoid = exp.status_pengeluaran === 'dibatalkan';
                                        return `
                                            <tr class="hover:bg-app-bg/50">
                                                <td class="px-4 py-3">
                                                    <div class="font-semibold ${isVoid ? 'text-ink-muted line-through' : 'text-ink'}">${escapeHtml(exp.deskripsi)}</div>
                                                    <div class="text-xs text-ink-muted">${escapeHtml(formatDateIndo(exp.tanggal_pengeluaran))} • ${escapeHtml(exp.pengguna?.nama_lengkap || '-')}</div>
                                                </td>
                                                <td class="px-4 py-3 text-xs text-ink-muted">${escapeHtml(exp.kategori?.nama_kategori || '-')}</td>
                                                <td class="px-4 py-3 text-right font-bold tabular-nums ${isVoid ? 'text-ink-muted line-through' : 'text-danger'}">
                                                    ${isVoid ? escapeHtml(formatRupiah(exp.nominal)) : `- ${escapeHtml(formatRupiah(exp.nominal))}`}
                                                </td>
                                                <td class="px-4 py-3">
                                                    ${isVoid ? '<span class="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-danger ring-1 ring-inset ring-red-600/20">Dibatalkan</span>' : badgeStatusAktif(true)}
                                                </td>
                                                <td class="px-4 py-3 text-right space-x-2.5 whitespace-nowrap">
                                                    ${!isVoid ? `
                                                        <button type="button" data-edit-exp="${exp.id_pengeluaran}" class="wn-link text-xs">Ubah</button>
                                                        <button type="button" data-cancel-exp="${exp.id_pengeluaran}" class="text-xs font-semibold text-danger hover:text-red-800">Batalkan</button>
                                                    ` : '-'}
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                        ${renderPaginationBar(expensesPage, 'data-exp-page', 'pengeluaran')}
                    `}
                </div>

                <div>
                    ${cancelling ? `
                        <form id="exp-cancel-form" class="space-y-3.5 rounded-xl border border-red-200 bg-surface p-5">
                            <div class="flex items-center justify-between">
                                <h3 class="text-sm font-bold text-danger">Batalkan Pengeluaran</h3>
                                <button type="button" id="exp-reset-mode" class="text-xs font-medium text-ink-muted hover:text-ink">Batal</button>
                            </div>
                            <p class="text-xs text-ink-muted">${escapeHtml(cancelling.deskripsi)} (${escapeHtml(formatRupiah(cancelling.nominal))})</p>
                            <div>
                                <label for="exp-cancel-reason" class="wn-label">Alasan Pembatalan <span class="text-danger">*</span> <span class="font-normal text-ink-muted">(Min. 5 karakter)</span></label>
                                <input id="exp-cancel-reason" type="text" required minlength="5" class="wn-input" />
                            </div>
                            <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-danger w-full">Batalkan (Soft Void)</button>
                        </form>
                    ` : activeCategories.length === 0 ? `
                        ${renderEmptyState({
                            kind: 'prerequisite',
                            title: 'Kategori pengeluaran belum tersedia',
                            message: 'Aktifkan minimal 1 kategori pengeluaran sebelum mencatat pengeluaran.',
                            actionsHtml: '<button type="button" data-fin-tab="categories" class="wn-btn-primary text-xs">Buka Kategori Pengeluaran</button>',
                        })}
                    ` : `
                        <form id="exp-form" class="wn-card space-y-3.5 p-5">
                            <div class="flex items-center justify-between">
                                <h3 class="text-sm font-bold text-ink">${editing ? 'Ubah Pengeluaran' : 'Catat Pengeluaran'}</h3>
                                ${editing ? '<button type="button" id="exp-reset-mode" class="text-xs font-medium text-ink-muted hover:text-ink">Batal</button>' : ''}
                            </div>
                            <div>
                                <label for="exp-cat" class="wn-label">Kategori <span class="text-danger">*</span></label>
                                <select id="exp-cat" required class="wn-select">
                                    ${activeCategories.map((c) => `<option value="${c.id_kategori_pengeluaran}" ${Number(editing?.id_kategori_pengeluaran) === Number(c.id_kategori_pengeluaran) ? 'selected' : ''}>${escapeHtml(c.nama_kategori)}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label for="exp-date" class="wn-label">Tanggal <span class="text-danger">*</span></label>
                                <input id="exp-date" type="date" required value="${escapeHtml(editing ? formatDateOnly(editing.tanggal_pengeluaran) : today)}" class="wn-input" />
                            </div>
                            <div>
                                <label for="exp-desc" class="wn-label">Deskripsi <span class="text-danger">*</span></label>
                                <input id="exp-desc" type="text" required value="${escapeHtml(editing?.deskripsi || '')}" placeholder="Contoh: Sabun cuci motor 5L" class="wn-input" />
                            </div>
                            <div>
                                <label for="exp-nominal" class="wn-label">Nominal (Rp) <span class="text-danger">*</span></label>
                                <input id="exp-nominal" type="number" min="1" step="1" required value="${escapeHtml(editing ? Number(editing.nominal) : '')}" class="wn-input tabular-nums" />
                            </div>
                            <div class="rounded-lg bg-app-bg px-3 py-2 text-xs">
                                <div class="flex items-center justify-between text-ink-muted">
                                    <span>Dampak Kas Harian</span>
                                    <span id="exp-preview-nominal" class="font-bold text-danger tabular-nums">${editing ? `- ${escapeHtml(formatRupiah(editing.nominal))}` : '- Rp 0'}</span>
                                </div>
                            </div>
                            ${editing ? `
                                <div>
                                    <label for="exp-reason" class="wn-label">Alasan Perubahan <span class="text-danger">*</span> <span class="font-normal text-ink-muted">(Min. 5 karakter)</span></label>
                                    <input id="exp-reason" type="text" required minlength="5" class="wn-input" />
                                </div>
                            ` : ''}
                            <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary w-full">
                                ${editing ? 'Simpan Perubahan' : 'Simpan Pengeluaran'}
                            </button>
                        </form>
                    `}
                </div>
            </div>
        `;
    }

    function renderExpenseCategoriesTab() {
        const editing = editingExpCatId ? expenseCategories.find((c) => Number(c.id_kategori_pengeluaran) === Number(editingExpCatId)) : null;

        return `
            <div class="grid gap-6 lg:grid-cols-3">
                <div class="wn-card overflow-hidden lg:col-span-2">
                    ${expenseCategories.length === 0 ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'empty',
                                title: 'Belum ada kategori pengeluaran',
                                message: 'Tambahkan kategori melalui formulir di samping.',
                            })}
                        </div>
                    ` : `
                        <div class="divide-y divide-border-subtle md:hidden">
                            ${expenseCategories.map((c) => `
                                <div class="flex flex-col gap-2 p-4">
                                    <div class="flex items-start justify-between gap-2">
                                        <span class="font-semibold text-ink">${escapeHtml(c.nama_kategori)}</span>
                                        ${badgeStatusAktif(Boolean(c.status_aktif))}
                                    </div>
                                    <div class="flex flex-wrap gap-2">
                                        <button type="button" data-edit-expcat="${c.id_kategori_pengeluaran}" class="wn-link inline-flex min-h-[34px] items-center rounded-md border border-primary-border bg-primary-soft px-3 text-xs">Ubah</button>
                                        ${c.status_aktif ? `<button type="button" data-del-expcat="${c.id_kategori_pengeluaran}" class="inline-flex min-h-[34px] items-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-danger hover:bg-red-100">Nonaktifkan</button>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="hidden overflow-x-auto md:block">
                            <table class="min-w-full divide-y divide-border-subtle text-left text-sm">
                                <thead class="bg-app-bg text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                    <tr>
                                        <th class="px-4 py-3">Nama Kategori</th>
                                        <th class="px-4 py-3">Status</th>
                                        <th class="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-border-subtle">
                                    ${expenseCategories.map((c) => `
                                        <tr class="hover:bg-app-bg/50">
                                            <td class="px-4 py-3 font-semibold text-ink">${escapeHtml(c.nama_kategori)}</td>
                                            <td class="px-4 py-3">${badgeStatusAktif(Boolean(c.status_aktif))}</td>
                                            <td class="px-4 py-3 text-right space-x-2.5">
                                                <button type="button" data-edit-expcat="${c.id_kategori_pengeluaran}" class="wn-link text-xs">Ubah</button>
                                                ${c.status_aktif ? `<button type="button" data-del-expcat="${c.id_kategori_pengeluaran}" class="text-xs font-semibold text-danger hover:text-red-800">Nonaktifkan</button>` : ''}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>

                <form id="expcat-form" class="wn-card space-y-3.5 self-start p-5">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-ink">${editing ? 'Ubah Kategori' : 'Tambah Kategori'}</h3>
                        ${editing ? '<button type="button" id="cancel-expcat-edit" class="text-xs font-medium text-ink-muted hover:text-ink">Batal</button>' : ''}
                    </div>
                    <div>
                        <label for="expcat-nama" class="wn-label">Nama Kategori</label>
                        <input id="expcat-nama" type="text" required value="${escapeHtml(editing?.nama_kategori || '')}" class="wn-input" />
                    </div>
                    <label class="flex items-center gap-2 text-xs text-ink">
                        <input id="expcat-aktif" type="checkbox" ${(editing ? editing.status_aktif : true) ? 'checked' : ''} class="wn-checkbox" />
                        <span>Status Aktif</span>
                    </label>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary w-full">Simpan Kategori</button>
                </form>
            </div>
        `;
    }

    function bindEvents() {
        container.querySelector('#fin-retry-btn')?.addEventListener('click', loadAll);
        container.querySelectorAll('[data-fin-tab]').forEach((btn) =>
            btn.addEventListener('click', () => {
                activeTab = btn.getAttribute('data-fin-tab');
                errorObj = null;
                render();
            })
        );

        container.querySelector('#report-filter-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            reportStart = container.querySelector('#rep-start')?.value || today;
            reportEnd = container.querySelector('#rep-end')?.value || today;
            loadAll();
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
                loadAll();
            })
        );

        container.querySelectorAll('[data-exp-status]').forEach((btn) =>
            btn.addEventListener('click', () => {
                expenseStatusFilter = btn.getAttribute('data-exp-status') || 'all';
                render();
            })
        );

        container.querySelector('#exp-nominal')?.addEventListener('input', (e) => {
            const previewEl = container.querySelector('#exp-preview-nominal');
            if (previewEl) {
                const val = Number(e.target.value || 0);
                previewEl.textContent = val > 0 ? `- ${formatRupiah(val)}` : '- Rp 0';
            }
        });

        container.querySelectorAll('[data-edit-exp]').forEach((b) =>
            b.addEventListener('click', () => {
                editingExpId = Number(b.getAttribute('data-edit-exp'));
                cancellingExpId = null;
                render();
            })
        );
        container.querySelectorAll('[data-cancel-exp]').forEach((b) =>
            b.addEventListener('click', () => {
                cancellingExpId = Number(b.getAttribute('data-cancel-exp'));
                editingExpId = null;
                render();
            })
        );
        container.querySelector('#exp-reset-mode')?.addEventListener('click', () => {
            editingExpId = null;
            cancellingExpId = null;
            render();
        });

        container.querySelector('#exp-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                id_kategori_pengeluaran: Number(container.querySelector('#exp-cat')?.value),
                tanggal_pengeluaran: container.querySelector('#exp-date')?.value,
                deskripsi: container.querySelector('#exp-desc')?.value?.trim(),
                nominal: Number(container.querySelector('#exp-nominal')?.value),
            };
            if (editingExpId) {
                payload.alasan = container.querySelector('#exp-reason')?.value?.trim() || '';
            }
            isSubmitting = true;
            errorObj = null;
            render();
            try {
                if (editingExpId) {
                    await washnoteApi.updateExpense(editingExpId, payload);
                    showToast('Pengeluaran diperbarui.', 'success');
                    editingExpId = null;
                } else {
                    await washnoteApi.createExpense(payload, expIdempotencyKey);
                    expIdempotencyKey = generateIdempotencyKey();
                    showToast('Pengeluaran berhasil dicatat.', 'success');
                }
                isSubmitting = false;
                await loadAll();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });

        container.querySelector('#exp-cancel-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const alasan = container.querySelector('#exp-cancel-reason')?.value?.trim() || '';
            isSubmitting = true;
            errorObj = null;
            render();
            try {
                await washnoteApi.cancelExpense(cancellingExpId, { alasan });
                showToast('Pengeluaran berhasil dibatalkan.', 'success');
                cancellingExpId = null;
                isSubmitting = false;
                await loadAll();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });

        container.querySelectorAll('[data-exp-page]').forEach((b) =>
            b.addEventListener('click', () => {
                const next = Number(b.getAttribute('data-exp-page'));
                if (next >= 1 && next <= (expensesPage?.last_page || 1)) {
                    currentExpPage = next;
                    loadAll();
                }
            })
        );

        container.querySelectorAll('[data-edit-expcat]').forEach((b) =>
            b.addEventListener('click', () => {
                editingExpCatId = Number(b.getAttribute('data-edit-expcat'));
                render();
            })
        );
        container.querySelector('#cancel-expcat-edit')?.addEventListener('click', () => {
            editingExpCatId = null;
            render();
        });
        container.querySelectorAll('[data-del-expcat]').forEach((b) =>
            b.addEventListener('click', async () => {
                try {
                    await washnoteApi.deleteExpenseCategory(Number(b.getAttribute('data-del-expcat')));
                    showToast('Kategori pengeluaran dinonaktifkan.', 'success');
                    await loadAll();
                } catch (err) {
                    errorObj = err;
                    render();
                }
            })
        );

        container.querySelector('#expcat-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                nama_kategori: container.querySelector('#expcat-nama')?.value?.trim(),
                status_aktif: Boolean(container.querySelector('#expcat-aktif')?.checked),
            };
            isSubmitting = true;
            errorObj = null;
            render();
            try {
                if (editingExpCatId) {
                    await washnoteApi.updateExpenseCategory(editingExpCatId, payload);
                    showToast('Kategori pengeluaran diperbarui.', 'success');
                    editingExpCatId = null;
                } else {
                    await washnoteApi.createExpenseCategory(payload);
                    showToast('Kategori pengeluaran ditambahkan.', 'success');
                }
                isSubmitting = false;
                await loadAll();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });
    }

    loadAll();
}
