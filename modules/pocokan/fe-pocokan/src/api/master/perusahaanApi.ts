import api from "@/api/axios";

export interface PerusahaanInfo {
  nama: string;
  alamat: string;
  kota: string;
  notelp: string;
  nofax: string;
  kdpos: string;
}

export const perusahaanApi = {
  getInfo: async (): Promise<PerusahaanInfo> => {
    const { data } = await api.get("/master/perusahaan");
    return data.data;
  },
};
