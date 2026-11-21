import { generateIdempotencyKey, washnoteApi } from '../api/client.js';
import { showToast } from '../state/store.js';
import { escapeHtml, formatDateOnly, formatRupiah, renderErrorAlert, todayWibDateString } from '../utils/formatters.js';

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
        container.innerHTML = `
            <div class="space-y-6">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 class="text-2xl font-bold tracking-tight text-slate-900">Keuangan, Pengeluaran & Laporan</h1>
                        <p class="mt-0.5 text-sm text-slate-600">Laporan pemasukan berdasar invoice terbayar (WIB), pengelolaan pengeluaran, dan kategori biaya.</p>
                    </div>
                    <button id="fin-refresh-btn" type="button" class="shrink-0 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Muat Ulang</button>
                </div>

                ${errorObj ? renderErrorAlert(errorObj) : ''}

                <div class="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                    ${[
                        ['reports', 'Laporan Ringkas & Harian'],
                        ['expenses', 'Pengeluaran'],
                        ['categories', 'Kategori Pengeluaran'],
                    ].map(([tab, label]) => `
                        <button type="button" data-fin-tab="${tab}" class="rounded-xl px-3.5 py-2 text-xs font-semibold ${activeTab === tab ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}">
                            ${escapeHtml(label)}
                        </button>
                    `).join('')}
                </div>

                ${isLoading ? '<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Memuat data keuangan...</div>' : ''}
                ${!isLoading && activeTab === 'reports' ? renderReportsTab() : ''}
                ${!isLoading && activeTab === 'expenses' ? renderExpensesTab() : ''}
                ${!isLoading && activeTab === 'categories' ? renderExpenseCategoriesTab() : ''}
            </div>
        `;

        bindEvents();
    }

    function renderReportsTab() {
        return `
            <div class="space-y-5">
                <form id="report-filter-form" class="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Tanggal Mulai</label>
                        <input id="rep-start" type="date" required value="${escapeHtml(reportStart)}" class="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Tanggal Akhir</label>
                        <input id="rep-end" type="date" required value="${escapeHtml(reportEnd)}" class="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <button type="submit" class="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">Tampilkan Laporan</button>
                </form>

                ${reportSummary ? `
                    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p class="text-xs text-slate-500">Total Pendapatan</p>
                            <p class="mt-1 text-xl font-bold text-emerald-700 tabular-nums">${escapeHtml(formatRupiah(reportSummary.total_pendapatan))}</p>
                        </div>
                        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p class="text-xs text-slate-500">Total Pengeluaran Aktif</p>
                            <p class="mt-1 text-xl font-bold text-rose-700 tabular-nums">${escapeHtml(formatRupiah(reportSummary.total_pengeluaran))}</p>
                        </div>
                        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p class="text-xs text-slate-500">Selisih Kas / Keuntungan Bersih</p>
                            <p class="mt-1 text-xl font-bold text-slate-900 tabular-nums">${escapeHtml(formatRupiah(reportSummary.keuntungan_bersih))}</p>
                        </div>
                        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p class="text-xs text-slate-500">Jumlah Kendaraan</p>
                            <p class="mt-1 text-xl font-bold text-slate-900 tabular-nums">${reportSummary.jumlah_kendaraan ?? 0}</p>
                        </div>
                    </div>
                ` : ''}

                <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div class="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">Rincian Harian (Asia/Jakarta)</div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
                            <thead class="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                                <tr>
                                    <th class="px-4 py-3">Tanggal</th>
                                    <th class="px-4 py-3 text-right">Kendaraan</th>
                                    <th class="px-4 py-3 text-right">Pendapatan</th>
                                    <th class="px-4 py-3 text-right">Pengeluaran</th>
                                    <th class="px-4 py-3 text-right">Selisih Bersih</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200">
                                ${reportDaily.length === 0 ? '<tr><td colspan="5" class="p-6 text-center text-slate-500">Tidak ada data pada rentang tanggal ini.</td></tr>' : reportDaily.map((d) => `
                                    <tr>
                                        <td class="px-4 py-2.5 font-mono text-xs font-semibold text-slate-800">${escapeHtml(d.tanggal)}</td>
                                        <td class="px-4 py-2.5 text-right tabular-nums">${d.jumlah_kendaraan ?? 0}</td>
                                        <td class="px-4 py-2.5 text-right font-medium text-emerald-700 tabular-nums">${escapeHtml(formatRupiah(d.pendapatan))}</td>
                                        <td class="px-4 py-2.5 text-right font-medium text-rose-700 tabular-nums">${escapeHtml(formatRupiah(d.pengeluaran))}</td>
                                        <td class="px-4 py-2.5 text-right font-bold text-slate-900 tabular-nums">${escapeHtml(formatRupiah(d.keuntungan_bersih))}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    function renderExpensesTab() {
        const rows = expensesPage?.data || [];
        const activeCategories = expenseCategories.filter((c) => c.status_aktif);
        const editing = editingExpId ? rows.find((r) => Number(r.id_pengeluaran) === Number(editingExpId)) : null;
        const cancelling = cancellingExpId ? rows.find((r) => Number(r.id_pengeluaran) === Number(cancellingExpId)) : null;

        return `
            <div class="grid gap-6 lg:grid-cols-3">
                <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
                    ${rows.length === 0 ? '<div class="p-8 text-center text-sm text-slate-500">Belum ada catatan pengeluaran.</div>' : `
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
                                <thead class="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                                    <tr>
                                        <th class="px-4 py-3">Tanggal & Deskripsi</th>
                                        <th class="px-4 py-3">Kategori</th>
                                        <th class="px-4 py-3 text-right">Nominal</th>
                                        <th class="px-4 py-3">Status</th>
                                        <th class="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-200">
                                    ${rows.map((exp) => `
                                        <tr>
                                            <td class="px-4 py-2.5">
                                                <div class="font-semibold text-slate-900">${escapeHtml(exp.deskripsi)}</div>
                                                <div class="text-xs text-slate-500">${escapeHtml(formatDateOnly(exp.tanggal_pengeluaran))} • oleh ${escapeHtml(exp.pengguna?.nama_lengkap || '-')}</div>
                                            </td>
                                            <td class="px-4 py-2.5 text-xs text-slate-700">${escapeHtml(exp.kategori?.nama_kategori || '-')}</td>
                                            <td class="px-4 py-2.5 text-right font-bold text-slate-900 tabular-nums">${escapeHtml(formatRupiah(exp.nominal))}</td>
                                            <td class="px-4 py-2.5">
                                                ${exp.status_pengeluaran === 'dibatalkan' ? '<span class="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">Dibatalkan</span>' : '<span class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Aktif</span>'}
                                            </td>
                                            <td class="px-4 py-2.5 text-right space-x-2">
                                                ${exp.status_pengeluaran !== 'dibatalkan' ? `
                                                    <button type="button" data-edit-exp="${exp.id_pengeluaran}" class="text-xs font-semibold text-teal-700">Ubah</button>
                                                    <button type="button" data-cancel-exp="${exp.id_pengeluaran}" class="text-xs font-semibold text-rose-600">Batalkan</button>
                                                ` : '-'}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        ${expensesPage && expensesPage.last_page > 1 ? `
                            <div class="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                                <span>Halaman ${expensesPage.current_page} dari ${expensesPage.last_page}</span>
                                <div class="flex gap-2">
                                    <button type="button" data-exp-page="${expensesPage.current_page - 1}" ${expensesPage.current_page <= 1 ? 'disabled' : ''} class="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-50">Sebelumnya</button>
                                    <button type="button" data-exp-page="${expensesPage.current_page + 1}" ${expensesPage.current_page >= expensesPage.last_page ? 'disabled' : ''} class="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-50">Berikutnya</button>
                                </div>
                            </div>
                        ` : ''}
                    `}
                </div>

                <div>
                    ${cancelling ? `
                        <form id="exp-cancel-form" class="space-y-3 rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
                            <div class="flex items-center justify-between">
                                <h3 class="text-sm font-bold text-rose-800">Batalkan Pengeluaran</h3>
                                <button type="button" id="exp-reset-mode" class="text-xs text-slate-500">Batal</button>
                            </div>
                            <p class="text-xs text-slate-600">${escapeHtml(cancelling.deskripsi)} (${escapeHtml(formatRupiah(cancelling.nominal))})</p>
                            <div>
                                <label class="mb-1 block text-xs font-medium text-slate-600">Alasan Pembatalan (Min. 5 karakter)</label>
                                <input id="exp-cancel-reason" type="text" required minlength="5" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                            </div>
                            <button type="submit" ${isSubmitting ? 'disabled' : ''} class="w-full rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">Batalkan (Soft Void)</button>
                        </form>
                    ` : `
                        <form id="exp-form" class="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div class="flex items-center justify-between">
                                <h3 class="text-sm font-bold text-slate-900">${editing ? 'Ubah Pengeluaran' : 'Catat Pengeluaran Baru'}</h3>
                                ${editing ? '<button type="button" id="exp-reset-mode" class="text-xs text-slate-500">Batal</button>' : ''}
                            </div>
                            <div>
                                <label class="mb-1 block text-xs font-medium text-slate-600">Kategori Pengeluaran</label>
                                <select id="exp-cat" required class="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                                    ${activeCategories.map((c) => `<option value="${c.id_kategori_pengeluaran}" ${Number(editing?.id_kategori_pengeluaran) === Number(c.id_kategori_pengeluaran) ? 'selected' : ''}>${escapeHtml(c.nama_kategori)}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="mb-1 block text-xs font-medium text-slate-600">Tanggal Pengeluaran</label>
                                <input id="exp-date" type="date" required value="${escapeHtml(editing ? formatDateOnly(editing.tanggal_pengeluaran) : today)}" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                            </div>
                            <div>
                                <label class="mb-1 block text-xs font-medium text-slate-600">Deskripsi</label>
                                <input id="exp-desc" type="text" required value="${escapeHtml(editing?.deskripsi || '')}" placeholder="Contoh: Sabun cuci motor 5L" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                            </div>
                            <div>
                                <label class="mb-1 block text-xs font-medium text-slate-600">Nominal (Rp)</label>
                                <input id="exp-nominal" type="number" min="1" step="1" required value="${escapeHtml(editing ? Number(editing.nominal) : '')}" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums" />
                            </div>
                            ${editing ? `
                                <div>
                                    <label class="mb-1 block text-xs font-medium text-slate-600">Alasan Perubahan (Min. 5 karakter)</label>
                                    <input id="exp-reason" type="text" required minlength="5" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                                </div>
                            ` : ''}
                            <button type="submit" ${isSubmitting || activeCategories.length === 0 ? 'disabled' : ''} class="w-full rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
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
                <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
                    <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
                        <thead class="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                            <tr>
                                <th class="px-4 py-3">Nama Kategori</th>
                                <th class="px-4 py-3">Status</th>
                                <th class="px-4 py-3 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            ${expenseCategories.map((c) => `
                                <tr>
                                    <td class="px-4 py-2.5 font-semibold text-slate-900">${escapeHtml(c.nama_kategori)}</td>
                                    <td class="px-4 py-2.5">${c.status_aktif ? '<span class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Aktif</span>' : '<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Nonaktif</span>'}</td>
                                    <td class="px-4 py-2.5 text-right space-x-2">
                                        <button type="button" data-edit-expcat="${c.id_kategori_pengeluaran}" class="text-xs font-semibold text-teal-700">Ubah</button>
                                        ${c.status_aktif ? `<button type="button" data-del-expcat="${c.id_kategori_pengeluaran}" class="text-xs font-semibold text-rose-600">Nonaktifkan</button>` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <form id="expcat-form" class="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-slate-900">${editing ? 'Ubah Kategori' : 'Tambah Kategori'}</h3>
                        ${editing ? '<button type="button" id="cancel-expcat-edit" class="text-xs text-slate-500">Batal</button>' : ''}
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Nama Kategori</label>
                        <input id="expcat-nama" type="text" required value="${escapeHtml(editing?.nama_kategori || '')}" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <label class="flex items-center gap-2 text-xs text-slate-700">
                        <input id="expcat-aktif" type="checkbox" ${(editing ? editing.status_aktif : true) ? 'checked' : ''} class="rounded border-slate-300 text-teal-700" />
                        <span>Status Aktif</span>
                    </label>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="w-full rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Simpan Kategori</button>
                </form>
            </div>
        `;
    }

    function bindEvents() {
        container.querySelector('#fin-refresh-btn')?.addEventListener('click', loadAll);
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
                await loadAll();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            } finally {
                isSubmitting = false;
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
                await loadAll();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            } finally {
                isSubmitting = false;
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
                await loadAll();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            } finally {
                isSubmitting = false;
            }
        });
    }

    loadAll();
}
