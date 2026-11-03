import api from "@/api/axios";

export interface SpkForm {
  isEdit: boolean;
  nomor: string;
  nama: string;
  brgKode: number | string;
  brgNama: string;
  satuan: string;
  custKode: string;
  custNama: string;
  tanggal: string;
  dateline: string;
  jumlah: number;
  jumlahJadi: number;
  jumlahKirim: number;
  keterangan: string;
  harga: number;
  idBatch: string;
}

export const spkFormApi = {
  getBarang: (search: string) =>
    api.get("/transaksi/spk/form/barang", { params: { search } }).then((r) => r.data.data),

  getCustomer: (search: string) =>
    api.get("/transaksi/spk/form/customer", { params: { search } }).then((r) => r.data.data),

  getDetailForm: (nomor: string) =>
    api.get(`/transaksi/spk/form/form/${encodeURIComponent(nomor)}`).then((r) => r.data.data),

  save: (payload: SpkForm) =>
    api.post("/transaksi/spk/form/save", payload).then((r) => r.data),
};