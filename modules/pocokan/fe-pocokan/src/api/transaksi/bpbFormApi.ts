import api from "@/api/axios";

export interface BpbDetail {
  nourut: number;
  brgKode: number;
  brgNama: string;
  barcode: string;
  satuan: string;
  qtyPo: number;           // snapshot dari PO (readonly)
  qtySudahTerima: number;  // akumulasi sebelumnya (readonly)
  qty: number;             // qty diterima sekarang (input user)
  tglExpired: string;      // '0000-00-00' kalau tidak ada
  podNourut: number;       // referensi pod_nourut di tpo_dtl
}

export interface BpbForm {
  isEdit: boolean;
  nomor: string;
  tanggal: string;
  poNomor: string;
  gdgKode: string;
  gdgNama: string;
  memo: string;
  // Status invoice BPB ini murni dikontrol sistem (trigger saat invoice
  // dibuat/dihapus), bukan input form — hanya dibaca (read-only) kalau ada.
  isInvoice?: number;
  detail: BpbDetail[];
}

export const bpbFormApi = {
  getPoOptions: (search: string) =>
    api.get("/transaksi/bpb/form/po-options", { params: { search } }).then(r => r.data.data),

  getPoDetail: (poNomor: string) =>
    api.get(`/transaksi/bpb/form/po-detail/${encodeURIComponent(poNomor)}`).then(r => r.data.data),

  getGudang: (search: string) =>
    api.get("/transaksi/bpb/form/gudang", { params: { search } }).then(r => r.data.data),

  getDetailForm: (nomor: string) =>
    api.get(`/transaksi/bpb/form/form/${encodeURIComponent(nomor)}`).then(r => r.data.data),

  save: (payload: BpbForm) =>
    api.post("/transaksi/bpb/form/save", payload).then(r => r.data),
};
