import api from "@/api/axios";

export interface JenisBarang {
  kode: number;
  nama: string;
  rekKode?: string | null;
  rekNama?: string;
}

export const jenisBarangApi = {
  getAll: async (): Promise<JenisBarang[]> => {
    const { data } = await api.get("/master/jenis-barang");
    return data.data;
  },
  getById: async (kode: number): Promise<JenisBarang> => {
    const { data } = await api.get(`/master/jenis-barang/${kode}`);
    return data.data;
  },
  save: async (payload: { isEdit: boolean; kode?: number; nama: string }) => {
    const { data } = await api.post("/master/jenis-barang/save", payload);
    return data;
  },
  delete: async (kode: number) => {
    const { data } = await api.delete(`/master/jenis-barang/${kode}`);
    return data;
  },
};