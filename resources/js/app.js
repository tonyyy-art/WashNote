import { clearAuthSession, setUnauthorizedHandler, washnoteApi } from './api/client.js';
import {
    APP_VIEWS,
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
import { mountOwnerFinanceView } from './views/ownerFinanceView.js';
import { mountOwnerStaffView } from './views/ownerStaffView.js';
import { mountProfileView } from './views/profileView.js';

const rootEl = document.getElementById('app');

function getNavItems() {
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
            { view: APP_VIEWS.OWNER_FINANCE, label: 'Pengeluaran & Laporan', icon: 'wallet', group: 'Manajemen Owner' },
            { view: APP_VIEWS.OWNER_AUDIT, label: 'Audit Perubahan', icon: 'shield', group: 'Manajemen Owner' },
        );
    }

    items.push({ view: APP_VIEWS.PROFILE, label: 'Profil & Kata Sandi', icon: 'user', group: 'Akun' });

    return items;
}

async function handleLogout() {
    try {
        await washnoteApi.logout();
    } catch {
        // Proceed clearing local token even if session already expired
    } finally {
        resetSession('Anda telah keluar dari sesi.');
        renderApp();
    }
}

function renderShellAndView() {
    const navItems = getNavItems();
    const groups = [...new Set(navItems.map((i) => i.group))];

    rootEl.innerHTML = `
        <div class="min-h-screen bg-app-bg text-ink lg:flex">
            <aside class="border-b border-border-subtle bg-surface lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
                <div class="flex items-center justify-between px-4 py-3 lg:border-b lg:border-border-subtle lg:px-5 lg:py-4">
                    <div class="flex items-center gap-2.5">
                        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-sm font-bold text-white shadow-xs">WN</div>
                        <div>
                            <div class="text-sm font-bold leading-tight text-ink">WashNote POS</div>
                            <div class="text-[11px] font-medium text-ink-muted">GALIROSO WASH</div>
                        </div>
                    </div>
                    <button
                        id="mobile-nav-toggle"
                        type="button"
                        aria-expanded="${state.mobileMenuOpen ? 'true' : 'false'}"
                        aria-controls="mobile-drawer"
                        class="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-app-bg lg:hidden"
                    >
                        <span id="mobile-nav-icon">${iconSvg(state.mobileMenuOpen ? 'close' : 'menu', 'h-4 w-4 text-brand-navy')}</span>
                        <span id="mobile-nav-label">${state.mobileMenuOpen ? 'Tutup' : 'Menu'}</span>
                    </button>
                </div>

                <div id="mobile-drawer" class="${state.mobileMenuOpen ? 'block' : 'hidden'} flex-1 space-y-5 border-t border-border-subtle p-4 lg:block lg:border-t-0">
                    <div class="rounded-xl border border-border-subtle bg-app-bg px-3.5 py-2.5">
                        <p class="truncate text-sm font-semibold text-ink">${escapeHtml(state.user?.nama_lengkap || '-')}</p>
                        <p class="text-xs text-ink-muted">@${escapeHtml(state.user?.username || '-')} • <span class="font-semibold uppercase text-primary">${escapeHtml(state.user?.peran || '-')}</span></p>
                    </div>

                    <nav aria-label="Navigasi utama" class="space-y-4">
                        ${groups.map((grp) => `
                            <div>
                                <p class="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">${escapeHtml(grp)}</p>
                                <div class="space-y-1">
                                    ${navItems
                                        .filter((item) => item.group === grp)
                                        .map((item) => {
                                            const active =
                                                state.activeView === item.view ||
                                                (state.activeView === APP_VIEWS.ORDER_DETAIL && item.view === APP_VIEWS.ORDERS);
                                            return `
                                                <button
                                                    type="button"
                                                    data-nav-view="${item.view}"
                                                    class="flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                                                        active
                                                            ? 'bg-primary text-white shadow-xs'
                                                            : 'text-ink hover:bg-app-bg'
                                                    }"
                                                >
                                                    ${iconSvg(item.icon, `h-4 w-4 ${active ? 'text-white' : 'text-ink-muted'}`)}
                                                    <span>${escapeHtml(item.label)}</span>
                                                </button>
                                            `;
                                        })
                                        .join('')}
                                </div>
                            </div>
                        `).join('')}
                    </nav>

                    <div class="border-t border-border-subtle pt-3">
                        <button id="logout-btn" type="button" class="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-red-100">
                            ${iconSvg('logout', 'h-4 w-4')}
                            <span>Keluar</span>
                        </button>
                    </div>
                </div>
            </aside>

            <main class="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
                <div id="toast-outlet"></div>

                <div id="view-outlet" class="mx-auto w-full max-w-7xl"></div>
            </main>
        </div>
    `;

    renderToast();

    rootEl.querySelector('#mobile-nav-toggle')?.addEventListener('click', () => {
        state.mobileMenuOpen = !state.mobileMenuOpen;
        const toggleBtn = rootEl.querySelector('#mobile-nav-toggle');
        const toggleIcon = rootEl.querySelector('#mobile-nav-icon');
        const toggleLabel = rootEl.querySelector('#mobile-nav-label');
        const drawer = rootEl.querySelector('#mobile-drawer');
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', state.mobileMenuOpen ? 'true' : 'false');
        }
        if (toggleIcon) {
            toggleIcon.innerHTML = iconSvg(state.mobileMenuOpen ? 'close' : 'menu', 'h-4 w-4 text-brand-navy');
        }
        if (toggleLabel) {
            toggleLabel.textContent = state.mobileMenuOpen ? 'Tutup' : 'Menu';
        }
        if (drawer) {
            drawer.classList.toggle('hidden', !state.mobileMenuOpen);
            drawer.classList.toggle('block', state.mobileMenuOpen);
        }
    });

    rootEl.querySelectorAll('[data-nav-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
            navigateTo(btn.getAttribute('data-nav-view'));
        });
    });

    rootEl.querySelector('#logout-btn')?.addEventListener('click', handleLogout);

    const outlet = rootEl.querySelector('#view-outlet');

    switch (state.activeView) {
        case APP_VIEWS.DASHBOARD:
            mountDashboardView(outlet);
            break;
        case APP_VIEWS.ORDER_CREATE:
            mountOrderCreateView(outlet);
            break;
        case APP_VIEWS.ORDERS:
            mountOrdersListView(outlet);
            break;
        case APP_VIEWS.ORDER_DETAIL:
            mountOrderDetailView(outlet, state.selectedOrderId);
            break;
        case APP_VIEWS.OPERATING_HOURS:
            mountOperatingHoursView(outlet);
            break;
        case APP_VIEWS.OWNER_CATALOG:
            mountOwnerCatalogView(outlet);
            break;
        case APP_VIEWS.OWNER_STAFF:
            mountOwnerStaffView(outlet);
            break;
        case APP_VIEWS.OWNER_FINANCE:
            mountOwnerFinanceView(outlet);
            break;
        case APP_VIEWS.OWNER_AUDIT:
            mountOwnerAuditView(outlet);
            break;
        case APP_VIEWS.PROFILE:
            mountProfileView(outlet, () => renderApp());
            break;
        default:
            mountDashboardView(outlet);
    }
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
              ? 'border-primary-border bg-primary-soft text-brand-navy'
              : 'border-green-200 bg-green-50 text-success';

    toastOutlet.innerHTML = `
        <div class="mb-4 rounded-xl border px-4 py-3 text-sm font-medium shadow-sm ${colorCls}" role="status">
            ${escapeHtml(state.toast.message)}
        </div>
    `;
}

function renderApp() {
    if (!rootEl) {
        return;
    }

    if (!state.token || !state.user) {
        mountLoginView(rootEl, state.authNotice, () => {
            const initial = resolveViewFromPath(window.location.pathname);
            navigateTo(initial.view, { ...initial.options, replaceUrl: true });
        });
        return;
    }

    renderShellAndView();
}

async function bootstrap() {
    setUnauthorizedHandler((err) => {
        resetSession(err?.message || 'Sesi Anda telah berakhir. Silakan masuk kembali.');
        renderApp();
    });

    subscribeStateChange(renderApp);
    subscribeToastChange(renderToast);

    window.addEventListener('popstate', () => {
        if (state.token && state.user) {
            const target = resolveViewFromPath(window.location.pathname);
            navigateTo(target.view, { ...target.options, replaceUrl: true });
        }
    });

    if (state.token) {
        try {
            const res = await washnoteApi.getProfile();
            if (res?.data) {
                setAuthenticatedSession(state.token, res.data);
                const initial = resolveViewFromPath(window.location.pathname);
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
