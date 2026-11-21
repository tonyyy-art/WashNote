import { clearAuthSession, getStoredToken, getStoredUser, saveAuthSession } from '../api/client.js';

export const APP_VIEWS = {
    DASHBOARD: 'dashboard',
    ORDERS: 'orders',
    ORDER_CREATE: 'order-create',
    ORDER_DETAIL: 'order-detail',
    OPERATING_HOURS: 'operating-hours',
    OWNER_CATALOG: 'owner-catalog',
    OWNER_STAFF: 'owner-staff',
    OWNER_FINANCE: 'owner-finance',
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
    [APP_VIEWS.OWNER_FINANCE]: '/keuangan',
    [APP_VIEWS.OWNER_AUDIT]: '/riwayat-audit',
    [APP_VIEWS.PROFILE]: '/profil',
};

export function resolveViewFromPath(pathname) {
    const clean = (pathname || '/').replace(/\/+$/, '') || '/';

    if (clean === '/pesanan/baru') {
        return { view: APP_VIEWS.ORDER_CREATE, options: {} };
    }

    const detailMatch = clean.match(/^\/pesanan\/(\d+)$/);
    if (detailMatch) {
        return { view: APP_VIEWS.ORDER_DETAIL, options: { orderId: Number(detailMatch[1]) } };
    }

    for (const [view, path] of Object.entries(VIEW_PATHS)) {
        if (path === clean) {
            return { view, options: {} };
        }
    }

    return { view: APP_VIEWS.DASHBOARD, options: {} };
}

function buildPathForView(view, orderId = null) {
    if (view === APP_VIEWS.ORDER_DETAIL && orderId) {
        return `/pesanan/${orderId}`;
    }

    return VIEW_PATHS[view] || '/';
}

function syncBrowserUrl(view, orderId = null, replace = false) {
    if (typeof window === 'undefined' || !window.history) {
        return;
    }

    const targetPath = buildPathForView(view, orderId);
    if (window.location.pathname !== targetPath) {
        const fn = replace ? 'replaceState' : 'pushState';
        window.history[fn]({ view, orderId }, '', targetPath);
    }
}

export const state = {
    user: getStoredUser(),
    token: getStoredToken(),
    activeView: APP_VIEWS.DASHBOARD,
    selectedOrderId: null,
    selectedOrderInitialTab: 'detail',
    authNotice: null,
    toast: null,
    mobileMenuOpen: false,
};

let onStateChange = () => {};
let onToastChange = () => {};

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
    state.token = null;
    state.user = null;
    state.selectedOrderId = null;
    state.activeView = APP_VIEWS.DASHBOARD;
    state.authNotice = notice;
    syncBrowserUrl(APP_VIEWS.DASHBOARD, null, true);
}

export function showToast(message, type = 'success') {
    state.toast = {
        id: Date.now(),
        message,
        type,
    };
    notifyToastRender();

    const currentId = state.toast.id;
    window.setTimeout(() => {
        if (state.toast?.id === currentId) {
            state.toast = null;
            notifyToastRender();
        }
    }, 4500);
}

export function navigateTo(view, options = {}) {
    const ownerOnlyViews = new Set([
        APP_VIEWS.OWNER_CATALOG,
        APP_VIEWS.OWNER_STAFF,
        APP_VIEWS.OWNER_FINANCE,
        APP_VIEWS.OWNER_AUDIT,
    ]);

    if (ownerOnlyViews.has(view) && !isOwner()) {
        showToast('Anda tidak memiliki hak akses ke halaman khusus Owner.', 'error');
        state.activeView = APP_VIEWS.DASHBOARD;
        state.mobileMenuOpen = false;
        syncBrowserUrl(APP_VIEWS.DASHBOARD, null, true);
        notifyRender();
        return;
    }

    state.activeView = view;
    state.mobileMenuOpen = false;

    if (options.orderId !== undefined) {
        state.selectedOrderId = options.orderId;
    }

    if (options.tab !== undefined) {
        state.selectedOrderInitialTab = options.tab;
    }

    syncBrowserUrl(view, state.selectedOrderId, Boolean(options.replaceUrl));
    notifyRender();
}
