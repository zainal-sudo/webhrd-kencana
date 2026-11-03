import api from "@/api/axios";

export interface Cabang {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
}

export const cabangApi = {
  getAll: async (): Promise<Cabang[]> => {
    const { data } = await api.get("/master/cabang");
    return data.data;
  },
  save: async (payload: { isEdit: boolean; kode: string; nama: string; alamat: string; kota: string }) => {
    const { data } = await api.post("/master/cabang/save", payload);
    return data;
  },
  delete: async (kode: string) => {
    const { data } = await api.delete(`/master/cabang/${kode}`);
    return data;
  },
};