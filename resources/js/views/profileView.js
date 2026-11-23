import { washnoteApi } from '../api/client.js';
import { createViewMotion } from '../motion/motionSystem.js';
import { APP_VIEWS, isOwner, navigateTo, resetSession, state } from '../state/store.js';
import {
    badgeStatusAktif,
    escapeHtml,
    getInitials,
    iconSvg,
    renderErrorAlert,
    renderPageHeader,
} from '../utils/formatters.js';

export function mountProfileView(container, onSessionEnded) {
    const motion = createViewMotion(container);
    let isSubmitting = false;
    let errorObj = null;
    let profile = state.user;

    async function refreshProfile() {
        try {
            const res = await washnoteApi.getProfile();
            if (res?.data) {
                profile = res.data;
                state.user = res.data;
            }
        } catch (err) {
            errorObj = err;
        } finally {
            render();
            motion.runIntro();
        }
    }

    async function handleLogout() {
        try {
            await washnoteApi.logout();
        } catch {
            // Proceed clearing local token even if session already expired
        } finally {
            resetSession('Anda telah keluar dari sesi.');
            onSessionEnded();
        }
    }

    function renderPasswordField(id, label, placeholder) {
        return `
            <div>
                <label for="${id}" class="wn-label">${escapeHtml(label)} <span class="text-danger">*</span></label>
                <div class="relative">
                    <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
                        ${iconSvg('lock', 'h-4 w-4')}
                    </span>
                    <input id="${id}" type="password" required minlength="8" placeholder="${escapeHtml(placeholder)}" class="wn-input pl-9 pr-11" />
                    <button
                        type="button"
                        data-toggle-pass="${id}"
                        aria-label="Tampilkan kata sandi"
                        class="absolute inset-y-0 right-1 flex min-w-[36px] items-center justify-center text-ink-muted hover:text-ink"
                    >
                        ${iconSvg('eye', 'h-4 w-4')}
                    </button>
                </div>
            </div>
        `;
    }

    function render() {
        const ownerMode = isOwner();

        container.innerHTML = `
            <div class="max-w-2xl space-y-6">
                ${renderPageHeader({ title: 'Pengaturan Akun' })}

                ${errorObj ? renderErrorAlert(errorObj) : ''}

                <div data-motion-card class="wn-card-navy p-5 sm:p-6">
                    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div class="flex items-center gap-4">
                            <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-white">
                                ${escapeHtml(getInitials(profile?.nama_lengkap))}
                            </div>
                            <div class="min-w-0">
                                <div class="flex flex-wrap items-center gap-2">
                                    <h2 class="text-lg font-bold">${escapeHtml(profile?.nama_lengkap || '-')}</h2>
                                    <span class="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-teal-100">
                                        ${escapeHtml(profile?.peran || '-')}
                                    </span>
                                </div>
                                <p class="mt-0.5 font-mono text-xs text-blue-100/80">@${escapeHtml(profile?.username || '-')}</p>
                            </div>
                        </div>
                        <div>${badgeStatusAktif(Boolean(profile?.status_aktif))}</div>
                    </div>
                    ${!ownerMode ? `
                        <div class="mt-4 flex items-start gap-2.5 rounded-xl bg-white/10 px-3.5 py-2.5 text-xs text-blue-50">
                            ${iconSvg('shield', 'mt-0.5 h-4 w-4 text-teal-200')}
                            <span>Akses terbatas pada operasional pesanan, antrean, dan pembayaran. Hubungi Owner untuk perubahan tarif atau akun.</span>
                        </div>
                    ` : ''}
                </div>

                ${ownerMode ? `
                    <div data-motion-card class="space-y-3">
                        <h2 class="text-sm font-bold text-ink">Manajemen Data & Gerai</h2>
                        <div class="grid gap-3 sm:grid-cols-2">
                            ${[
                                [APP_VIEWS.OWNER_STAFF, 'users', 'Kelola Akun Kasir', 'Tambah staf, status aktif, dan reset sandi'],
                                [APP_VIEWS.OWNER_CATALOG, 'tag', 'Katalog & Tarif', 'Kategori kendaraan, layanan, dan batas harga'],
                                [APP_VIEWS.OPERATING_HOURS, 'clock', 'Jam Operasional', 'Jadwal mingguan & pengecualian hari libur'],
                                [APP_VIEWS.ORDERS, 'receipt', 'Riwayat & Daftar Pesanan', 'Cari transaksi, ubah, atau batalkan pesanan'],
                                [APP_VIEWS.OWNER_FINANCE, 'wallet', 'Pengeluaran & Laporan', 'Kategori biaya, pengeluaran, dan laporan omzet'],
                                [APP_VIEWS.OWNER_AUDIT, 'shield', 'Audit Perubahan', 'Riwayat perubahan pesanan, tarif, & akun'],
                            ].map(([view, icon, title, desc]) => `
                                <button
                                    type="button"
                                    data-prof-nav="${view}"
                                    class="wn-card wn-interactive-card flex items-center justify-between gap-3 p-4 text-left transition hover:border-accent-border hover:bg-accent-soft/40"
                                >
                                    <div class="flex items-start gap-3">
                                        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                                            ${iconSvg(icon, 'h-4 w-4')}
                                        </span>
                                        <div>
                                            <p class="text-sm font-bold text-ink">${escapeHtml(title)}</p>
                                            <p class="mt-0.5 text-xs text-ink-muted">${escapeHtml(desc)}</p>
                                        </div>
                                    </div>
                                    ${iconSvg('chevronRight', 'h-4 w-4 text-ink-muted')}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                ` : `
                    <div data-motion-card class="space-y-3">
                        <h2 class="text-sm font-bold text-ink">Operasional Gerai</h2>
                        <button
                            type="button"
                            data-prof-nav="${APP_VIEWS.OPERATING_HOURS}"
                            class="wn-card wn-interactive-card flex w-full items-center justify-between gap-3 p-4 text-left transition hover:border-accent-border hover:bg-accent-soft/40"
                        >
                            <div class="flex items-start gap-3">
                                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                                    ${iconSvg('clock', 'h-4 w-4')}
                                </span>
                                <div>
                                    <p class="text-sm font-bold text-ink">Jadwal Jam Operasional</p>
                                    <p class="mt-0.5 text-xs text-ink-muted">Lihat jam buka mingguan dan hari libur gerai (WIB)</p>
                                </div>
                            </div>
                            ${iconSvg('chevronRight', 'h-4 w-4 text-ink-muted')}
                        </button>
                    </div>
                `}

                <form id="change-pass-form" data-motion-reveal class="wn-card space-y-4 p-5 sm:p-6">
                    <div>
                        <h2 class="text-base font-bold text-ink">Keamanan & Ubah Kata Sandi</h2>
                        <p class="mt-1 text-xs text-ink-muted">Sesi login aktif akan berakhir setelah kata sandi diperbarui.</p>
                    </div>
                    ${renderPasswordField('prof-cur-pass', 'Kata Sandi Saat Ini', 'Masukkan kata sandi saat ini')}
                    ${renderPasswordField('prof-new-pass', 'Kata Sandi Baru (Min. 8 karakter)', 'Minimal 8 karakter')}
                    ${renderPasswordField('prof-conf-pass', 'Konfirmasi Kata Sandi Baru', 'Ketik ulang kata sandi baru')}
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary w-full sm:w-auto">
                        ${isSubmitting ? 'Memproses...' : 'Simpan Kata Sandi'}
                    </button>
                </form>

                <div data-motion-reveal class="wn-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 class="text-sm font-bold text-ink">Akhiri Sesi</h3>
                        <p class="mt-0.5 text-xs text-ink-muted">Keluar dari perangkat ini dan cabut token autentikasi aktif.</p>
                    </div>
                    <button id="prof-logout-btn" type="button" class="wn-btn-danger w-full gap-2 sm:w-auto">
                        ${iconSvg('logout', 'h-4 w-4')}
                        <span>Keluar</span>
                    </button>
                </div>
            </div>
        `;

        container.querySelectorAll('[data-prof-nav]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-prof-nav');
                if (target === APP_VIEWS.OWNER_FINANCE) {
                    navigateTo(target, { financeTab: 'reports' });
                } else {
                    navigateTo(target);
                }
            });
        });

        container.querySelectorAll('[data-toggle-pass]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-toggle-pass');
                const input = container.querySelector(`#${targetId}`);
                if (!input) {
                    return;
                }
                const nextType = input.type === 'password' ? 'text' : 'password';
                input.type = nextType;
                btn.innerHTML = iconSvg(nextType === 'text' ? 'eyeOff' : 'eye', 'h-4 w-4');
            });
        });

        container.querySelector('#prof-logout-btn')?.addEventListener('click', handleLogout);

        container.querySelector('#change-pass-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                current_password: container.querySelector('#prof-cur-pass')?.value || '',
                new_password: container.querySelector('#prof-new-pass')?.value || '',
                new_password_confirmation: container.querySelector('#prof-conf-pass')?.value || '',
            };
            isSubmitting = true;
            errorObj = null;
            render();

            try {
                await washnoteApi.changePassword(payload);
                resetSession('Kata sandi berhasil diperbarui. Silakan masuk kembali dengan kata sandi baru.');
                onSessionEnded();
            } catch (err) {
                errorObj = err;
                isSubmitting = false;
                render();
            }
        });
    }

    refreshProfile();
}
