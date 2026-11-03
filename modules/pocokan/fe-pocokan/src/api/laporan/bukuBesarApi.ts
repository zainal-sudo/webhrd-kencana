import api from "@/api/axios";

export interface BukuBesarRow {
  Tanggal: string;
  Nomor: string;
  Trs: string;
  Nota: string;
  Penerima: string;
  Keterangan: string;
  Debet: number;
  Kredit: number;
  Saldo: number;
  Account: string;
  NamaAccount: string;
  TglTransfer: string | null;
}

export interface AccountItem {
  kode: string;
  nama: string;
}

export const bukuBesarApi = {
  getDefaultAccount: async (cabang: string) => {
    const { data } = await api.get("/laporan/buku-besar/default-account", {
      params: { cabang },
    });
    return data.data as { kode: string };
  },
  searchAccount: async (cabang: string, search?: string) => {
    const { data } = await api.get("/laporan/buku-besar/search-account", {
      params: { cabang, search },
    });
    return data.data as AccountItem[];
  },
  getAccountByKode: async (kode: string) => {
    const { data } = await api.get(
      `/laporan/buku-besar/account/${encodeURIComponent(kode)}`,
    );
    return data.data as AccountItem;
  },
  getBukuBesar: async (rekkode: string, startDate: string, endDate: string) => {
    const { data } = await api.get("/laporan/buku-besar", {
      params: { rekkode, startDate, endDate },
    });
    return data.data as BukuBesarRow[];
  },
};
