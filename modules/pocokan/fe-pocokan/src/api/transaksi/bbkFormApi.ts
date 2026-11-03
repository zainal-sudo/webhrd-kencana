import api from "@/api/axios";

export interface BbkFormDetail {
  no: number;
  uraian: string;
  nominal: number;
  rekkode: string;
  reknama: string;
  cckode: number;
  ccnama: string;
  dcnama: string;
  dckode: number;
  kdsup: string;
  supplier: string;
  bank: string;
  rekening: string;
  atasnama: string;
}

export interface BbkForm {
  nomor: string;
  tanggal: string;
  rek_kode: string;
  rek_nama: string;
  penerima: string;
  nota: string;
  keterangan: string;
  cabang: string;
  cabang_old: string;
  detail: BbkFormDetail[];
}

export const bbkFormApi = {
  getAccountOptions: async (cabang: string) => {
    const { data } = await api.get("/transaksi/bbk/form/account", {
      params: { cabang },
    });
    return data.data as { kode: string; nama: string; cabang: string }[];
  },
  getAccountAll: async () => {
    const { data } = await api.get("/transaksi/bbk/form/account-all");
    return data.data as { kode: string; nama: string; cabang: string }[];
  },
  getKeteranganOptions: async () => {
    const { data } = await api.get("/transaksi/bbk/form/keterangan");
    return data.data as { nama: string }[];
  },
  getCostCenterOptions: async () => {
    const { data } = await api.get("/transaksi/bbk/form/cost-center");
    return data.data as { kode: number; nama: string }[];
  },
  getDcOptions: async (cckode: number) => {
    const { data } = await api.get(`/transaksi/bbk/form/dc/${cckode}`);
    return data.data as { kode: number; nama: string }[];
  },
  getSupplierOptions: async (search = "") => {
    const { data } = await api.get("/transaksi/bbk/form/supplier", {
      params: { search },
    });
    return data.data as {
      kode: string;
      nama: string;
      bank: string;
      rekening: string;
      atasnama: string;
    }[];
  },
  getDetailForm: async (nomor: string): Promise<BbkForm> => {
    const { data } = await api.get(
      `/transaksi/bbk/form/form/${encodeURIComponent(nomor)}`,
    );
    return data.data;
  },
  save: async (payload: any) => {
    const { data } = await api.post("/transaksi/bbk/form/save", payload);
    return data;
  },
  getPrintData: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/bbk/form/print/${encodeURIComponent(nomor)}`,
    );
    return data.data;
  },
};
