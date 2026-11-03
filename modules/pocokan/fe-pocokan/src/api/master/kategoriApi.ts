import api from "@/api/axios";

export interface Kategori {
  kode: string;
  nama: string;
  tingkat: number; // 1 = Departemen, 2 = Sub Kategori, 3 = Kategori
}

export interface KategoriSaveForm {
  isEdit: boolean;
  kode: string;
  nama: string;
  tingkat: number;
  parentKode?: string | null;
}

export const kategoriApi = {
  // params.tingkat: 1 | 2 | 3, params.parent: kode induk (opsional)
  getAll: async (params?: { tingkat?: number; parent?: string }): Promise<Kategori[]> => {
    const { data } = await api.get("/master/kategori", { params });
    return data.data;
  },
  getById: async (kode: string): Promise<Kategori> => {
    const { data } = await api.get(`/master/kategori/${kode}`);
    return data.data;
  },
  save: async (payload: KategoriSaveForm) => {
    const { data } = await api.post("/master/kategori/save", payload);
    return data;
  },
  delete: async (kode: string) => {
    const { data } = await api.delete(`/master/kategori/${kode}`);
    return data;
  },
};