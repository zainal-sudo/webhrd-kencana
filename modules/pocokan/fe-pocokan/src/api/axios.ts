import axios from "axios";

let isExpiredHandled = false; // cegah double dispatch

/* API pocokan dijalankan di bawah origin HRIS (port eksternal sama):
 *   /pocokan-api/...  → API pocokan (subapp dari backend HRIS)
 * Dev standalone pocokan memakai server 3299 langsung. Override keduanya
 * via VITE_API_BASE bila diperlukan. */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "http://localhost:3299" : "/pocokan-api"),
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("finance_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const isLoginRequest = error.config?.url?.includes("/auth/login");
    const status = error.response?.status;
    const message = error.response?.data?.message || "";

    // Tangkap 401 ATAU 403 dengan pesan token expired
    const isTokenExpired =
      (status === 401 || status === 403) &&
      !isLoginRequest &&
      (message.includes("expired") ||
        message.includes("Token tidak valid") ||
        message.includes("token"));

    if (isTokenExpired) {
      console.log("Token expired detected, dispatching auth:expired");
      if (!isExpiredHandled) {
        isExpiredHandled = true;
        window.dispatchEvent(new CustomEvent("auth:expired"));
        setTimeout(() => {
          isExpiredHandled = false;
        }, 5000);
      }
      const authError = new Error("AUTH_EXPIRED") as any;
      authError.isAuthExpired = true;
      return Promise.reject(authError);
    }

    return Promise.reject(error);
  },
);

export const isAuthExpiredError = (e: any) => e?.isAuthExpired === true;

export default api;
