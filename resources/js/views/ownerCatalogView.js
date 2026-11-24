import { washnoteApi } from '../api/client.js';
import { createViewMotion, scrollToElement } from '../motion/motionSystem.js';
import { APP_VIEWS, navigateBack, showToast } from '../state/store.js';
import {
    badgeStatusAktif,
    escapeHtml,
    formatRupiah,
    renderEmptyState,
    renderErrorAlert,
    renderLoadingState,
    renderPageHeader,
} from '../utils/formatters.js';

export function mountOwnerCatalogView(container) {
    const motion = createViewMotion(container);
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
            motion.runIntro();
        }
    }

    function render() {
        const hasAnyData = categories.length > 0 || services.length > 0 || tariffs.length > 0;

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({
                    backBtnId: 'cat-back-btn',
                    title: 'Katalog & Tarif Layanan',
                })}

                ${errorObj && hasAnyData ? renderErrorAlert(errorObj) : ''}

                <div class="flex flex-wrap gap-2 border-b border-border-subtle pb-2">
                    ${[
                        ['categories', `Kategori Kendaraan (${categories.length})`],
                        ['services', `Layanan (${services.length})`],
                        ['tariffs', `Tarif & Batas Harga (${tariffs.length})`],
                    ].map(([tab, label]) => `
                        <button type="button" data-cat-tab="${tab}" class="min-h-[38px] rounded-lg px-3.5 py-2 text-xs font-semibold transition active:scale-[0.985] ${activeTab === tab ? 'bg-brand-navy text-white shadow-xs' : 'bg-surface text-ink-muted ring-1 ring-border-subtle hover:bg-app-bg hover:text-ink'}">
                            ${escapeHtml(label)}
                        </button>
                    `).join('')}
                </div>

                ${isLoading ? `<div class="wn-card">${renderLoadingState('Memuat katalog layanan...')}</div>` : errorObj && !hasAnyData ? `
                    ${renderEmptyState({
                        kind: 'error',
                        title: 'Gagal memuat katalog & tarif',
                        message: errorObj.message || 'Terjadi kendala saat mengambil data.',
                        actionsHtml: '<button id="cat-retry-btn" type="button" class="wn-btn-secondary">Coba Lagi</button>',
                    })}
                ` : ''}
                ${!isLoading && !(errorObj && !hasAnyData) && activeTab === 'categories' ? `<div data-motion-tabpanel>${renderCategoriesTab()}</div>` : ''}
                ${!isLoading && !(errorObj && !hasAnyData) && activeTab === 'services' ? `<div data-motion-tabpanel>${renderServicesTab()}</div>` : ''}
                ${!isLoading && !(errorObj && !hasAnyData) && activeTab === 'tariffs' ? `<div data-motion-tabpanel>${renderTariffsTab()}</div>` : ''}
            </div>
        `;

        bindEvents();
        if (!isLoading) {
            motion.refresh();
        }
    }

    function renderCategoriesTab() {
        const editing = editingCatId ? categories.find((c) => Number(c.id_kategori_kendaraan) === Number(editingCatId)) : null;

        return `
            <div class="grid gap-6 lg:grid-cols-3">
                <div class="wn-card min-w-0 overflow-hidden lg:col-span-2">
                    ${categories.length === 0 ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'empty',
                                title: 'Belum ada kategori kendaraan',
                                message: 'Tambahkan kategori kendaraan melalui formulir di samping.',
                            })}
                        </div>
                    ` : `
                        <div class="divide-y divide-border-subtle md:hidden">
                            ${categories.map((cat) => `
                                <div class="flex flex-col gap-2 p-4">
                                    <div class="flex items-start justify-between gap-2">
                                        <div>
                                            <p class="font-semibold text-ink">${escapeHtml(cat.nama_kategori)}</p>
                                            <p class="text-xs capitalize text-ink-muted">${escapeHtml(cat.jenis_kendaraan)}</p>
                                        </div>
                                        ${badgeStatusAktif(Boolean(cat.status_aktif))}
                                    </div>
                                    <div class="flex flex-wrap gap-2">
                                        <button type="button" data-edit-cat-row="${cat.id_kategori_kendaraan}" class="wn-link inline-flex min-h-[34px] items-center rounded-md border border-accent-border bg-accent-soft px-3 text-xs">Ubah</button>
                                        ${cat.status_aktif ? `<button type="button" data-del-cat-row="${cat.id_kategori_kendaraan}" class="inline-flex min-h-[34px] items-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-danger hover:bg-red-100">Nonaktifkan</button>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="hidden overflow-x-auto md:block">
                            <table class="min-w-full divide-y divide-border-subtle text-left text-sm">
                                <thead class="bg-app-bg text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                    <tr>
                                        <th class="px-4 py-3">Jenis</th>
                                        <th class="px-4 py-3">Nama Kategori</th>
                                        <th class="px-4 py-3">Status</th>
                                        <th class="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-border-subtle">
                                    ${categories.map((cat) => `
                                        <tr class="hover:bg-app-bg/50">
                                            <td class="px-4 py-3 capitalize text-ink-muted">${escapeHtml(cat.jenis_kendaraan)}</td>
                                            <td class="px-4 py-3 font-semibold text-ink">${escapeHtml(cat.nama_kategori)}</td>
                                            <td class="px-4 py-3">${badgeStatusAktif(Boolean(cat.status_aktif))}</td>
                                            <td class="px-4 py-3 text-right space-x-2.5">
                                                <button type="button" data-edit-cat-row="${cat.id_kategori_kendaraan}" class="wn-link text-xs">Ubah</button>
                                                ${cat.status_aktif ? `<button type="button" data-del-cat-row="${cat.id_kategori_kendaraan}" class="text-xs font-semibold text-danger hover:text-red-800">Nonaktifkan</button>` : ''}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>

                <form id="cat-form" class="wn-card space-y-3.5 self-start p-5">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-ink">${editing ? 'Ubah Kategori' : 'Tambah Kategori'}</h3>
                        ${editing ? '<button type="button" id="cancel-cat-edit" class="text-xs font-medium text-ink-muted hover:text-ink">Batal</button>' : ''}
                    </div>
                    <div>
                        <label for="cat-jenis" class="wn-label">Jenis Kendaraan</label>
                        <select id="cat-jenis" class="wn-select">
                            <option value="motor" ${editing?.jenis_kendaraan === 'motor' ? 'selected' : ''}>Motor</option>
                            <option value="mobil" ${editing?.jenis_kendaraan === 'mobil' ? 'selected' : ''}>Mobil</option>
                        </select>
                    </div>
                    <div>
                        <label for="cat-nama" class="wn-label">Nama Kategori <span class="text-danger">*</span></label>
                        <input id="cat-nama" type="text" required value="${escapeHtml(editing?.nama_kategori || '')}" placeholder="Mis. Motor Besar / Mobil SUV" class="wn-input" />
                    </div>
                    <label class="flex items-center gap-2 text-xs text-ink">
                        <input id="cat-aktif" type="checkbox" ${(editing ? editing.status_aktif : true) ? 'checked' : ''} class="wn-checkbox" />
                        <span>Status Aktif</span>
                    </label>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary w-full">${editing ? 'Simpan Perubahan' : 'Tambah Kategori'}</button>
                </form>
            </div>
        `;
    }

    function renderServicesTab() {
        const editing = editingSrvId ? services.find((s) => Number(s.id_layanan) === Number(editingSrvId)) : null;

        return `
            <div class="grid gap-6 lg:grid-cols-3">
                <div class="wn-card min-w-0 overflow-hidden lg:col-span-2">
                    ${services.length === 0 ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'empty',
                                title: 'Belum ada layanan',
                                message: 'Tambahkan layanan utama atau tambahan melalui formulir di samping.',
                            })}
                        </div>
                    ` : `
                        <div class="divide-y divide-border-subtle md:hidden">
                            ${services.map((srv) => `
                                <div class="flex flex-col gap-2 p-4">
                                    <div class="flex items-start justify-between gap-2">
                                        <div class="min-w-0">
                                            <p class="font-semibold text-ink">${escapeHtml(srv.nama_layanan)}</p>
                                            ${srv.deskripsi ? `<p class="text-xs text-ink-muted">${escapeHtml(srv.deskripsi)}</p>` : ''}
                                        </div>
                                        <span class="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ${srv.tipe_layanan === 'tambahan' ? 'bg-slate-100 text-brand-navy' : 'bg-accent-soft text-accent'}">${escapeHtml(srv.tipe_layanan || 'utama')}</span>
                                    </div>
                                    <div class="flex flex-wrap items-center justify-between gap-2">
                                        ${badgeStatusAktif(Boolean(srv.status_aktif))}
                                        <div class="flex flex-wrap gap-2">
                                            <button type="button" data-edit-srv-row="${srv.id_layanan}" class="wn-link inline-flex min-h-[34px] items-center rounded-md border border-accent-border bg-accent-soft px-3 text-xs">Ubah</button>
                                            ${srv.status_aktif ? `<button type="button" data-del-srv-row="${srv.id_layanan}" class="inline-flex min-h-[34px] items-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-danger hover:bg-red-100">Nonaktifkan</button>` : ''}
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="hidden overflow-x-auto md:block">
                            <table class="min-w-full divide-y divide-border-subtle text-left text-sm">
                                <thead class="bg-app-bg text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                    <tr>
                                        <th class="px-4 py-3">Nama Layanan</th>
                                        <th class="px-4 py-3">Tipe</th>
                                        <th class="px-4 py-3">Status</th>
                                        <th class="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-border-subtle">
                                    ${services.map((srv) => `
                                        <tr class="hover:bg-app-bg/50">
                                            <td class="px-4 py-3">
                                                <div class="font-semibold text-ink">${escapeHtml(srv.nama_layanan)}</div>
                                                ${srv.deskripsi ? `<div class="text-xs text-ink-muted">${escapeHtml(srv.deskripsi)}</div>` : ''}
                                            </td>
                                            <td class="px-4 py-3">
                                                <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${srv.tipe_layanan === 'tambahan' ? 'bg-slate-100 text-brand-navy' : 'bg-accent-soft text-accent'}">${escapeHtml(srv.tipe_layanan || 'utama')}</span>
                                            </td>
                                            <td class="px-4 py-3">${badgeStatusAktif(Boolean(srv.status_aktif))}</td>
                                            <td class="px-4 py-3 text-right space-x-2.5">
                                                <button type="button" data-edit-srv-row="${srv.id_layanan}" class="wn-link text-xs">Ubah</button>
                                                ${srv.status_aktif ? `<button type="button" data-del-srv-row="${srv.id_layanan}" class="text-xs font-semibold text-danger hover:text-red-800">Nonaktifkan</button>` : ''}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>

                <form id="srv-form" class="wn-card space-y-3.5 self-start p-5">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-ink">${editing ? 'Ubah Layanan' : 'Tambah Layanan'}</h3>
                        ${editing ? '<button type="button" id="cancel-srv-edit" class="text-xs font-medium text-ink-muted hover:text-ink">Batal</button>' : ''}
                    </div>
                    <div>
                        <label for="srv-nama" class="wn-label">Nama Layanan <span class="text-danger">*</span></label>
                        <input id="srv-nama" type="text" required value="${escapeHtml(editing?.nama_layanan || '')}" placeholder="Mis. Cuci Salju / Semir Ban" class="wn-input" />
                    </div>
                    <div>
                        <label for="srv-tipe" class="wn-label">Tipe Layanan</label>
                        <select id="srv-tipe" class="wn-select">
                            <option value="utama" ${editing?.tipe_layanan !== 'tambahan' ? 'selected' : ''}>Utama</option>
                            <option value="tambahan" ${editing?.tipe_layanan === 'tambahan' ? 'selected' : ''}>Tambahan (Add-On)</option>
                        </select>
                    </div>
                    <div>
                        <label for="srv-desk" class="wn-label">Deskripsi (Opsional)</label>
                        <input id="srv-desk" type="text" value="${escapeHtml(editing?.deskripsi || '')}" class="wn-input" />
                    </div>
                    <label class="flex items-center gap-2 text-xs text-ink">
                        <input id="srv-aktif" type="checkbox" ${(editing ? editing.status_aktif : true) ? 'checked' : ''} class="wn-checkbox" />
                        <span>Status Aktif</span>
                    </label>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary w-full">${editing ? 'Simpan Perubahan' : 'Tambah Layanan'}</button>
                </form>
            </div>
        `;
    }

    function renderTariffsTab() {
        const editing = editingTariffId ? tariffs.find((t) => Number(t.id_harga) === Number(editingTariffId)) : null;
        const missingPrereq = categories.length === 0 || services.length === 0;

        return `
            <div class="grid gap-6 lg:grid-cols-3">
                <div class="wn-card min-w-0 overflow-hidden lg:col-span-2">
                    ${tariffs.length === 0 ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: missingPrereq ? 'prerequisite' : 'empty',
                                title: missingPrereq ? 'Prasyarat tarif belum terpenuhi' : 'Belum ada tarif layanan',
                                message: missingPrereq
                                    ? 'Aktifkan minimal 1 kategori kendaraan dan 1 layanan terlebih dahulu.'
                                    : 'Tambahkan tarif dasar dan batas harga pada formulir di samping.',
                            })}
                        </div>
                    ` : `
                        <div class="divide-y divide-border-subtle md:hidden">
                            ${tariffs.map((tar) => `
                                <div class="space-y-2 p-4">
                                    <div class="flex items-start justify-between gap-2">
                                        <div>
                                            <p class="font-semibold text-ink">${escapeHtml(tar.layanan?.nama_layanan || '-')}</p>
                                            <p class="text-xs text-ink-muted">${escapeHtml(tar.kategori_kendaraan?.nama_kategori || '-')}</p>
                                        </div>
                                        ${badgeStatusAktif(Boolean(tar.status_aktif))}
                                    </div>
                                    <div class="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-app-bg px-3 py-2 text-xs">
                                        <span class="font-bold text-ink tabular-nums">${escapeHtml(formatRupiah(tar.harga_dasar))}</span>
                                        <span class="text-ink-muted tabular-nums">Rentang: ${escapeHtml(formatRupiah(tar.batas_bawah))} – ${escapeHtml(formatRupiah(tar.batas_atas))}</span>
                                    </div>
                                    <div class="flex flex-wrap gap-2">
                                        <button type="button" data-edit-tar-row="${tar.id_harga}" class="wn-link inline-flex min-h-[34px] items-center rounded-md border border-accent-border bg-accent-soft px-3 text-xs">Ubah</button>
                                        ${tar.status_aktif ? `<button type="button" data-del-tar-row="${tar.id_harga}" class="inline-flex min-h-[34px] items-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-danger hover:bg-red-100">Nonaktifkan</button>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="hidden overflow-x-auto md:block">
                            <table class="min-w-full divide-y divide-border-subtle text-left text-sm">
                                <thead class="bg-app-bg text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                    <tr>
                                        <th class="px-4 py-3">Layanan & Kategori</th>
                                        <th class="px-4 py-3 text-right">Harga Dasar</th>
                                        <th class="px-4 py-3 text-right">Rentang Fleksibel</th>
                                        <th class="px-4 py-3">Status</th>
                                        <th class="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-border-subtle">
                                    ${tariffs.map((tar) => `
                                        <tr class="hover:bg-app-bg/50">
                                            <td class="px-4 py-3">
                                                <div class="font-semibold text-ink">${escapeHtml(tar.layanan?.nama_layanan || '-')}</div>
                                                <div class="text-xs text-ink-muted">${escapeHtml(tar.kategori_kendaraan?.nama_kategori || '-')}</div>
                                            </td>
                                            <td class="px-4 py-3 text-right font-bold text-ink tabular-nums">${escapeHtml(formatRupiah(tar.harga_dasar))}</td>
                                            <td class="px-4 py-3 text-right text-xs text-ink-muted tabular-nums">${escapeHtml(formatRupiah(tar.batas_bawah))} – ${escapeHtml(formatRupiah(tar.batas_atas))}</td>
                                            <td class="px-4 py-3">${badgeStatusAktif(Boolean(tar.status_aktif))}</td>
                                            <td class="px-4 py-3 text-right space-x-2.5">
                                                <button type="button" data-edit-tar-row="${tar.id_harga}" class="wn-link text-xs">Ubah</button>
                                                ${tar.status_aktif ? `<button type="button" data-del-tar-row="${tar.id_harga}" class="text-xs font-semibold text-danger hover:text-red-800">Nonaktifkan</button>` : ''}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>

                ${missingPrereq ? `
                    <div class="self-start">
                        ${renderEmptyState({
                            kind: 'prerequisite',
                            title: 'Belum bisa menambah tarif',
                            message: 'Tambahkan minimal 1 kategori kendaraan dan 1 layanan terlebih dahulu.',
                            actionsHtml: `
                                ${categories.length === 0 ? '<button type="button" data-cat-tab="categories" class="wn-btn-secondary text-xs">Buka Kategori</button>' : ''}
                                ${services.length === 0 ? '<button type="button" data-cat-tab="services" class="wn-btn-secondary text-xs">Buka Layanan</button>' : ''}
                            `,
                        })}
                    </div>
                ` : `
                    <form id="tar-form" class="wn-card space-y-3.5 self-start p-5">
                        <div class="flex items-center justify-between">
                            <h3 class="text-sm font-bold text-ink">${editing ? 'Ubah Tarif Harga' : 'Tambah Tarif Harga'}</h3>
                            ${editing ? '<button type="button" id="cancel-tar-edit" class="text-xs font-medium text-ink-muted hover:text-ink">Batal</button>' : ''}
                        </div>
                        <div>
                            <label for="tar-layanan" class="wn-label">Layanan</label>
                            <select id="tar-layanan" required class="wn-select">
                                ${services.map((s) => `<option value="${s.id_layanan}" ${Number(editing?.id_layanan) === Number(s.id_layanan) ? 'selected' : ''}>[${escapeHtml(s.tipe_layanan || 'utama')}] ${escapeHtml(s.nama_layanan)}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label for="tar-kat" class="wn-label">Kategori Kendaraan</label>
                            <select id="tar-kat" required class="wn-select">
                                ${categories.map((c) => `<option value="${c.id_kategori_kendaraan}" ${Number(editing?.id_kategori_kendaraan) === Number(c.id_kategori_kendaraan) ? 'selected' : ''}>${escapeHtml(c.nama_kategori)}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label for="tar-base" class="wn-label">Harga Dasar (Rp) <span class="text-danger">*</span></label>
                            <input id="tar-base" type="number" min="0" required value="${escapeHtml(editing ? Number(editing.harga_dasar) : '')}" class="wn-input tabular-nums" />
                        </div>
                        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label for="tar-min" class="wn-label">Batas Bawah <span class="text-danger">*</span></label>
                                <input id="tar-min" type="number" min="0" required value="${escapeHtml(editing ? Number(editing.batas_bawah) : '')}" class="wn-input tabular-nums" />
                            </div>
                            <div>
                                <label for="tar-max" class="wn-label">Batas Atas <span class="text-danger">*</span></label>
                                <input id="tar-max" type="number" min="0" required value="${escapeHtml(editing ? Number(editing.batas_atas) : '')}" class="wn-input tabular-nums" />
                            </div>
                        </div>
                        <label class="flex items-center gap-2 text-xs text-ink">
                            <input id="tar-aktif" type="checkbox" ${(editing ? editing.status_aktif : true) ? 'checked' : ''} class="wn-checkbox" />
                            <span>Status Aktif</span>
                        </label>
                        <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary w-full">${editing ? 'Simpan Tarif' : 'Tambah Tarif'}</button>
                    </form>
                `}
            </div>
        `;
    }

    function bindEvents() {
        container.querySelector('#cat-back-btn')?.addEventListener('click', () => navigateBack(APP_VIEWS.PROFILE));
        container.querySelector('#cat-retry-btn')?.addEventListener('click', loadCatalogMaster);
        container.querySelectorAll('[data-cat-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                activeTab = btn.getAttribute('data-cat-tab');
                errorObj = null;
                render();
                motion.animateTabPanel();
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
                scrollToElement('#cat-form');
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
                isSubmitting = false;
                await loadCatalogMaster();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });

        container.querySelectorAll('[data-edit-srv-row]').forEach((b) =>
            b.addEventListener('click', () => {
                editingSrvId = Number(b.getAttribute('data-edit-srv-row'));
                render();
                scrollToElement('#srv-form');
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
                isSubmitting = false;
                await loadCatalogMaster();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });

        container.querySelectorAll('[data-edit-tar-row]').forEach((b) =>
            b.addEventListener('click', () => {
                editingTariffId = Number(b.getAttribute('data-edit-tar-row'));
                render();
                scrollToElement('#tar-form');
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
                isSubmitting = false;
                await loadCatalogMaster();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });
    }

    loadCatalogMaster();
}
