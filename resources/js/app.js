import { clearAuthSession, setUnauthorizedHandler, washnoteApi } from './api/client.js';
import {
    animateToastElement,
    cleanupViewMotion,
    destroySmoothScroll,
    initSmoothScroll,
    scrollToPageTop,
    syncBottomNavIndicator,
} from './motion/motionSystem.js';
import {
    APP_VIEWS,
    handlePopStateNavigation,
    isOwner,
    navigateTo,
    resetSession,
    resolveViewFromPath,
    setAuthenticatedSession,
    state,
    subscribeStateChange,
    subscribeToastChange,
} from './state/store.js';
import { escapeHtml, iconSvg } from './utils/formatters.js';
import { mountDashboardView } from './views/dashboardView.js';
import { mountLoginView } from './views/loginView.js';
import { mountOperatingHoursView } from './views/operatingHoursView.js';
import { mountOrderDetailView } from './views/orderDetailView.js';
import { mountOrderCreateView, mountOrdersListView } from './views/ordersView.js';
import { mountOwnerAuditView } from './views/ownerAuditView.js';
import { mountOwnerCatalogView } from './views/ownerCatalogView.js';
import { mountOwnerExpenseCategoriesView } from './views/ownerExpenseCategoriesView.js';
import { mountOwnerExpensesView } from './views/ownerExpensesView.js';
import { mountOwnerReportsView } from './views/ownerReportsView.js';
import { mountOwnerStaffView } from './views/ownerStaffView.js';
import { mountProfileView } from './views/profileView.js';

const rootEl = document.getElementById('app');

let mountedShellRole = null;
let bottomNavResizeListener = null;

function getSidebarNavItems() {
    const items = [
        { view: APP_VIEWS.DASHBOARD, label: 'Dashboard Antrean', icon: 'car', group: 'Operasional' },
        { view: APP_VIEWS.ORDER_CREATE, label: 'Buat Pesanan', icon: 'plus', group: 'Operasional' },
        { view: APP_VIEWS.ORDERS, label: 'Daftar & Riwayat Pesanan', icon: 'receipt', group: 'Operasional' },
        { view: APP_VIEWS.OPERATING_HOURS, label: 'Jam Operasional', icon: 'clock', group: 'Operasional' },
    ];

    if (isOwner()) {
        items.push(
            { view: APP_VIEWS.OWNER_CATALOG, label: 'Katalog & Tarif', icon: 'tag', group: 'Manajemen Owner' },
            { view: APP_VIEWS.OWNER_STAFF, label: 'Akun Kasir', icon: 'users', group: 'Manajemen Owner' },
            { view: APP_VIEWS.OWNER_EXPENSES, label: 'Pengeluaran', icon: 'receipt', group: 'Manajemen Owner' },
            { view: APP_VIEWS.OWNER_REPORTS, label: 'Laporan Keuangan', icon: 'chart', group: 'Manajemen Owner' },
            { view: APP_VIEWS.OWNER_AUDIT, label: 'Audit Perubahan', icon: 'shield', group: 'Manajemen Owner' },
        );
    }

    items.push({ view: APP_VIEWS.PROFILE, label: 'Profil & Kata Sandi', icon: 'user', group: 'Akun' });

    return items;
}

function getMobileBottomNavItems() {
    if (isOwner()) {
        return [
            {
                id: 'owner-home',
                view: APP_VIEWS.DASHBOARD,
                label: 'Beranda',
                icon: 'grid',
                isActive: () =>
                    [APP_VIEWS.DASHBOARD, APP_VIEWS.ORDER_CREATE, APP_VIEWS.ORDERS, APP_VIEWS.ORDER_DETAIL].includes(
                        state.activeView
                    ),
            },
            {
                id: 'owner-expenses',
                view: APP_VIEWS.OWNER_EXPENSES,
                label: 'Pengeluaran',
                icon: 'receipt',
                isActive: () =>
                    [APP_VIEWS.OWNER_EXPENSES, APP_VIEWS.OWNER_EXPENSE_CATEGORIES].includes(state.activeView),
            },
            {
                id: 'owner-reports',
                view: APP_VIEWS.OWNER_REPORTS,
                label: 'Laporan',
                icon: 'barChart',
                isActive: () => state.activeView === APP_VIEWS.OWNER_REPORTS,
            },
            {
                id: 'owner-account',
                view: APP_VIEWS.PROFILE,
                label: 'Akun',
                icon: 'userCog',
                isActive: () =>
                    [
                        APP_VIEWS.PROFILE,
                        APP_VIEWS.OWNER_CATALOG,
                        APP_VIEWS.OWNER_STAFF,
                        APP_VIEWS.OWNER_AUDIT,
                        APP_VIEWS.OPERATING_HOURS,
                    ].includes(state.activeView),
            },
        ];
    }

    return [
        {
            id: 'kasir-home',
            view: APP_VIEWS.DASHBOARD,
            label: 'Beranda',
            icon: 'home',
            isActive: () => state.activeView === APP_VIEWS.DASHBOARD,
        },
        {
            id: 'kasir-create',
            view: APP_VIEWS.ORDER_CREATE,
            label: 'Pesanan',
            icon: 'plusCircle',
            isActive: () => state.activeView === APP_VIEWS.ORDER_CREATE,
        },
        {
            id: 'kasir-orders',
            view: APP_VIEWS.ORDERS,
            label: 'Riwayat',
            icon: 'history',
            isActive: () => [APP_VIEWS.ORDERS, APP_VIEWS.ORDER_DETAIL].includes(state.activeView),
        },
        {
            id: 'kasir-account',
            view: APP_VIEWS.PROFILE,
            label: 'Akun',
            icon: 'user',
            isActive: () => [APP_VIEWS.PROFILE, APP_VIEWS.OPERATING_HOURS].includes(state.activeView),
        },
    ];
}

function getMobileHeaderLabel() {
    switch (state.activeView) {
        case APP_VIEWS.DASHBOARD:
            return 'Dashboard';
        case APP_VIEWS.ORDER_CREATE:
            return 'Form Pesanan';
        case APP_VIEWS.ORDERS:
            return 'Riwayat Pesanan';
        case APP_VIEWS.ORDER_DETAIL:
            return 'Detail Pesanan';
        case APP_VIEWS.OPERATING_HOURS:
            return 'Jam Operasional';
        case APP_VIEWS.OWNER_CATALOG:
            return 'Katalog & Tarif';
        case APP_VIEWS.OWNER_STAFF:
            return 'Kelola Akun Kasir';
        case APP_VIEWS.OWNER_EXPENSES:
            return 'Pengeluaran';
        case APP_VIEWS.OWNER_EXPENSE_CATEGORIES:
            return 'Kategori Pengeluaran';
        case APP_VIEWS.OWNER_REPORTS:
            return 'Laporan Keuangan';
        case APP_VIEWS.OWNER_AUDIT:
            return 'Audit Perubahan';
        case APP_VIEWS.PROFILE:
            return 'Pengaturan Akun';
        default:
            return 'WashNote POS';
    }
}

let cleanupActiveView = null;

async function handleLogout() {
    try {
        await washnoteApi.logout();
    } catch {
        // Proceed clearing local token even if session already expired
    } finally {
        cleanupShellLifecycle();
        resetSession('Anda telah keluar dari sesi.');
        renderApp();
    }
}

function cleanupShellLifecycle() {
    if (typeof cleanupActiveView === 'function') {
        cleanupActiveView();
        cleanupActiveView = null;
    }
    cleanupViewMotion();
    destroySmoothScroll();
    mountedShellRole = null;

    if (bottomNavResizeListener) {
        window.removeEventListener('resize', bottomNavResizeListener);
        bottomNavResizeListener = null;
    }
}

function syncNavigationHighlights(immediateIndicator = false) {
    if (!rootEl) {
        return;
    }

    const subtitleEl = rootEl.querySelector('#mobile-header-subtitle');
    if (subtitleEl) {
        subtitleEl.textContent = getMobileHeaderLabel();
    }

    const profileBtn = rootEl.querySelector('#mobile-header-profile-btn');
    if (profileBtn) {
        const onProfile = state.activeView === APP_VIEWS.PROFILE;
        profileBtn.className = `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition active:scale-[0.97] ${
            onProfile
                ? 'border-brand-navy bg-brand-navy text-white ring-2 ring-brand-navy/20'
                : 'border-border-subtle bg-brand-navy text-white hover:bg-brand-navy-hover'
        }`;
    }

    rootEl.querySelectorAll('[data-nav-view]').forEach((btn) => {
        const itemView = btn.getAttribute('data-nav-view');
        const active =
            state.activeView === itemView ||
            (state.activeView === APP_VIEWS.ORDER_DETAIL && itemView === APP_VIEWS.ORDERS) ||
            (state.activeView === APP_VIEWS.OWNER_EXPENSE_CATEGORIES && itemView === APP_VIEWS.OWNER_EXPENSES);

        btn.className = `flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
            active ? 'bg-brand-navy text-white shadow-xs' : 'text-ink hover:bg-app-bg'
        }`;

        const svgEl = btn.querySelector('svg');
        if (svgEl) {
            svgEl.classList.toggle('text-white', active);
            svgEl.classList.toggle('text-ink-muted', !active);
        }
    });

    const bottomNav = rootEl.querySelector('#mobile-bottom-nav');
    if (!bottomNav) {
        return;
    }

    const mobileItems = getMobileBottomNavItems();
    let activeBottomBtn = null;

    bottomNav.querySelectorAll('[data-bottom-nav-id]').forEach((btn) => {
        const id = btn.getAttribute('data-bottom-nav-id');
        const item = mobileItems.find((entry) => entry.id === id);
        const active = Boolean(item && item.isActive());

        btn.setAttribute('aria-current', active ? 'page' : 'false');
        btn.className = `relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold whitespace-nowrap transition active:scale-[0.96] ${
            active ? 'text-brand-navy' : 'text-ink-muted hover:text-ink'
        }`;

        if (active) {
            activeBottomBtn = btn;
        }
    });

    syncBottomNavIndicator(bottomNav, activeBottomBtn, immediateIndicator);
}

function mountShell() {
    const sidebarItems = getSidebarNavItems();
    const groups = [...new Set(sidebarItems.map((i) => i.group))];
    const mobileItems = getMobileBottomNavItems();
    const roleLabel = isOwner() ? 'OWNER' : 'KASIR';

    rootEl.innerHTML = `
        <div class="min-h-screen bg-app-bg text-ink lg:flex">
            <header class="border-b border-border-subtle bg-surface px-4 py-3 lg:hidden">
                <div class="mx-auto flex max-w-7xl items-center justify-between gap-3">
                    <button id="mobile-header-home-btn" type="button" class="flex min-w-0 items-center gap-2.5 text-left">
                        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-sm font-bold text-white shadow-xs">WN</div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="truncate text-sm font-bold leading-tight text-ink">GALIROSO WASH</span>
                                <span class="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent ring-1 ring-inset ring-accent-border">${escapeHtml(roleLabel)}</span>
                            </div>
                            <div id="mobile-header-subtitle" class="truncate text-xs font-medium text-ink-muted">${escapeHtml(getMobileHeaderLabel())}</div>
                        </div>
                    </button>
                    <button
                        id="mobile-header-profile-btn"
                        type="button"
                        aria-label="Buka Pengaturan Akun"
                        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-brand-navy text-white transition active:scale-[0.97]"
                    >
                        ${iconSvg('user', 'h-5 w-5')}
                    </button>
                </div>
            </header>

            <aside class="hidden border-r border-border-subtle bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-y-auto">
                <div class="border-b border-border-subtle px-5 py-4">
                    <div class="flex items-center gap-2.5">
                        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-sm font-bold text-white shadow-xs">WN</div>
                        <div>
                            <div class="text-sm font-bold leading-tight text-ink">WashNote POS</div>
                            <div class="text-[11px] font-medium text-ink-muted">GALIROSO WASH</div>
                        </div>
                    </div>
                </div>

                <div class="flex flex-1 flex-col justify-between space-y-5 p-4">
                    <div class="space-y-5">
                        <div class="rounded-xl border border-border-subtle bg-app-bg px-3.5 py-2.5">
                            <p class="truncate text-sm font-semibold text-ink">${escapeHtml(state.user?.nama_lengkap || '-')}</p>
                            <p class="text-xs text-ink-muted">@${escapeHtml(state.user?.username || '-')} • <span class="font-semibold uppercase text-accent">${escapeHtml(state.user?.peran || '-')}</span></p>
                        </div>

                        <nav aria-label="Navigasi desktop" class="space-y-4">
                            ${groups.map((grp) => `
                                <div>
                                    <p class="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">${escapeHtml(grp)}</p>
                                    <div class="space-y-1">
                                        ${sidebarItems
                                            .filter((item) => item.group === grp)
                                            .map((item) => `
                                                <button
                                                    type="button"
                                                    data-nav-view="${item.view}"
                                                    class="flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-app-bg"
                                                >
                                                    ${iconSvg(item.icon, 'h-4 w-4 text-ink-muted')}
                                                    <span>${escapeHtml(item.label)}</span>
                                                </button>
                                            `)
                                            .join('')}
                                    </div>
                                </div>
                            `).join('')}
                        </nav>
                    </div>

                    <div class="border-t border-border-subtle pt-3">
                        <button id="logout-btn" type="button" class="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-danger transition active:scale-[0.985] hover:bg-red-100">
                            ${iconSvg('logout', 'h-4 w-4')}
                            <span>Keluar</span>
                        </button>
                    </div>
                </div>
            </aside>

            <main class="min-w-0 flex-1 px-4 pt-4 pb-24 sm:px-6 sm:pt-6 lg:p-8">
                <div id="toast-outlet"></div>

                <div id="view-outlet" class="mx-auto w-full max-w-7xl"></div>
            </main>

            <nav
                id="mobile-bottom-nav"
                aria-label="Navigasi utama mobile"
                style="padding-bottom: max(0.35rem, env(safe-area-inset-bottom));"
                class="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface/95 backdrop-blur-xs lg:hidden"
            >
                <div class="relative mx-auto grid max-w-lg grid-cols-4">
                    <div id="bottom-nav-indicator" class="pointer-events-none absolute top-0 left-0 h-[3px] rounded-b-full bg-brand-navy opacity-0"></div>
                    ${mobileItems
                        .map(
                            (item) => `
                                <button
                                    type="button"
                                    data-bottom-nav-id="${item.id}"
                                    data-bottom-view="${item.view}"
                                    class="relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold whitespace-nowrap text-ink-muted transition"
                                >
                                    ${iconSvg(item.icon, 'h-5 w-5')}
                                    <span>${escapeHtml(item.label)}</span>
                                </button>
                            `
                        )
                        .join('')}
                </div>
            </nav>
        </div>
    `;

    rootEl.querySelector('#mobile-header-home-btn')?.addEventListener('click', () => {
        navigateTo(APP_VIEWS.DASHBOARD);
    });

    rootEl.querySelector('#mobile-header-profile-btn')?.addEventListener('click', () => {
        navigateTo(APP_VIEWS.PROFILE);
    });

    rootEl.querySelectorAll('[data-nav-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
            navigateTo(btn.getAttribute('data-nav-view'));
        });
    });

    rootEl.querySelectorAll('[data-bottom-nav-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
            navigateTo(btn.getAttribute('data-bottom-view'));
        });
    });

    rootEl.querySelector('#logout-btn')?.addEventListener('click', handleLogout);

    bottomNavResizeListener = () => {
        syncNavigationHighlights(true);
    };
    window.addEventListener('resize', bottomNavResizeListener);

    mountedShellRole = isOwner() ? 'owner' : 'kasir';
    initSmoothScroll();
}

function mountActiveView() {
    const outlet = rootEl?.querySelector('#view-outlet');
    if (!outlet) {
        return;
    }

    if (typeof cleanupActiveView === 'function') {
        cleanupActiveView();
        cleanupActiveView = null;
    }

    cleanupViewMotion();
    scrollToPageTop();

    switch (state.activeView) {
        case APP_VIEWS.DASHBOARD:
            cleanupActiveView = mountDashboardView(outlet);
            break;
        case APP_VIEWS.ORDER_CREATE:
            cleanupActiveView = mountOrderCreateView(outlet);
            break;
        case APP_VIEWS.ORDERS:
            cleanupActiveView = mountOrdersListView(outlet);
            break;
        case APP_VIEWS.ORDER_DETAIL:
            cleanupActiveView = mountOrderDetailView(outlet, state.selectedOrderId);
            break;
        case APP_VIEWS.OPERATING_HOURS:
            cleanupActiveView = mountOperatingHoursView(outlet);
            break;
        case APP_VIEWS.OWNER_CATALOG:
            cleanupActiveView = mountOwnerCatalogView(outlet);
            break;
        case APP_VIEWS.OWNER_STAFF:
            cleanupActiveView = mountOwnerStaffView(outlet);
            break;
        case APP_VIEWS.OWNER_EXPENSES:
            cleanupActiveView = mountOwnerExpensesView(outlet);
            break;
        case APP_VIEWS.OWNER_EXPENSE_CATEGORIES:
            cleanupActiveView = mountOwnerExpenseCategoriesView(outlet);
            break;
        case APP_VIEWS.OWNER_REPORTS:
            cleanupActiveView = mountOwnerReportsView(outlet);
            break;
        case APP_VIEWS.OWNER_AUDIT:
            cleanupActiveView = mountOwnerAuditView(outlet);
            break;
        case APP_VIEWS.PROFILE:
            cleanupActiveView = mountProfileView(outlet, () => renderApp());
            break;
        default:
            cleanupActiveView = mountDashboardView(outlet);
    }
}

function renderShellAndView() {
    const role = isOwner() ? 'owner' : 'kasir';
    const hasShell = Boolean(rootEl?.querySelector('#view-outlet')) && mountedShellRole === role;

    if (!hasShell) {
        cleanupShellLifecycle();
        mountShell();
        renderToast();
        syncNavigationHighlights(true);
    } else {
        syncNavigationHighlights(false);
    }

    mountActiveView();
}

function renderToast() {
    const toastOutlet = rootEl?.querySelector('#toast-outlet');
    if (!toastOutlet) {
        return;
    }

    if (!state.toast) {
        toastOutlet.innerHTML = '';
        return;
    }

    const colorCls =
        state.toast.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-900'
            : state.toast.type === 'info'
              ? 'border-blue-200 bg-blue-50 text-brand-navy'
              : 'border-green-200 bg-green-50 text-success';

    toastOutlet.innerHTML = `
        <div class="mb-4 rounded-xl border px-4 py-3 text-sm font-medium shadow-sm ${colorCls}" role="status">
            ${escapeHtml(state.toast.message)}
        </div>
    `;

    animateToastElement(toastOutlet.firstElementChild);
}

function renderApp() {
    if (!rootEl) {
        return;
    }

    if (!state.token || !state.user) {
        cleanupShellLifecycle();
        initSmoothScroll();
        cleanupActiveView = mountLoginView(rootEl, state.authNotice, () => {
            const initial = resolveViewFromPath(window.location.pathname, window.location.search);
            navigateTo(initial.view, { ...initial.options, replaceUrl: true });
        });
        return;
    }

    renderShellAndView();
}

async function bootstrap() {
    setUnauthorizedHandler((err) => {
        cleanupShellLifecycle();
        resetSession(err?.message || 'Sesi Anda telah berakhir. Silakan masuk kembali.');
        renderApp();
    });

    subscribeStateChange(renderApp);
    subscribeToastChange(renderToast);

    window.addEventListener('popstate', (event) => {
        handlePopStateNavigation(event.state);
    });

    if (state.token) {
        try {
            const res = await washnoteApi.getProfile();
            if (res?.data) {
                setAuthenticatedSession(state.token, res.data);
                const initial = resolveViewFromPath(window.location.pathname, window.location.search);
                navigateTo(initial.view, { ...initial.options, replaceUrl: true });
                return;
            }
        } catch {
            clearAuthSession();
            resetSession('Sesi tidak valid atau akun dinonaktifkan. Silakan login kembali.');
        }
    }

    renderApp();
}

bootstrap();
