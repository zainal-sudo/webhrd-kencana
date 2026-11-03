import api from "@/api/axios";

export interface VoucherRow {
  Nomor: string;
  Tanggal: string;
  KodeSupplier: string;
  Supplier: string;
  NomorPajak: string;
  Total: number;
  BahanTambahan: number;
  Net: number;
  Disc: number;
  Status: string;
  NomorRealisasi: string;
  TanggalRealisasi: string | null;
  AccountBayar: string;
  NamaAccount: string;
  CcNama: string;
  DcNama: string;
  Ngedit: string;
  Usr: string;
  Created: string;
}

export interface VoucherDetailRow {
  Nomor: string;
  Nota: string;
  NomorPO: string;
  Tanggal: string;
  Type: string;
  Total: number;
  SpkNomor: string;
  SpkNama: string;
  Jumlah: number;
  Bs: number;
  TarifBS: number;
}

export const voucherPembayaranApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/voucher-pembayaran", {
      params: { startDate, endDate },
    });
    return data.data as VoucherRow[];
  },
  getBrowseDetail: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/voucher-pembayaran/detail", {
      params: { startDate, endDate },
    });
    return data.data as VoucherDetailRow[];
  },
  getBrowsePendingAll: async () => {
    const { data } = await api.get("/transaksi/voucher-pembayaran/pending-all");
    return data.data as VoucherRow[];
  },
  getBrowseDetailPendingAll: async () => {
    const { data } = await api.get(
      "/transaksi/voucher-pembayaran/pending-all/detail",
    );
    return data.data as VoucherDetailRow[];
  },
  delete: async (nomor: string) => {
    return api.delete(
      `/transaksi/voucher-pembayaran/${encodeURIComponent(nomor)}`,
    );
  },
  cekPengajuan: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/voucher-pembayaran/${encodeURIComponent(nomor)}/cek-pengajuan`,
    );
    return data as {
      perlu: boolean;
      urut?: number;
      alasanLama?: string;
      message?: string;
    };
  },
  requestPin5: async (nomor: string, alasan: string) => {
    return api.post(
      `/transaksi/voucher-pembayaran/${encodeURIComponent(nomor)}/pengajuan`,
      { alasan },
    );
  },
};
