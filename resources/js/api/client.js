const TOKEN_STORAGE_KEY = 'washnote_auth_token';
const USER_STORAGE_KEY = 'washnote_auth_user';

export class ApiError extends Error {
    constructor({ status, errorCode = null, message = 'Permintaan gagal.', errors = null, retryAfterSeconds = null, data = null }) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.errorCode = errorCode;
        this.errors = errors;
        this.retryAfterSeconds = retryAfterSeconds;
        this.data = data;
    }
}

let unauthorizedHandler = null;
let isHandlingUnauthorized = false;

export function setUnauthorizedHandler(handler) {
    unauthorizedHandler = handler;
}

export function isAbortError(err) {
    return Boolean(err && (err.name === 'AbortError' || err.errorCode === 'ABORTED'));
}

export function getStoredToken() {
    try {
        return window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
        return null;
    }
}

export function getStoredUser() {
    try {
        const raw = window.localStorage.getItem(USER_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function saveAuthSession(token, user) {
    isHandlingUnauthorized = false;

    try {
        if (token) {
            window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
        }
        if (user) {
            window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
        }
    } catch {
        // Ignore storage quota exceptions cleanly
    }
}

export function clearAuthSession() {
    try {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        window.localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
        // Ignore storage exceptions
    }
}

export function generateIdempotencyKey() {
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }

    return `wn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildUrl(path, query = null) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const base = `/api${cleanPath}`;

    if (!query || typeof query !== 'object') {
        return base;
    }

    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || String(value).trim() === '') {
            continue;
        }
        params.set(key, String(value));
    }

    const qs = params.toString();
    return qs !== '' ? `${base}?${qs}` : base;
}

export async function apiRequest(method, path, { body = null, query = null, headers = {}, skipAuthRedirect = false, signal = undefined } = {}) {
    const reqHeaders = {
        Accept: 'application/json',
        ...headers,
    };

    if (body !== null) {
        reqHeaders['Content-Type'] = 'application/json';
    }

    const token = getStoredToken();

    if (token) {
        reqHeaders.Authorization = `Bearer ${token}`;
    }

    let response;

    try {
        response = await fetch(buildUrl(path, query), {
            method,
            headers: reqHeaders,
            body: body !== null ? JSON.stringify(body) : undefined,
            signal,
        });
    } catch (networkErr) {
        if (networkErr?.name === 'AbortError' || signal?.aborted) {
            const abortErr = networkErr?.name === 'AbortError' ? networkErr : new Error('Permintaan dibatalkan.');
            abortErr.name = 'AbortError';
            abortErr.errorCode = 'ABORTED';
            throw abortErr;
        }

        throw new ApiError({
            status: 0,
            errorCode: 'NETWORK_ERROR',
            message: 'Tidak dapat terhubung ke server backend. Periksa koneksi jaringan atau server Laravel.',
        });
    }

    if (signal?.aborted) {
        const abortErr = new Error('Permintaan dibatalkan.');
        abortErr.name = 'AbortError';
        abortErr.errorCode = 'ABORTED';
        throw abortErr;
    }

    let payload = null;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }
    }

    if (signal?.aborted) {
        const abortErr = new Error('Permintaan dibatalkan.');
        abortErr.name = 'AbortError';
        abortErr.errorCode = 'ABORTED';
        throw abortErr;
    }

    if (!response.ok) {
        const error = new ApiError({
            status: response.status,
            errorCode: payload?.error_code ?? null,
            message: payload?.message || `Permintaan gagal (HTTP ${response.status}).`,
            errors: payload?.errors ?? null,
            retryAfterSeconds: payload?.retry_after_seconds ?? null,
            data: payload,
        });

        if (response.status === 401 && !skipAuthRedirect) {
            clearAuthSession();
            if (!isHandlingUnauthorized) {
                isHandlingUnauthorized = true;
                if (typeof unauthorizedHandler === 'function') {
                    unauthorizedHandler(error);
                }
            }
        }

        throw error;
    }

    return payload;
}

export const washnoteApi = {
    // Auth & profile
    login: (credentials, options = {}) => apiRequest('POST', '/login', { body: credentials, skipAuthRedirect: true, signal: options?.signal }),
    logout: (options = {}) => apiRequest('POST', '/logout', { skipAuthRedirect: true, signal: options?.signal }),
    getProfile: (options = {}) => apiRequest('GET', '/profile', { signal: options?.signal }),
    changePassword: (payload, options = {}) => apiRequest('PUT', '/profile/password', { body: payload, signal: options?.signal }),

    // Operational Catalog & Schedule (Kasir + Owner)
    getCatalog: (options = {}) => apiRequest('GET', '/katalog', { signal: options?.signal }),
    getOperatingHours: (options = {}) => apiRequest('GET', '/jam-operasional', { signal: options?.signal }),
    getOperatingStatus: (options = {}) => apiRequest('GET', '/jam-operasional/status', { signal: options?.signal }),
    getOperatingExceptions: (query = {}, options = {}) => apiRequest('GET', '/jam-operasional/pengecualian', { query, signal: options?.signal }),

    // Orders & Payments (Kasir + Owner)
    getOrders: (query = {}, options = {}) => apiRequest('GET', '/pesanan', { query, signal: options?.signal }),
    createOrder: (payload, idempotencyKey, options = {}) =>
        apiRequest('POST', '/pesanan', {
            body: payload,
            headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
            signal: options?.signal,
        }),
    getOrder: (id, options = {}) => apiRequest('GET', `/pesanan/${id}`, { signal: options?.signal }),
    updateOrder: (id, payload, options = {}) => apiRequest('PUT', `/pesanan/${id}`, { body: payload, signal: options?.signal }),
    updateOrderMetadata: (id, payload, options = {}) => apiRequest('PATCH', `/pesanan/${id}/metadata`, { body: payload, signal: options?.signal }),
    cancelOrder: (id, payload, options = {}) => apiRequest('POST', `/pesanan/${id}/batal`, { body: payload, signal: options?.signal }),
    updateVehicleStatus: (vehicleId, payload, options = {}) => apiRequest('PUT', `/kendaraan-pesanan/${vehicleId}/status`, { body: payload, signal: options?.signal }),
    getPayment: (orderId, options = {}) => apiRequest('GET', `/pesanan/${orderId}/pembayaran`, { signal: options?.signal }),
    storePayment: (orderId, payload, idempotencyKey, options = {}) =>
        apiRequest('POST', `/pesanan/${orderId}/pembayaran`, {
            body: payload,
            headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
            signal: options?.signal,
        }),

    // Owner: Operating hours CRUD
    createOperatingHour: (payload, options = {}) => apiRequest('POST', '/jam-operasional', { body: payload, signal: options?.signal }),
    updateOperatingHour: (id, payload, options = {}) => apiRequest('PUT', `/jam-operasional/${id}`, { body: payload, signal: options?.signal }),
    deleteOperatingHour: (id, options = {}) => apiRequest('DELETE', `/jam-operasional/${id}`, { signal: options?.signal }),
    createOperatingException: (payload, options = {}) => apiRequest('POST', '/jam-operasional/pengecualian', { body: payload, signal: options?.signal }),
    updateOperatingException: (id, payload, options = {}) => apiRequest('PUT', `/jam-operasional/pengecualian/${id}`, { body: payload, signal: options?.signal }),
    deleteOperatingException: (id, options = {}) => apiRequest('DELETE', `/jam-operasional/pengecualian/${id}`, { signal: options?.signal }),

    // Owner: Vehicle categories, services, tariffs
    getVehicleCategories: (options = {}) => apiRequest('GET', '/kategori-kendaraan', { signal: options?.signal }),
    createVehicleCategory: (payload, options = {}) => apiRequest('POST', '/kategori-kendaraan', { body: payload, signal: options?.signal }),
    updateVehicleCategory: (id, payload, options = {}) => apiRequest('PUT', `/kategori-kendaraan/${id}`, { body: payload, signal: options?.signal }),
    deleteVehicleCategory: (id, options = {}) => apiRequest('DELETE', `/kategori-kendaraan/${id}`, { signal: options?.signal }),

    getServices: (query = {}, options = {}) => apiRequest('GET', '/layanan', { query, signal: options?.signal }),
    createService: (payload, options = {}) => apiRequest('POST', '/layanan', { body: payload, signal: options?.signal }),
    updateService: (id, payload, options = {}) => apiRequest('PUT', `/layanan/${id}`, { body: payload, signal: options?.signal }),
    deleteService: (id, options = {}) => apiRequest('DELETE', `/layanan/${id}`, { signal: options?.signal }),

    getTariffs: (options = {}) => apiRequest('GET', '/harga-layanan', { signal: options?.signal }),
    createTariff: (payload, options = {}) => apiRequest('POST', '/harga-layanan', { body: payload, signal: options?.signal }),
    updateTariff: (id, payload, options = {}) => apiRequest('PUT', `/harga-layanan/${id}`, { body: payload, signal: options?.signal }),
    deleteTariff: (id, options = {}) => apiRequest('DELETE', `/harga-layanan/${id}`, { signal: options?.signal }),

    // Owner: Kasir accounts
    getKasir: (query = {}, options = {}) => apiRequest('GET', '/kasir', { query, signal: options?.signal }),
    createKasir: (payload, options = {}) => apiRequest('POST', '/kasir', { body: payload, signal: options?.signal }),
    updateKasir: (id, payload, options = {}) => apiRequest('PUT', `/kasir/${id}`, { body: payload, signal: options?.signal }),
    updateKasirStatus: (id, payload, options = {}) => apiRequest('PATCH', `/kasir/${id}/status`, { body: payload, signal: options?.signal }),
    resetKasirPassword: (id, payload, options = {}) => apiRequest('PUT', `/kasir/${id}/reset-password`, { body: payload, signal: options?.signal }),

    // Owner: Expenses & Reports
    getExpenseCategories: (options = {}) => apiRequest('GET', '/kategori-pengeluaran', { signal: options?.signal }),
    createExpenseCategory: (payload, options = {}) => apiRequest('POST', '/kategori-pengeluaran', { body: payload, signal: options?.signal }),
    updateExpenseCategory: (id, payload, options = {}) => apiRequest('PUT', `/kategori-pengeluaran/${id}`, { body: payload, signal: options?.signal }),
    deleteExpenseCategory: (id, options = {}) => apiRequest('DELETE', `/kategori-pengeluaran/${id}`, { signal: options?.signal }),

    getExpenses: (query = {}, options = {}) => apiRequest('GET', '/pengeluaran', { query, signal: options?.signal }),
    createExpense: (payload, idempotencyKey, options = {}) =>
        apiRequest('POST', '/pengeluaran', {
            body: payload,
            headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
            signal: options?.signal,
        }),
    updateExpense: (id, payload, options = {}) => apiRequest('PUT', `/pengeluaran/${id}`, { body: payload, signal: options?.signal }),
    cancelExpense: (id, payload, options = {}) => apiRequest('PATCH', `/pengeluaran/${id}/batal`, { body: payload, signal: options?.signal }),

    getReportSummary: (query, options = {}) => apiRequest('GET', '/laporan', { query, signal: options?.signal }),
    getReportDaily: (query, options = {}) => apiRequest('GET', '/laporan/harian', { query, signal: options?.signal }),
    getAuditLogs: (query = {}, options = {}) => apiRequest('GET', '/riwayat-perubahan', { query, signal: options?.signal }),
};
