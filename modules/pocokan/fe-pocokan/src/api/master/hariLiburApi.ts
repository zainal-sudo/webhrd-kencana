import api from "@/api/axios";

export interface HariLibur {
  tanggal: string;
  keterangan: string;
}

export const hariLiburApi = {
  getAll: async (tahun: number): Promise<HariLibur[]> => {
    const { data } = await api.get(`/master/hari-libur?tahun=${tahun}`);
    return data.data;
  },
  save: async (payload: { isEdit: boolean; tanggal: string; keterangan: string; oldTanggal?: string }) => {
    const { data } = await api.post("/master/hari-libur/save", payload);
    return data;
  },
  insertSundays: async (tahun: number) => {
    const { data } = await api.post("/master/hari-libur/insert-sundays", { tahun });
    return data;
  },
  delete: async (tanggal: string) => {
    const { data } = await api.delete(`/master/hari-libur/${tanggal}`);
    return data;
  },
};
