import api from "@/api/axios";

export interface InvDetail {
  nourut?: number;
  brgKode: number;
  brgNama: string;
  barcode: string;
  satuan: string;
  qty: number;
  harga: number;
  discPr: number;
  expired?: string | null;
}

export interface InvForm {
  isEdit: boolean;
  nomor: string;
  tanggal: string;
  jthtempo: string;
  bpbNomor: string;
  poNomor?: string;
  poDateline?: string;
  supKode?: string;
  supNama?: string;
  supAlamat?: string;
  supTelp?: string;
  memo: string;
  isTax: number;
  discFakturPr: number;
  discFaktur: number;
  freight: number;
  amount: number;
  taxAmount: number;
  nobukti: number;
  isPajak: number;
  noPajak?: string | null;
  detail: InvDetail[];
}

export const invFormApi = {
  getBpbOptions: (search: string, includeNomor?: string) =>
    api
      .get("/transaksi/invoice/form/bpb-options", { params: { search, includeNomor } })
      .then((r) => r.data.data),

  getBpbDetail: (bpbNomor: string) =>
    api
      .get(`/transaksi/invoice/form/bpb-detail/${encodeURIComponent(bpbNomor)}`)
      .then((r) => r.data.data),

  getDetailForm: (nomor: string) =>
    api.get(`/transaksi/invoice/form/form/${encodeURIComponent(nomor)}`).then((r) => r.data.data),

  save: (payload: InvForm) =>
    api.post("/transaksi/invoice/form/save", payload).then((r) => r.data),
};