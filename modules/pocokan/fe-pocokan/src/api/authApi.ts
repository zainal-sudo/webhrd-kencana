import api from "./axios";

export interface LoginPayload {
  username: string;
  password: string;
}

export interface AuthUser {
  kode: string;
  nama: string;
  level: string;
  cabang: string;
  menus?: MenuPermission[];
}

export interface MenuPermission {
  menu_id: string;
  hak_view: "Y" | "N";
  hak_insert: "Y" | "N";
  hak_edit: "Y" | "N";
  hak_delete: "Y" | "N";
  hak_print: "Y" | "N";
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export const authApi = {
  login: async (payload: LoginPayload): Promise<LoginResponse> => {
    const { data } = await api.post<{ success: boolean; data: LoginResponse }>(
      "/auth/login",
      payload,
    );
    return data.data;
  },

  me: async (): Promise<AuthUser> => {
    const { data } = await api.get<{ success: boolean; data: AuthUser }>(
      "/auth/me",
    );
    return data.data;
  },
};
