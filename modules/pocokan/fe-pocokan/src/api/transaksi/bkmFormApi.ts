import api from "@/api/axios";

export interface BkmFormDetail {
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

export interface BkmForm {
  nomor: string;
  tanggal: string;
  rek_kode: string;
  rek_nama: string;
  penerima: string;
  nota: string;
  keterangan: string;
  cabang: string;
  cabang_old: string;
  detail: BkmFormDetail[];
}

export const bkmFormApi = {
  getAccountOptions: async (cabang: string) => {
    const { data } = await api.get("/transaksi/bkm/form/account", {
      params: { cabang },
    });
    return data.data as { kode: string; nama: string; cabang: string }[];
  },
  getAccountAll: async () => {
    const { data } = await api.get("/transaksi/bkm/form/account-all");
    return data.data as { kode: string; nama: string; cabang: string }[];
  },
  getCostCenterOptions: async () => {
    const { data } = await api.get("/transaksi/bkm/form/cost-center");
    return data.data as { kode: number; nama: string }[];
  },
  getDcOptions: async (cckode: number) => {
    const { data } = await api.get(`/transaksi/bkm/form/dc/${cckode}`);
    return data.data as { kode: number; nama: string }[];
  },
  getDetailForm: async (nomor: string): Promise<BkmForm> => {
    const { data } = await api.get(
      `/transaksi/bkm/form/form/${encodeURIComponent(nomor)}`,
    );
    return data.data;
  },
  save: async (payload: any) => {
    const { data } = await api.post("/transaksi/bkm/form/save", payload);
    return data;
  },
  getPrintData: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/bkm/form/print/${encodeURIComponent(nomor)}`,
    );
    return data.data;
  },
};
