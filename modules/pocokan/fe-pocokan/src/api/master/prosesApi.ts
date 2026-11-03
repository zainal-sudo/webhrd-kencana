import api from "@/api/axios";

export interface ProsesDetail {
  id?: number;
  urutan: number;
  nama: string;        // contoh: "MESIN", "PACKING", "FINISHING"
  brgKode?: string | null;
  brgNama?: string | null; // hanya utk display, tidak dikirim saat save
  keterangan?: string;
}

export interface Proses {
  kode: string;
  nama: string;
  keterangan?: string;
  aktif: number; // 1 / 0
  jumlahTahap?: number;
}

export interface ProsesDetailPayload {
  isEdit: boolean;
  kode: string;
  nama: string;
  keterangan?: string;
  aktif: boolean;
  details: ProsesDetail[];
}

export const prosesApi = {
  getAll: async (): Promise<Proses[]> => {
    const { data } = await api.get("/master/proses");
    return data.data;
  },
  getById: async (kode: string): Promise<Proses & { details: ProsesDetail[] }> => {
    const { data } = await api.get(`/master/proses/${kode}`);
    return data.data;
  },
  save: async (payload: ProsesDetailPayload) => {
    const { data } = await api.post("/master/proses/save", payload);
    return data;
  },
  delete: async (kode: string) => {
    const { data } = await api.delete(`/master/proses/${kode}`);
    return data;
  },
};
