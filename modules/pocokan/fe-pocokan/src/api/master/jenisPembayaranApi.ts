import api from "@/api/axios";

export interface JenisPembayaran {
  nama: string;
}

export const jenisPembayaranApi = {
  getAll: async (): Promise<JenisPembayaran[]> => {
    const { data } = await api.get("/master/jenis-pembayaran");
    return data.data;
  },
  save: async (payload: { nama: string }) => {
    const { data } = await api.post("/master/jenis-pembayaran/save", payload);
    return data;
  },
  delete: async (nama: string) => {
    const { data } = await api.delete(
      `/master/jenis-pembayaran/${encodeURIComponent(nama)}`,
    );
    return data;
  },
};
