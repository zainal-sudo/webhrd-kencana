import api from "@/api/axios";

export interface UserRow {
  Kode: string;
  Nama: string;
  Edit: string;
  JumlahMenu: number;
}

export const masterUserApi = {
  getBrowse: async () => {
    const { data } = await api.get("/tools/master-user");
    return data.data as UserRow[];
  },
  delete: async (kode: string) => {
    return api.delete(`/tools/master-user/${encodeURIComponent(kode)}`);
  },
};