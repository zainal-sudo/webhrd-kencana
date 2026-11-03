import api from "@/api/axios";

export const mutasiApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/mutasi", { params: { startDate, endDate } });
    return data.data;
  },
  getDetail: async (nomor: string) => {
    const { data } = await api.get(`/transaksi/mutasi/detail/${encodeURIComponent(nomor)}`);
    return data.data;
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(`/transaksi/mutasi/${encodeURIComponent(nomor)}`);
    return data;
  },
  // Tambahkan fungsi realisasi di sini
  realisasi: async (nomor: string) => {
    const { data } = await api.put(`/transaksi/mutasi/realisasi/${encodeURIComponent(nomor)}`);
    return data;
  },
};