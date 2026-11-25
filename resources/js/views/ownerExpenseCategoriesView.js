import { isAbortError, washnoteApi } from '../api/client.js';
import { createViewMotion, scrollToElement } from '../motion/motionSystem.js';
import { APP_VIEWS, navigateBack, showToast } from '../state/store.js';
import {
    badgeStatusAktif,
    escapeHtml,
    renderEmptyState,
    renderErrorAlert,
    renderLoadingState,
    renderPageHeader,
} from '../utils/formatters.js';

export function mountOwnerExpenseCategoriesView(container) {
    const motion = createViewMotion(container);
    const abortController = new AbortController();
    let isDisposed = false;
    let isLoading = true;
    let isSubmitting = false;
    let errorObj = null;
    let expenseCategories = [];
    let editingExpCatId = null;

    async function loadCategories() {
        isLoading = true;
        errorObj = null;
        render();

        let wasAborted = false;
        try {
            const res = await washnoteApi.getExpenseCategories({ signal: abortController.signal });
            if (isDisposed) {
                return;
            }
            expenseCategories = res?.data || [];
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
        const editing = editingExpCatId
            ? expenseCategories.find((c) => Number(c.id_kategori_pengeluaran) === Number(editingExpCatId))
            : null;

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({
                    backBtnId: 'expcat-back-btn',
                    title: 'Kategori Pengeluaran',
                })}

                ${errorObj && expenseCategories.length > 0 ? renderErrorAlert(errorObj) : ''}

                ${isLoading ? `<div class="wn-card">${renderLoadingState('Memuat kategori pengeluaran...')}</div>` : errorObj && expenseCategories.length === 0 ? `
                    ${renderEmptyState({
                        kind: 'error',
                        title: 'Gagal memuat kategori pengeluaran',
                        message: errorObj.message || 'Terjadi kendala saat mengambil data.',
                        actionsHtml: '<button id="expcat-retry-btn" type="button" class="wn-btn-secondary">Coba Lagi</button>',
                    })}
                ` : `
                    <div class="grid gap-6 lg:grid-cols-3">
                        <div data-motion-card class="wn-card min-w-0 overflow-hidden lg:col-span-2">
                            ${expenseCategories.length === 0 ? `
                                <div class="p-4">
                                    ${renderEmptyState({
                                        kind: 'empty',
                                        title: 'Belum ada kategori pengeluaran',
                                        message: 'Tambahkan kategori melalui formulir.',
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
                                                <button type="button" data-edit-expcat="${c.id_kategori_pengeluaran}" class="wn-link inline-flex min-h-[40px] items-center rounded-md border border-accent-border bg-accent-soft px-3 text-xs">Ubah</button>
                                                ${c.status_aktif ? `<button type="button" data-del-expcat="${c.id_kategori_pengeluaran}" ${isSubmitting ? 'disabled' : ''} class="inline-flex min-h-[40px] items-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-danger hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-55">Nonaktifkan</button>` : ''}
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
                                                        ${c.status_aktif ? `<button type="button" data-del-expcat="${c.id_kategori_pengeluaran}" ${isSubmitting ? 'disabled' : ''} class="text-xs font-semibold text-danger hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-55">Nonaktifkan</button>` : ''}
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `}
                        </div>

                        <form id="expcat-form" data-motion-card class="wn-card min-w-0 space-y-3.5 self-start p-5">
                            <div class="flex items-center justify-between">
                                <h3 class="text-sm font-bold text-ink">${editing ? 'Ubah Kategori' : 'Tambah Kategori'}</h3>
                                ${editing ? '<button type="button" id="cancel-expcat-edit" class="text-xs font-medium text-ink-muted hover:text-ink">Batal</button>' : ''}
                            </div>
                            <div>
                                <label for="expcat-nama" class="wn-label">Nama Kategori <span class="text-danger">*</span></label>
                                <input id="expcat-nama" type="text" required value="${escapeHtml(editing?.nama_kategori || '')}" class="wn-input" />
                            </div>
                            <label for="expcat-aktif" class="flex min-h-[40px] sm:min-h-[32px] items-center gap-2 text-xs text-ink">
                                <input id="expcat-aktif" type="checkbox" ${(editing ? editing.status_aktif : true) ? 'checked' : ''} class="wn-checkbox" />
                                <span>Status Aktif</span>
                            </label>
                            <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary w-full">Simpan Kategori</button>
                        </form>
                    </div>
                `}
            </div>
        `;

        bindEvents();
        if (!isLoading) {
            motion.refresh();
        }
    }

    function bindEvents() {
        container.querySelector('#expcat-back-btn')?.addEventListener('click', () => navigateBack(APP_VIEWS.OWNER_EXPENSES));
        container.querySelector('#expcat-retry-btn')?.addEventListener('click', loadCategories);

        container.querySelectorAll('[data-edit-expcat]').forEach((b) =>
            b.addEventListener('click', () => {
                editingExpCatId = Number(b.getAttribute('data-edit-expcat'));
                render();
                scrollToElement('#expcat-form');
            })
        );
        container.querySelector('#cancel-expcat-edit')?.addEventListener('click', () => {
            editingExpCatId = null;
            render();
        });
        container.querySelectorAll('[data-del-expcat]').forEach((b) =>
            b.addEventListener('click', async () => {
                if (isDisposed || isSubmitting) {
                    return;
                }
                isSubmitting = true;
                errorObj = null;
                render();

                try {
                    await washnoteApi.deleteExpenseCategory(Number(b.getAttribute('data-del-expcat')), { signal: abortController.signal });
                    if (isDisposed) {
                        return;
                    }
                    isSubmitting = false;
                    showToast('Kategori pengeluaran dinonaktifkan.', 'success');
                    await loadCategories();
                } catch (err) {
                    if (isDisposed || isAbortError(err)) {
                        return;
                    }
                    isSubmitting = false;
                    errorObj = err;
                    render();
                }
            })
        );

        container.querySelector('#expcat-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isDisposed || isSubmitting) {
                return;
            }
            const payload = {
                nama_kategori: container.querySelector('#expcat-nama')?.value?.trim(),
                status_aktif: Boolean(container.querySelector('#expcat-aktif')?.checked),
            };
            isSubmitting = true;
            errorObj = null;
            render();
            try {
                if (editingExpCatId) {
                    await washnoteApi.updateExpenseCategory(editingExpCatId, payload, { signal: abortController.signal });
                    if (isDisposed) {
                        return;
                    }
                    showToast('Kategori pengeluaran diperbarui.', 'success');
                    editingExpCatId = null;
                } else {
                    await washnoteApi.createExpenseCategory(payload, { signal: abortController.signal });
                    if (isDisposed) {
                        return;
                    }
                    showToast('Kategori pengeluaran ditambahkan.', 'success');
                }
                isSubmitting = false;
                await loadCategories();
            } catch (err) {
                if (isDisposed || isAbortError(err)) {
                    return;
                }
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });
    }

    loadCategories();

    return () => {
        isDisposed = true;
        abortController.abort();
    };
}
