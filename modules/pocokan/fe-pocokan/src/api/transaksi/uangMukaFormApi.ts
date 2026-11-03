import api from "@/api/axios";

export interface UangMukaFormDetail {
  no: number;
  nama: string;
  spesifikasi: string;
  qty: number;
  satuan: string;
  nilai: number;
  nilai_old: number;
  total: number;
  approved: boolean;
  reject: boolean;
  kegunaan: string;
  ga: number; // 1=dari pengajuan GA, 0=manual
  kdsup: string;
  supplier: string;
  bank: string;
  rekening: string;
  atasnama: string;
}

export interface UangMukaFormData {
  nomor: string;
  tanggal: string;
  jenis: "KAS" | "BANK";
  rek_kode: string;
  rek_nama: string;
  cabang: string;
  cabang_old: string;
  pjh_nomor: string;
  pmt_pjh_nomor?: string;
  nota: string;
  nominal: number;
  penerima: string;
  keterangan: string;
  pmt_nomor: string;
  pmt_tanggal: string;
  pjh_tanggal: string;
  pjh_nik: string;
  jenis_permintaan: string;
  nama: string;
  bagian: string;
  lokasi: string;
  detail: UangMukaFormDetail[];
}

export const uangMukaFormApi = {
  getAccountOptions: async (jenis: string, cabang: string) => {
    const { data } = await api.get("/transaksi/uang-muka/form/account", {
      params: { jenis, cabang },
    });
    return data.data as { kode: string; nama: string; cabang: string }[];
  },

  getPengajuanOptions: async (cabang: string) => {
    const { data } = await api.get("/transaksi/uang-muka/form/pengajuan", {
      params: { cabang },
    });
    return data.data as {
      nomor: string;
      tanggal: string;
      ke: string;
      keterangan: string;
    }[];
  },

  getDetailPengajuan: async (pjhNomor: string) => {
    const { data } = await api.get(
      `/transaksi/uang-muka/form/pengajuan/${encodeURIComponent(pjhNomor)}`,
    );
    return data.data as UangMukaFormData;
  },

  getDetailForm: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/uang-muka/form/detail/${encodeURIComponent(nomor)}`,
    );
    return data.data as UangMukaFormData;
  },

  getSupplierOptions: async (search: string) => {
    const { data } = await api.get("/transaksi/uang-muka/form/supplier", {
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

  save: async (payload: UangMukaFormData & { isEdit: boolean }) => {
    const { data } = await api.post("/transaksi/uang-muka/form/save", payload);
    return data;
  },

  getPrintData: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/uang-muka/form/print/${encodeURIComponent(nomor)}`,
    );
    return data.data;
  },
};
