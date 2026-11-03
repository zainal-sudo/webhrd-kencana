import api from "@/api/axios";

export interface RekonsiliasiBankRow {
  Kode: string;
  Nama: string;
  SaldoAkhir: number;
  SaldoBank: number;
  Rekon: string;
}

export interface RekonDetail {
  no: number;
  uraian: string;
  keterangan: string;
  nominal: number;
}

export const rekonsiliasiBankApi = {
  getBrowse: async (tanggal: string) => {
    const { data } = await api.get("/transaksi/rekonsiliasi-bank", {
      params: { tanggal },
    });
    return data.data as RekonsiliasiBankRow[];
  },
  delete: async (rekKode: string, tanggal: string) => {
    const { data } = await api.delete("/transaksi/rekonsiliasi-bank", {
      params: { rekKode, tanggal },
    });
    return data;
  },
  getValidasi: async (rekKode: string, tanggal: string) => {
    const { data } = await api.get("/transaksi/rekonsiliasi-bank/validasi", {
      params: { rekKode, tanggal },
    });
    return data.data as { saldo_koran: number };
  },
  saveValidasi: async (
    rekKode: string,
    tanggal: string,
    saldoKoran: number,
  ) => {
    const { data } = await api.post("/transaksi/rekonsiliasi-bank/validasi", {
      rekKode,
      tanggal,
      saldoKoran,
    });
    return data;
  },
  getRekon: async (rekKode: string, tanggal: string) => {
    const { data } = await api.get("/transaksi/rekonsiliasi-bank/rekon", {
      params: { rekKode, tanggal },
    });
    return data.data as {
      bukuTambah: RekonDetail[];
      bukuKurang: RekonDetail[];
      bankTambah: RekonDetail[];
      bankKurang: RekonDetail[];
    };
  },

  saveRekon: async (
    rekKode: string,
    tanggal: string,
    saldoBuku: number,
    saldoKoran: number,
    detail: {
      bukuTambah: RekonDetail[];
      bukuKurang: RekonDetail[];
      bankTambah: RekonDetail[];
      bankKurang: RekonDetail[];
    },
  ) => {
    const { data } = await api.post("/transaksi/rekonsiliasi-bank/rekon", {
      rekKode,
      tanggal,
      saldoBuku,
      saldoKoran,
      detail,
    });
    return data;
  },
};
