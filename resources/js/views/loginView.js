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
                        <p class="mt-1 text-sm text-slate-600">Sistem Operasional & Pencatatan GALIROSO WASH</p>
                    </div>

                    <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                        <h2 class="text-lg font-semibold text-slate-900">Masuk ke Akun Internal</h2>
                        <p class="mt-1 text-xs text-slate-500">Hak akses Owner atau Kasir ditentukan otomatis oleh akun Anda.</p>

                        ${authNotice ? `
                            <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
                                ${escapeHtml(authNotice)}
                            </div>
                        ` : ''}

                        ${errorObj ? `<div class="mt-4">${renderErrorAlert(errorObj)}</div>` : ''}

                        <form id="login-form" class="mt-5 space-y-4">
                            <div>
                                <label for="login-username" class="block text-sm font-medium text-slate-700">Username</label>
                                <input
                                    id="login-username"
                                    name="username"
                                    type="text"
                                    required
                                    autocomplete="username"
                                    placeholder="Masukkan username"
                                    class="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                                />
                            </div>

                            <div>
                                <label for="login-password" class="block text-sm font-medium text-slate-700">Kata Sandi</label>
                                <input
                                    id="login-password"
                                    name="password"
                                    type="password"
                                    required
                                    autocomplete="current-password"
                                    placeholder="Masukkan kata sandi"
                                    class="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                                />
                            </div>

                            <button
                                type="submit"
                                id="login-submit"
                                ${isLoading ? 'disabled' : ''}
                                class="flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
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
