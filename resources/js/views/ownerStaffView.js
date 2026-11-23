import { washnoteApi } from '../api/client.js';
import { showToast } from '../state/store.js';
import {
    badgeStatusAktif,
    escapeHtml,
    formatDateTimeWib,
    renderEmptyState,
    renderErrorAlert,
    renderLoadingState,
    renderPageHeader,
} from '../utils/formatters.js';

export function mountOwnerStaffView(container) {
    let isLoading = true;
    let isSubmitting = false;
    let errorObj = null;
    let kasirPage = null;
    let filters = { status: 'all', search: '', page: 1 };
    let selectedKasirId = null;
    let modalMode = null; // 'edit' | 'status' | 'reset'

    async function loadStaff() {
        isLoading = true;
        errorObj = null;
        render();

        try {
            const res = await washnoteApi.getKasir({ ...filters, per_page: 10 });
            kasirPage = res?.data || null;
        } catch (err) {
            errorObj = err;
        } finally {
            isLoading = false;
            render();
        }
    }

    function render() {
        const rows = kasirPage?.data || [];
        const selected = selectedKasirId ? rows.find((r) => Number(r.id_pengguna) === Number(selectedKasirId)) : null;
        const hasFilter = filters.search !== '' || filters.status !== 'all';

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({ title: 'Akun Kasir' })}

                ${errorObj && rows.length > 0 ? renderErrorAlert(errorObj) : ''}

                <div class="grid gap-6 lg:grid-cols-3">
                    <div class="space-y-4 lg:col-span-2">
                        <div class="wn-card p-4">
                            <form id="kasir-filter-form" class="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                                <input id="kasir-search" type="search" value="${escapeHtml(filters.search)}" placeholder="Cari nama atau username..." class="wn-input flex-1" />
                                <div class="sm:w-44">
                                    <select id="kasir-status" class="wn-select">
                                        <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Semua Status</option>
                                        <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Aktif</option>
                                        <option value="inactive" ${filters.status === 'inactive' ? 'selected' : ''}>Nonaktif</option>
                                    </select>
                                </div>
                                <button type="submit" class="wn-btn-dark">Filter</button>
                            </form>
                        </div>

                        <div class="wn-card overflow-hidden">
                            ${isLoading ? renderLoadingState('Memuat daftar kasir...') : errorObj && rows.length === 0 ? `
                                <div class="p-4">
                                    ${renderEmptyState({
                                        kind: 'error',
                                        title: 'Gagal memuat akun kasir',
                                        message: errorObj.message || 'Terjadi kendala saat mengambil data.',
                                        actionsHtml: '<button id="kasir-retry-btn" type="button" class="wn-btn-secondary">Coba Lagi</button>',
                                    })}
                                </div>
                            ` : rows.length === 0 && hasFilter ? `
                                <div class="p-4">
                                    ${renderEmptyState({
                                        kind: 'filtered',
                                        title: 'Akun kasir tidak ditemukan',
                                        message: 'Ubah kata kunci pencarian atau pilih status lain.',
                                        actionsHtml: '<button id="kasir-reset-filter-btn" type="button" class="wn-btn-secondary">Reset Filter</button>',
                                    })}
                                </div>
                            ` : rows.length === 0 ? `
                                <div class="p-4">
                                    ${renderEmptyState({
                                        kind: 'empty',
                                        title: 'Belum ada akun kasir',
                                        message: 'Buat akun Kasir melalui formulir di samping.',
                                    })}
                                </div>
                            ` : `
                                <div class="overflow-x-auto">
                                    <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
                                        <thead class="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                                            <tr>
                                                <th class="px-4 py-3">Kasir</th>
                                                <th class="px-4 py-3">Status</th>
                                                <th class="px-4 py-3 text-right">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-slate-200">
                                            ${rows.map((row) => `
                                                <tr class="hover:bg-slate-50">
                                                    <td class="px-4 py-3">
                                                        <div class="font-semibold text-slate-900">${escapeHtml(row.nama_lengkap)}</div>
                                                        <div class="font-mono text-xs text-slate-500">@${escapeHtml(row.username)} • ${escapeHtml(formatDateTimeWib(row.created_at))}</div>
                                                    </td>
                                                    <td class="px-4 py-3">
                                                        ${badgeStatusAktif(Boolean(row.status_aktif))}
                                                    </td>
                                                    <td class="px-4 py-3 text-right space-x-2.5 whitespace-nowrap">
                                                        <button type="button" data-k-action="edit" data-k-id="${row.id_pengguna}" class="text-xs font-semibold text-teal-700 hover:text-teal-900">Edit Nama</button>
                                                        <button type="button" data-k-action="status" data-k-id="${row.id_pengguna}" class="text-xs font-semibold text-amber-700 hover:text-amber-900">${row.status_aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                                                        <button type="button" data-k-action="reset" data-k-id="${row.id_pengguna}" class="text-xs font-semibold text-slate-700 hover:text-slate-900">Reset Sandi</button>
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `}
                            ${kasirPage && kasirPage.last_page > 1 ? `
                                <div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                                    <span>Halaman ${kasirPage.current_page} dari ${kasirPage.last_page} (${kasirPage.total} akun)</span>
                                    <div class="flex gap-2">
                                        <button type="button" data-kasir-page="${kasirPage.current_page - 1}" ${kasirPage.current_page <= 1 ? 'disabled' : ''} class="wn-btn-secondary px-3 py-1.5 text-xs">Sebelumnya</button>
                                        <button type="button" data-kasir-page="${kasirPage.current_page + 1}" ${kasirPage.current_page >= kasirPage.last_page ? 'disabled' : ''} class="wn-btn-secondary px-3 py-1.5 text-xs">Berikutnya</button>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="space-y-4">
                        ${selected && modalMode ? renderActionPanel(selected, modalMode) : `
                            <form id="kasir-create-form" class="wn-card space-y-3.5 p-5">
                                <h3 class="text-sm font-bold text-slate-900">Buat Akun Kasir</h3>
                                <div>
                                    <label for="new-k-name" class="wn-label">Nama Lengkap</label>
                                    <input id="new-k-name" type="text" required minlength="2" class="wn-input" />
                                </div>
                                <div>
                                    <label for="new-k-user" class="wn-label">Username (3–100 huruf/angka/._-)</label>
                                    <input id="new-k-user" type="text" required minlength="3" class="wn-input" />
                                </div>
                                <div>
                                    <label for="new-k-pass" class="wn-label">Kata Sandi (Min. 8 karakter)</label>
                                    <input id="new-k-pass" type="password" required minlength="8" class="wn-input" />
                                </div>
                                <div>
                                    <label for="new-k-pass-conf" class="wn-label">Konfirmasi Kata Sandi</label>
                                    <input id="new-k-pass-conf" type="password" required minlength="8" class="wn-input" />
                                </div>
                                <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary w-full">Tambah Kasir</button>
                            </form>
                        `}
                    </div>
                </div>
            </div>
        `;

        bindEvents(selected);
    }

    function renderActionPanel(selected, mode) {
        if (mode === 'edit') {
            return `
                <form id="kasir-edit-form" class="wn-card space-y-3.5 p-5">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-slate-900">Edit Akun @${escapeHtml(selected.username)}</h3>
                        <button type="button" id="k-cancel-action" class="text-xs font-medium text-slate-500 hover:text-slate-800">Batal</button>
                    </div>
                    <div>
                        <label for="edit-k-name" class="wn-label">Nama Lengkap</label>
                        <input id="edit-k-name" type="text" required minlength="2" value="${escapeHtml(selected.nama_lengkap)}" class="wn-input" />
                    </div>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary w-full">Simpan Nama</button>
                </form>
            `;
        }

        if (mode === 'status') {
            const nextStatus = !selected.status_aktif;
            return `
                <form id="kasir-status-form" class="wn-card space-y-3.5 p-5">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-slate-900">${nextStatus ? 'Aktifkan' : 'Nonaktifkan'} @${escapeHtml(selected.username)}</h3>
                        <button type="button" id="k-cancel-action" class="text-xs font-medium text-slate-500 hover:text-slate-800">Batal</button>
                    </div>
                    <p class="text-xs text-slate-500">${nextStatus ? 'Kasir dapat masuk kembali.' : 'Seluruh sesi aktif Kasir ini akan langsung dicabut.'}</p>
                    <div>
                        <label for="status-k-alasan" class="wn-label">Alasan Perubahan Status (Min. 5 karakter)</label>
                        <input id="status-k-alasan" type="text" required minlength="5" class="wn-input" />
                    </div>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="${nextStatus ? 'wn-btn-primary' : 'wn-btn-danger'} w-full">
                        ${nextStatus ? 'Aktifkan Akun' : 'Nonaktifkan Akun'}
                    </button>
                </form>
            `;
        }

        return `
            <form id="kasir-reset-form" class="wn-card space-y-3.5 p-5">
                <div class="flex items-center justify-between">
                    <h3 class="text-sm font-bold text-slate-900">Reset Sandi @${escapeHtml(selected.username)}</h3>
                    <button type="button" id="k-cancel-action" class="text-xs font-medium text-slate-500 hover:text-slate-800">Batal</button>
                </div>
                <div>
                    <label for="reset-k-pass" class="wn-label">Kata Sandi Baru (Min. 8 karakter)</label>
                    <input id="reset-k-pass" type="password" required minlength="8" class="wn-input" />
                </div>
                <div>
                    <label for="reset-k-conf" class="wn-label">Konfirmasi Kata Sandi</label>
                    <input id="reset-k-conf" type="password" required minlength="8" class="wn-input" />
                </div>
                <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-dark w-full">Reset & Cabut Sesi</button>
            </form>
        `;
    }

    function bindEvents(selected) {
        container.querySelector('#kasir-retry-btn')?.addEventListener('click', loadStaff);
        container.querySelector('#kasir-reset-filter-btn')?.addEventListener('click', () => {
            filters = { status: 'all', search: '', page: 1 };
            loadStaff();
        });
        container.querySelector('#kasir-filter-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            filters.search = container.querySelector('#kasir-search')?.value?.trim() || '';
            filters.status = container.querySelector('#kasir-status')?.value || 'all';
            filters.page = 1;
            loadStaff();
        });

        container.querySelectorAll('[data-kasir-page]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const nextPage = Number(btn.getAttribute('data-kasir-page'));
                if (nextPage >= 1 && (!kasirPage || nextPage <= kasirPage.last_page)) {
                    filters.page = nextPage;
                    loadStaff();
                }
            });
        });

        container.querySelectorAll('[data-k-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                selectedKasirId = Number(btn.getAttribute('data-k-id'));
                modalMode = btn.getAttribute('data-k-action');
                errorObj = null;
                render();
            });
        });

        container.querySelector('#k-cancel-action')?.addEventListener('click', () => {
            selectedKasirId = null;
            modalMode = null;
            render();
        });

        container.querySelector('#kasir-create-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                nama_lengkap: container.querySelector('#new-k-name')?.value?.trim() || '',
                username: container.querySelector('#new-k-user')?.value?.trim() || '',
                password: container.querySelector('#new-k-pass')?.value || '',
                password_confirmation: container.querySelector('#new-k-pass-conf')?.value || '',
            };
            isSubmitting = true;
            errorObj = null;
            render();
            try {
                await washnoteApi.createKasir(payload);
                showToast('Akun kasir berhasil dibuat.', 'success');
                isSubmitting = false;
                await loadStaff();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });

        container.querySelector('#kasir-edit-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                nama_lengkap: container.querySelector('#edit-k-name')?.value?.trim() || '',
                username: selected.username,
            };
            isSubmitting = true;
            errorObj = null;
            render();
            try {
                await washnoteApi.updateKasir(selected.id_pengguna, payload);
                showToast('Data kasir diperbarui.', 'success');
                selectedKasirId = null;
                modalMode = null;
                isSubmitting = false;
                await loadStaff();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });

        container.querySelector('#kasir-status-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                status_aktif: !selected.status_aktif,
                alasan: container.querySelector('#status-k-alasan')?.value?.trim() || '',
            };
            isSubmitting = true;
            errorObj = null;
            render();
            try {
                await washnoteApi.updateKasirStatus(selected.id_pengguna, payload);
                showToast('Status kasir diperbarui.', 'success');
                selectedKasirId = null;
                modalMode = null;
                isSubmitting = false;
                await loadStaff();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });

        container.querySelector('#kasir-reset-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                password_baru: container.querySelector('#reset-k-pass')?.value || '',
                password_baru_confirmation: container.querySelector('#reset-k-conf')?.value || '',
            };
            isSubmitting = true;
            errorObj = null;
            render();
            try {
                await washnoteApi.resetKasirPassword(selected.id_pengguna, payload);
                showToast('Password kasir berhasil direset.', 'success');
                selectedKasirId = null;
                modalMode = null;
                isSubmitting = false;
                await loadStaff();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });
    }

    loadStaff();
}
