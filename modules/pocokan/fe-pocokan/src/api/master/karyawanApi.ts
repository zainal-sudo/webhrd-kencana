import api from "@/api/axios";

export interface Karyawan {
  kode: string;
  nama: string;
  bagian: string;
  pabrik: string;
  tglmasuk: string;
  gapok: number;
  lembur: number;
  lembur2?: number;
  isaktif: number;
  rekening?: string;
}

export interface Bagian {
  kode: string;
  nama: string;
}

export interface Pabrik {
  kode: string;
  nama: string;
}

export const karyawanApi = {
  getAll: async () => {
    const res = await api.get("/master/karyawan");
    return res.data.data;
  },
  getById: async (kode: string) => {
    const res = await api.get(`/master/karyawan/${kode}`);
    return res.data.data;
  },
  save: async (data: any) => {
    const res = await api.post("/master/karyawan/save", data);
    return res.data;
  },
  delete: async (kode: string) => {
    const res = await api.delete(`/master/karyawan/${kode}`);
    return res.data;
  },
  getBagianList: async () => {
    const res = await api.get("/lookups/bagian");
    return res.data.data || res.data;
  },
  getPabrikList: async () => {
    const res = await api.get("/lookups/pabrik");
    return res.data.data || res.data;
  },
};
