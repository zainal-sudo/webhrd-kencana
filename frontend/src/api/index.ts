import { api, getErrorMessage } from "./axios";
import type { AuthResponse, Paginated, Pagination } from "@/types";

export const authApi = {
  async login(user_kode: string, user_password: string): Promise<AuthResponse> {
    const { data } = await api.post<{ data: AuthResponse }>("/login", { user_kode, user_password });
    return data.data;
  },

  async me(): Promise<any> {
    const { data } = await api.get<{ data: any }>("/me");
    return data.data;
  },

  async changePassword(payload: { password_lama: string; password_baru: string }): Promise<void> {
    await api.post("/change-password", payload);
  },

  async logout(): Promise<void> {
    try {
      await api.post("/logout");
    } catch {
      /* abaikan */
    }
  },
};

interface Envelope<T> {
  success: boolean;
  message: string;
  data: T;
  pagination?: Pagination;
}

export async function safeGet<T>(url: string, config?: any): Promise<T> {
  const { data } = await api.get<Envelope<T>>(url, config);
  return data.data;
}

export async function safeGetPage<T>(url: string, config?: any): Promise<Paginated<T>> {
  const { data } = await api.get<Envelope<T[]>>(url, config);
  const rows = data.data ?? [];
  return {
    success: data.success,
    message: data.message,
    data: rows,
    pagination: data.pagination || { page: 1, per_page: rows.length, total: rows.length, last_page: 1 },
  };
}

export async function safePost<T>(url: string, body?: any): Promise<T> {
  const { data } = await api.post<Envelope<T>>(url, body);
  return data.data;
}

export async function safePut<T>(url: string, body?: any): Promise<T> {
  const { data } = await api.put<Envelope<T>>(url, body);
  return data.data;
}

export async function safeDelete<T>(url: string): Promise<T> {
  const { data } = await api.delete<Envelope<T>>(url);
  return data.data;
}

/** Unduh berkas hasil endpoint (PDF/Excel) memakai token yang sama. */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const res = await api.get(url, { responseType: "blob" });
  const disposition = res.headers["content-disposition"] || "";
  const match = /filename\*?=(?:UTF-8'')?"?([^;"]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export function pickError(err: unknown): string {
  return getErrorMessage(err, "Terjadi kesalahan");
}
