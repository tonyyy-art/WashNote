import { washnoteApi } from '../api/client.js';
import { resetSession, state } from '../state/store.js';
import { escapeHtml, renderErrorAlert } from '../utils/formatters.js';

export function mountProfileView(container, onSessionEnded) {
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
        }
    }

    function render() {
        container.innerHTML = `
            <div class="max-w-xl space-y-6">
                <div>
                    <h1 class="text-2xl font-bold tracking-tight text-slate-900">Profil & Keamanan Akun</h1>
                    <p class="mt-0.5 text-sm text-slate-600">Informasi akun aktif dan pembaruan kata sandi.</p>
                </div>

                ${errorObj ? renderErrorAlert(errorObj) : ''}

                <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <dl class="grid gap-3 text-sm sm:grid-cols-2">
                        <div><dt class="text-xs text-slate-500">Nama Lengkap</dt><dd class="font-semibold text-slate-900">${escapeHtml(profile?.nama_lengkap || '-')}</dd></div>
                        <div><dt class="text-xs text-slate-500">Username</dt><dd class="font-mono font-semibold text-slate-900">${escapeHtml(profile?.username || '-')}</dd></div>
                        <div><dt class="text-xs text-slate-500">Peran</dt><dd class="font-semibold uppercase text-teal-700">${escapeHtml(profile?.peran || '-')}</dd></div>
                        <div><dt class="text-xs text-slate-500">Status Akun</dt><dd class="font-semibold text-emerald-700">${profile?.status_aktif ? 'Aktif' : 'Nonaktif'}</dd></div>
                    </dl>
                </div>

                <form id="change-pass-form" class="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div>
                        <h2 class="text-base font-bold text-slate-900">Ubah Kata Sandi</h2>
                        <p class="mt-1 text-xs text-slate-500">Setelah kata sandi diubah, seluruh sesi login aktif Anda akan dicabut dan Anda harus login kembali.</p>
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Kata Sandi Saat Ini</label>
                        <input id="prof-cur-pass" type="password" required class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Kata Sandi Baru (Min. 8 karakter)</label>
                        <input id="prof-new-pass" type="password" required minlength="8" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-600">Konfirmasi Kata Sandi Baru</label>
                        <input id="prof-conf-pass" type="password" required minlength="8" class="block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
                        ${isSubmitting ? 'Memproses...' : 'Perbarui Kata Sandi'}
                    </button>
                </form>
            </div>
        `;

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
