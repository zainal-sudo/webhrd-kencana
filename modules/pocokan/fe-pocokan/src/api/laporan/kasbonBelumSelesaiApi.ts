import api from "@/api/axios";

export interface KasbonMasterRow {
  Nomor: string;
  Tanggal: string;
  Jenis: string;
  Pjh: string;
  Nota: string;
  Penerima: string;
  Nominal: number;
  Keterangan: string;
}

export interface KasbonDetailRow {
  Nomor: string;
  Uraian: string;
  Satuan: string;
  Qty: number;
  Nominal: number;
  Total: number;
  Kegunaan: string;
  Keterangan: string;
}

export interface AccountItem {
  kode: string;
  nama: string;
}

export const kasbonBelumSelesaiApi = {
  getDefaultAccount: async (cabang: string) => {
    const { data } = await api.get(
      "/laporan/kasbon-belum-selesai/default-account",
      { params: { cabang } },
    );
    return data.data as { kode: string };
  },
  searchAccount: async (cabang: string, search?: string) => {
    const { data } = await api.get(
      "/laporan/kasbon-belum-selesai/search-account",
      { params: { cabang, search } },
    );
    return data.data as AccountItem[];
  },
  getAccountByKode: async (kode: string) => {
    const { data } = await api.get(
      `/laporan/kasbon-belum-selesai/account/${encodeURIComponent(kode)}`,
    );
    return data.data as AccountItem;
  },
  getData: async (rekkode: string) => {
    const { data } = await api.get("/laporan/kasbon-belum-selesai", {
      params: { rekkode },
    });
    return data.data as {
      master: KasbonMasterRow[];
      detail: KasbonDetailRow[];
    };
  },
};
