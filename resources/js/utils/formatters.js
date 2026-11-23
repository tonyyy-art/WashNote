export function getInitials(name) {
    const parts = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (parts.length === 0) {
        return 'WN';
    }
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function iconSvg(name, cls = 'h-4 w-4') {
    const icons = {
        user: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />',
        lock: '<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />',
        eye: '<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />',
        eyeOff: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />',
        receipt: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185Z" />',
        car: '<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />',
        clock: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />',
        wallet: '<path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />',
        chart: '<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />',
        users: '<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />',
        tag: '<path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6Z" />',
        shield: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />',
        checkCircle: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />',
        alertCircle: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />',
        plus: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />',
        chevronRight: '<path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />',
        logout: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />',
        menu: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />',
        close: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />',
    };

    const body = icons[name];
    if (!body) {
        return '';
    }

    return `<svg class="${escapeHtml(cls)} shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" aria-hidden="true">${body}</svg>`;
}

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
        berjalan: ['Berjalan', 'bg-primary-soft text-primary ring-primary-border'],
        selesai: ['Selesai', 'bg-green-50 text-success ring-green-600/20'],
        dibatalkan: ['Dibatalkan', 'bg-red-50 text-danger ring-red-600/20'],
    };

    const [label, cls] = map[status] ?? [status || '-', 'bg-slate-100 text-ink-muted ring-slate-500/20'];

    return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}">${escapeHtml(label)}</span>`;
}

export function badgeKendaraan(status) {
    const map = {
        menunggu: ['Menunggu', 'bg-slate-100 text-ink-muted ring-slate-600/20'],
        proses: ['Sedang Diproses', 'bg-amber-50 text-warning ring-amber-600/20'],
        selesai: ['Selesai Cuci', 'bg-green-50 text-success ring-green-600/20'],
    };

    const [label, cls] = map[status] ?? [status || '-', 'bg-slate-100 text-ink-muted ring-slate-500/20'];

    return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}">${escapeHtml(label)}</span>`;
}

export function badgePembayaran(status) {
    const map = {
        belum_dibayar: ['Belum Dibayar', 'bg-amber-50 text-warning ring-amber-600/20'],
        sudah_dibayar: ['Sudah Dibayar', 'bg-green-50 text-success ring-green-600/20'],
    };

    const [label, cls] = map[status] ?? [status || '-', 'bg-slate-100 text-ink-muted ring-slate-500/20'];

    return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}">${escapeHtml(label)}</span>`;
}

export function badgeOperasional(status) {
    const map = {
        dalam_jam: ['Dalam Jam Operasional', 'bg-green-50 text-success ring-green-600/20'],
        di_luar_jam: ['Di Luar Jam Buka', 'bg-amber-50 text-warning ring-amber-600/20'],
        hari_libur: ['Hari Libur', 'bg-red-50 text-danger ring-red-600/20'],
        belum_dikonfigurasi: ['Jadwal Belum Lengkap', 'bg-slate-100 text-ink-muted ring-slate-500/20'],
    };

    const [label, cls] = map[status] ?? [status || '-', 'bg-slate-100 text-ink-muted ring-slate-500/20'];

    return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}">${escapeHtml(label)}</span>`;
}

export function badgeStatusAktif(isAktif) {
    return isAktif
        ? '<span class="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-success ring-1 ring-inset ring-green-600/20">Aktif</span>'
        : '<span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-ink-muted ring-1 ring-inset ring-slate-500/20">Nonaktif</span>';
}

export function renderPageHeader({ title, subtitle = '', backBtnId = '', backLabel = '← Kembali', actionsHtml = '' }) {
    return `
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
                ${backBtnId ? `<button id="${escapeHtml(backBtnId)}" type="button" class="wn-link mb-1 inline-flex min-h-[32px] items-center text-xs">${escapeHtml(backLabel)}</button>` : ''}
                <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">${escapeHtml(title)}</h1>
                ${subtitle ? `<p class="mt-0.5 text-sm text-ink-muted">${escapeHtml(subtitle)}</p>` : ''}
            </div>
            ${actionsHtml ? `<div class="flex flex-wrap items-center gap-2">${actionsHtml}</div>` : ''}
        </div>
    `;
}

export function renderPaginationBar(paginator, dataAttr, countLabel = '') {
    if (!paginator || (paginator.last_page ?? 1) <= 1) {
        return '';
    }

    const totalText = countLabel ? ` (${paginator.total} ${escapeHtml(countLabel)})` : '';

    return `
        <div class="flex flex-col gap-2.5 border-t border-border-subtle bg-app-bg/50 px-4 py-3 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
            <span>Halaman ${paginator.current_page} dari ${paginator.last_page}${totalText}</span>
            <div class="flex gap-2">
                <button
                    type="button"
                    ${escapeHtml(dataAttr)}="${paginator.current_page - 1}"
                    ${paginator.current_page <= 1 ? 'disabled' : ''}
                    class="wn-btn-secondary flex-1 px-3 py-1.5 text-xs sm:flex-none"
                >
                    Sebelumnya
                </button>
                <button
                    type="button"
                    ${escapeHtml(dataAttr)}="${paginator.current_page + 1}"
                    ${paginator.current_page >= paginator.last_page ? 'disabled' : ''}
                    class="wn-btn-secondary flex-1 px-3 py-1.5 text-xs sm:flex-none"
                >
                    Berikutnya
                </button>
            </div>
        </div>
    `;
}

export function renderLoadingState(message = 'Memuat data...') {
    return `
        <div class="flex items-center justify-center gap-2.5 p-10 text-sm text-ink-muted">
            <span class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
            <span>${escapeHtml(message)}</span>
        </div>
    `;
}

export function renderEmptyState({ kind = 'empty', title, message = '', actionsHtml = '' }) {
    const toneMap = {
        empty: 'border-border-subtle bg-app-bg/70 text-ink',
        filtered: 'border-border-subtle bg-app-bg/70 text-ink',
        error: 'border-red-200 bg-red-50/70 text-red-900',
        prerequisite: 'border-amber-200 bg-amber-50/70 text-amber-900',
    };
    const toneCls = toneMap[kind] ?? toneMap.empty;

    return `
        <div class="rounded-xl border ${toneCls} p-6 text-center sm:p-8">
            <p class="text-sm font-semibold">${escapeHtml(title)}</p>
            ${message ? `<p class="mt-1 text-xs opacity-85">${escapeHtml(message)}</p>` : ''}
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
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
            <p class="font-semibold">${escapeHtml(err.message || 'Gagal memproses permintaan.')}</p>
            ${fieldErrors.length > 0 ? `<ul class="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">${fieldErrors.join('')}</ul>` : ''}
        </div>
    `;
}
