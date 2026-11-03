import api from "@/api/axios";

export interface DataPostingRow {
  Tanggal: string;
  Nomor: string;
  RekKode: string;
  RekNama: string;
  Jenis: string;
  Nominal: number;
  Uraian: string;
  Customer: string;
  Status: string; // '' = belum, 'Sukses' = sudah diposting sesi ini, 'Sudah' = sudah ada di DB
}

export interface PostingResult {
  nomor: string;
  status: "Sukses" | "Skip";
  message: string;
}

export const pembayaranCustomerFormApi = {
  getDataPosting: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/posting/pembayaran-customer/form", {
      params: { startDate, endDate },
    });
    return data.data as DataPostingRow[];
  },
  doPosting: async (items: DataPostingRow[]) => {
    const { data } = await api.post(
      "/posting/pembayaran-customer/form/posting",
      { items },
    );
    return data as {
      success: boolean;
      message: string;
      data: PostingResult[];
    };
  },
};
