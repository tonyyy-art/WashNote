import { washnoteApi } from '../api/client.js';
import { escapeHtml, formatDateTimeWib, renderErrorAlert } from '../utils/formatters.js';

const ENTITIES = [
    '',
    'pesanan',
    'kendaraan_pesanan',
    'pembayaran',
    'pengguna',
    'kategori_kendaraan',
    'layanan',
    'harga_layanan',
    'kategori_pengeluaran',
    'pengeluaran',
    'jam_operasional',
    'pengecualian_jam_operasional',
];

export function mountOwnerAuditView(container) {
    let isLoading = true;
    let errorObj = null;
    let auditPage = null;
    let filters = { entitas: '', record_id: '', page: 1 };

    async function loadLogs() {
        isLoading = true;
        errorObj = null;
        render();

        try {
            const res = await washnoteApi.getAuditLogs({ ...filters, per_page: 15 });
            auditPage = res?.data || null;
        } catch (err) {
            errorObj = err;
        } finally {
            isLoading = false;
            render();
        }
    }

    function render() {
        const rows = auditPage?.data || [];

        container.innerHTML = `
            <div class="space-y-6">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 class="text-2xl font-bold tracking-tight text-slate-900">Riwayat Perubahan (Audit Log)</h1>
                        <p class="mt-0.5 text-sm text-slate-600">Catatan audit append-only seluruh mutasi bisnis penting tanpa kebocoran data sensitif.</p>
                    </div>
                    <button id="audit-refresh-btn" type="button" class="shrink-0 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Muat Ulang</button>
                </div>

                <form id="audit-filter-form" class="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Entitas</label>
                        <select id="audit-entity" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                            ${ENTITIES.map((ent) => `<option value="${ent}" ${filters.entitas === ent ? 'selected' : ''}>${ent || 'Semua Entitas'}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">ID Record (Opsional)</label>
                        <input id="audit-record-id" type="number" min="1" value="${escapeHtml(filters.record_id)}" placeholder="Mis. 12" class="w-36 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <button type="submit" class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Filter</button>
                </form>

                ${errorObj ? renderErrorAlert(errorObj) : ''}

                <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    ${isLoading ? '<div class="p-8 text-center text-sm text-slate-500">Memuat riwayat perubahan...</div>' : rows.length === 0 ? '<div class="p-8 text-center text-sm text-slate-500">Tidak ada entri audit ditemukan.</div>' : `
                        <div class="divide-y divide-slate-200">
                            ${rows.map((row) => `
                                <div class="p-4">
                                    <div class="flex flex-wrap items-center justify-between gap-2">
                                        <div class="flex flex-wrap items-center gap-2 text-xs">
                                            <span class="rounded-md bg-slate-900 px-2 py-0.5 font-mono font-semibold text-white">${escapeHtml(row.entitas)} #${escapeHtml(row.record_id)}</span>
                                            <span class="font-semibold text-slate-800">${escapeHtml(row.pengguna?.nama_lengkap || `User #${row.id_pengguna}`)}</span>
                                            ${row.pengguna?.peran ? `<span class="rounded bg-slate-100 px-1.5 py-0.5 uppercase text-slate-600">${escapeHtml(row.pengguna.peran)}</span>` : ''}
                                        </div>
                                        <span class="text-xs text-slate-500">${escapeHtml(formatDateTimeWib(row.waktu_perubahan))}</span>
                                    </div>
                                    ${row.alasan ? `<p class="mt-1.5 text-xs font-medium text-slate-700">Alasan: ${escapeHtml(row.alasan)}</p>` : ''}
                                    <div class="mt-2 grid gap-2 sm:grid-cols-2">
                                        <div class="rounded-lg bg-slate-50 p-2.5">
                                            <p class="mb-1 text-[10px] font-bold uppercase text-slate-500">Nilai Sebelum</p>
                                            <pre class="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700">${escapeHtml(row.nilai_sebelum ? JSON.stringify(row.nilai_sebelum, null, 2) : '-')}</pre>
                                        </div>
                                        <div class="rounded-lg bg-slate-50 p-2.5">
                                            <p class="mb-1 text-[10px] font-bold uppercase text-slate-500">Nilai Sesudah</p>
                                            <pre class="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-800">${escapeHtml(row.nilai_sesudah ? JSON.stringify(row.nilai_sesudah, null, 2) : '-')}</pre>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        ${auditPage && auditPage.last_page > 1 ? `
                            <div class="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                                <span>Halaman ${auditPage.current_page} dari ${auditPage.last_page} (Total ${auditPage.total} entri)</span>
                                <div class="flex gap-2">
                                    <button type="button" data-audit-page="${auditPage.current_page - 1}" ${auditPage.current_page <= 1 ? 'disabled' : ''} class="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-50">Sebelumnya</button>
                                    <button type="button" data-audit-page="${auditPage.current_page + 1}" ${auditPage.current_page >= auditPage.last_page ? 'disabled' : ''} class="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-50">Berikutnya</button>
                                </div>
                            </div>
                        ` : ''}
                    `}
                </div>
            </div>
        `;

        container.querySelector('#audit-refresh-btn')?.addEventListener('click', loadLogs);
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
}
