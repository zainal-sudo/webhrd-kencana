import api from "@/api/axios";

export interface StbjDetail {
  brgKode: number;
  brgNama: string;
  barcode: string;
  jumlah: number;
  koli: number;
  keterangan: string;
}

export interface StbjForm {
  isEdit: boolean;
  nomor: string;
  tanggal: string;
  gdgKode: string;
  gdgNama: string;
  gdgpKode: string;
  gdgpNama: string;
  memo: string;
  detail: StbjDetail[];
}

export const stbjFormApi = {
  getGudang: (search: string) =>
    api.get("/transaksi/stbj/form/gudang", { params: { search } }).then(r => r.data.data),

  getBarang: (search: string) =>
    api.get("/transaksi/stbj/form/barang", { params: { search } }).then(r => r.data.data),

  getDetailForm: (nomor: string) =>
    api.get(`/transaksi/stbj/form/form/${encodeURIComponent(nomor)}`).then(r => r.data.data),

  save: (payload: StbjForm) =>
    api.post("/transaksi/stbj/form/save", payload).then(r => r.data),
};