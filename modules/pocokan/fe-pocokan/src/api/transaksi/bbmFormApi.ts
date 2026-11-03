import api from "@/api/axios";

export interface BbmFormDetail {
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

export interface BbmForm {
  nomor: string;
  tanggal: string;
  rek_kode: string;
  rek_nama: string;
  penerima: string;
  nota: string;
  keterangan: string;
  cabang: string;
  cabang_old: string;
  detail: BbmFormDetail[];
}

export const bbmFormApi = {
  getAccountOptions: async (cabang: string) => {
    const { data } = await api.get("/transaksi/bbm/form/account", {
      params: { cabang },
    });
    return data.data as {
      kode: string;
      nama: string;
      cabang: string;
      rekening: string;
    }[];
  },
  getAccountAll: async () => {
    const { data } = await api.get("/transaksi/bbm/form/account-all");
    return data.data as { kode: string; nama: string; cabang: string }[];
  },
  getCostCenterOptions: async () => {
    const { data } = await api.get("/transaksi/bbm/form/cost-center");
    return data.data as { kode: number; nama: string }[];
  },
  getDcOptions: async (cckode: number) => {
    const { data } = await api.get(`/transaksi/bbm/form/dc/${cckode}`);
    return data.data as { kode: number; nama: string }[];
  },
  getDetailForm: async (nomor: string): Promise<BbmForm> => {
    const { data } = await api.get(
      `/transaksi/bbm/form/form/${encodeURIComponent(nomor)}`,
    );
    return data.data;
  },
  save: async (payload: any) => {
    const { data } = await api.post("/transaksi/bbm/form/save", payload);
    return data;
  },
  getPrintData: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/bbm/form/print/${encodeURIComponent(nomor)}`,
    );
    return data.data;
  },
};
