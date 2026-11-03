import api from "@/api/axios";

export interface InvoiceHutang {
  invoiceNomor: string;
  invoiceTanggal: string;
  invoiceNetto: number;
  sisaHutang: number;
  nilaiBayar: number;
  isChecked: boolean; // Flag kontrol checkbox di sisi frontend
}

export const bayarSupplierApi = {
  // Lookup supplier & rekening milik modul ini sendiri (menu 53).
  // Sebelumnya form ini memakai returFormApi (menu 16 - Retur) sehingga
  // user yang tidak punya akses ke menu Retur tidak bisa memilih supplier
  // sama sekali (request ditolak 403 oleh backend).
  getSupplier: async (search: string) => {
    const { data } = await api.get("/transaksi/bayarSupplier/supplier", { params: { search } });
    return data.data;
  },
  getRekening: async (search: string) => {
    const { data } = await api.get("/transaksi/bayarSupplier/rekening", { params: { search } });
    return data.data;
  },
  getInitData: async () => {
    const { data } = await api.get("/transaksi/bayarSupplier/init");
    return data.data;
  },
  getInvoiceHutang: async (supKode: string): Promise<InvoiceHutang[]> => {
    const { data } = await api.get(`/transaksi/bayarSupplier/invoice-hutang/${supKode}`);
    return data.data;
  },
  saveData: async (payload: any) => {
    const { data } = await api.post("/transaksi/bayarSupplier/save", payload);
    return data;
  },
  // startDate/endDate (YYYY-MM-DD) opsional -- dipakai filter Periode di browse.
  // String kosong sengaja diubah jadi undefined supaya TIDAK ikut terkirim
  // sebagai query param -- artinya "tampilkan semua data" kalau user belum
  // pilih periode apa pun.
  // BUG SEBELUMNYA: fungsi ini sama sekali tidak menerima parameter apa pun,
  // jadi filter tanggal di halaman Browse tidak pernah benar-benar terkirim
  // ke server walau usernya sudah mengisi kolom Periode.
  getAll: async (startDate?: string, endDate?: string) => {
    const { data } = await api.get("/transaksi/bayarSupplier", {
      params: {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
    });
    return data.data;
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(`/transaksi/bayarSupplier/${nomor}`);
    return data;
  },
  getDetailForm: (nomor: string) =>
    api.get(`/transaksi/bayarSupplier/${encodeURIComponent(nomor)}`).then(r => r.data.data),
  getDetail: async (nomor: string) => {
    const { data } = await api.get(`/transaksi/bayarSupplier/detail/${encodeURIComponent(nomor)}`);
    return data.data;
  },
};