import axios from 'axios';

// Default API URL - will be updated after loading from connection.txt
const DEFAULT_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Function to load API URL from connection.txt file
async function loadApiUrl() {
  try {
    // Try to fetch connection.txt from the dist folder
    const response = await fetch('/connection.txt');
    if (response.ok) {
      const url = (await response.text()).trim();
      // Only use the fetched URL if it's not empty
      if (url && url.length > 0) {
        return url;
      }
    }
  } catch (error) {
    // If fetch fails (file doesn't exist or network error), fall back to defaults
    console.warn('Could not load connection.txt, using default API URL:', error);
  }
  
  // Fall back to environment variable or default
  return DEFAULT_API_URL;
}

// Initialize axios with default URL
const api = axios.create({
  baseURL: DEFAULT_API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Export a function to initialize the API URL
export async function initializeApiUrl() {
  const apiUrl = await loadApiUrl();
  api.defaults.baseURL = apiUrl;
  console.log('API URL initialized:', apiUrl);
  return apiUrl;
}

// Request interceptor for auth token if needed
api.interceptors.request.use(
  (config) => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.token) {
      config.headers.Authorization = `Bearer ${user.token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Health API
export const healthAPI = {
  ping: () => api.get('/health')
};

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials)
};

// Users API
export const usersAPI = {
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`)
};

// Branches API
export const branchesAPI = {
  getAll: () => api.get('/branches'),
  getByName: (name) => api.get(`/branches/${name}`),
  create: (data) => api.post('/branches', data),
  update: (originalName, data) => api.put(`/branches/${originalName}`, data),
  delete: (name) => api.delete(`/branches/${name}`)
};

// Items API
export const itemsAPI = {
  getAll: () => api.get('/items'),
  getByCode: (code) => api.get(`/items/${code}`),
  create: (data) => api.post('/items', data),
  update: (code, data) => api.put(`/items/${code}`, data),
  delete: (code) => api.delete(`/items/${code}`)
};

// Stocks API
export const stocksAPI = {
  get: (params) => api.get('/stocks', { params }),
  getBatchStatus: (params) => api.get('/stocks/batch-status', { params }),
  update: (data) => api.post('/stocks/update', data),
  finishBatch: (data) => api.post('/stocks/finish-batch', data),
  updateReturns: (data) => api.post('/stocks/update-returns', data)
};

// Grocery API
export const groceryAPI = {
  getStocks: (params) => api.get('/grocery/stocks', { params }),
  getStocksByDate: (params) => api.get('/grocery/stocks-by-date', { params }),
  addStock: (data) => api.post('/grocery/stocks', data),
  getSales: (params) => api.get('/grocery/sales', { params }),
  recordSale: (data) => api.post('/grocery/sales', data),
  getReturns: (params) => api.get('/grocery/returns', { params }),
  recordReturn: (data) => api.post('/grocery/returns', data),
  updateRemaining: (data) => api.put('/grocery/stocks/remaining', data),
  checkFinished: (params) => api.get('/grocery/check-finished', { params }),
  finishBatch: (data) => api.post('/grocery/finish-batch', data)
};

// Machines API
export const machinesAPI = {
  getBatches: (params) => api.get('/machines/batches', { params }),
  startBatch: (data) => api.post('/machines/batches', data),
  updateBatch: (id, data) => api.put(`/machines/batches/${id}`, data),
  finishBatch: (id, data) => api.post(`/machines/batches/${id}/finish`, data),
  getSales: (params) => api.get('/machines/sales', { params })
};

// Cash API
export const cashAPI = {
  getEntries: (params) => api.get('/cash', { params }),
  createEntry: (data) => api.post('/cash', data),
  getExpected: (params) => api.get('/cash/expected', { params })
};

// Transfers API
export const transfersAPI = {
  get: (params) => api.get('/transfers', { params }),
  create: (data) => api.post('/transfers', data)
};

// Reports API
export const reportsAPI = {
  generate: (data) => api.post('/reports/generate', data)
};

// Notifications API
export const notificationsAPI = {
  get: (params) => api.get('/notifications', { params }),
  create: (data) => api.post('/notifications', data),
  markAsRead: (id, userId) => api.put(`/notifications/${id}/read`, { userId }),
  checkExpiring: () => api.post('/notifications/check-expiring')
};

// System API
export const systemAPI = {
  clearTransactionData: () => api.delete('/system/clear-data')
};

// Activities API
export const activitiesAPI = {
  getRecentActivities: (params) => api.get('/activities', { params })
};

