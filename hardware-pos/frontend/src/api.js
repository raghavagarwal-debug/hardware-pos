const BASE = '/api';

function getToken() {
  return localStorage.getItem('hw_token');
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    console.error('Fetch error:', err);
    throw new Error('Unable to connect to the backend server. Please make sure the backend is running (run `npm start` in the backend directory).');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error('Backend server is not reachable. Please start the backend server (run `npm start` in the backend directory).');
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/auth/me'),

  products: () => request('/products'),
  product: (id) => request(`/products/${id}`),
  createProduct: (payload) => request('/products', { method: 'POST', body: payload }),
  updatePrice: (id, payload) => request(`/products/${id}/price`, { method: 'PUT', body: payload }),
  updateProduct: (id, payload) => request(`/products/${id}`, { method: 'PUT', body: payload }),
  importProducts: async (file) => {

    const token = getToken();

    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch(`${BASE}/products/import`, {

      method: "POST",

      headers: {
        Authorization: `Bearer ${token}`,
      },

      body: formData,

    });

    const data = await response.json();

    if (!response.ok) {

      throw new Error(data.error || "Import failed");

    }

    return data;

  },

  recordTransaction: (payload) => request('/inventory/transactions', { method: 'POST', body: payload }),
  ledger: (params) => request(`/inventory/transactions?${new URLSearchParams(params).toString()}`),
  transactionTypes: () => request('/inventory/transaction-types'),

  createInvoice: (payload) => request('/invoices', { method: 'POST', body: payload }),
  invoices: () => request('/invoices'),
  invoice: (id) => request(`/invoices/${id}`),
  payInvoice: (id, payload) => request(`/invoices/${id}/pay`, { method: 'PUT', body: payload }),
  updateInvoice: (id, payload) => request(`/invoices/${id}`, { method: 'PUT', body: payload }),
  invoiceWhatsApp: (id) => request(`/invoices/${id}/whatsapp`),
  deleteInvoice: (id) => request(`/invoices/${id}`, { method: 'DELETE' }),
  deletedInvoices: () => request('/invoices/deleted'),
  restoreInvoice: (id) => request(`/invoices/${id}/restore`, { method: 'POST' }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),

  dashboard: {
    stats: () => request('/dashboard/stats'),
  },

  customers: {
    list: () => request('/customers'),
    inactive: (days) => request(`/customers/inactive?days=${days}`),
    create: (payload) => request('/customers', { method: 'POST', body: payload }),
    get: (phone) => request(`/customers/${phone}`),
    update: (phone, payload) => request(`/customers/${phone}`, { method: 'PUT', body: payload }),
    delete: (phone) => request(`/customers/${phone}`, { method: 'DELETE' }),
    pay: (phone, payload) => request(`/customers/${phone}/payments`, { method: 'POST', body: payload }),
    exportAll: async () => {

      const token = getToken();

      const response = await fetch(`${BASE}/customers/export-all`, {

        method: "GET",

        headers: {
          Authorization: `Bearer ${token}`,
        },

      });

      if (!response.ok) {
        throw new Error("Failed to export customers");
      }

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");

      a.href = url;

      a.download = "Customers_Report.xlsx";

      document.body.appendChild(a);

      a.click();

      a.remove();

      window.URL.revokeObjectURL(url);

    },
  },

  payments: {
    delete: (id) => request(`/customers/payments/${id}`, { method: 'DELETE' }),
  },

  reports: {
    dailyMovement: (date) => request(`/reports/daily-stock-movement?${new URLSearchParams({ date }).toString()}`),
    monthlyMovement: (month) => request(`/reports/monthly-stock-movement?${new URLSearchParams({ month }).toString()}`),
    // damagedItems: () => request('/reports/damaged-items'),
    // adjustments: () => request('/reports/manual-adjustments'),
    // stockValue: () => request('/reports/stock-value'),
    // addedVsSold: (from, to) => request(`/reports/added-vs-sold?${new URLSearchParams({ from, to }).toString()}`),
    fastMoving: (from, to) =>
      request(
        `/reports/fast-moving?${new URLSearchParams({
          from,
          to
        }).toString()}`
      ),

    slowMoving: (from, to) =>
      request(
        `/reports/slow-moving?${new URLSearchParams({
          from,
          to
        }).toString()}`
      ),
  },
};

export { getToken };
