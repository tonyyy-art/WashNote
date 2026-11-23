import { washnoteApi } from '../api/client.js';
import { isOwner, showToast } from '../state/store.js';
import {
    badgeOperasional,
    escapeHtml,
    formatDateFullIndo,
    formatDateIndo,
    formatDateOnly,
    formatTimeHm,
    renderEmptyState,
    renderErrorAlert,
    renderLoadingState,
    renderPageHeader,
} from '../utils/formatters.js';

const DAYS = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];

export function mountOperatingHoursView(container) {
    let isLoading = true;
    let isSubmitting = false;
    let errorObj = null;
    let statusData = null;
    let weeklyList = [];
    let configComplete = false;
    let configWarning = null;
    let exceptionsList = [];
    let editingWeeklyId = null;
    let editingExceptionId = null;

    async function loadAll() {
        isLoading = true;
        errorObj = null;
        render();

        try {
            const [hoursRes, statusRes, excRes] = await Promise.all([
                washnoteApi.getOperatingHours(),
                washnoteApi.getOperatingStatus(),
                washnoteApi.getOperatingExceptions(),
            ]);

            weeklyList = hoursRes?.data || [];
            configComplete = Boolean(hoursRes?.konfigurasi_lengkap);
            configWarning = hoursRes?.peringatan_konfigurasi || null;
            statusData = statusRes?.data || null;
            exceptionsList = excRes?.data || [];
        } catch (err) {
            errorObj = err;
        } finally {
            isLoading = false;
            render();
        }
    }

    function render() {
        const ownerMode = isOwner();
        const configuredDays = new Set(weeklyList.map((item) => item.hari));
        const unconfiguredDays = DAYS.filter((day) => !configuredDays.has(day));
        const editingWeekly = editingWeeklyId ? weeklyList.find((w) => Number(w.id_jam_operasional) === Number(editingWeeklyId)) : null;
        const editingException = editingExceptionId ? exceptionsList.find((e) => Number(e.id_pengecualian) === Number(editingExceptionId)) : null;

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({
                    title: 'Jam Operasional',
                    subtitle: 'Asia/Jakarta (WIB) • Tutup maksimal 21.00 WIB',
                })}

                ${errorObj && weeklyList.length > 0 ? renderErrorAlert(errorObj) : ''}

                ${statusData ? `
                    <div class="wn-card p-4">
                        <div class="flex flex-wrap items-center gap-2.5">
                            <span class="text-xs font-semibold text-slate-600">${escapeHtml(formatDateFullIndo(statusData.tanggal))} • ${escapeHtml(formatTimeHm(statusData.waktu_wib))} WIB</span>
                            ${badgeOperasional(statusData.status_jam_operasional)}
                        </div>
                        ${configWarning ? `<p class="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">${escapeHtml(configWarning)}</p>` : ''}
                    </div>
                ` : ''}

                ${isLoading ? `<div class="wn-card">${renderLoadingState('Memuat jadwal operasional...')}</div>` : errorObj && weeklyList.length === 0 && exceptionsList.length === 0 ? `
                    ${renderEmptyState({
                        kind: 'error',
                        title: 'Gagal memuat jadwal operasional',
                        message: errorObj.message || 'Terjadi kendala saat mengambil data.',
                        actionsHtml: '<button id="hours-retry-btn" type="button" class="wn-btn-secondary">Coba Lagi</button>',
                    })}
                ` : `
                    <div class="grid gap-6 lg:grid-cols-2">
                        <div class="wn-card space-y-4 p-5">
                            <div class="flex items-center justify-between">
                                <h2 class="text-base font-bold text-slate-900">Jadwal Mingguan</h2>
                                <span class="text-xs font-semibold ${configComplete ? 'text-emerald-700' : 'text-amber-700'}">${weeklyList.length}/7 hari</span>
                            </div>

                            ${weeklyList.length === 0 ? renderEmptyState({
                                kind: 'empty',
                                title: 'Belum ada jadwal mingguan',
                                message: ownerMode ? 'Tambahkan jadwal 7 hari agar status operasional akurat.' : 'Jadwal operasional belum diatur oleh Owner.',
                            }) : `
                                <div class="divide-y divide-slate-200 rounded-lg border border-slate-200">
                                    ${weeklyList.map((row) => `
                                        <div class="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                                            <div>
                                                <span class="font-semibold capitalize text-slate-900">${escapeHtml(row.hari)}</span>
                                                <span class="ml-2 text-xs tabular-nums ${row.status_buka ? 'text-emerald-700' : 'text-slate-500'}">
                                                    ${row.status_buka ? `${escapeHtml(formatTimeHm(row.jam_buka))} – ${escapeHtml(formatTimeHm(row.jam_tutup))} WIB` : 'Tutup'}
                                                </span>
                                            </div>
                                            ${ownerMode ? `
                                                <div class="flex gap-2.5">
                                                    <button type="button" data-edit-weekly="${row.id_jam_operasional}" class="text-xs font-semibold text-teal-700 hover:text-teal-900">Ubah</button>
                                                    <button type="button" data-del-weekly="${row.id_jam_operasional}" class="text-xs font-semibold text-rose-600 hover:text-rose-800">Hapus</button>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            `}

                            ${ownerMode ? `
                                <form id="weekly-form" class="space-y-3 border-t border-slate-100 pt-4">
                                    <div class="flex items-center justify-between">
                                        <h3 class="text-xs font-bold uppercase tracking-wide text-slate-700">${editingWeekly ? `Ubah Jadwal (${escapeHtml(editingWeekly.hari)})` : 'Tambah Jadwal Hari'}</h3>
                                        ${editingWeekly ? `<button type="button" id="cancel-edit-weekly" class="text-xs font-medium text-slate-500 hover:text-slate-800">Batal Edit</button>` : ''}
                                    </div>
                                    ${!editingWeekly ? `
                                        <select id="weekly-hari" required class="wn-select capitalize">
                                            ${unconfiguredDays.length > 0 ? unconfiguredDays.map((d) => `<option value="${d}">${escapeHtml(d)}</option>`).join('') : '<option value="" disabled selected>Semua 7 hari sudah terkonfigurasi</option>'}
                                        </select>
                                    ` : ''}
                                    <label class="flex items-center gap-2 text-sm text-slate-700">
                                        <input id="weekly-open" type="checkbox" ${(editingWeekly ? editingWeekly.status_buka : true) ? 'checked' : ''} class="rounded border-slate-300 text-teal-700" />
                                        <span>Buka pada hari ini</span>
                                    </label>
                                    <div class="grid grid-cols-2 gap-3">
                                        <div>
                                            <label class="wn-label">Jam Buka</label>
                                            <input id="weekly-start" type="time" value="${escapeHtml(editingWeekly?.jam_buka ? String(editingWeekly.jam_buka).slice(0, 5) : '08:00')}" class="wn-input" />
                                        </div>
                                        <div>
                                            <label class="wn-label">Jam Tutup (Maks. 21.00)</label>
                                            <input id="weekly-end" type="time" max="21:00" value="${escapeHtml(editingWeekly?.jam_tutup ? String(editingWeekly.jam_tutup).slice(0, 5) : '20:00')}" class="wn-input" />
                                        </div>
                                    </div>
                                    <button type="submit" ${isSubmitting || (!editingWeekly && unconfiguredDays.length === 0) ? 'disabled' : ''} class="wn-btn-primary text-xs">
                                        ${editingWeekly ? 'Simpan Jadwal' : 'Tambah Jadwal'}
                                    </button>
                                </form>
                            ` : ''}
                        </div>

                        <div class="wn-card space-y-4 p-5">
                            <h2 class="text-base font-bold text-slate-900">Pengecualian Tanggal</h2>

                            ${exceptionsList.length === 0 ? renderEmptyState({
                                kind: 'empty',
                                title: 'Belum ada pengecualian tanggal',
                            }) : `
                                <div class="divide-y divide-slate-200 rounded-lg border border-slate-200">
                                    ${exceptionsList.map((exc) => `
                                        <div class="flex items-start justify-between gap-3 px-3.5 py-2.5 text-sm">
                                            <div>
                                                <div class="font-semibold text-slate-900">
                                                    ${escapeHtml(formatDateIndo(exc.tanggal))}
                                                    <span class="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${exc.jenis_pengecualian === 'libur' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}">
                                                        ${escapeHtml(exc.jenis_pengecualian === 'libur' ? 'Libur' : 'Jam Khusus')}
                                                    </span>
                                                </div>
                                                <p class="text-xs text-slate-600">
                                                    ${exc.jenis_pengecualian === 'jam_khusus' ? `${escapeHtml(formatTimeHm(exc.jam_buka))}–${escapeHtml(formatTimeHm(exc.jam_tutup))} WIB • ` : ''}${escapeHtml(exc.keterangan)}
                                                </p>
                                            </div>
                                            ${ownerMode ? `
                                                <div class="flex gap-2.5">
                                                    <button type="button" data-edit-exc="${exc.id_pengecualian}" class="text-xs font-semibold text-teal-700 hover:text-teal-900">Ubah</button>
                                                    <button type="button" data-del-exc="${exc.id_pengecualian}" class="text-xs font-semibold text-rose-600 hover:text-rose-800">Hapus</button>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            `}

                            ${ownerMode ? `
                                <form id="exc-form" class="space-y-3 border-t border-slate-100 pt-4">
                                    <div class="flex items-center justify-between">
                                        <h3 class="text-xs font-bold uppercase tracking-wide text-slate-700">${editingException ? `Ubah Pengecualian (${escapeHtml(formatDateIndo(editingException.tanggal))})` : 'Tambah Pengecualian'}</h3>
                                        ${editingException ? `<button type="button" id="cancel-edit-exc" class="text-xs font-medium text-slate-500 hover:text-slate-800">Batal Edit</button>` : ''}
                                    </div>
                                    <div class="grid grid-cols-2 gap-3">
                                        <div>
                                            <label class="wn-label">Tanggal</label>
                                            <input id="exc-date" type="date" required value="${escapeHtml(editingException ? formatDateOnly(editingException.tanggal) : '')}" class="wn-input" />
                                        </div>
                                        <div>
                                            <label class="wn-label">Jenis</label>
                                            <select id="exc-type" class="wn-select">
                                                <option value="libur" ${editingException?.jenis_pengecualian !== 'jam_khusus' ? 'selected' : ''}>Hari Libur (Tutup)</option>
                                                <option value="jam_khusus" ${editingException?.jenis_pengecualian === 'jam_khusus' ? 'selected' : ''}>Jam Khusus</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="grid grid-cols-2 gap-3">
                                        <div>
                                            <label class="wn-label">Jam Buka (Jam Khusus)</label>
                                            <input id="exc-start" type="time" value="${escapeHtml(editingException?.jam_buka ? String(editingException.jam_buka).slice(0, 5) : '09:00')}" class="wn-input" />
                                        </div>
                                        <div>
                                            <label class="wn-label">Jam Tutup (Maks. 21.00)</label>
                                            <input id="exc-end" type="time" max="21:00" value="${escapeHtml(editingException?.jam_tutup ? String(editingException.jam_tutup).slice(0, 5) : '17:00')}" class="wn-input" />
                                        </div>
                                    </div>
                                    <div>
                                        <label class="wn-label">Keterangan</label>
                                        <input id="exc-note" type="text" required minlength="3" value="${escapeHtml(editingException?.keterangan || '')}" placeholder="Contoh: Hari Raya / Perawatan Peralatan" class="wn-input" />
                                    </div>
                                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary text-xs">
                                        ${editingException ? 'Simpan Pengecualian' : 'Tambah Pengecualian'}
                                    </button>
                                </form>
                            ` : ''}
                        </div>
                    </div>
                `}
            </div>
        `;

        bindEvents();
    }

    function bindEvents() {
        container.querySelector('#hours-retry-btn')?.addEventListener('click', loadAll);
        container.querySelector('#cancel-edit-weekly')?.addEventListener('click', () => {
            editingWeeklyId = null;
            render();
        });
        container.querySelector('#cancel-edit-exc')?.addEventListener('click', () => {
            editingExceptionId = null;
            render();
        });

        container.querySelectorAll('[data-edit-weekly]').forEach((btn) => {
            btn.addEventListener('click', () => {
                editingWeeklyId = Number(btn.getAttribute('data-edit-weekly'));
                render();
            });
        });

        container.querySelectorAll('[data-del-weekly]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await washnoteApi.deleteOperatingHour(Number(btn.getAttribute('data-del-weekly')));
                    showToast('Jadwal mingguan dihapus.', 'success');
                    editingWeeklyId = null;
                    await loadAll();
                } catch (err) {
                    errorObj = err;
                    render();
                }
            });
        });

        container.querySelector('#weekly-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const isOpen = Boolean(container.querySelector('#weekly-open')?.checked);
            const jamBuka = container.querySelector('#weekly-start')?.value || null;
            const jamTutup = container.querySelector('#weekly-end')?.value || null;
            const hari = !editingWeeklyId ? container.querySelector('#weekly-hari')?.value : null;

            isSubmitting = true;
            errorObj = null;
            render();

            try {
                if (editingWeeklyId) {
                    await washnoteApi.updateOperatingHour(editingWeeklyId, {
                        status_buka: isOpen,
                        jam_buka: isOpen ? jamBuka : null,
                        jam_tutup: isOpen ? jamTutup : null,
                    });
                    showToast('Jadwal operasional diperbarui.', 'success');
                    editingWeeklyId = null;
                } else {
                    await washnoteApi.createOperatingHour({
                        hari,
                        status_buka: isOpen,
                        jam_buka: isOpen ? jamBuka : null,
                        jam_tutup: isOpen ? jamTutup : null,
                    });
                    showToast('Jadwal operasional ditambahkan.', 'success');
                }
                isSubmitting = false;
                await loadAll();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });

        container.querySelectorAll('[data-edit-exc]').forEach((btn) => {
            btn.addEventListener('click', () => {
                editingExceptionId = Number(btn.getAttribute('data-edit-exc'));
                render();
            });
        });

        container.querySelectorAll('[data-del-exc]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await washnoteApi.deleteOperatingException(Number(btn.getAttribute('data-del-exc')));
                    showToast('Pengecualian jam operasional dihapus.', 'success');
                    editingExceptionId = null;
                    await loadAll();
                } catch (err) {
                    errorObj = err;
                    render();
                }
            });
        });

        container.querySelector('#exc-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tanggal = container.querySelector('#exc-date')?.value;
            const jenis = container.querySelector('#exc-type')?.value;
            const jamBuka = container.querySelector('#exc-start')?.value || null;
            const jamTutup = container.querySelector('#exc-end')?.value || null;
            const keterangan = container.querySelector('#exc-note')?.value?.trim() || '';

            const payload = {
                tanggal,
                jenis_pengecualian: jenis,
                jam_buka: jenis === 'jam_khusus' ? jamBuka : null,
                jam_tutup: jenis === 'jam_khusus' ? jamTutup : null,
                keterangan,
            };

            isSubmitting = true;
            errorObj = null;
            render();

            try {
                if (editingExceptionId) {
                    await washnoteApi.updateOperatingException(editingExceptionId, payload);
                    showToast('Pengecualian diperbarui.', 'success');
                    editingExceptionId = null;
                } else {
                    await washnoteApi.createOperatingException(payload);
                    showToast('Pengecualian ditambahkan.', 'success');
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
