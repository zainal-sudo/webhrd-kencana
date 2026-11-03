import api from "@/api/axios";

export interface StokMasterRow {
  Jenis: string;
  Kode: string;
  Nama: string;
  Satuan: string;
  Stok: number;
  Mutasi: number;
  REAL_: number;
}

export interface StokDetailRow {
  Kode: string;
  Tanggal: string;
  Nomor: string;
  NoMB: string;
  Jenis: string;
  StokIn: number;
  StokOut: number;
  Selisih: number;
}

export const stokFinanceApi = {
  getCabangList: async () => {
    const { data } = await api.get("/laporan/stok-finance/cabang");
    return data.data as string[];
  },
  getData: async (cabang: string) => {
    const { data } = await api.get("/laporan/stok-finance", {
      params: { cabang },
    });
    return data.data as { master: StokMasterRow[]; detail: StokDetailRow[] };
  },
};
