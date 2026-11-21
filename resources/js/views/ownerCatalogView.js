import { washnoteApi } from '../api/client.js';
import { showToast } from '../state/store.js';
import { escapeHtml, formatRupiah, renderErrorAlert } from '../utils/formatters.js';

export function mountOwnerCatalogView(container) {
    let activeTab = 'categories';
    let isLoading = true;
    let isSubmitting = false;
    let errorObj = null;
    let categories = [];
    let services = [];
    let tariffs = [];

    let editingCatId = null;
    let editingSrvId = null;
    let editingTariffId = null;

    async function loadCatalogMaster() {
        isLoading = true;
        errorObj = null;
        render();

        try {
            const [catRes, srvRes, tarRes] = await Promise.all([
                washnoteApi.getVehicleCategories(),
                washnoteApi.getServices(),
                washnoteApi.getTariffs(),
            ]);

            categories = catRes?.data || [];
            services = srvRes?.data || [];
            tariffs = tarRes?.data || [];
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
                        <h1 class="text-2xl font-bold tracking-tight text-slate-900">Master Katalog & Tarif Layanan</h1>
                        <p class="mt-0.5 text-sm text-slate-600">Kelola kategori kendaraan, layanan utama/tambahan, serta tarif dasar dengan batas bawah & atas.</p>
                    </div>
                    <button id="cat-refresh-btn" type="button" class="shrink-0 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Muat Ulang</button>
                </div>

                ${errorObj ? renderErrorAlert(errorObj) : ''}

                <div class="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                    ${[
                        ['categories', 'Kategori Kendaraan'],
                        ['services', 'Layanan (Utama / Tambahan)'],
                        ['tariffs', 'Tarif & Batas Harga'],
                    ].map(([tab, label]) => `
                        <button type="button" data-cat-tab="${tab}" class="rounded-xl px-3.5 py-2 text-xs font-semibold ${activeTab === tab ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}">
                            ${escapeHtml(label)}
                        </button>
                    `).join('')}
                </div>

                ${isLoading ? '<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Memuat master data...</div>' : ''}
                ${!isLoading && activeTab === 'categories' ? renderCategoriesTab() : ''}
                ${!isLoading && activeTab === 'services' ? renderServicesTab() : ''}
                ${!isLoading && activeTab === 'tariffs' ? renderTariffsTab() : ''}
            </div>
        `;

        bindEvents();
    }

    function renderCategoriesTab() {
        const editing = editingCatId ? categories.find((c) => Number(c.id_kategori_kendaraan) === Number(editingCatId)) : null;

        return `
            <div class="grid gap-6 lg:grid-cols-3">
                <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
                    <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
                        <thead class="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                            <tr>
                                <th class="px-4 py-3">Jenis</th>
                                <th class="px-4 py-3">Nama Kategori</th>
                                <th class="px-4 py-3">Status</th>
                                <th class="px-4 py-3 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            ${categories.map((cat) => `
                                <tr>
                                    <td class="px-4 py-2.5 capitalize">${escapeHtml(cat.jenis_kendaraan)}</td>
                                    <td class="px-4 py-2.5 font-semibold text-slate-900">${escapeHtml(cat.nama_kategori)}</td>
                                    <td class="px-4 py-2.5">${cat.status_aktif ? '<span class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Aktif</span>' : '<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Nonaktif</span>'}</td>
                                    <td class="px-4 py-2.5 text-right space-x-2">
                                        <button type="button" data-edit-cat-row="${cat.id_kategori_kendaraan}" class="text-xs font-semibold text-teal-700">Ubah</button>
                                        ${cat.status_aktif ? `<button type="button" data-del-cat-row="${cat.id_kategori_kendaraan}" class="text-xs font-semibold text-rose-600">Nonaktifkan</button>` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <form id="cat-form" class="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-slate-900">${editing ? 'Ubah Kategori' : 'Tambah Kategori'}</h3>
                        ${editing ? '<button type="button" id="cancel-cat-edit" class="text-xs text-slate-500">Batal</button>' : ''}
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Jenis Kendaraan</label>
                        <select id="cat-jenis" class="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                            <option value="motor" ${editing?.jenis_kendaraan === 'motor' ? 'selected' : ''}>Motor</option>
                            <option value="mobil" ${editing?.jenis_kendaraan === 'mobil' ? 'selected' : ''}>Mobil</option>
                        </select>
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Nama Kategori</label>
                        <input id="cat-nama" type="text" required value="${escapeHtml(editing?.nama_kategori || '')}" placeholder="Mis. Motor Besar / Mobil SUV" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <label class="flex items-center gap-2 text-xs text-slate-700">
                        <input id="cat-aktif" type="checkbox" ${(editing ? editing.status_aktif : true) ? 'checked' : ''} class="rounded border-slate-300 text-teal-700" />
                        <span>Status Aktif</span>
                    </label>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="w-full rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">${editing ? 'Simpan Perubahan' : 'Tambah Kategori'}</button>
                </form>
            </div>
        `;
    }

    function renderServicesTab() {
        const editing = editingSrvId ? services.find((s) => Number(s.id_layanan) === Number(editingSrvId)) : null;

        return `
            <div class="grid gap-6 lg:grid-cols-3">
                <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
                    <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
                        <thead class="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                            <tr>
                                <th class="px-4 py-3">Nama Layanan</th>
                                <th class="px-4 py-3">Tipe</th>
                                <th class="px-4 py-3">Status</th>
                                <th class="px-4 py-3 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            ${services.map((srv) => `
                                <tr>
                                    <td class="px-4 py-2.5">
                                        <div class="font-semibold text-slate-900">${escapeHtml(srv.nama_layanan)}</div>
                                        ${srv.deskripsi ? `<div class="text-xs text-slate-500">${escapeHtml(srv.deskripsi)}</div>` : ''}
                                    </td>
                                    <td class="px-4 py-2.5">
                                        <span class="rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${srv.tipe_layanan === 'tambahan' ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-800'}">${escapeHtml(srv.tipe_layanan || 'utama')}</span>
                                    </td>
                                    <td class="px-4 py-2.5">${srv.status_aktif ? '<span class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Aktif</span>' : '<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Nonaktif</span>'}</td>
                                    <td class="px-4 py-2.5 text-right space-x-2">
                                        <button type="button" data-edit-srv-row="${srv.id_layanan}" class="text-xs font-semibold text-teal-700">Ubah</button>
                                        ${srv.status_aktif ? `<button type="button" data-del-srv-row="${srv.id_layanan}" class="text-xs font-semibold text-rose-600">Nonaktifkan</button>` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <form id="srv-form" class="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-slate-900">${editing ? 'Ubah Layanan' : 'Tambah Layanan'}</h3>
                        ${editing ? '<button type="button" id="cancel-srv-edit" class="text-xs text-slate-500">Batal</button>' : ''}
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Nama Layanan</label>
                        <input id="srv-nama" type="text" required value="${escapeHtml(editing?.nama_layanan || '')}" placeholder="Mis. Cuci Salju / Semir Ban" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Tipe Layanan</label>
                        <select id="srv-tipe" class="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                            <option value="utama" ${editing?.tipe_layanan !== 'tambahan' ? 'selected' : ''}>Utama</option>
                            <option value="tambahan" ${editing?.tipe_layanan === 'tambahan' ? 'selected' : ''}>Tambahan (Add-On)</option>
                        </select>
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Deskripsi (Opsional)</label>
                        <input id="srv-desk" type="text" value="${escapeHtml(editing?.deskripsi || '')}" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <label class="flex items-center gap-2 text-xs text-slate-700">
                        <input id="srv-aktif" type="checkbox" ${(editing ? editing.status_aktif : true) ? 'checked' : ''} class="rounded border-slate-300 text-teal-700" />
                        <span>Status Aktif</span>
                    </label>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="w-full rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">${editing ? 'Simpan Perubahan' : 'Tambah Layanan'}</button>
                </form>
            </div>
        `;
    }

    function renderTariffsTab() {
        const editing = editingTariffId ? tariffs.find((t) => Number(t.id_harga) === Number(editingTariffId)) : null;

        return `
            <div class="grid gap-6 lg:grid-cols-3">
                <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
                    <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
                        <thead class="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                            <tr>
                                <th class="px-4 py-3">Layanan & Kategori</th>
                                <th class="px-4 py-3 text-right">Harga Dasar</th>
                                <th class="px-4 py-3 text-right">Rentang Fleksibel</th>
                                <th class="px-4 py-3">Status</th>
                                <th class="px-4 py-3 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            ${tariffs.map((tar) => `
                                <tr>
                                    <td class="px-4 py-2.5">
                                        <div class="font-semibold text-slate-900">${escapeHtml(tar.layanan?.nama_layanan || '-')}</div>
                                        <div class="text-xs text-slate-500">${escapeHtml(tar.kategori_kendaraan?.nama_kategori || '-')}</div>
                                    </td>
                                    <td class="px-4 py-2.5 text-right font-bold text-slate-900 tabular-nums">${escapeHtml(formatRupiah(tar.harga_dasar))}</td>
                                    <td class="px-4 py-2.5 text-right text-xs text-slate-600 tabular-nums">${escapeHtml(formatRupiah(tar.batas_bawah))} – ${escapeHtml(formatRupiah(tar.batas_atas))}</td>
                                    <td class="px-4 py-2.5">${tar.status_aktif ? '<span class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Aktif</span>' : '<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Nonaktif</span>'}</td>
                                    <td class="px-4 py-2.5 text-right space-x-2">
                                        <button type="button" data-edit-tar-row="${tar.id_harga}" class="text-xs font-semibold text-teal-700">Ubah</button>
                                        ${tar.status_aktif ? `<button type="button" data-del-tar-row="${tar.id_harga}" class="text-xs font-semibold text-rose-600">Nonaktifkan</button>` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <form id="tar-form" class="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-slate-900">${editing ? 'Ubah Tarif Harga' : 'Tambah Tarif Harga'}</h3>
                        ${editing ? '<button type="button" id="cancel-tar-edit" class="text-xs text-slate-500">Batal</button>' : ''}
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Layanan</label>
                        <select id="tar-layanan" required class="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                            ${services.map((s) => `<option value="${s.id_layanan}" ${Number(editing?.id_layanan) === Number(s.id_layanan) ? 'selected' : ''}>[${escapeHtml(s.tipe_layanan || 'utama')}] ${escapeHtml(s.nama_layanan)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Kategori Kendaraan</label>
                        <select id="tar-kat" required class="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                            ${categories.map((c) => `<option value="${c.id_kategori_kendaraan}" ${Number(editing?.id_kategori_kendaraan) === Number(c.id_kategori_kendaraan) ? 'selected' : ''}>${escapeHtml(c.nama_kategori)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Harga Dasar (Rp)</label>
                        <input id="tar-base" type="number" min="0" required value="${escapeHtml(editing ? Number(editing.harga_dasar) : '')}" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums" />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="mb-1 block text-xs font-medium text-slate-600">Batas Bawah</label>
                            <input id="tar-min" type="number" min="0" required value="${escapeHtml(editing ? Number(editing.batas_bawah) : '')}" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums" />
                        </div>
                        <div>
                            <label class="mb-1 block text-xs font-medium text-slate-600">Batas Atas</label>
                            <input id="tar-max" type="number" min="0" required value="${escapeHtml(editing ? Number(editing.batas_atas) : '')}" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums" />
                        </div>
                    </div>
                    <label class="flex items-center gap-2 text-xs text-slate-700">
                        <input id="tar-aktif" type="checkbox" ${(editing ? editing.status_aktif : true) ? 'checked' : ''} class="rounded border-slate-300 text-teal-700" />
                        <span>Status Aktif</span>
                    </label>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="w-full rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">${editing ? 'Simpan Tarif' : 'Tambah Tarif'}</button>
                </form>
            </div>
        `;
    }

    function bindEvents() {
        container.querySelector('#cat-refresh-btn')?.addEventListener('click', loadCatalogMaster);
        container.querySelectorAll('[data-cat-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                activeTab = btn.getAttribute('data-cat-tab');
                errorObj = null;
                render();
            });
        });

        container.querySelector('#cancel-cat-edit')?.addEventListener('click', () => {
            editingCatId = null;
            render();
        });
        container.querySelector('#cancel-srv-edit')?.addEventListener('click', () => {
            editingSrvId = null;
            render();
        });
        container.querySelector('#cancel-tar-edit')?.addEventListener('click', () => {
            editingTariffId = null;
            render();
        });

        container.querySelectorAll('[data-edit-cat-row]').forEach((b) =>
            b.addEventListener('click', () => {
                editingCatId = Number(b.getAttribute('data-edit-cat-row'));
                render();
            })
        );
        container.querySelectorAll('[data-del-cat-row]').forEach((b) =>
            b.addEventListener('click', async () => {
                try {
                    await washnoteApi.deleteVehicleCategory(Number(b.getAttribute('data-del-cat-row')));
                    showToast('Kategori dinonaktifkan.', 'success');
                    await loadCatalogMaster();
                } catch (err) {
                    errorObj = err;
                    render();
                }
            })
        );

        container.querySelector('#cat-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                jenis_kendaraan: container.querySelector('#cat-jenis')?.value,
                nama_kategori: container.querySelector('#cat-nama')?.value?.trim(),
                status_aktif: Boolean(container.querySelector('#cat-aktif')?.checked),
            };
            isSubmitting = true;
            errorObj = null;
            render();
            try {
                if (editingCatId) {
                    await washnoteApi.updateVehicleCategory(editingCatId, payload);
                    showToast('Kategori diperbarui.', 'success');
                    editingCatId = null;
                } else {
                    await washnoteApi.createVehicleCategory(payload);
                    showToast('Kategori ditambahkan.', 'success');
                }
                await loadCatalogMaster();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            } finally {
                isSubmitting = false;
            }
        });

        container.querySelectorAll('[data-edit-srv-row]').forEach((b) =>
            b.addEventListener('click', () => {
                editingSrvId = Number(b.getAttribute('data-edit-srv-row'));
                render();
            })
        );
        container.querySelectorAll('[data-del-srv-row]').forEach((b) =>
            b.addEventListener('click', async () => {
                try {
                    await washnoteApi.deleteService(Number(b.getAttribute('data-del-srv-row')));
                    showToast('Layanan dinonaktifkan.', 'success');
                    await loadCatalogMaster();
                } catch (err) {
                    errorObj = err;
                    render();
                }
            })
        );

        container.querySelector('#srv-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                nama_layanan: container.querySelector('#srv-nama')?.value?.trim(),
                tipe_layanan: container.querySelector('#srv-tipe')?.value,
                deskripsi: container.querySelector('#srv-desk')?.value?.trim() || null,
                status_aktif: Boolean(container.querySelector('#srv-aktif')?.checked),
            };
            isSubmitting = true;
            errorObj = null;
            render();
            try {
                if (editingSrvId) {
                    await washnoteApi.updateService(editingSrvId, payload);
                    showToast('Layanan diperbarui.', 'success');
                    editingSrvId = null;
                } else {
                    await washnoteApi.createService(payload);
                    showToast('Layanan ditambahkan.', 'success');
                }
                await loadCatalogMaster();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            } finally {
                isSubmitting = false;
            }
        });

        container.querySelectorAll('[data-edit-tar-row]').forEach((b) =>
            b.addEventListener('click', () => {
                editingTariffId = Number(b.getAttribute('data-edit-tar-row'));
                render();
            })
        );
        container.querySelectorAll('[data-del-tar-row]').forEach((b) =>
            b.addEventListener('click', async () => {
                try {
                    await washnoteApi.deleteTariff(Number(b.getAttribute('data-del-tar-row')));
                    showToast('Tarif dinonaktifkan.', 'success');
                    await loadCatalogMaster();
                } catch (err) {
                    errorObj = err;
                    render();
                }
            })
        );

        container.querySelector('#tar-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                id_layanan: Number(container.querySelector('#tar-layanan')?.value),
                id_kategori_kendaraan: Number(container.querySelector('#tar-kat')?.value),
                harga_dasar: Number(container.querySelector('#tar-base')?.value),
                batas_bawah: Number(container.querySelector('#tar-min')?.value),
                batas_atas: Number(container.querySelector('#tar-max')?.value),
                status_aktif: Boolean(container.querySelector('#tar-aktif')?.checked),
            };
            isSubmitting = true;
            errorObj = null;
            render();
            try {
                if (editingTariffId) {
                    await washnoteApi.updateTariff(editingTariffId, payload);
                    showToast('Tarif diperbarui.', 'success');
                    editingTariffId = null;
                } else {
                    await washnoteApi.createTariff(payload);
                    showToast('Tarif ditambahkan.', 'success');
                }
                await loadCatalogMaster();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            } finally {
                isSubmitting = false;
            }
        });
    }

    loadCatalogMaster();
}
