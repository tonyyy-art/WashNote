/**
 * Escape untrusted strings before interpolating into HTML templates.
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function formatRupiah(value) {
    const num = Number(value ?? 0);

    if (Number.isNaN(num)) {
        return 'Rp 0';
    }

    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: num % 1 !== 0 ? 2 : 0,
        maximumFractionDigits: 2,
    }).format(num);
}

export function formatDateTimeWib(value) {
    if (!value) {
        return '-';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return escapeHtml(value);
    }

    return `${new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date)} WIB`;
}

export function formatDateOnly(value) {
    if (!value) {
        return '-';
    }

    const str = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }

    const date = new Date(str);

    if (Number.isNaN(date.getTime())) {
        return /^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(0, 10) : escapeHtml(str);
    }

    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

export function formatDateIndo(value) {
    if (!value) {
        return '-';
    }

    const str = String(value).trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(`${str}T12:00:00+07:00`) : new Date(str);

    if (Number.isNaN(date.getTime())) {
        return escapeHtml(str);
    }

    return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
}

export function formatDateFullIndo(value) {
    if (!value) {
        return '-';
    }

    const str = String(value).trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(`${str}T12:00:00+07:00`) : new Date(str);

    if (Number.isNaN(date.getTime())) {
        return escapeHtml(str);
    }

    return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
}

export function formatTimeHm(value) {
    if (!value) {
        return '-';
    }

    const match = String(value).trim().match(/^(\d{1,2})[:.](\d{2})/);
    if (match) {
        return `${match[1].padStart(2, '0')}.${match[2]}`;
    }

    return escapeHtml(String(value));
}

export function todayWibDateString() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

export function badgePesanan(status) {
    const map = {
        berjalan: ['Berjalan', 'bg-sky-50 text-sky-700 ring-sky-600/20'],
        selesai: ['Selesai', 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'],
        dibatalkan: ['Dibatalkan', 'bg-rose-50 text-rose-700 ring-rose-600/20'],
    };

    const [label, cls] = map[status] ?? [status || '-', 'bg-slate-100 text-slate-700 ring-slate-500/20'];

    return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}">${escapeHtml(label)}</span>`;
}

export function badgeKendaraan(status) {
    const map = {
        menunggu: ['Menunggu', 'bg-slate-100 text-slate-700 ring-slate-600/20'],
        proses: ['Sedang Diproses', 'bg-amber-50 text-amber-800 ring-amber-600/20'],
        selesai: ['Selesai Cuci', 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'],
    };

    const [label, cls] = map[status] ?? [status || '-', 'bg-slate-100 text-slate-700 ring-slate-500/20'];

    return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}">${escapeHtml(label)}</span>`;
}

export function badgePembayaran(status) {
    const map = {
        belum_dibayar: ['Belum Dibayar', 'bg-amber-50 text-amber-800 ring-amber-600/20'],
        sudah_dibayar: ['Sudah Dibayar', 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'],
    };

    const [label, cls] = map[status] ?? [status || '-', 'bg-slate-100 text-slate-700 ring-slate-500/20'];

    return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}">${escapeHtml(label)}</span>`;
}

export function badgeOperasional(status) {
    const map = {
        dalam_jam: ['Dalam Jam Operasional', 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'],
        di_luar_jam: ['Di Luar Jam Buka', 'bg-amber-50 text-amber-800 ring-amber-600/20'],
        hari_libur: ['Hari Libur', 'bg-rose-50 text-rose-700 ring-rose-600/20'],
        belum_dikonfigurasi: ['Jadwal Belum Lengkap', 'bg-slate-100 text-slate-700 ring-slate-500/20'],
    };

    const [label, cls] = map[status] ?? [status || '-', 'bg-slate-100 text-slate-700 ring-slate-500/20'];

    return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}">${escapeHtml(label)}</span>`;
}

export function badgeStatusAktif(isAktif) {
    return isAktif
        ? '<span class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Aktif</span>'
        : '<span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/20">Nonaktif</span>';
}

export function renderPageHeader({ title, subtitle = '', backBtnId = '', backLabel = '← Kembali', actionsHtml = '' }) {
    return `
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
                ${backBtnId ? `<button id="${escapeHtml(backBtnId)}" type="button" class="mb-1 text-xs font-semibold text-teal-700 hover:text-teal-900">${escapeHtml(backLabel)}</button>` : ''}
                <h1 class="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">${escapeHtml(title)}</h1>
                ${subtitle ? `<p class="mt-0.5 text-sm text-slate-600">${escapeHtml(subtitle)}</p>` : ''}
            </div>
            ${actionsHtml ? `<div class="flex flex-wrap items-center gap-2">${actionsHtml}</div>` : ''}
        </div>
    `;
}

export function renderLoadingState(message = 'Memuat data...') {
    return `
        <div class="flex items-center justify-center gap-2.5 p-10 text-sm text-slate-500">
            <span class="h-4 w-4 animate-spin rounded-full border-2 border-teal-700 border-t-transparent"></span>
            <span>${escapeHtml(message)}</span>
        </div>
    `;
}

export function renderEmptyState({ kind = 'empty', title, message = '', actionsHtml = '' }) {
    const toneMap = {
        empty: 'border-slate-200 bg-slate-50/70 text-slate-700',
        filtered: 'border-slate-200 bg-slate-50/70 text-slate-700',
        error: 'border-rose-200 bg-rose-50/60 text-rose-900',
        prerequisite: 'border-amber-200 bg-amber-50/70 text-amber-900',
    };
    const toneCls = toneMap[kind] ?? toneMap.empty;

    return `
        <div class="rounded-xl border ${toneCls} p-8 text-center">
            <p class="text-sm font-semibold">${escapeHtml(title)}</p>
            ${message ? `<p class="mt-1 text-xs opacity-80">${escapeHtml(message)}</p>` : ''}
            ${actionsHtml ? `<div class="mt-4 flex flex-wrap items-center justify-center gap-2">${actionsHtml}</div>` : ''}
        </div>
    `;
}

export function extractErrorMessage(err) {
    if (!err) {
        return 'Terjadi kesalahan tidak terduga.';
    }

    if (err.errors && typeof err.errors === 'object') {
        const list = [];

        for (const messages of Object.values(err.errors)) {
            if (Array.isArray(messages)) {
                for (const msg of messages) {
                    list.push(String(msg));
                }
            }
        }

        if (list.length > 0) {
            return list[0];
        }
    }

    return err.message || 'Permintaan gagal diproses.';
}

export function renderErrorAlert(err) {
    if (!err) {
        return '';
    }

    const fieldErrors = [];

    if (err.errors && typeof err.errors === 'object') {
        for (const [field, messages] of Object.entries(err.errors)) {
            if (Array.isArray(messages)) {
                for (const msg of messages) {
                    fieldErrors.push(`<li><span class="font-medium">${escapeHtml(field)}:</span> ${escapeHtml(msg)}</li>`);
                }
            }
        }
    }

    return `
        <div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
            <p class="font-semibold">${escapeHtml(err.message || 'Gagal memproses permintaan.')}</p>
            ${fieldErrors.length > 0 ? `<ul class="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">${fieldErrors.join('')}</ul>` : ''}
        </div>
    `;
}
