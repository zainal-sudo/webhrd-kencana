import api from "@/api/axios";

export interface UangMuka {
  Nomor: string;
  Tanggal: string;
  Jenis: string;
  NamaAccount: string;
  Pjh: string;
  Nota: string;
  Penerima: string;
  Nominal: number;
  Terpakai: number;
  Sisa: number;
  Keterangan: string;
  NoBukti: string;
  Selesai: "Belum" | "Sudah";
  Closed: "Belum" | "Sudah";
}

export const uangMukaApi = {
  getBrowse: async (
    startDate: string,
    endDate: string,
    cabang: string,
  ): Promise<UangMuka[]> => {
    const { data } = await api.get("/transaksi/uang-muka", {
      params: { startDate, endDate, cabang },
    });
    return data.data;
  },
  getBrowsePendingAll: async () => {
    const { data } = await api.get("/transaksi/uang-muka/pending-all");
    return data.data as UangMuka[];
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(
      `/transaksi/uang-muka/${encodeURIComponent(nomor)}`,
    );
    return data;
  },
};
