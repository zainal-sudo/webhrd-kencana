import api from "@/api/axios";

export const penyesuaianStokApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/penyesuaian-stok", { params: { startDate, endDate } });
    return data.data;
  },
  getDetail: async (nomor: string) => {
    const { data } = await api.get(`/transaksi/penyesuaian-stok/detail/${encodeURIComponent(nomor)}`);
    return data.data;
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(`/transaksi/penyesuaian-stok/${encodeURIComponent(nomor)}`);
    return data;
  },
};