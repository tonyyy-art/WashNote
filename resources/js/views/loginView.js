import { washnoteApi } from '../api/client.js';
import { setAuthenticatedSession } from '../state/store.js';
import { escapeHtml, renderErrorAlert } from '../utils/formatters.js';

export function mountLoginView(container, authNotice, onLoggedIn) {
    let isLoading = false;
    let errorObj = null;

    function render() {
        container.innerHTML = `
            <div class="flex min-h-screen flex-col justify-center bg-slate-100 px-4 py-10 sm:px-6">
                <div class="mx-auto w-full max-w-md">
                    <div class="mb-6 text-center">
                        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-700 text-lg font-bold text-white shadow-sm">
                            WN
                        </div>
                        <h1 class="text-2xl font-bold tracking-tight text-slate-900">WashNote POS</h1>
                        <p class="mt-0.5 text-xs font-semibold tracking-wider text-slate-500">GALIROSO WASH</p>
                    </div>

                    <div class="wn-card p-6 shadow-sm sm:p-8">
                        <h2 class="text-lg font-bold text-slate-900">Masuk</h2>

                        ${authNotice ? `
                            <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
                                ${escapeHtml(authNotice)}
                            </div>
                        ` : ''}

                        ${errorObj ? `<div class="mt-4">${renderErrorAlert(errorObj)}</div>` : ''}

                        <form id="login-form" class="mt-5 space-y-4">
                            <div>
                                <label for="login-username" class="wn-label">Username</label>
                                <input
                                    id="login-username"
                                    name="username"
                                    type="text"
                                    required
                                    autocomplete="username"
                                    placeholder="Masukkan username"
                                    class="wn-input"
                                />
                            </div>

                            <div>
                                <label for="login-password" class="wn-label">Kata Sandi</label>
                                <input
                                    id="login-password"
                                    name="password"
                                    type="password"
                                    required
                                    autocomplete="current-password"
                                    placeholder="Masukkan kata sandi"
                                    class="wn-input"
                                />
                            </div>

                            <button
                                type="submit"
                                id="login-submit"
                                ${isLoading ? 'disabled' : ''}
                                class="wn-btn-primary w-full"
                            >
                                ${isLoading ? 'Memverifikasi...' : 'Masuk'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;

        const form = container.querySelector('#login-form');
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (isLoading) {
                return;
            }

            const usernameInput = container.querySelector('#login-username');
            const passwordInput = container.querySelector('#login-password');
            const username = usernameInput?.value?.trim() || '';
            const password = passwordInput?.value || '';

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
                onLoggedIn();
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
}
