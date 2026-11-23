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
import { escapeHtml } from './utils/formatters.js';
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
        { view: APP_VIEWS.DASHBOARD, label: 'Dashboard Antrean', group: 'Operasional' },
        { view: APP_VIEWS.ORDER_CREATE, label: 'Buat Pesanan', group: 'Operasional' },
        { view: APP_VIEWS.ORDERS, label: 'Daftar & Riwayat Pesanan', group: 'Operasional' },
        { view: APP_VIEWS.OPERATING_HOURS, label: 'Jam Operasional', group: 'Operasional' },
    ];

    if (isOwner()) {
        items.push(
            { view: APP_VIEWS.OWNER_CATALOG, label: 'Katalog & Tarif', group: 'Manajemen Owner' },
            { view: APP_VIEWS.OWNER_STAFF, label: 'Akun Kasir', group: 'Manajemen Owner' },
            { view: APP_VIEWS.OWNER_FINANCE, label: 'Pengeluaran & Laporan', group: 'Manajemen Owner' },
            { view: APP_VIEWS.OWNER_AUDIT, label: 'Audit Perubahan', group: 'Manajemen Owner' },
        );
    }

    items.push({ view: APP_VIEWS.PROFILE, label: 'Profil & Kata Sandi', group: 'Akun' });

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
        <div class="min-h-screen bg-slate-50 lg:flex">
            <aside class="border-b border-slate-200 bg-white lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
                <div class="flex items-center justify-between px-4 py-3.5 lg:border-b lg:border-slate-200 lg:px-5 lg:py-4">
                    <div class="flex items-center gap-2.5">
                        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-sm font-bold text-white">WN</div>
                        <div>
                            <div class="text-sm font-bold leading-tight text-slate-900">WashNote POS</div>
                            <div class="text-[11px] font-medium text-slate-500">GALIROSO WASH</div>
                        </div>
                    </div>
                    <button id="mobile-nav-toggle" type="button" class="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 lg:hidden">
                        Menu
                    </button>
                </div>

                <div id="mobile-drawer" class="${state.mobileMenuOpen ? 'block' : 'hidden'} flex-1 space-y-5 p-4 lg:block">
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                        <p class="truncate text-sm font-semibold text-slate-900">${escapeHtml(state.user?.nama_lengkap || '-')}</p>
                        <p class="text-xs text-slate-500">@${escapeHtml(state.user?.username || '-')} • <span class="font-semibold uppercase text-teal-700">${escapeHtml(state.user?.peran || '-')}</span></p>
                    </div>

                    <nav class="space-y-4">
                        ${groups.map((grp) => `
                            <div>
                                <p class="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">${escapeHtml(grp)}</p>
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
                                                    class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                                                        active ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
                                                    }"
                                                >
                                                    ${escapeHtml(item.label)}
                                                </button>
                                            `;
                                        })
                                        .join('')}
                                </div>
                            </div>
                        `).join('')}
                    </nav>

                    <div class="border-t border-slate-200 pt-3">
                        <button id="logout-btn" type="button" class="flex w-full items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                            Keluar
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
        const drawer = rootEl.querySelector('#mobile-drawer');
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
            ? 'border-rose-200 bg-rose-50 text-rose-800'
            : state.toast.type === 'info'
              ? 'border-sky-200 bg-sky-50 text-sky-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800';

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
