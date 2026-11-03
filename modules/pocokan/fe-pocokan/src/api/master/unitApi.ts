import api from "@/api/axios";

export interface Unit {
  kode: string;
  nama: string;
}

export const unitApi = {
  getAll: async (): Promise<Unit[]> => {
    const { data } = await api.get("/master/unit");
    return data.data;
  },
  save: async (payload: { isEdit: boolean; kode: string; nama: string }) => {
    const { data } = await api.post("/master/unit/save", payload);
    return data;
  },
  delete: async (kode: string) => {
    const { data } = await api.delete(`/master/unit/${kode}`);
    return data;
  },
};
