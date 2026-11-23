import { washnoteApi } from '../api/client.js';
import { resetSession, state } from '../state/store.js';
import { badgeStatusAktif, escapeHtml, renderErrorAlert, renderPageHeader } from '../utils/formatters.js';

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
                ${renderPageHeader({ title: 'Profil Akun' })}

                ${errorObj ? renderErrorAlert(errorObj) : ''}

                <div class="wn-card p-5">
                    <dl class="grid gap-4 text-sm sm:grid-cols-2">
                        <div><dt class="text-xs text-slate-500">Nama Lengkap</dt><dd class="mt-0.5 font-semibold text-slate-900">${escapeHtml(profile?.nama_lengkap || '-')}</dd></div>
                        <div><dt class="text-xs text-slate-500">Username</dt><dd class="mt-0.5 font-mono font-semibold text-slate-900">@${escapeHtml(profile?.username || '-')}</dd></div>
                        <div><dt class="text-xs text-slate-500">Peran</dt><dd class="mt-0.5 font-semibold uppercase text-teal-700">${escapeHtml(profile?.peran || '-')}</dd></div>
                        <div><dt class="text-xs text-slate-500">Status</dt><dd class="mt-0.5">${badgeStatusAktif(Boolean(profile?.status_aktif))}</dd></div>
                    </dl>
                </div>

                <form id="change-pass-form" class="wn-card space-y-4 p-5 sm:p-6">
                    <div>
                        <h2 class="text-base font-bold text-slate-900">Ubah Kata Sandi</h2>
                        <p class="mt-1 text-xs text-slate-500">Sesi login aktif akan berakhir setelah kata sandi diperbarui.</p>
                    </div>
                    <div>
                        <label for="prof-cur-pass" class="wn-label">Kata Sandi Saat Ini</label>
                        <input id="prof-cur-pass" type="password" required class="wn-input" />
                    </div>
                    <div>
                        <label for="prof-new-pass" class="wn-label">Kata Sandi Baru (Min. 8 karakter)</label>
                        <input id="prof-new-pass" type="password" required minlength="8" class="wn-input" />
                    </div>
                    <div>
                        <label for="prof-conf-pass" class="wn-label">Konfirmasi Kata Sandi Baru</label>
                        <input id="prof-conf-pass" type="password" required minlength="8" class="wn-input" />
                    </div>
                    <button type="submit" ${isSubmitting ? 'disabled' : ''} class="wn-btn-primary">
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
