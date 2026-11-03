import api from "@/api/axios";

export interface ListJurnalRow {
  Bulan: number;
  Tahun: number;
  Tanggal: string;
  Nomor: string;
  Referensi: string;
  Account: string;
  AccountName: string;
  Keterangan: string;
  Debet: number;
  Kredit: number;
  DetailCC: string;
}

export const listJurnalApi = {
  getListJurnal: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/laporan/list-jurnal", {
      params: { startDate, endDate },
    });
    return data.data as ListJurnalRow[];
  },
};
