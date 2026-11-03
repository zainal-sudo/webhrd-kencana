import api from "@/api/axios";

export interface ReturDetail {
  no?: number;
  brgKode: number;
  brgNama: string;
  barcode: string;
  satuan: string;
  qty: number;
  harga: number;
  discPr: number;
  expired?: string;
}

export interface ReturForm {
  isEdit: boolean;
  nomor: string;
  tanggal: string;
  supKode: string;
  supNama: string;
  gdgKode: string;
  invNomor: string;
  memo: string;
  isTax: number;
  discFakturPr: number;
  discFaktur: number;
  amount: number;
  taxAmount: number;
  detail: ReturDetail[];
}

export const returFormApi = {
  getSupplier: (search: string) => 
    api.get("/transaksi/retur/form/supplier", { params: { search } }).then(r => r.data.data),
    
  getRekening: (search: string) => 
    api.get("/transaksi/retur/form/rekening", { params: { search } }).then(r => r.data.data),

  getBarang: (search: string) => 
    api.get("/transaksi/retur/form/barang", { params: { search } }).then(r => r.data.data),
  
  getGudang: (search: string) => 
    api.get("/transaksi/retur/form/gudang", { params: { search } }).then(r => r.data.data),  

 getInvoice: (search: string) =>
    api.get("/transaksi/retur/form/invoice", { params: { search } }).then(r => r.data.data),

  getInvoiceDetail: (nomor: string) =>
    api.get(`/transaksi/retur/form/invoice/${encodeURIComponent(nomor)}`).then(r => r.data.data),
  getDetailForm: (nomor: string) => 
    api.get(`/transaksi/retur/form/form/${encodeURIComponent(nomor)}`).then(r => r.data.data),
    
  save: (payload: ReturForm) =>
    api.post("/transaksi/retur/form/save", payload).then(r => r.data)
};