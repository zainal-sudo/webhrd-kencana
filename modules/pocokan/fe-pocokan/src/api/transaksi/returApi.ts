import api from "@/api/axios";
export const returApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/retur", { params: { startDate, endDate } });
    return data.data;
  },
      getDetail: async (nomor: string) => {
  const { data } = await api.get(`/transaksi/retur/detail/${encodeURIComponent(nomor)}`);
  return data.data;
},
  delete: async (nomor: string) => {
    const { data } = await api.delete(`/transaksi/retur/${encodeURIComponent(nomor)}`);
    return data;
  }
};