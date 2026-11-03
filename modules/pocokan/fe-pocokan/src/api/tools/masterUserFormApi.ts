import api from "@/api/axios";

export interface UserMenuPermission {
  menu_id: number;
  view_: string;
  insert_: string;
  edit_: string;
  delete_: string;
}

export interface UserDetail {
  kode: string;
  nama: string;
  password: string;
  editReport: number;
  menus: UserMenuPermission[];
}

export interface MenuItem {
  id: number;
  grp: string;
  nama: string;
}

export const masterUserFormApi = {
  getCabangList: async () => {
    const { data } = await api.get("/tools/master-user/form/cabang");
    return data.data as string[];
  },
  getAllMenus: async () => {
    const { data } = await api.get("/tools/master-user/form/menus");
    return data.data as MenuItem[];
  },
  getDetail: async (kode: string) => {
    const { data } = await api.get(
      `/tools/master-user/form/detail/${encodeURIComponent(kode)}`,
    );
    return data.data as UserDetail;
  },
  save: async (payload: any) => {
    return api.post("/tools/master-user/form/save", payload);
  },
};