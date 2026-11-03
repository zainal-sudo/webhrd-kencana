import api from "@/api/axios";

export interface PoDetail {
  no?: number;
  brgKode: number;
  brgNama: string;
  barcode: string;
  satuan: string;
  qty: number;
  harga: number;
  discPr: number;
  keterangan: string;
  isiCrt: number;
  isiLsn: number;
}

export interface PoForm {
  isEdit: boolean;
  nomor: string;
  tanggal: string;
  supKode: string;
  supNama: string;
  supAlamat?: string;
  supTelp?: string;
  supTop?: number;
  memo: string;
  isTax: number;
  discFakturPr: number;
  discFaktur: number;
  amount: number;
  taxAmount: number;
  dateline: string;
  pemesan: string;
  detail: PoDetail[];
}

export const poFormApi = {
  getSupplier: (search: string) =>
    api.get("/transaksi/po/form/supplier", { params: { search } }).then(r => r.data.data),

  getBarang: (search: string) =>
    api.get("/transaksi/po/form/barang", { params: { search } }).then(r => r.data.data),

  getDetailForm: (nomor: string) =>
    api.get(`/transaksi/po/form/form/${encodeURIComponent(nomor)}`).then(r => r.data.data),

  save: (payload: PoForm) =>
    api.post("/transaksi/po/form/save", payload).then(r => r.data),
};