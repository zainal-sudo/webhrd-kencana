import api from "@/api/axios";

export interface Bagian {
  kode: string;
  nama: string;
}

export const bagianApi = {
  getAll: async (): Promise<Bagian[]> => {
    const { data } = await api.get("/master/bagian");
    return data.data;
  },
  save: async (payload: { isEdit: boolean; kode: string; nama: string }) => {
    const { data } = await api.post("/master/bagian/save", payload);
    return data;
  },
  delete: async (kode: string) => {
    const { data } = await api.delete(`/master/bagian/${kode}`);
    return data;
  },
};
