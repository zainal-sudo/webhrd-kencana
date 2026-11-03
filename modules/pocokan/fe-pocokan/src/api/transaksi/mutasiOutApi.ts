import api from "@/api/axios";

export interface MutasiOutRow {
  Nomor: string;
  Jenis: string;
  Tanggal: string;
  Cab: string;
  Tujuan: string;
  Keterangan: string;
  Usr: string;
  Bagian: string;
  Created: string;
  NoTerima: string;
  UsrTerima: string;
  TglTerima: string;
  Ngedit: string;
}

export interface MutasiOutDetail {
  Nomor: string;
  NoPermintaan: string;
  Kode: string;
  Nama: string;
  Spesifikasi: string;
  Satuan: string;
  Jumlah: number;
}

export const mutasiOutApi = {
  getBrowse: async (params: {
    startDate: string;
    endDate: string;
    jenis?: string;
    cabang?: string;
  }) => {
    const { data } = await api.get("/transaksi/mutasi-out", { params });
    return data.data as MutasiOutRow[];
  },

  getDetail: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/mutasi-out/detail/${encodeURIComponent(nomor)}`,
    );
    return data.data as MutasiOutDetail[];
  },

  deleteData: async (nomor: string) => {
    const { data } = await api.delete(
      `/transaksi/mutasi-out/${encodeURIComponent(nomor)}`,
    );
    return data;
  },

  requestPin: async (payload: {
    nomor: string;
    tanggal: string;
    keterangan: string;
    alasan: string;
  }) => {
    const { data } = await api.post(
      "/transaksi/mutasi-out/request-pin",
      payload,
    );
    return data;
  },
};
