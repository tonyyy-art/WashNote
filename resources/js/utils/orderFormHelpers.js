import { escapeHtml, formatRupiah, iconSvg } from './formatters.js';

let uidCounter = 1;

export function ensureLineUid(line) {
    if (line && !line._uid) {
        line._uid = `srv-${uidCounter++}`;
    }
    return line?._uid || '';
}

function getVehicleLabel(vehicles, vIdx, catalog) {
    const veh = vehicles?.[vIdx];
    const kat = (catalog?.kategori_kendaraan || []).find(
        (k) => Number(k.id_kategori_kendaraan) === Number(veh?.id_kategori_kendaraan)
    );
    const katName = kat?.nama_kategori || 'Kendaraan';
    const plate = veh?.plat_nomor ? ` (${veh.plat_nomor.trim().toUpperCase()})` : '';
    return `Kendaraan #${vIdx + 1} · ${katName}${plate}`;
}

function getServiceLabel(vehicles, vIdx, lIdx, tariffsPool) {
    const line = vehicles?.[vIdx]?.layanan?.[lIdx];
    if (!line) {
        return `Layanan #${lIdx + 1}`;
    }
    const tariff = (tariffsPool || []).find((t) => Number(t.id_harga) === Number(line.id_harga));
    return tariff?.layanan?.nama_layanan || `Layanan #${lIdx + 1}`;
}

function formatBackendPriceMessage(rawMsg, tariff) {
    const msg = String(rawMsg || '').trim();
    if (/rentang\s+([\d.,]+)\s+sampai\s+([\d.,]+)/i.test(msg)) {
        const match = msg.match(/rentang\s+([\d.,]+)\s+sampai\s+([\d.,]+)/i);
        const min = Number(String(match[1]).replace(/,/g, ''));
        const max = Number(String(match[2]).replace(/,/g, ''));
        if (!Number.isNaN(min) && !Number.isNaN(max)) {
            return `Gunakan harga antara ${formatRupiah(min)} – ${formatRupiah(max)}.`;
        }
    }

    if (tariff && /batas|rentang/i.test(msg)) {
        return `Gunakan harga antara ${formatRupiah(tariff.batas_bawah)} – ${formatRupiah(tariff.batas_atas)}.`;
    }

    if (/alasan penyesuaian/i.test(msg)) {
        const base = tariff ? ` (${formatRupiah(tariff.harga_dasar)})` : '';
        return `Isi alasan penyesuaian karena harga berbeda dari tarif dasar${base}.`;
    }

    return msg;
}

const TOP_FIELD_LABELS = {
    alasan: 'Alasan Perubahan Pesanan',
    catatan: 'Catatan Pesanan',
    kendaraan: 'Daftar Kendaraan',
    layanan: 'Pilihan Layanan',
    expected_version: 'Sinkronisasi Data',
    konfirmasi_hari_libur: 'Konfirmasi Hari Libur',
};

/**
 * Translate Laravel nested validation keys (`kendaraan.0.layanan.0.harga_akhir`) into
 * structured inline field errors + concise human-readable summary lines.
 */
export function parseOrderValidationError(err, vehicles = [], catalog = {}, extraTariffs = []) {
    const result = {
        hasError: Boolean(err),
        title: err?.message || 'Periksa kembali data pesanan.',
        summaryItems: [],
        vehicleErrors: {},
        lineErrors: {},
        topErrors: {},
    };

    if (!err) {
        return result;
    }

    const tariffsPool = [...(catalog?.harga_layanan || []), ...(extraTariffs || [])];
    const rawErrors = err.errors && typeof err.errors === 'object' ? err.errors : null;

    if (!rawErrors) {
        if (err.message) {
            result.summaryItems.push(err.message);
        }
        return result;
    }

    const seenSummaries = new Set();
    const pushSummary = (text) => {
        const clean = String(text || '').trim();
        if (clean && !seenSummaries.has(clean)) {
            seenSummaries.add(clean);
            result.summaryItems.push(clean);
        }
    };

    for (const [key, messages] of Object.entries(rawErrors)) {
        const firstRaw = Array.isArray(messages) ? messages[0] : String(messages || '');

        const lineMatch = key.match(/^kendaraan\.(\d+)\.layanan\.(\d+)\.(harga_akhir|alasan_penyesuaian|id_harga)$/);
        if (lineMatch) {
            const vIdx = Number(lineMatch[1]);
            const lIdx = Number(lineMatch[2]);
            const field = lineMatch[3];
            const lineKey = `${vIdx}-${lIdx}`;
            const line = vehicles?.[vIdx]?.layanan?.[lIdx];
            const tariff = line ? tariffsPool.find((t) => Number(t.id_harga) === Number(line.id_harga)) : null;
            const friendly = formatBackendPriceMessage(firstRaw, tariff);

            if (!result.lineErrors[lineKey]) {
                result.lineErrors[lineKey] = {};
            }
            if (field === 'harga_akhir') {
                result.lineErrors[lineKey].harga_akhir = friendly;
            } else if (field === 'alasan_penyesuaian') {
                result.lineErrors[lineKey].alasan_penyesuaian = friendly;
            } else {
                result.lineErrors[lineKey].service = friendly;
            }

            const vehLbl = getVehicleLabel(vehicles, vIdx, catalog);
            const srvLbl = getServiceLabel(vehicles, vIdx, lIdx, tariffsPool);
            pushSummary(`${vehLbl} — ${srvLbl}: ${friendly}`);
            continue;
        }

        const vehMatch = key.match(/^kendaraan\.(\d+)\.(id_kategori_kendaraan|plat_nomor|layanan)$/);
        if (vehMatch) {
            const vIdx = Number(vehMatch[1]);
            const field = vehMatch[2];
            if (!result.vehicleErrors[vIdx]) {
                result.vehicleErrors[vIdx] = {};
            }
            result.vehicleErrors[vIdx][field] = firstRaw;
            const vehLbl = getVehicleLabel(vehicles, vIdx, catalog);
            const fieldLabel = field === 'layanan' ? 'Layanan' : field === 'plat_nomor' ? 'Plat Nomor' : 'Kategori';
            pushSummary(`${vehLbl} (${fieldLabel}): ${firstRaw}`);
            continue;
        }

        if (key === 'alasan') {
            result.topErrors.alasan = firstRaw;
            pushSummary(`Alasan Perubahan Pesanan: ${firstRaw}`);
            continue;
        }

        if (key === 'catatan') {
            result.topErrors.catatan = firstRaw;
            pushSummary(`Catatan: ${firstRaw}`);
            continue;
        }

        const friendlyKey = TOP_FIELD_LABELS[key];
        pushSummary(friendlyKey ? `${friendlyKey}: ${firstRaw}` : firstRaw);
    }

    if (result.summaryItems.length === 1 && /valid/i.test(result.title)) {
        result.title = 'Periksa kembali input berikut sebelum menyimpan:';
    } else if (result.summaryItems.length > 0 && /data yang diberikan tidak valid/i.test(result.title)) {
        result.title = 'Periksa kembali isian berikut:';
    }

    return result;
}

export function renderOrderErrorSummary(parsed) {
    if (!parsed || !parsed.hasError) {
        return '';
    }

    const items = parsed.summaryItems || [];

    return `
        <div class="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-xs text-red-900" role="alert">
            <div class="flex items-start gap-2.5">
                ${iconSvg('alertCircle', 'mt-0.5 h-4 w-4 text-danger')}
                <div class="min-w-0 flex-1">
                    <p class="font-semibold text-red-950">${escapeHtml(parsed.title)}</p>
                    ${items.length > 0 ? `
                        <ul class="mt-1.5 space-y-1">
                            ${items.map((item) => `<li class="flex items-start gap-1.5"><span class="mt-1 h-1 w-1 shrink-0 rounded-full bg-danger"></span><span>${escapeHtml(item)}</span></li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

/**
 * Shared vehicle & scalable service picker renderer used identically on Create & Edit Order.
 */
export function renderVehicleServiceCard({
    veh,
    vIdx,
    totalVehicles,
    categories = [],
    availableTariffs = [],
    expandedLines = new Set(),
    parsedError = null,
    prefix = 'create',
    compactCard = false,
}) {
    const mainTariffs = availableTariffs.filter((t) => (t.layanan?.tipe_layanan || 'utama') === 'utama');
    const addOnTariffs = availableTariffs.filter((t) => t.layanan?.tipe_layanan === 'tambahan');
    const selectedCounts = new Map();

    for (const item of veh.layanan || []) {
        const id = Number(item.id_harga);
        selectedCounts.set(id, (selectedCounts.get(id) || 0) + 1);
    }

    const vehErr = parsedError?.vehicleErrors?.[vIdx] || {};
    const vehicleSubtotal = (veh.layanan || []).reduce((sum, item) => {
        const tariff = availableTariffs.find((t) => Number(t.id_harga) === Number(item.id_harga));
        const val = item.harga_akhir === '' || item.harga_akhir === null ? Number(tariff?.harga_dasar ?? 0) : Number(item.harga_akhir);
        return sum + (Number.isNaN(val) ? 0 : val);
    }, 0);

    const cardSurface = compactCard
        ? 'rounded-xl border border-border-subtle bg-surface p-4'
        : 'wn-card p-4 shadow-xs sm:p-5';

    return `
        <div data-motion-card class="${cardSurface} min-w-0">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
                <div class="flex flex-wrap items-center gap-2 min-w-0">
                    <h3 class="text-sm font-bold text-ink">Kendaraan #${vIdx + 1}</h3>
                    <span class="rounded-full bg-app-bg px-2.5 py-0.5 text-xs font-semibold text-ink-muted tabular-nums">
                        ${escapeHtml(formatRupiah(vehicleSubtotal))}
                    </span>
                </div>
                ${totalVehicles > 1 ? `
                    <button type="button" data-${prefix}-remove-veh="${vIdx}" class="inline-flex min-h-[34px] items-center rounded-lg px-2.5 text-xs font-semibold text-danger transition hover:bg-red-50">
                        Hapus Kendaraan
                    </button>
                ` : ''}
            </div>

            <div class="mt-4 grid gap-3.5 sm:grid-cols-2">
                <div class="min-w-0">
                    <label class="wn-label">Kategori Kendaraan <span class="text-danger">*</span></label>
                    <select data-${prefix}-cat="${vIdx}" class="wn-select ${vehErr.id_kategori_kendaraan ? 'wn-select-error' : ''}">
                        ${categories.map((kat) => `
                            <option value="${kat.id_kategori_kendaraan}" ${Number(kat.id_kategori_kendaraan) === Number(veh.id_kategori_kendaraan) ? 'selected' : ''}>
                                ${escapeHtml(kat.nama_kategori)} (${escapeHtml(kat.jenis_kendaraan)})
                            </option>
                        `).join('')}
                    </select>
                    ${vehErr.id_kategori_kendaraan ? `<p class="wn-error-inline">${iconSvg('alertCircle', 'mt-0.5 h-3.5 w-3.5')}<span>${escapeHtml(vehErr.id_kategori_kendaraan)}</span></p>` : ''}
                </div>
                <div class="min-w-0">
                    <label class="wn-label">Plat Nomor <span class="font-normal text-ink-muted">(Opsional)</span></label>
                    <input
                        type="text"
                        maxlength="20"
                        data-${prefix}-plat="${vIdx}"
                        value="${escapeHtml(veh.plat_nomor || '')}"
                        placeholder="Mis. B 1234 XYZ"
                        class="wn-input uppercase ${vehErr.plat_nomor ? 'wn-input-error' : ''}"
                    />
                    ${vehErr.plat_nomor ? `<p class="wn-error-inline">${iconSvg('alertCircle', 'mt-0.5 h-3.5 w-3.5')}<span>${escapeHtml(vehErr.plat_nomor)}</span></p>` : ''}
                </div>
            </div>

            <div class="mt-4 space-y-3 border-t border-border-subtle pt-4">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-bold uppercase tracking-wide text-ink-muted">Pilih Layanan</span>
                    <span class="text-xs font-medium text-ink-muted">${(veh.layanan || []).length} dipilih</span>
                </div>

                ${availableTariffs.length === 0 ? `
                    <p class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Belum ada tarif aktif untuk kategori kendaraan ini.</p>
                ` : `
                    <div class="grid gap-3 sm:grid-cols-2">
                        <div class="min-w-0">
                            <label class="wn-label">Tambah Layanan Utama</label>
                            <select data-${prefix}-pick-main="${vIdx}" class="wn-select text-xs sm:text-sm" ${mainTariffs.length === 0 ? 'disabled' : ''}>
                                <option value="">${mainTariffs.length > 0 ? '+ Pilih layanan utama...' : 'Tidak ada layanan utama'}</option>
                                ${mainTariffs.map((t) => `
                                    <option value="${t.id_harga}">
                                        ${escapeHtml(t.layanan?.nama_layanan || 'Layanan')} — ${escapeHtml(formatRupiah(t.harga_dasar))}${selectedCounts.has(Number(t.id_harga)) ? ' (dipilih)' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>

                        <div class="min-w-0">
                            <label class="wn-label">Tambah Layanan Tambahan</label>
                            <select data-${prefix}-pick-addon="${vIdx}" class="wn-select text-xs sm:text-sm" ${addOnTariffs.length === 0 ? 'disabled' : ''}>
                                <option value="">${addOnTariffs.length > 0 ? '+ Pilih layanan tambahan...' : 'Tidak ada layanan tambahan'}</option>
                                ${addOnTariffs.map((t) => `
                                    <option value="${t.id_harga}">
                                        ${escapeHtml(t.layanan?.nama_layanan || 'Add-On')} — ${escapeHtml(formatRupiah(t.harga_dasar))}${selectedCounts.has(Number(t.id_harga)) ? ' (dipilih)' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>

                    ${vehErr.layanan ? `<p class="wn-error-inline">${iconSvg('alertCircle', 'mt-0.5 h-3.5 w-3.5')}<span>${escapeHtml(vehErr.layanan)}</span></p>` : ''}

                    ${(veh.layanan || []).length === 0 ? `
                        <p class="rounded-lg border border-dashed border-border-subtle bg-app-bg px-3 py-2.5 text-xs text-ink-muted">
                            Pilih minimal 1 layanan dari dropdown di atas.
                        </p>
                    ` : `
                        <div class="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface">
                            ${veh.layanan.map((line, lIdx) => {
                                const uid = ensureLineUid(line);
                                const tariff = availableTariffs.find((t) => Number(t.id_harga) === Number(line.id_harga)) || availableTariffs[0];
                                const tipe = tariff?.layanan?.tipe_layanan || 'utama';
                                const basePrice = Number(tariff?.harga_dasar ?? 0);
                                const minPrice = Number(tariff?.batas_bawah ?? 0);
                                const maxPrice = Number(tariff?.batas_atas ?? 0);
                                const activePrice =
                                    line.harga_akhir === '' || line.harga_akhir === null ? basePrice : Number(line.harga_akhir);
                                const isAdjusted = Math.abs(activePrice - basePrice) > 0.001;
                                const lineErr = parsedError?.lineErrors?.[`${vIdx}-${lIdx}`] || {};
                                const hasError = Boolean(lineErr.harga_akhir || lineErr.alasan_penyesuaian || lineErr.service);
                                const isExpanded = expandedLines.has(uid) || isAdjusted || hasError;

                                return `
                                    <div class="min-w-0 ${hasError ? 'bg-red-50/35' : ''}">
                                        <div class="flex flex-col gap-2.5 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div class="min-w-0 flex-1">
                                                <div class="flex flex-wrap items-center gap-1.5">
                                                    <span class="text-sm font-semibold text-ink">${escapeHtml(tariff?.layanan?.nama_layanan || 'Layanan')}</span>
                                                    <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tipe === 'tambahan' ? 'bg-slate-100 text-brand-navy' : 'bg-accent-soft text-accent'}">${escapeHtml(tipe)}</span>
                                                    ${isAdjusted ? '<span class="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-warning ring-1 ring-inset ring-amber-600/20">Disesuaikan</span>' : ''}
                                                </div>
                                                <p class="mt-0.5 text-xs text-ink-muted tabular-nums">
                                                    Tarif dasar: ${escapeHtml(formatRupiah(basePrice))}${tariff ? ` · Batas: ${escapeHtml(formatRupiah(minPrice))} – ${escapeHtml(formatRupiah(maxPrice))}` : ''}
                                                </p>
                                            </div>

                                            <div class="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                                                <span class="text-sm font-bold text-ink tabular-nums">${escapeHtml(formatRupiah(activePrice))}</span>
                                                <div class="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        data-${prefix}-toggle-price="${vIdx}-${lIdx}"
                                                        class="inline-flex min-h-[34px] items-center rounded-lg border border-border-subtle bg-app-bg px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-slate-200/60"
                                                    >
                                                        ${isExpanded ? 'Tutup Harga' : 'Edit Harga'}
                                                    </button>
                                                    ${veh.layanan.length > 1 ? `
                                                        <button
                                                            type="button"
                                                            data-${prefix}-remove-service="${vIdx}-${lIdx}"
                                                            class="inline-flex min-h-[34px] items-center rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-danger transition hover:bg-red-100"
                                                        >
                                                            Hapus
                                                        </button>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        </div>

                                        ${isExpanded ? `
                                            <div class="border-t border-border-subtle bg-app-bg/70 px-3.5 py-3">
                                                <div class="grid gap-3 sm:grid-cols-2">
                                                    <div class="min-w-0">
                                                        <label class="wn-label">
                                                            Harga Akhir (Rp) <span class="text-danger">*</span>
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            data-${prefix}-price="${vIdx}-${lIdx}"
                                                            value="${escapeHtml(line.harga_akhir)}"
                                                            class="wn-input tabular-nums ${lineErr.harga_akhir ? 'wn-input-error' : ''}"
                                                        />
                                                        ${lineErr.harga_akhir ? `
                                                            <p class="wn-error-inline" data-inline-error="true">
                                                                ${iconSvg('alertCircle', 'mt-0.5 h-3.5 w-3.5')}
                                                                <span>${escapeHtml(lineErr.harga_akhir)}</span>
                                                            </p>
                                                        ` : tariff ? `
                                                            <p class="mt-1 text-[11px] text-ink-muted tabular-nums">Rentang valid: ${escapeHtml(formatRupiah(minPrice))} – ${escapeHtml(formatRupiah(maxPrice))}</p>
                                                        ` : ''}
                                                    </div>

                                                    <div class="min-w-0">
                                                        <label class="wn-label">
                                                            Alasan Penyesuaian ${isAdjusted ? '<span class="text-danger">*</span> <span class="font-normal text-ink-muted">(Wajib)</span>' : '<span class="font-normal text-ink-muted">(Jika harga diubah)</span>'}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            data-${prefix}-reason="${vIdx}-${lIdx}"
                                                            value="${escapeHtml(line.alasan_penyesuaian || '')}"
                                                            placeholder="${isAdjusted ? 'Isi alasan perubahan harga' : 'Opsional jika sesuai harga dasar'}"
                                                            class="wn-input ${lineErr.alasan_penyesuaian ? 'wn-input-error' : isAdjusted && !(line.alasan_penyesuaian || '').trim() ? 'border-amber-400 bg-amber-50/70' : ''}"
                                                        />
                                                        ${lineErr.alasan_penyesuaian ? `
                                                            <p class="wn-error-inline" data-inline-error="true">
                                                                ${iconSvg('alertCircle', 'mt-0.5 h-3.5 w-3.5')}
                                                                <span>${escapeHtml(lineErr.alasan_penyesuaian)}</span>
                                                            </p>
                                                        ` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `}
                `}
            </div>
        </div>
    `;
}
