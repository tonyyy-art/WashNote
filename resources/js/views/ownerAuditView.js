import { isAbortError, washnoteApi } from '../api/client.js';
import { createViewMotion } from '../motion/motionSystem.js';
import { APP_VIEWS, navigateBack } from '../state/store.js';
import {
    escapeHtml,
    formatDateIndo,
    formatDateTimeWib,
    formatRupiah,
    formatTimeHm,
    renderEmptyState,
    renderErrorAlert,
    renderLoadingState,
    renderPageHeader,
    renderPaginationBar,
} from '../utils/formatters.js';

const ENTITIES = [
    ['', 'Semua Entitas'],
    ['pesanan', 'Pesanan'],
    ['kendaraan_pesanan', 'Kendaraan Pesanan'],
    ['pembayaran', 'Pembayaran'],
    ['pengguna', 'Akun Pengguna'],
    ['kategori_kendaraan', 'Kategori Kendaraan'],
    ['layanan', 'Layanan'],
    ['harga_layanan', 'Tarif Layanan'],
    ['kategori_pengeluaran', 'Kategori Pengeluaran'],
    ['pengeluaran', 'Pengeluaran'],
    ['jam_operasional', 'Jam Operasional'],
    ['pengecualian_jam_operasional', 'Pengecualian Jam'],
];

const ENTITY_LABELS = Object.fromEntries(ENTITIES.filter(([k]) => k !== ''));

const FIELD_LABELS = {
    aksi: 'Aksi',
    nomor_nota: 'Nomor Nota',
    status_pesanan: 'Status Pesanan',
    status_proses: 'Status Kendaraan',
    catatan: 'Catatan',
    plat_nomor: 'Plat Nomor',
    status_pembayaran: 'Status Pembayaran',
    jumlah_dibayar: 'Nilai Tagihan Dibayar',
    uang_diterima: 'Uang Diterima',
    kembalian: 'Kembalian',
    metode_pembayaran: 'Metode Pembayaran',
    waktu_penerimaan: 'Waktu Pembayaran',
    subtotal_utama: 'Subtotal Utama',
    subtotal_tambahan: 'Subtotal Tambahan',
    total_harga: 'Total Tagihan',
    alasan_pembatalan: 'Alasan Pembatalan',
    kendaraan: 'Kendaraan & Layanan',
    nama_kategori: 'Nama Kategori',
    jenis_kendaraan: 'Jenis Kendaraan',
    nama_layanan: 'Nama Layanan',
    tipe_layanan: 'Tipe Layanan',
    deskripsi: 'Deskripsi',
    harga_dasar: 'Harga Dasar',
    batas_bawah: 'Batas Bawah',
    batas_atas: 'Batas Atas',
    status_aktif: 'Status Aktif',
    nama_lengkap: 'Nama Lengkap',
    username: 'Username',
    peran: 'Peran',
    nominal: 'Nominal',
    tanggal_pengeluaran: 'Tanggal Pengeluaran',
    status_pengeluaran: 'Status Pengeluaran',
    hari: 'Hari',
    status_buka: 'Status Buka',
    jam_buka: 'Jam Buka',
    jam_tutup: 'Jam Tutup',
    tanggal: 'Tanggal',
    jenis_pengecualian: 'Jenis Pengecualian',
    keterangan: 'Keterangan',
    di_luar_jam_operasional: 'Di Luar Jam Operasional',
    pada_hari_libur: 'Pada Hari Libur',
    konfirmasi_hari_libur: 'Konfirmasi Hari Libur',
    status_jam_operasional: 'Status Operasional',
};

const MONEY_FIELDS = new Set([
    'jumlah_dibayar',
    'uang_diterima',
    'kembalian',
    'subtotal_utama',
    'subtotal_tambahan',
    'total_harga',
    'harga_dasar',
    'batas_bawah',
    'batas_atas',
    'nominal',
]);

const DATE_FIELDS = new Set(['tanggal_pengeluaran', 'tanggal']);
const TIME_FIELDS = new Set(['jam_buka', 'jam_tutup']);
const TIMESTAMP_FIELDS = new Set(['waktu_penerimaan']);

const IGNORED_TECHNICAL_KEYS = new Set([
    'version',
    'kata_sandi_hash',
    'password',
    'token',
    'created_at',
    'updated_at',
]);

function isTechnicalKey(key) {
    return IGNORED_TECHNICAL_KEYS.has(key) || key.startsWith('id_');
}

function formatVehiclesSummary(list) {
    if (!Array.isArray(list) || list.length === 0) {
        return '-';
    }

    return list
        .map((v, idx) => {
            const name = v.nama_kategori_snapshot || 'Kendaraan';
            const plate = v.plat_nomor ? ` (${v.plat_nomor})` : '';
            const services = Array.isArray(v.detail_layanan)
                ? v.detail_layanan.map((d) => `${d.nama_layanan_snapshot}: ${formatRupiah(d.harga_akhir)}`).join(', ')
                : '';
            return `#${idx + 1} ${name}${plate}${services ? ` — ${services}` : ''}`;
        })
        .join(' | ');
}

function formatAuditValue(key, val) {
    if (val === null || val === undefined || val === '') {
        return '-';
    }

    if (key === 'kendaraan' && Array.isArray(val)) {
        return formatVehiclesSummary(val);
    }

    if (typeof val === 'boolean') {
        if (key === 'status_aktif') {
            return val ? 'Aktif' : 'Nonaktif';
        }
        if (key === 'status_buka') {
            return val ? 'Buka' : 'Tutup';
        }
        return val ? 'Ya' : 'Tidak';
    }

    if (MONEY_FIELDS.has(key) && !Number.isNaN(Number(val))) {
        return formatRupiah(val);
    }

    if (DATE_FIELDS.has(key)) {
        return formatDateIndo(val);
    }

    if (TIME_FIELDS.has(key)) {
        return formatTimeHm(val);
    }

    if (TIMESTAMP_FIELDS.has(key)) {
        return formatDateTimeWib(val);
    }

    if (typeof val === 'object') {
        return JSON.stringify(val);
    }

    return String(val);
}

function buildHumanDiffRows(beforeObj, afterObj) {
    const before = beforeObj && typeof beforeObj === 'object' ? beforeObj : {};
    const after = afterObj && typeof afterObj === 'object' ? afterObj : {};
    const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !isTechnicalKey(k));

    const hasBoth = Boolean(beforeObj) && Boolean(afterObj);
    const rows = [];

    for (const key of allKeys) {
        const beforeStr = formatAuditValue(key, before[key]);
        const afterStr = formatAuditValue(key, after[key]);
        const changed = hasBoth ? beforeStr !== afterStr : true;

        if (hasBoth && !changed) {
            continue;
        }

        rows.push({
            label: FIELD_LABELS[key] || key.replace(/_/g, ' '),
            before: beforeObj ? beforeStr : '-',
            after: afterObj ? afterStr : '-',
            changed,
        });
    }

    return rows;
}

function stripSensitiveTechnicalFields(obj) {
    if (!obj || typeof obj !== 'object') {
        return null;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => stripSensitiveTechnicalFields(item));
    }

    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
        if (IGNORED_TECHNICAL_KEYS.has(k)) {
            continue;
        }
        clean[k] = typeof v === 'object' && v !== null ? stripSensitiveTechnicalFields(v) : v;
    }
    return clean;
}

export function mountOwnerAuditView(container) {
    const motion = createViewMotion(container);
    const abortController = new AbortController();
    let isDisposed = false;
    let isLoading = true;
    let errorObj = null;
    let auditPage = null;
    let filters = { entitas: '', record_id: '', page: 1 };

    async function loadLogs() {
        isLoading = true;
        errorObj = null;
        render();

        let wasAborted = false;
        try {
            const res = await washnoteApi.getAuditLogs({ ...filters, per_page: 15 }, { signal: abortController.signal });
            if (isDisposed) {
                return;
            }
            auditPage = res?.data || null;
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
        const rows = auditPage?.data || [];
        const hasFilter = filters.entitas !== '' || filters.record_id !== '';

        container.innerHTML = `
            <div class="space-y-5">
                ${renderPageHeader({
                    backBtnId: 'audit-back-btn',
                    title: 'Audit Perubahan',
                })}

                <form id="audit-filter-form" data-motion-card class="wn-card flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
                    <div class="w-full sm:w-56">
                        <label for="audit-entity" class="wn-label">Entitas</label>
                        <select id="audit-entity" class="wn-select">
                            ${ENTITIES.map(([val, lbl]) => `<option value="${val}" ${filters.entitas === val ? 'selected' : ''}>${escapeHtml(lbl)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="w-full sm:w-36">
                        <label for="audit-record-id" class="wn-label">ID Record</label>
                        <input id="audit-record-id" type="number" min="1" value="${escapeHtml(filters.record_id)}" placeholder="Mis. 12" class="wn-input" />
                    </div>
                    <button type="submit" class="wn-btn-dark w-full sm:w-auto">Filter</button>
                </form>

                ${errorObj && rows.length > 0 ? renderErrorAlert(errorObj) : ''}

                <div data-motion-reveal class="wn-card overflow-hidden">
                    ${isLoading ? renderLoadingState('Memuat riwayat perubahan...') : errorObj && rows.length === 0 ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'error',
                                title: 'Gagal memuat log audit',
                                message: errorObj.message || 'Terjadi kendala saat mengambil data audit.',
                                actionsHtml: '<button id="audit-retry-btn" type="button" class="wn-btn-secondary">Coba Lagi</button>',
                            })}
                        </div>
                    ` : rows.length === 0 && hasFilter ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'filtered',
                                title: 'Catatan audit tidak ditemukan',
                                message: 'Ubah pilihan entitas atau ID record.',
                                actionsHtml: '<button id="audit-reset-filter-btn" type="button" class="wn-btn-secondary">Reset Filter</button>',
                            })}
                        </div>
                    ` : rows.length === 0 ? `
                        <div class="p-4">
                            ${renderEmptyState({
                                kind: 'empty',
                                title: 'Belum ada riwayat perubahan',
                            })}
                        </div>
                    ` : `
                        <div class="divide-y divide-border-subtle">
                            ${rows.map((row) => {
                                const diffRows = buildHumanDiffRows(row.nilai_sebelum, row.nilai_sesudah);
                                const safeBefore = stripSensitiveTechnicalFields(row.nilai_sebelum);
                                const safeAfter = stripSensitiveTechnicalFields(row.nilai_sesudah);

                                return `
                                    <div class="p-4 sm:p-5">
                                        <div class="flex flex-wrap items-center justify-between gap-2">
                                            <div class="flex flex-wrap items-center gap-2 text-xs">
                                                <span class="rounded-md bg-brand-navy px-2 py-0.5 font-semibold text-white">${escapeHtml(ENTITY_LABELS[row.entitas] || row.entitas)}</span>
                                                <span class="font-semibold text-ink">${escapeHtml(row.pengguna?.nama_lengkap || 'Sistem')}</span>
                                                ${row.pengguna?.peran ? `<span class="rounded bg-app-bg px-1.5 py-0.5 text-[11px] font-semibold uppercase text-ink-muted">${escapeHtml(row.pengguna.peran)}</span>` : ''}
                                            </div>
                                            <span class="text-xs font-medium text-ink-muted">${escapeHtml(formatDateTimeWib(row.waktu_perubahan))}</span>
                                        </div>

                                        ${row.alasan ? `<p class="mt-2 text-xs text-ink"><span class="font-semibold">Alasan:</span> ${escapeHtml(row.alasan)}</p>` : ''}

                                        ${diffRows.length > 0 ? `
                                            <div class="mt-3 space-y-2 md:hidden">
                                                ${diffRows.map((d) => `
                                                    <div class="rounded-lg border border-border-subtle bg-app-bg/60 p-3 text-xs">
                                                        <p class="font-semibold text-ink">${escapeHtml(d.label)}</p>
                                                        <div class="mt-1.5 grid gap-1 text-[11px]">
                                                            <p class="text-ink-muted"><span class="font-medium">Sebelum:</span> ${escapeHtml(d.before)}</p>
                                                            <p class="font-medium text-ink"><span class="text-ink-muted">Sesudah:</span> ${escapeHtml(d.after)}</p>
                                                        </div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                            <div class="mt-3 hidden overflow-x-auto rounded-lg border border-border-subtle md:block">
                                                <table class="min-w-full divide-y divide-border-subtle text-left text-xs">
                                                    <thead class="bg-app-bg font-semibold uppercase tracking-wide text-ink-muted">
                                                        <tr>
                                                            <th class="w-44 px-3 py-2">Field</th>
                                                            <th class="px-3 py-2">Nilai Sebelum</th>
                                                            <th class="px-3 py-2">Nilai Sesudah</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody class="divide-y divide-border-subtle bg-surface">
                                                        ${diffRows.map((d) => `
                                                            <tr>
                                                                <td class="px-3 py-2 font-semibold text-ink">${escapeHtml(d.label)}</td>
                                                                <td class="px-3 py-2 text-ink-muted">${escapeHtml(d.before)}</td>
                                                                <td class="px-3 py-2 font-medium text-ink">${escapeHtml(d.after)}</td>
                                                            </tr>
                                                        `).join('')}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ` : '<p class="mt-2 text-xs text-ink-muted">Tidak ada perbedaan nilai field bisnis yang ditampilkan.</p>'}

                                        <details class="mt-2.5 text-xs text-ink-muted">
                                            <summary class="cursor-pointer font-medium hover:text-ink">Detail teknis</summary>
                                            <div class="mt-2 space-y-2 rounded-lg border border-border-subtle bg-app-bg p-3">
                                                <p class="font-mono text-[11px] text-ink-muted">
                                                    Entitas: ${escapeHtml(row.entitas)} • ID Record: ${escapeHtml(row.record_id)} • ID Aktor: ${escapeHtml(row.id_pengguna)} • Waktu: ${escapeHtml(formatDateTimeWib(row.waktu_perubahan))}
                                                </p>
                                                <div class="grid gap-2 sm:grid-cols-2">
                                                    <pre class="overflow-x-auto whitespace-pre-wrap break-all rounded border border-border-subtle bg-surface p-2 font-mono text-[11px] text-ink-muted">${escapeHtml(safeBefore ? JSON.stringify(safeBefore, null, 2) : '-')}</pre>
                                                    <pre class="overflow-x-auto whitespace-pre-wrap break-all rounded border border-border-subtle bg-surface p-2 font-mono text-[11px] text-ink">${escapeHtml(safeAfter ? JSON.stringify(safeAfter, null, 2) : '-')}</pre>
                                                </div>
                                            </div>
                                        </details>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        ${renderPaginationBar(auditPage, 'data-audit-page', 'entri')}
                    `}
                </div>
            </div>
        `;

        container.querySelector('#audit-back-btn')?.addEventListener('click', () => navigateBack(APP_VIEWS.PROFILE));
        container.querySelector('#audit-retry-btn')?.addEventListener('click', loadLogs);
        if (!isLoading) {
            motion.refresh();
        }
        container.querySelector('#audit-reset-filter-btn')?.addEventListener('click', () => {
            filters = { entitas: '', record_id: '', page: 1 };
            loadLogs();
        });
        container.querySelector('#audit-filter-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            filters.entitas = container.querySelector('#audit-entity')?.value || '';
            filters.record_id = container.querySelector('#audit-record-id')?.value?.trim() || '';
            filters.page = 1;
            loadLogs();
        });
        container.querySelectorAll('[data-audit-page]').forEach((b) =>
            b.addEventListener('click', () => {
                const next = Number(b.getAttribute('data-audit-page'));
                if (next >= 1 && next <= (auditPage?.last_page || 1)) {
                    filters.page = next;
                    loadLogs();
                }
            })
        );
    }

    loadLogs();

    return () => {
        isDisposed = true;
        abortController.abort();
    };
}
