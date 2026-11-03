import api from "@/api/axios";

export interface KoreksiDetail {
  nourut: number;
  brgKode: number | string;
  brgNama: string;
  barcode: string;
  satuan: string;
  expired: string;       // '' kalau tidak ada, 'YYYY-MM-DD' kalau ada
  stokSystem: number;    // stok sistem terkini (readonly, snapshot)
  fisik: number;         // input user, hasil hitung fisik
  qty: number;           // selisih = fisik - stokSystem (readonly, computed)
  harga: number;
  nilai: number;         // qty * harga (readonly, computed)
}

export interface KoreksiForm {
  isEdit: boolean;
  nomor: string;
  tanggal: string;
  gdgKode: string;
  gdgNama: string;
  keterangan: string;
  idbatch: string;
  expired: string;
  produksi: string;
  memo: string;
  detail: KoreksiDetail[];
}

export const penyesuaianStokFormApi = {
  getGudang: (search: string) =>
    api.get("/transaksi/penyesuaian-stok/form/gudang", { params: { search } }).then((r) => r.data.data),

  getBarangByGudang: (gdgKode: string, search: string = "") =>
    api
      .get(`/transaksi/penyesuaian-stok/form/barang/${encodeURIComponent(gdgKode)}`, { params: { search } })
      .then((r) => r.data.data),

  getDetailForm: (nomor: string) =>
    api.get(`/transaksi/penyesuaian-stok/form/form/${encodeURIComponent(nomor)}`).then((r) => r.data.data),

  save: (payload: KoreksiForm) =>
    api.post("/transaksi/penyesuaian-stok/form/save", payload).then((r) => r.data),
};