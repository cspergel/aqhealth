import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8090",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Global filter interceptor — appends group_id / provider_id query params
// when the global filter is active. Values are written to localStorage by
// the FilterProvider so the interceptor stays framework-agnostic.
// ---------------------------------------------------------------------------

api.interceptors.request.use((config) => {
  const groupId = localStorage.getItem("global_filter_group_id");
  const providerId = localStorage.getItem("global_filter_provider_id");

  if (groupId || providerId) {
    config.params = config.params || {};
    if (groupId) config.params.group_id = groupId;
    if (providerId) config.params.provider_id = providerId;
  }
  return config;
});

// Shared promise mutex to prevent concurrent token refresh requests.
// When multiple 401s arrive simultaneously, only one refresh call is made
// and all waiting requests share the same result.
let refreshPromise: Promise<any> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      // Try refresh token
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        try {
          if (!refreshPromise) {
            refreshPromise = axios
              .post(`${api.defaults.baseURL}/api/auth/refresh`, {
                refresh_token: refresh,
              })
              .finally(() => {
                refreshPromise = null;
              });
          }
          const res = await refreshPromise;
          localStorage.setItem("access_token", res.data.access_token);
          localStorage.setItem("refresh_token", res.data.refresh_token);
          originalRequest.headers.Authorization = `Bearer ${res.data.access_token}`;
          return api(originalRequest);
        } catch {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
