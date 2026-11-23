import { washnoteApi } from '../api/client.js';
import { createViewMotion } from '../motion/motionSystem.js';
import { setAuthenticatedSession } from '../state/store.js';
import { escapeHtml, iconSvg, renderErrorAlert } from '../utils/formatters.js';

export function mountLoginView(container, authNotice, onLoggedIn) {
    const motion = createViewMotion(container);
    let isLoading = false;
    let verifiedRoleLabel = null;
    let errorObj = null;
    let fieldErrors = {};
    let showPassword = false;

    function render() {
        container.innerHTML = `
            <div class="flex min-h-screen flex-col justify-center bg-app-bg px-4 py-8 sm:px-6 sm:py-10">
                <div class="mx-auto w-full max-w-md">
                    <div data-motion-card class="mb-6 text-center">
                        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-navy text-lg font-bold text-white shadow-sm">
                            WN
                        </div>
                        <p class="text-xs font-semibold tracking-widest text-ink-muted">GALIROSO WASH POS</p>
                        <h1 class="mt-1 text-2xl font-bold tracking-tight text-ink">Selamat Datang</h1>
                        <p class="mt-1 text-sm text-ink-muted">Masuk untuk melanjutkan.</p>
                    </div>

                    <div data-motion-card class="wn-card p-5 shadow-sm sm:p-8">
                        ${verifiedRoleLabel ? `
                            <div class="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm font-medium text-success" role="status">
                                ${iconSvg('checkCircle', 'h-4 w-4 text-success')}
                                <span>Terverifikasi sebagai ${escapeHtml(verifiedRoleLabel)}</span>
                            </div>
                        ` : ''}

                        ${authNotice && !verifiedRoleLabel ? `
                            <div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900" role="status">
                                ${escapeHtml(authNotice)}
                            </div>
                        ` : ''}

                        ${errorObj ? `<div class="mb-4">${renderErrorAlert(errorObj)}</div>` : ''}

                        <form id="login-form" novalidate class="space-y-4">
                            <div>
                                <label for="login-username" class="wn-label">Username <span class="text-danger">*</span></label>
                                <div class="relative">
                                    <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
                                        ${iconSvg('user', 'h-4 w-4')}
                                    </span>
                                    <input
                                        id="login-username"
                                        name="username"
                                        type="text"
                                        required
                                        autocomplete="username"
                                        placeholder="Masukkan username"
                                        class="wn-input pl-9 ${fieldErrors.username ? 'border-danger focus:border-danger focus:ring-danger/20' : ''}"
                                    />
                                </div>
                                ${fieldErrors.username ? `
                                    <p class="mt-1.5 flex items-center gap-1 text-xs font-medium text-danger">
                                        ${iconSvg('alertCircle', 'h-3.5 w-3.5')}
                                        <span>${escapeHtml(fieldErrors.username)}</span>
                                    </p>
                                ` : ''}
                            </div>

                            <div>
                                <label for="login-password" class="wn-label">Kata Sandi <span class="text-danger">*</span></label>
                                <div class="relative">
                                    <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
                                        ${iconSvg('lock', 'h-4 w-4')}
                                    </span>
                                    <input
                                        id="login-password"
                                        name="password"
                                        type="${showPassword ? 'text' : 'password'}"
                                        required
                                        autocomplete="current-password"
                                        placeholder="Masukkan kata sandi"
                                        class="wn-input pl-9 pr-11 ${fieldErrors.password ? 'border-danger focus:border-danger focus:ring-danger/20' : ''}"
                                    />
                                    <button
                                        id="login-toggle-pass"
                                        type="button"
                                        aria-label="Tampilkan atau sembunyikan kata sandi"
                                        class="absolute inset-y-0 right-1 flex min-w-[36px] items-center justify-center text-ink-muted hover:text-ink"
                                    >
                                        ${iconSvg(showPassword ? 'eyeOff' : 'eye', 'h-4 w-4')}
                                    </button>
                                </div>
                                ${fieldErrors.password ? `
                                    <p class="mt-1.5 flex items-center gap-1 text-xs font-medium text-danger">
                                        ${iconSvg('alertCircle', 'h-3.5 w-3.5')}
                                        <span>${escapeHtml(fieldErrors.password)}</span>
                                    </p>
                                ` : ''}
                            </div>

                            <button
                                type="submit"
                                id="login-submit"
                                ${isLoading || Boolean(verifiedRoleLabel) ? 'disabled' : ''}
                                class="wn-btn-primary w-full gap-2"
                            >
                                ${isLoading ? '<span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>' : ''}
                                <span>${verifiedRoleLabel ? 'Berhasil Masuk...' : isLoading ? 'Memverifikasi...' : 'Masuk'}</span>
                            </button>
                        </form>
                    </div>

                    <p class="mt-6 text-center text-xs text-ink-muted">Sistem POS Internal • Akses Khusus Staf & Pemilik</p>
                </div>
            </div>
        `;

        const passInput = container.querySelector('#login-password');
        const toggleBtn = container.querySelector('#login-toggle-pass');
        toggleBtn?.addEventListener('click', () => {
            showPassword = !showPassword;
            if (passInput) {
                passInput.type = showPassword ? 'text' : 'password';
            }
            if (toggleBtn) {
                toggleBtn.innerHTML = iconSvg(showPassword ? 'eyeOff' : 'eye', 'h-4 w-4');
            }
        });

        const form = container.querySelector('#login-form');
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (isLoading || verifiedRoleLabel) {
                return;
            }

            const usernameInput = container.querySelector('#login-username');
            const passwordInput = container.querySelector('#login-password');
            const username = usernameInput?.value?.trim() || '';
            const password = passwordInput?.value || '';

            const nextFieldErrors = {};
            if (username === '') {
                nextFieldErrors.username = 'Username wajib diisi.';
            }
            if (password === '') {
                nextFieldErrors.password = 'Kata sandi wajib diisi.';
            }

            if (Object.keys(nextFieldErrors).length > 0) {
                fieldErrors = nextFieldErrors;
                errorObj = null;
                render();
                const restoredUsername = container.querySelector('#login-username');
                if (restoredUsername) {
                    restoredUsername.value = username;
                }
                return;
            }

            fieldErrors = {};
            isLoading = true;
            errorObj = null;
            render();

            try {
                const res = await washnoteApi.login({ username, password });
                const token = res?.data?.token;
                const user = res?.data?.user;

                if (!token || !user) {
                    throw new Error('Respons autentikasi dari server tidak lengkap.');
                }

                setAuthenticatedSession(token, user);
                isLoading = false;
                verifiedRoleLabel = user.peran === 'owner' ? 'Owner' : 'Kasir';
                render();
                window.setTimeout(() => onLoggedIn(), 200);
            } catch (err) {
                errorObj = err;
                isLoading = false;
                render();

                const nextUsername = container.querySelector('#login-username');
                if (nextUsername) {
                    nextUsername.value = username;
                }
            }
        });
    }

    render();
    motion.runIntro();
}
