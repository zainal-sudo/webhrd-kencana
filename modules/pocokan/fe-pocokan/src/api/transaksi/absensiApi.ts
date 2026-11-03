import api from "@/api/axios";

export interface AbsensiItem {
  no: number;
  id: string;
  nama: string;
  unit: string;
  bagian: string;
  kehadiran: number | null | "";
  jamlembur: number | null | "";
}

export interface TarikAbsensiResult {
  success: boolean;
  message: string;
  data: { ditemukan: number; inserted: number; updated: number; skipped: number };
}

export const absensiApi = {
  getKaryawan: async (pabKode: string, tanggal: string): Promise<AbsensiItem[]> => {
    const { data } = await api.get(`/transaksi/absensi/karyawan?pabKode=${pabKode}&tanggal=${tanggal}`);
    return data.data;
  },
  save: async (payload: { pabKode: string; tanggal: string; items: AbsensiItem[] }) => {
    const { data } = await api.post("/transaksi/absensi/save", payload);
    return data;
  },
  tarikWajah: async (payload: { pabKode: string; tanggal: string }): Promise<TarikAbsensiResult> => {
    const { data } = await api.post("/transaksi/absensi/tarik-wajah", payload);
    return data;
  },
};
