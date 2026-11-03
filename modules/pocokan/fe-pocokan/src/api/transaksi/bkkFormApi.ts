import api from "@/api/axios";

export interface BkkFormDetail {
  no: number;
  uraian: string;
  nominal: number;
  rekkode: string;
  reknama: string;
  cckode: number;
  ccnama: string;
  dcnama: string;
  dckode: number;
}

export interface BkkForm {
  nomor: string;
  tanggal: string;
  rek_kode: string;
  rek_nama: string;
  penerima: string;
  nota: string;
  keterangan: string;
  cabang: string;
  cabang_old: string;
  detail: BkkFormDetail[];
}

export const bkkFormApi = {
  getAccountOptions: async (cabang: string) => {
    const { data } = await api.get("/transaksi/bkk/form/account", {
      params: { cabang },
    });
    return data.data as { kode: string; nama: string; cabang: string }[];
  },
  getAccountAll: async () => {
    const { data } = await api.get("/transaksi/bkk/form/account-all");
    return data.data as { kode: string; nama: string; cabang: string }[];
  },
  getKeteranganOptions: async () => {
    const { data } = await api.get("/transaksi/bkk/form/keterangan");
    return data.data as { nama: string }[];
  },
  getCostCenterOptions: async () => {
    const { data } = await api.get("/transaksi/bkk/form/cost-center");
    return data.data as { kode: number; nama: string }[];
  },
  getDcOptions: async (cckode: number) => {
    const { data } = await api.get(`/transaksi/bkk/form/dc/${cckode}`);
    return data.data as { kode: number; nama: string }[];
  },
  getDetailForm: async (nomor: string): Promise<BkkForm> => {
    const { data } = await api.get(
      `/transaksi/bkk/form/form/${encodeURIComponent(nomor)}`,
    );
    return data.data;
  },
  save: async (payload: any) => {
    const { data } = await api.post("/transaksi/bkk/form/save", payload);
    return data;
  },
  getPrintData: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/bkk/form/print/${encodeURIComponent(nomor)}`,
    );
    return data.data;
  },
};
