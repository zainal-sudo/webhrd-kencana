import api from "@/api/axios";

export interface LapGajiItem {
    no: number;
    id: string;
    nama: string;
    unit: string;
    bagian: string;
    hari: number;
    lemburLE2: number;
    lemburGT2: number;
    kehadiran: number;
    lembur: number;
    potongan: number;
    thp: number;
    rekening: string;
}

export const lapGajiApi = {
    getData: async (
        periode1: string,
        periode2: string
    ): Promise<LapGajiItem[]> => {
        const { data } = await api.get("/laporan/lap-gaji", {
            params: {
                periode1,
                periode2,
            },
        });

        return data.data;
    },
};