import api from "@/api/axios";

export const bpbApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/bpb", { params: { startDate, endDate } });
    return data.data;
  },
    getDetail: async (nomor: string) => {
  const { data } = await api.get(`/transaksi/bpb/detail/${encodeURIComponent(nomor)}`);
  return data.data;
},
  delete: async (nomor: string) => {
    const { data } = await api.delete(`/transaksi/bpb/${encodeURIComponent(nomor)}`);
    return data;
  },

};
