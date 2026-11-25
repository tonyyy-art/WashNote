import { generateIdempotencyKey, isAbortError, washnoteApi } from '../api/client.js';
import { createViewMotion, scrollToElement } from '../motion/motionSystem.js';
import { APP_VIEWS, navigateBack, navigateTo, showToast } from '../state/store.js';
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

export function mountOwnerExpensesView(container) {
    const motion = createViewMotion(container);
    const abortController = new AbortController();
    let isDisposed = false;
    let isLoading = true;
    let isSubmitting = false;
    let errorObj = null;

    const today = todayWibDateString();
    let expenseCategories = [];
    let expensesPage = null;
    let currentExpPage = 1;
    let expenseStatusFilter = 'all';
    let expIdempotencyKey = generateIdempotencyKey();
    let editingExpId = null;
    let cancellingExpId = null;

    async function loadExpenses() {
        isLoading = true;
        errorObj = null;
        render();

        let wasAborted = false;
        try {
            const [expCatRes, expRes] = await Promise.all([
                washnoteApi.getExpenseCategories({ signal: abortController.signal }),
                washnoteApi.getExpenses({ page: currentExpPage }, { signal: abortController.signal }),
            ]);

            if (isDisposed) {
                return;
            }

            expenseCategories = expCatRes?.data || [];
            expensesPage = expRes?.data || null;
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

    function renderContent() {
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
                <div data-motion-card class="wn-card min-w-0 overflow-hidden lg:col-span-2">
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
                        <div role="group" aria-label="Filter status pengeluaran" class="inline-flex flex-wrap gap-1 rounded-lg bg-app-bg p-1 text-xs font-semibold">
                            ${[
                                ['all', `Semua (${allRows.length})`],
                                ['aktif', `Aktif (${allRows.filter((r) => r.status_pengeluaran !== 'dibatalkan').length})`],
                                ['dibatalkan', `Dibatalkan (${allRows.filter((r) => r.status_pengeluaran === 'dibatalkan').length})`],
                            ].map(([st, label]) => `
                                <button type="button" data-exp-status="${st}" aria-pressed="${expenseStatusFilter === st ? 'true' : 'false'}" class="min-h-[40px] sm:min-h-[32px] rounded-md px-3 py-1 transition ${expenseStatusFilter === st ? 'bg-surface text-ink shadow-xs' : 'text-ink-muted hover:text-ink'}">
                                    ${escapeHtml(label)}
                                </button>
                            `).join('')}
                        </div>
                        ${activeCategories.length > 0 && !cancelling ? `
                            <button id="exp-jump-form-btn" type="button" class="wn-btn-primary min-h-[40px] sm:min-h-[34px] px-3 py-1.5 text-xs lg:hidden">+ Catat</button>
                        ` : ''}
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
                                            <div class="shrink-0 text-right font-bold tabular-nums ${isVoid ? 'text-ink-muted line-through' : 'text-danger'}">
                                                ${isVoid ? escapeHtml(formatRupiah(exp.nominal)) : `- ${escapeHtml(formatRupiah(exp.nominal))}`}
                                            </div>
                                        </div>
                                        <div class="flex flex-wrap items-center justify-between gap-2">
                                            ${isVoid ? '<span class="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-danger ring-1 ring-inset ring-red-600/20">Dibatalkan</span>' : badgeStatusAktif(true)}
                                            ${!isVoid ? `
                                                <div class="flex flex-wrap gap-2">
                                                    <button type="button" data-edit-exp="${exp.id_pengeluaran}" class="wn-link inline-flex min-h-[40px] items-center rounded-md border border-accent-border bg-accent-soft px-3 text-xs">Ubah</button>
                                                    <button type="button" data-cancel-exp="${exp.id_pengeluaran}" class="inline-flex min-h-[40px] items-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-danger hover:bg-red-100">Batalkan</button>
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

                <div class="min-w-0">
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
                            actionsHtml: '<button type="button" id="exp-empty-cat-btn" class="wn-btn-primary text-xs">Kelola Kategori</button>',
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

    function render() {
        const hasAnyData = expenseCategories.length > 0 || (expensesPage?.data || []).length > 0;

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({
                    backBtnId: 'exp-back-btn',
                    title: 'Pengeluaran',
                    actionsHtml: '<button id="exp-manage-cat-btn" type="button" class="wn-btn-secondary w-full text-xs sm:w-auto sm:text-sm">Kelola Kategori</button>',
                })}

                ${errorObj && hasAnyData ? renderErrorAlert(errorObj) : ''}

                ${isLoading ? `<div class="wn-card">${renderLoadingState('Memuat daftar pengeluaran...')}</div>` : errorObj && !hasAnyData ? `
                    ${renderEmptyState({
                        kind: 'error',
                        title: 'Gagal memuat pengeluaran',
                        message: errorObj.message || 'Terjadi kendala saat mengambil data pengeluaran.',
                        actionsHtml: '<button id="exp-retry-btn" type="button" class="wn-btn-secondary">Coba Lagi</button>',
                    })}
                ` : renderContent()}
            </div>
        `;

        bindEvents();
        if (!isLoading) {
            motion.refresh();
        }
    }

    function bindEvents() {
        container.querySelector('#exp-back-btn')?.addEventListener('click', () => navigateBack(APP_VIEWS.DASHBOARD));
        container.querySelector('#exp-manage-cat-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.OWNER_EXPENSE_CATEGORIES));
        container.querySelector('#exp-empty-cat-btn')?.addEventListener('click', () => navigateTo(APP_VIEWS.OWNER_EXPENSE_CATEGORIES));
        container.querySelector('#exp-retry-btn')?.addEventListener('click', loadExpenses);
        container.querySelector('#exp-jump-form-btn')?.addEventListener('click', () => scrollToElement('#exp-form'));

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
                scrollToElement('#exp-form');
            })
        );
        container.querySelectorAll('[data-cancel-exp]').forEach((b) =>
            b.addEventListener('click', () => {
                cancellingExpId = Number(b.getAttribute('data-cancel-exp'));
                editingExpId = null;
                render();
                scrollToElement('#exp-cancel-form');
            })
        );
        container.querySelector('#exp-reset-mode')?.addEventListener('click', () => {
            editingExpId = null;
            cancellingExpId = null;
            render();
        });

        container.querySelector('#exp-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isDisposed || isSubmitting) {
                return;
            }
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
                    await washnoteApi.updateExpense(editingExpId, payload, { signal: abortController.signal });
                    if (isDisposed) {
                        return;
                    }
                    showToast('Pengeluaran diperbarui.', 'success');
                    editingExpId = null;
                } else {
                    await washnoteApi.createExpense(payload, expIdempotencyKey, { signal: abortController.signal });
                    if (isDisposed) {
                        return;
                    }
                    expIdempotencyKey = generateIdempotencyKey();
                    showToast('Pengeluaran berhasil dicatat.', 'success');
                }
                isSubmitting = false;
                await loadExpenses();
            } catch (err) {
                if (isDisposed || isAbortError(err)) {
                    return;
                }
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });

        container.querySelector('#exp-cancel-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isDisposed || isSubmitting) {
                return;
            }
            const alasan = container.querySelector('#exp-cancel-reason')?.value?.trim() || '';
            isSubmitting = true;
            errorObj = null;
            render();
            try {
                await washnoteApi.cancelExpense(cancellingExpId, { alasan }, { signal: abortController.signal });
                if (isDisposed) {
                    return;
                }
                showToast('Pengeluaran berhasil dibatalkan.', 'success');
                cancellingExpId = null;
                isSubmitting = false;
                await loadExpenses();
            } catch (err) {
                if (isDisposed || isAbortError(err)) {
                    return;
                }
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
                    loadExpenses();
                }
            })
        );
    }

    loadExpenses();

    return () => {
        isDisposed = true;
        abortController.abort();
    };
}
