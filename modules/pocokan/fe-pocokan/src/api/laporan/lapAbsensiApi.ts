import api from "@/api/axios";

export interface LapAbsensiItem {
  no: number;
  pabrik: string;
  tanggal: string;
  nama: string;
  bagian: string;
  hari: string;
  kehadiran: number;
}

export const lapAbsensiApi = {
  getData: async (
    pabKode: string,
    periode1: string,
    periode2: string
  ): Promise<LapAbsensiItem[]> => {
    const { data } = await api.get("/laporan/lap-absensi", {
      params: { pabKode, periode1, periode2 },
    });
    return data.data;
  },
};
