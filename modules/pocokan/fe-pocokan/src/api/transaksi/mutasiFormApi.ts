import api from "@/api/axios";

export interface MutasiDetail {
  brgKode: number;
  brgNama: string;
  barcode: string;
  qty: number;
  expired: string;
  keterangan: string;
}

export interface MutasiForm {
  isEdit: boolean;
  nomor: string;
  tanggal: string;
  gdgAsal: string;
  gdgAsalNama: string;
  gdgTujuan: string;
  gdgTujuanNama: string;
  memo: string;
  detail: MutasiDetail[];
}

export const mutasiFormApi = {
  getGudang: (search: string) =>
    api.get("/transaksi/mutasi/form/gudang", { params: { search } }).then(r => r.data.data),

  getBarang: (search: string, gdgKode: string) =>
    api.get("/transaksi/mutasi/form/barang", { params: { search, gdgKode } }).then(r => r.data.data),
  
  getDetailForm: (nomor: string) =>
    api.get(`/transaksi/mutasi/form/form/${encodeURIComponent(nomor)}`).then(r => r.data.data),

  save: (payload: MutasiForm) =>
    api.post("/transaksi/mutasi/form/save", payload).then(r => r.data),
};