import api from "@/api/axios";

export interface PengajuanTransferFormDetail {
  nourut: number;
  kode: string;
  nama: string;
  bank: string;
  rekening: string;
  atasnama: string;
  trs: string;
  nominal: number;
  ket: string;
  tglRealisasi: string;
  rekkode: string;
  reknama: string;
  cckode: number;
  ccnama: string;
  dcnama: string;
  dckode: number;
  jurnal: string;
  batal: string;
}

export interface PengajuanTransferForm {
  nomor: string;
  tanggal: string;
  rek_kode: string;
  rek_nama: string;
  rek_rekening: string;
  byrvoucher: string;
  detail: PengajuanTransferFormDetail[];
}

export const pengajuanTransferFormApi = {
  getAccountOptions: async () => {
    const { data } = await api.get(
      "/transaksi/pengajuan-transfer/form/account",
    );
    return data.data as { kode: string; nama: string; rekening: string }[];
  },
  getSupplierOptions: async (search = "") => {
    const { data } = await api.get(
      "/transaksi/pengajuan-transfer/form/supplier",
      {
        params: { search },
      },
    );
    return data.data as { kode: string; nama: string }[];
  },
  getSupplierDetail: async (kode: string) => {
    const { data } = await api.get(
      `/transaksi/pengajuan-transfer/form/supplier/${encodeURIComponent(kode)}`,
    );
    return data.data as {
      kode: string;
      nama: string;
      bank: string;
      rekening: string;
      atasnama: string;
    }[];
  },
  getVoucherOptions: async (search = "") => {
    const { data } = await api.get(
      "/transaksi/pengajuan-transfer/form/voucher",
      {
        params: { search },
      },
    );
    return data.data as {
      nomor: string;
      tanggal: string;
      supplier: string;
      nominal: number;
    }[];
  },
  getPoExternalOptions: async (search = "") => {
    const { data } = await api.get(
      "/transaksi/pengajuan-transfer/form/po-external",
      {
        params: { search },
      },
    );
    return data.data as {
      nomor: string;
      tanggal: string;
      spk: string;
      supplier: string;
      nominal: number;
    }[];
  },
  getPettyCashOptions: async (search = "") => {
    const { data } = await api.get(
      "/transaksi/pengajuan-transfer/form/petty-cash",
      {
        params: { search },
      },
    );
    return data.data as {
      nomor: string;
      tanggal: string;
      store: string;
      namaStore: string;
      nominal: number;
    }[];
  },
  getDetailForm: async (nomor: string): Promise<PengajuanTransferForm> => {
    const { data } = await api.get(
      `/transaksi/pengajuan-transfer/form/form/${encodeURIComponent(nomor)}`,
    );
    return data.data;
  },
  getAccountAll: async (search = "") => {
    const { data } = await api.get(
      "/transaksi/pengajuan-transfer/form/account-all",
      {
        params: { search },
      },
    );
    return data.data as { kode: string; nama: string; cabang: string }[];
  },
  getCostCenterOptions: async (search = "") => {
    const { data } = await api.get(
      "/transaksi/pengajuan-transfer/form/cost-center",
      {
        params: { search },
      },
    );
    return data.data as { kode: number; nama: string }[];
  },
  getDcOptions: async (cckode: number, search = "") => {
    const { data } = await api.get(
      `/transaksi/pengajuan-transfer/form/dc/${cckode}`,
      {
        params: { search },
      },
    );
    return data.data as { kode: number; nama: string }[];
  },
  save: async (payload: any) => {
    const { data } = await api.post(
      "/transaksi/pengajuan-transfer/form/save",
      payload,
    );
    return data;
  },
  getPrintData: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/pengajuan-transfer/form/print/${encodeURIComponent(nomor)}`,
    );
    return data.data;
  },
};
