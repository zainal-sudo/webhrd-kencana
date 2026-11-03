import api from "@/api/axios";

export interface ProsesGajiItem {
  no: number;
  id: string;
  nama: string;
  unit: string;
  bagian: string;
  gapok: number;
  kehadiran: number;
  lemburLE2: number;
  lemburGT2: number;
  potongan: number | null | "";
}

export const prosesGajiApi = {
  getData: async (pabKode: string, periode1: string, periode2: string): Promise<ProsesGajiItem[]> => {
    const { data } = await api.get(`/transaksi/proses-gaji?pabKode=${pabKode}&periode1=${periode1}&periode2=${periode2}`);
    return data.data;
  },
  save: async (payload: { pabKode: string; periode1: string; periode2: string; items: ProsesGajiItem[] }) => {
    const { data } = await api.post("/transaksi/proses-gaji/save", payload);
    return data;
  },
};
