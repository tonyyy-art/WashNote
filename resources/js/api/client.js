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

export function setUnauthorizedHandler(handler) {
    unauthorizedHandler = handler;
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

export async function apiRequest(method, path, { body = null, query = null, headers = {}, skipAuthRedirect = false } = {}) {
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
        });
    } catch {
        throw new ApiError({
            status: 0,
            errorCode: 'NETWORK_ERROR',
            message: 'Tidak dapat terhubung ke server backend. Periksa koneksi jaringan atau server Laravel.',
        });
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
            if (typeof unauthorizedHandler === 'function') {
                unauthorizedHandler(error);
            }
        }

        throw error;
    }

    return payload;
}

export const washnoteApi = {
    // Auth & profile
    login: (credentials) => apiRequest('POST', '/login', { body: credentials, skipAuthRedirect: true }),
    logout: () => apiRequest('POST', '/logout', { skipAuthRedirect: true }),
    getProfile: () => apiRequest('GET', '/profile'),
    changePassword: (payload) => apiRequest('PUT', '/profile/password', { body: payload }),

    // Operational Catalog & Schedule (Kasir + Owner)
    getCatalog: () => apiRequest('GET', '/katalog'),
    getOperatingHours: () => apiRequest('GET', '/jam-operasional'),
    getOperatingStatus: () => apiRequest('GET', '/jam-operasional/status'),
    getOperatingExceptions: (query = {}) => apiRequest('GET', '/jam-operasional/pengecualian', { query }),

    // Orders & Payments (Kasir + Owner)
    getOrders: (query = {}) => apiRequest('GET', '/pesanan', { query }),
    createOrder: (payload, idempotencyKey) =>
        apiRequest('POST', '/pesanan', {
            body: payload,
            headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
        }),
    getOrder: (id) => apiRequest('GET', `/pesanan/${id}`),
    updateOrder: (id, payload) => apiRequest('PUT', `/pesanan/${id}`, { body: payload }),
    updateOrderMetadata: (id, payload) => apiRequest('PATCH', `/pesanan/${id}/metadata`, { body: payload }),
    cancelOrder: (id, payload) => apiRequest('POST', `/pesanan/${id}/batal`, { body: payload }),
    updateVehicleStatus: (vehicleId, payload) => apiRequest('PUT', `/kendaraan-pesanan/${vehicleId}/status`, { body: payload }),
    getPayment: (orderId) => apiRequest('GET', `/pesanan/${orderId}/pembayaran`),
    storePayment: (orderId, payload, idempotencyKey) =>
        apiRequest('POST', `/pesanan/${orderId}/pembayaran`, {
            body: payload,
            headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
        }),

    // Owner: Operating hours CRUD
    createOperatingHour: (payload) => apiRequest('POST', '/jam-operasional', { body: payload }),
    updateOperatingHour: (id, payload) => apiRequest('PUT', `/jam-operasional/${id}`, { body: payload }),
    deleteOperatingHour: (id) => apiRequest('DELETE', `/jam-operasional/${id}`),
    createOperatingException: (payload) => apiRequest('POST', '/jam-operasional/pengecualian', { body: payload }),
    updateOperatingException: (id, payload) => apiRequest('PUT', `/jam-operasional/pengecualian/${id}`, { body: payload }),
    deleteOperatingException: (id) => apiRequest('DELETE', `/jam-operasional/pengecualian/${id}`),

    // Owner: Vehicle categories, services, tariffs
    getVehicleCategories: () => apiRequest('GET', '/kategori-kendaraan'),
    createVehicleCategory: (payload) => apiRequest('POST', '/kategori-kendaraan', { body: payload }),
    updateVehicleCategory: (id, payload) => apiRequest('PUT', `/kategori-kendaraan/${id}`, { body: payload }),
    deleteVehicleCategory: (id) => apiRequest('DELETE', `/kategori-kendaraan/${id}`),

    getServices: (query = {}) => apiRequest('GET', '/layanan', { query }),
    createService: (payload) => apiRequest('POST', '/layanan', { body: payload }),
    updateService: (id, payload) => apiRequest('PUT', `/layanan/${id}`, { body: payload }),
    deleteService: (id) => apiRequest('DELETE', `/layanan/${id}`),

    getTariffs: () => apiRequest('GET', '/harga-layanan'),
    createTariff: (payload) => apiRequest('POST', '/harga-layanan', { body: payload }),
    updateTariff: (id, payload) => apiRequest('PUT', `/harga-layanan/${id}`, { body: payload }),
    deleteTariff: (id) => apiRequest('DELETE', `/harga-layanan/${id}`),

    // Owner: Kasir accounts
    getKasir: (query = {}) => apiRequest('GET', '/kasir', { query }),
    createKasir: (payload) => apiRequest('POST', '/kasir', { body: payload }),
    updateKasir: (id, payload) => apiRequest('PUT', `/kasir/${id}`, { body: payload }),
    updateKasirStatus: (id, payload) => apiRequest('PATCH', `/kasir/${id}/status`, { body: payload }),
    resetKasirPassword: (id, payload) => apiRequest('PUT', `/kasir/${id}/reset-password`, { body: payload }),

    // Owner: Expenses & Reports
    getExpenseCategories: () => apiRequest('GET', '/kategori-pengeluaran'),
    createExpenseCategory: (payload) => apiRequest('POST', '/kategori-pengeluaran', { body: payload }),
    updateExpenseCategory: (id, payload) => apiRequest('PUT', `/kategori-pengeluaran/${id}`, { body: payload }),
    deleteExpenseCategory: (id) => apiRequest('DELETE', `/kategori-pengeluaran/${id}`),

    getExpenses: (query = {}) => apiRequest('GET', '/pengeluaran', { query }),
    createExpense: (payload, idempotencyKey) =>
        apiRequest('POST', '/pengeluaran', {
            body: payload,
            headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
        }),
    updateExpense: (id, payload) => apiRequest('PUT', `/pengeluaran/${id}`, { body: payload }),
    cancelExpense: (id, payload) => apiRequest('PATCH', `/pengeluaran/${id}/batal`, { body: payload }),

    getReportSummary: (query) => apiRequest('GET', '/laporan', { query }),
    getReportDaily: (query) => apiRequest('GET', '/laporan/harian', { query }),
    getAuditLogs: (query = {}) => apiRequest('GET', '/riwayat-perubahan', { query }),
};
