import api from "@/api/axios";

export interface PengajuanTransferRow {
  Nomor: string;
  Tanggal: string;
  Account: string;
  NoRekAsal: string;
  NamaRekening: string;
  Status_: string;
}

export interface PengajuanTransferDetailRow {
  Nomor: string;
  KodeSup: string;
  NamaSupplier: string;
  Bank: string;
  AtasNama: string;
  Rekening: string;
  NoTransaksi: string;
  Nominal: number;
  Keterangan: string;
  TglRealisasi: string;
  Account: string;
  NamaAccount: string;
  CcNama: string;
  DcNama: string;
  Jurnal: string;
  KetBatal: string;
}

export const pengajuanTransferApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/pengajuan-transfer", {
      params: { startDate, endDate },
    });
    return data.data as PengajuanTransferRow[];
  },
  getBrowseDetail: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/pengajuan-transfer/detail", {
      params: { startDate, endDate },
    });
    return data.data as PengajuanTransferDetailRow[];
  },
  getBrowsePendingAll: async () => {
    const { data } = await api.get("/transaksi/pengajuan-transfer/pending-all");
    return data.data as PengajuanTransferRow[];
  },
  getBrowseDetailPendingAll: async () => {
    const { data } = await api.get(
      "/transaksi/pengajuan-transfer/pending-all/detail",
    );
    return data.data as PengajuanTransferDetailRow[];
  },
  getStatus: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/pengajuan-transfer/status/${encodeURIComponent(nomor)}`,
    );
    return data.data as { status: string; sudah: number; item: number };
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(
      `/transaksi/pengajuan-transfer/${encodeURIComponent(nomor)}`,
    );
    return data;
  },
};
