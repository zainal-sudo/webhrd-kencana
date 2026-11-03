import api from "@/api/axios";

export interface Gudang {
  kode: string;
  nama: string;
  penanggungjawab: string;
  keterangan: string;
}

export const gudangApi = {
  getAll: async (): Promise<Gudang[]> => {
    const { data } = await api.get("/master/gudang");
    return data.data;
  },
  save: async (payload: { isEdit: boolean; kode: string; nama: string; penanggungjawab: string; keterangan: string }) => {
    const { data } = await api.post("/master/gudang/save", payload);
    return data;
  },
  delete: async (kode: string) => {
    const { data } = await api.delete(`/master/gudang/${kode}`);
    return data;
  },
};