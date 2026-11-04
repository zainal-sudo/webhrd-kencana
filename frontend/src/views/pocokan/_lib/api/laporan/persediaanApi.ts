import api from "@/views/pocokan/_lib/api/axios";

export const persediaanApi = {
  getLaporan: async (gdgKode?: string) => {
    const { data } = await api.get("/laporan/persediaan", {
      params: { gdgKode },
    });
    return data.data;
  },
};