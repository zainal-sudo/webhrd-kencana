import api from "@/api/axios";

export interface SpkDetail {
  id: number;
  urutan: number;
  nama: string;
  target: number;
  selesai: number;
  pic: string | null;
  tglMulai: string | null;
  tglSelesai: string | null;
  status: "Belum Mulai" | "Proses" | "Selesai";
  keterangan: string | null;
}

export interface SpkKategoriProses {
  kode: string;      // ktg_kode asli, mis. "2.9.1"
  nama: string | null; // ktg_nama dari tkategori, mis. "Masker Earloop"
}

export const spkDetailApi = {
  getKategoriList: () =>
    api.get(`/transaksi/spk/tahapan/kategori`).then((r) => r.data.data as SpkKategoriProses[]),

  // Auto-suggest ktg_kode dari kode barang (via brg_ktg_kode, satu hop, tanpa
  // tabel mapping perantara). Return ktgKode null kalau barang belum terdaftar
  // atau kategorinya belum punya template — frontend lalu minta user pilih manual.
  getProsesByBarang: (brgKode: string) =>
    api
      .get(`/transaksi/spk/tahapan/proses-oleh-barang/${encodeURIComponent(brgKode)}`)
      .then((r) => r.data.data as { ktgKode: string | null }),

  getBySpk: (nomor: string) =>
    api.get(`/transaksi/spk/tahapan/${encodeURIComponent(nomor)}`).then((r) => r.data.data as SpkDetail[]),

  update: (id: number, payload: Partial<SpkDetail>) =>
    api.put(`/transaksi/spk/tahapan/${id}`, payload).then((r) => r.data),
};