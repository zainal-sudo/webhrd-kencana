import axios from "axios";

export const TOKEN_KEY = "kencana_hrd_token";
export const USER_KEY = "kencana_hrd_user";
export const MENUS_KEY = "kencana_hrd_menus";

export const api = axios.create({
  baseURL: "/api",
  timeout: 60000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    } else if (status === 403) {
      error.isForbidden = true;
    }
    return Promise.reject(error);
  }
);

export function getErrorMessage(err: unknown, fallback = "Terjadi kesalahan"): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || e?.message || fallback;
}
