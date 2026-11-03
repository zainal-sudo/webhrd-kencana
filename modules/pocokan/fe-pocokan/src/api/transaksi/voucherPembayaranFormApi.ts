import api from "@/api/axios";

export interface VoucherFormDetail {
  tipe: string;
  searchType: string;
  nomor: string;
  tanggal: string;
  keterangan: string;
  jenis: string;
  nilai: number;
  nilaiMax: number;
  bs: number;
  tarif: number;
  potongan: number;
  total: number;
}

export interface VoucherFormBahan {
  nama: string;
  satuan: string;
  jumlah: number;
  harga: number;
  nilai: number;
}

export interface VoucherFormData {
  nomor: string;
  tanggal: string;
  supKode: string;
  supNama: string;
  supRekening: string;
  supBank: string;
  supCabang: string;
  supAtasnama: string;
  nomorPajak: string;
  statusPpn: boolean;
  ppn: number;
  disc: number;
  keterangan: string;
  detail: VoucherFormDetail[];
  bahanTambahan: VoucherFormBahan[];
  pin5Status: string;
  pin5Urut: number;
}

export interface RealisasiRow {
  vouNomor: string;
  supplier: string;
  tanggalVou: string;
  nilai: number;
}

export interface RealisasiFormData {
  nomor: string;
  kodeBayar: string;
  namaBayar: string;
  tanggal: string;
  tanggalTempo: string;
  account: string;
  namaAccount: string;
  detail: RealisasiRow[];
}

const base = "/transaksi/voucher-pembayaran/form";
const rlBase = `${base}/realisasi`;

export const voucherPembayaranFormApi = {
  // ── Voucher ───────────────────────────────────────────────────────────
  getSupplier: async (kode: string) => {
    const { data } = await api.get(
      `${base}/supplier/${encodeURIComponent(kode)}`,
    );
    return data.data as {
      kode: string;
      nama: string;
      rekening: string;
      bank: string;
      cabang: string;
      atasnama: string;
    };
  },

  searchSupplier: async (search: string) => {
    const { data } = await api.get(`${base}/supplier`, { params: { search } });
    return data.data as { kode: string; nama: string }[];
  },

  getNotaDetail: async (kode: string, statusPpn = 0, type = "") => {
    const { data } = await api.get(
      `${base}/nota-detail/${encodeURIComponent(kode)}`,
      { params: { statusPpn, ...(type ? { type } : {}) } },
    );
    return data.data as VoucherFormDetail;
  },

  searchNota: async (type: string, supKode: string, search = "") => {
    const { data } = await api.get(`${base}/search-nota`, {
      params: { type, supKode, search },
    });
    return data.data as any[];
  },

  getDetailForm: async (nomor: string) => {
    const { data } = await api.get(`${base}/${encodeURIComponent(nomor)}`);
    return data.data as VoucherFormData;
  },

  save: async (payload: any) => api.post(`${base}/save`, payload),

  // ── Realisasi ─────────────────────────────────────────────────────────
  searchKodeBayar: async (q = "") => {
    const { data } = await api.get(`${rlBase}/kode-bayar`, {
      params: { search: q },
    });
    return data.data as { kode: string; nama: string }[];
  },

  getKodeBayar: async (kode: string) => {
    const { data } = await api.get(
      `${rlBase}/kode-bayar/${encodeURIComponent(kode)}`,
    );
    return data.data as { kode: string; nama: string };
  },

  searchAccount: async (q = "") => {
    const { data } = await api.get(`${rlBase}/account`, {
      params: { search: q },
    });
    return data.data as {
      rekening: string;
      bank: string;
      atasnama: string;
      cabang: string;
    }[];
  },

  searchVoucherRealisasi: async (q = "", excludeNomor = "") => {
    const { data } = await api.get(`${rlBase}/search-voucher`, {
      params: { search: q, excludeNomor },
    });
    return data.data as {
      Nomor: string;
      Tanggal: string;
      Supplier: string;
      Total: number;
    }[];
  },

  loadVoucherRealisasiDetail: async (vouNomor: string, currentNomor = "") => {
    const { data } = await api.get(
      `${rlBase}/voucher/${encodeURIComponent(vouNomor)}`,
      { params: { currentNomor } },
    );
    return data.data as RealisasiRow;
  },

  getDetailFormRealisasi: async (nomor: string) => {
    const { data } = await api.get(`${rlBase}/${encodeURIComponent(nomor)}`);
    return data.data as RealisasiFormData;
  },

  saveRealisasi: async (payload: any) => api.post(`${rlBase}/save`, payload),

  hapusRealisasi: async (nomor: string) =>
    api.delete(`${rlBase}/${encodeURIComponent(nomor)}`),
};
