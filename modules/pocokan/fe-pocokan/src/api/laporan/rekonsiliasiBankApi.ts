import api from "@/api/axios";

export interface RekonMasterRow {
  Tanggal: string;
  Account: string;
  Nama: string;
  SaldoBuku: number;
  Tambah: number;
  Kurang: number;
  SaldoBank: number;
  Tambah_: number;
  Kurang_: number;
  Bank: number;
  Buku: number;
  Selisih: number;
}

export interface RekonDetailRow {
  Tanggal: string;
  Account: string;
  Nama: string;
  Jenis: string;
  Nomor: string;
  Keterangan: string;
  Nominal: number;
}

export const rekonsiliasiBankApi = {
  getData: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/laporan/rekonsiliasi-bank", {
      params: { startDate, endDate },
    });
    return data.data as {
      master: RekonMasterRow[];
      detail: RekonDetailRow[];
    };
  },
};
