import { clearAuthSession, getStoredToken, getStoredUser, saveAuthSession } from '../api/client.js';
import { cleanupToastMotion } from '../motion/motionSystem.js';

export const APP_VIEWS = {
    DASHBOARD: 'dashboard',
    ORDERS: 'orders',
    ORDER_CREATE: 'order-create',
    ORDER_DETAIL: 'order-detail',
    OPERATING_HOURS: 'operating-hours',
    OWNER_CATALOG: 'owner-catalog',
    OWNER_STAFF: 'owner-staff',
    OWNER_EXPENSES: 'owner-expenses',
    OWNER_EXPENSE_CATEGORIES: 'owner-expense-categories',
    OWNER_REPORTS: 'owner-reports',
    OWNER_AUDIT: 'owner-audit',
    PROFILE: 'profile',
};

const VIEW_PATHS = {
    [APP_VIEWS.DASHBOARD]: '/',
    [APP_VIEWS.ORDERS]: '/pesanan',
    [APP_VIEWS.ORDER_CREATE]: '/pesanan/baru',
    [APP_VIEWS.OPERATING_HOURS]: '/jam-operasional',
    [APP_VIEWS.OWNER_CATALOG]: '/katalog-layanan',
    [APP_VIEWS.OWNER_STAFF]: '/kelola-kasir',
    [APP_VIEWS.OWNER_EXPENSES]: '/pengeluaran',
    [APP_VIEWS.OWNER_EXPENSE_CATEGORIES]: '/kategori-pengeluaran',
    [APP_VIEWS.OWNER_REPORTS]: '/laporan',
    [APP_VIEWS.OWNER_AUDIT]: '/riwayat-audit',
    [APP_VIEWS.PROFILE]: '/profil',
};

const OWNER_ONLY_VIEWS = new Set([
    APP_VIEWS.OWNER_CATALOG,
    APP_VIEWS.OWNER_STAFF,
    APP_VIEWS.OWNER_EXPENSES,
    APP_VIEWS.OWNER_EXPENSE_CATEGORIES,
    APP_VIEWS.OWNER_REPORTS,
    APP_VIEWS.OWNER_AUDIT,
]);

const APP_BOOT_ID = `wn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function resolveViewFromPath(pathname, search = typeof window !== 'undefined' ? window.location.search : '') {
    const clean = (pathname || '/').replace(/\/+$/, '') || '/';

    if (clean === '/pesanan/baru') {
        return { view: APP_VIEWS.ORDER_CREATE, options: {} };
    }

    const detailMatch = clean.match(/^\/pesanan\/(\d+)$/);
    if (detailMatch) {
        return { view: APP_VIEWS.ORDER_DETAIL, options: { orderId: Number(detailMatch[1]) } };
    }

    if (clean === '/pengeluaran') {
        return { view: APP_VIEWS.OWNER_EXPENSES, options: {} };
    }

    if (clean === '/kategori-pengeluaran') {
        return { view: APP_VIEWS.OWNER_EXPENSE_CATEGORIES, options: {} };
    }

    if (clean === '/laporan') {
        return { view: APP_VIEWS.OWNER_REPORTS, options: {} };
    }

    if (clean === '/keuangan') {
        const params = new URLSearchParams(search || '');
        const tabParam = params.get('tab');
        if (tabParam === 'expenses') {
            return { view: APP_VIEWS.OWNER_EXPENSES, options: {} };
        }
        if (tabParam === 'categories') {
            return { view: APP_VIEWS.OWNER_EXPENSE_CATEGORIES, options: {} };
        }
        return { view: APP_VIEWS.OWNER_REPORTS, options: {} };
    }

    for (const [view, path] of Object.entries(VIEW_PATHS)) {
        if (path === clean) {
            return { view, options: {} };
        }
    }

    return { view: APP_VIEWS.DASHBOARD, options: clean !== '/' ? { unknownRoute: clean } : {} };
}

function buildPathForView(view, orderId = null) {
    if (view === APP_VIEWS.ORDER_DETAIL && orderId) {
        return `/pesanan/${orderId}`;
    }

    return VIEW_PATHS[view] || '/';
}

function syncBrowserUrl(view, orderId = null, replace = false, nextHistoryIndex = 0) {
    if (typeof window === 'undefined' || !window.history) {
        return;
    }

    const targetUrl = buildPathForView(view, orderId);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    const payload = {
        view,
        orderId,
        appBootId: APP_BOOT_ID,
        historyIndex: nextHistoryIndex,
    };

    if (currentUrl !== targetUrl) {
        const fn = replace ? 'replaceState' : 'pushState';
        window.history[fn](payload, '', targetUrl);
    } else if (replace || window.history.state?.appBootId !== APP_BOOT_ID) {
        window.history.replaceState(payload, '', targetUrl);
    }
}

export const state = {
    user: getStoredUser(),
    token: getStoredToken(),
    activeView: APP_VIEWS.DASHBOARD,
    selectedOrderId: null,
    selectedOrderInitialTab: 'detail',
    historyIndex: 0,
    authNotice: null,
    toast: null,
};

let onStateChange = () => {};
let onToastChange = () => {};
let toastTimerId = null;

export function subscribeStateChange(callback) {
    onStateChange = callback;
}

export function subscribeToastChange(callback) {
    onToastChange = callback;
}

export function notifyRender() {
    onStateChange();
}

export function notifyToastRender() {
    onToastChange();
}

export function isOwner() {
    return state.user?.peran === 'owner';
}

export function setAuthenticatedSession(token, user) {
    state.token = token;
    state.user = user;
    state.authNotice = null;
    saveAuthSession(token, user);
}

export function resetSession(notice = null) {
    clearAuthSession();
    if (toastTimerId !== null) {
        window.clearTimeout(toastTimerId);
        toastTimerId = null;
    }
    cleanupToastMotion();
    state.toast = null;
    notifyToastRender();
    state.token = null;
    state.user = null;
    state.selectedOrderId = null;
    state.activeView = APP_VIEWS.DASHBOARD;
    state.historyIndex = 0;
    state.authNotice = notice;
    syncBrowserUrl(APP_VIEWS.DASHBOARD, null, true, 0);
}

export function showToast(message, type = 'success') {
    if (toastTimerId !== null) {
        window.clearTimeout(toastTimerId);
        toastTimerId = null;
    }

    state.toast = {
        id: Date.now(),
        message,
        type,
    };
    notifyToastRender();

    const currentId = state.toast.id;
    toastTimerId = window.setTimeout(() => {
        toastTimerId = null;
        if (state.toast?.id === currentId) {
            state.toast = null;
            notifyToastRender();
        }
    }, 4500);
}

export function navigateTo(view, options = {}) {
    if (OWNER_ONLY_VIEWS.has(view) && !isOwner()) {
        showToast('Anda tidak memiliki hak akses ke halaman khusus Owner.', 'error');
        state.activeView = APP_VIEWS.DASHBOARD;
        state.historyIndex = 0;
        syncBrowserUrl(APP_VIEWS.DASHBOARD, null, true, 0);
        notifyRender();
        return;
    }

    if (options.unknownRoute) {
        showToast('Halaman tidak ditemukan, dialihkan ke Beranda.', 'info');
    }

    const prevView = state.activeView;
    const prevOrderId = state.selectedOrderId;

    state.activeView = view;

    if (options.orderId !== undefined) {
        state.selectedOrderId = options.orderId;
    } else if (view !== APP_VIEWS.ORDER_DETAIL) {
        state.selectedOrderId = null;
    }

    if (options.tab !== undefined) {
        state.selectedOrderInitialTab = options.tab;
    } else if (view === APP_VIEWS.ORDER_DETAIL && options.tab === undefined) {
        state.selectedOrderInitialTab = 'detail';
    }

    const replace = Boolean(options.replaceUrl);
    const sameDestination = prevView === state.activeView && prevOrderId === state.selectedOrderId;

    if (options.popHistoryIndex !== undefined && options.popHistoryIndex !== null) {
        state.historyIndex = Math.max(0, Number(options.popHistoryIndex));
    } else if (!replace && !sameDestination) {
        state.historyIndex += 1;
    }

    syncBrowserUrl(view, state.selectedOrderId, replace || sameDestination, state.historyIndex);
    notifyRender();
}

export function handlePopStateNavigation(popState = null) {
    if (!state.token || !state.user) {
        return;
    }

    const target = resolveViewFromPath(window.location.pathname, window.location.search);
    const restoredIndex =
        popState && popState.appBootId === APP_BOOT_ID && typeof popState.historyIndex === 'number'
            ? popState.historyIndex
            : 0;

    navigateTo(target.view, {
        ...target.options,
        replaceUrl: true,
        popHistoryIndex: restoredIndex,
    });
}

export function navigateBack(fallbackView = APP_VIEWS.DASHBOARD, fallbackOptions = {}) {
    if (typeof window !== 'undefined' && window.history && state.historyIndex > 0) {
        window.history.back();
        return;
    }

    navigateTo(fallbackView, { ...fallbackOptions, replaceUrl: false });
}
