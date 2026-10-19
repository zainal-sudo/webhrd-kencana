import axios, { type InternalAxiosRequestConfig } from "axios";

export const TOKEN_KEY = "kencana_hrd_token";
export const USER_KEY = "kencana_hrd_user";
export const MENUS_KEY = "kencana_hrd_menus";

let sessionVersion = 0;
let expiredVersion = -1;
const pending = new Set<AbortController>();
interface RequestSession {
  version: number;
  token: string;
  public: boolean;
  controller: AbortController;
  detach?: () => void;
}
type SessionConfig = InternalAxiosRequestConfig & { __session?: RequestSession };

export const getAuthSessionVersion = () => sessionVersion;

/** Invalidate responses before clearing/replacing credentials, including pending login. */
export function resetAuthRequests(): number {
  ++sessionVersion;
  expiredVersion = -1;
  for (const controller of pending) controller.abort();
  pending.clear();
  return sessionVersion;
}

function stale(config?: SessionConfig): boolean {
  const context = config?.__session;
  return !!context && (context.version !== sessionVersion ||
    (!context.public && context.token !== (localStorage.getItem(TOKEN_KEY) || "")));
}
function cleanup(config?: SessionConfig) {
  const context = config?.__session;
  if (context) {
    pending.delete(context.controller);
    context.detach?.();
  }
}
export const cancelledAuthRequest = () => new axios.CanceledError("Request dibatalkan karena sesi berubah.");

export const api = axios.create({ baseURL: "/api", timeout: 60000 });

api.interceptors.request.use((rawConfig) => {
  const config = rawConfig as SessionConfig;
  const token = localStorage.getItem(TOKEN_KEY) || "";
  const publicRequest = /^\/?login(?:\?|$)/.test(config.url || "");
  if (!publicRequest && (!token || expiredVersion === sessionVersion)) throw cancelledAuthRequest();
  if (publicRequest) config.headers.delete("Authorization");
  else config.headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const context: RequestSession = { version: sessionVersion, token, public: publicRequest, controller };
  const callerSignal = config.signal;
  if (callerSignal?.aborted) controller.abort();
  else if (callerSignal?.addEventListener) {
    const abort = () => controller.abort();
    callerSignal.addEventListener("abort", abort);
    context.detach = () => callerSignal.removeEventListener?.("abort", abort);
  }
  config.signal = controller.signal;
  config.__session = context;
  pending.add(controller);
  return config;
}, (error) => { throw error; }, { synchronous: true });

api.interceptors.response.use(
  (response) => {
    const config = response.config as SessionConfig;
    cleanup(config);
    if (stale(config)) throw cancelledAuthRequest();
    return response;
  },
  (error) => {
    const config = error.config as SessionConfig | undefined;
    cleanup(config);
    if (axios.isCancel(error) || stale(config)) return Promise.reject(cancelledAuthRequest());
    const status = error.response?.status;
    const context = config?.__session;
    if (status === 401 && context && !context.public) {
      if (expiredVersion !== sessionVersion) {
        expiredVersion = sessionVersion;
        for (const controller of pending) controller.abort();
        window.dispatchEvent(new CustomEvent("auth:expired"));
      }
      // Session expiry has one dialog; page catch handlers must not add toasts.
      return Promise.reject(cancelledAuthRequest());
    }
    if (status === 403) error.isForbidden = true;
    return Promise.reject(error);
  }
);

export function getErrorMessage(err: unknown, fallback = "Terjadi kesalahan"): string {
  if (axios.isCancel(err)) return "";
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || e?.message || fallback;
}
