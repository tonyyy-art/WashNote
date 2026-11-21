import { washnoteApi } from '../api/client.js';
import { showToast } from '../state/store.js';
import { escapeHtml, formatDateTimeWib, renderErrorAlert } from '../utils/formatters.js';

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

        container.innerHTML = `
            <div class="space-y-6">
                <div>
                    <h1 class="text-2xl font-bold tracking-tight text-slate-900">Pengelolaan Akun Kasir</h1>
                    <p class="mt-0.5 text-sm text-slate-600">Tambah akun Kasir, perbarui nama lengkap (username bersifat tetap), aktifkan/nonaktifkan akses, dan reset kata sandi.</p>
                </div>

                ${errorObj ? renderErrorAlert(errorObj) : ''}

                <div class="grid gap-6 lg:grid-cols-3">
                    <div class="space-y-4 lg:col-span-2">
                        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <form id="kasir-filter-form" class="flex flex-col gap-3 sm:flex-row">
                                <input id="kasir-search" type="search" value="${escapeHtml(filters.search)}" placeholder="Cari nama atau username..." class="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                                <select id="kasir-status" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                                    <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Semua Status</option>
                                    <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Aktif</option>
                                    <option value="inactive" ${filters.status === 'inactive' ? 'selected' : ''}>Nonaktif</option>
                                </select>
                                <button type="submit" class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Filter</button>
                            </form>
                        </div>

                        <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            ${isLoading ? '<div class="p-8 text-center text-sm text-slate-500">Memuat daftar kasir...</div>' : rows.length === 0 ? '<div class="p-8 text-center text-sm text-slate-500">Belum ada akun kasir.</div>' : `
                                <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
                                    <thead class="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                                        <tr>
                                            <th class="px-4 py-3">Kasir</th>
                                            <th class="px-4 py-3">Status</th>
                                            <th class="px-4 py-3 text-right">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-200">
                                        ${rows.map((row) => `
                                            <tr>
                                                <td class="px-4 py-3">
                                                    <div class="font-semibold text-slate-900">${escapeHtml(row.nama_lengkap)}</div>
                                                    <div class="font-mono text-xs text-slate-500">@${escapeHtml(row.username)} • Dibuat ${escapeHtml(formatDateTimeWib(row.created_at))}</div>
                                                </td>
                                                <td class="px-4 py-3">
                                                    ${row.status_aktif ? '<span class="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Aktif</span>' : '<span class="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">Nonaktif</span>'}
                                                </td>
                                                <td class="px-4 py-3 text-right space-x-2">
                                                    <button type="button" data-k-action="edit" data-k-id="${row.id_pengguna}" class="text-xs font-semibold text-teal-700">Edit Nama</button>
                                                    <button type="button" data-k-action="status" data-k-id="${row.id_pengguna}" class="text-xs font-semibold text-amber-700">${row.status_aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                                                    <button type="button" data-k-action="reset" data-k-id="${row.id_pengguna}" class="text-xs font-semibold text-slate-700">Reset Sandi</button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            `}
                            ${kasirPage && kasirPage.last_page > 1 ? `
                                <div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                                    <span>Halaman ${kasirPage.current_page} dari ${kasirPage.last_page} (${kasirPage.total} akun)</span>
                                    <div class="flex gap-2">
                                        <button type="button" data-kasir-page="${kasirPage.current_page - 1}" ${kasirPage.current_page <= 1 ? 'disabled' : ''} class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:opacity-40">Sebelumnya</button>
                                        <button type="button" data-kasir-page="${kasirPage.current_page + 1}" ${kasirPage.current_page >= kasirPage.last_page ? 'disabled' : ''} class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:opacity-40">Berikutnya</button>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="space-y-4">
                        ${selected && modalMode ? renderActionPanel(selected, modalMode) : `
                            <form id="kasir-create-form" class="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <h3 class="text-sm font-bold text-slate-900">Buat Akun Kasir Baru</h3>
                                <div>
                                    <label class="mb-1 block text-xs font-medium text-slate-600">Nama Lengkap</label>
                                    <input id="new-k-name" type="text" required minlength="2" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                                </div>
                                <div>
                                    <label class="mb-1 block text-xs font-medium text-slate-600">Username (3–100 huruf/angka/._-)</label>
                                    <input id="new-k-user" type="text" required minlength="3" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                                </div>
                                <div>
                                    <label class="mb-1 block text-xs font-medium text-slate-600">Kata Sandi (Min. 8 karakter)</label>
                                    <input id="new-k-pass" type="password" required minlength="8" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                                </div>
                                <div>
                                    <label class="mb-1 block text-xs font-medium text-slate-600">Konfirmasi Kata Sandi</label>
                                    <input id="new-k-pass-conf" type="password" required minlength="8" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                                </div>
                                <button type="submit" ${isSubmitting ? 'disabled' : ''} class="w-full rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">Tambah Kasir</button>
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
                <form id="kasir-edit-form" class="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-slate-900">Edit Akun @${escapeHtml(selected.username)}</h3>
                        <button type="button" id="k-cancel-action" class="text-xs text-slate-500">Batal</button>
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Nama Lengkap</label>
                        <input id="edit-k-name" type="text" required minlength="2" value="${escapeHtml(selected.nama_lengkap)}" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="w-full rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Simpan Nama</button>
                </form>
            `;
        }

        if (mode === 'status') {
            const nextStatus = !selected.status_aktif;
            return `
                <form id="kasir-status-form" class="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-slate-900">${nextStatus ? 'Aktifkan' : 'Nonaktifkan'} @${escapeHtml(selected.username)}</h3>
                        <button type="button" id="k-cancel-action" class="text-xs text-slate-500">Batal</button>
                    </div>
                    <p class="text-xs text-slate-500">${nextStatus ? 'Kasir dapat masuk kembali.' : 'Seluruh token sesi aktif Kasir ini akan langsung dicabut.'}</p>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Alasan Perubahan Status (Min. 5 karakter)</label>
                        <input id="status-k-alasan" type="text" required minlength="5" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="w-full rounded-xl ${nextStatus ? 'bg-emerald-700' : 'bg-rose-700'} px-4 py-2 text-sm font-semibold text-white">
                        ${nextStatus ? 'Aktifkan Akun' : 'Nonaktifkan Akun'}
                    </button>
                </form>
            `;
        }

        return `
            <form id="kasir-reset-form" class="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex items-center justify-between">
                    <h3 class="text-sm font-bold text-slate-900">Reset Sandi @${escapeHtml(selected.username)}</h3>
                    <button type="button" id="k-cancel-action" class="text-xs text-slate-500">Batal</button>
                </div>
                <div>
                    <label class="mb-1 block text-xs font-medium text-slate-600">Kata Sandi Baru (Min. 8 karakter)</label>
                    <input id="reset-k-pass" type="password" required minlength="8" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                    <label class="mb-1 block text-xs font-medium text-slate-600">Konfirmasi Kata Sandi</label>
                    <input id="reset-k-conf" type="password" required minlength="8" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <button type="submit" ${isSubmitting ? 'disabled' : ''} class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Reset & Cabut Sesi</button>
            </form>
        `;
    }

    function bindEvents(selected) {
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
                await loadStaff();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            } finally {
                isSubmitting = false;
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
                await loadStaff();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            } finally {
                isSubmitting = false;
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
                await loadStaff();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            } finally {
                isSubmitting = false;
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
                await loadStaff();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            } finally {
                isSubmitting = false;
            }
        });
    }

    loadStaff();
}
