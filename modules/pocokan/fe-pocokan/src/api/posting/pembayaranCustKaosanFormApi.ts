import api from "@/api/axios";

export interface DataPostingKaosanRow {
  Tanggal: string;
  Nomor: string;
  RekKode: string;
  RekNama: string;
  Nominal: number;
  Uraian: string;
  Customer: string;
  Trs: string;
  TglTransfer: string | null;
  Cab: string;
  Status: string;
}

export interface PostingKaosanResult {
  nomor: string;
  status: "Sukses" | "Skip";
  message: string;
}

export interface CabangItem {
  kode: string;
  nama: string;
}

export const pembayaranCustKaosanFormApi = {
  getCabang: async () => {
    const { data } = await api.get(
      "/posting/pembayaran-cust-kaosan/form/cabang",
    );
    return data.data as CabangItem[];
  },
  getDataPosting: async (
    startDate: string,
    endDate: string,
    cabang: string,
  ) => {
    const { data } = await api.get("/posting/pembayaran-cust-kaosan/form", {
      params: { startDate, endDate, cabang },
    });
    return data.data as DataPostingKaosanRow[];
  },
  doPosting: async (items: DataPostingKaosanRow[]) => {
    const { data } = await api.post(
      "/posting/pembayaran-cust-kaosan/form/posting",
      { items },
    );
    return data as {
      success: boolean;
      message: string;
      data: PostingKaosanResult[];
    };
  },
};
