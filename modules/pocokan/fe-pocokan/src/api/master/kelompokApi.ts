import api from "@/api/axios";

export interface Kelompok {
  kode: string;
  nama: string;
  keterangan: string;
}

export const kelompokApi = {
  getAll: async (): Promise<Kelompok[]> => {
    const { data } = await api.get("/master/kelompok");
    return data.data;
  },
  getById: async (kode: string): Promise<Kelompok> => {
    const { data } = await api.get(`/master/kelompok/${kode}`);
    return data.data;
  },
  save: async (payload: {
    isEdit: boolean;
    kode: string;
    nama: string;
    keterangan: string;
  }) => {
    const { data } = await api.post("/master/kelompok/save", payload);
    return data;
  },
  delete: async (kode: string) => {
    const { data } = await api.delete(`/master/kelompok/${kode}`);
    return data;
  },
};
