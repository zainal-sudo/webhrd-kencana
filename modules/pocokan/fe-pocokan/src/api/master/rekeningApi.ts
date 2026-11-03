import api from "@/api/axios";

export interface Rekening {
  kode: string;
  nama: string;
  kelompokId: string;
  kelompokNama?: string;
  isAktif: number;
  urutan: number;
}

export const rekeningApi = {
  getAll: async (): Promise<Rekening[]> => {
    const { data } = await api.get("/master/rekening");
    return data.data;
  },
  getById: async (kode: string): Promise<Rekening> => {
    const { data } = await api.get(`/master/rekening/${kode}`);
    return data.data;
  },
  save: async (payload: {
    isEdit: boolean;
    kode: string;
    nama: string;
    kelompokId: string;
    isAktif: boolean;
    urutan: number;
  }) => {
    const { data } = await api.post("/master/rekening/save", payload);
    return data;
  },
  delete: async (kode: string) => {
    const { data } = await api.delete(`/master/rekening/${kode}`);
    return data;
  },
};