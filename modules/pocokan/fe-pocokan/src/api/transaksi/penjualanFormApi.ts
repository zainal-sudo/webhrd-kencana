import api from "@/api/axios";

export interface PenjualanDetail {
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

export interface PenjualanForm {
  isEdit: boolean;
  nomor: string;
  tanggal: string;
  cusKode: string;
  cusNama: string;
  cusAlamat?: string;
  cusTelp?: string;
  cusTop?: number;
  memo: string;
  isTax: number;
  discFakturPr: number;
  discFaktur: number;
  amount: number;
  taxAmount: number;
  dateline: string;
  pemesan: string;
  detail: PenjualanDetail[];
}

export const penjualanFormApi = {
  getCustomer: (search: string) =>
    api.get("/transaksi/penjualan/form/customer", { params: { search } }).then((r) => r.data.data),

  getBarang: (search: string) =>
    api.get("/transaksi/penjualan/form/barang", { params: { search } }).then((r) => r.data.data),

  getDetailForm: (nomor: string) =>
    api.get(`/transaksi/penjualan/form/form/${encodeURIComponent(nomor)}`).then((r) => r.data.data),

  save: (payload: PenjualanForm) =>
    api.post("/transaksi/penjualan/form/save", payload).then((r) => r.data),
};
