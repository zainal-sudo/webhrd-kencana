import api from "@/api/axios";

export interface PenyelesaianDetail {
  no: number;
  pjh: string;
  pmt: string;
  uraian: string;
  spesifikasi: string;
  satuan: string;
  qty: number;
  harga: number;
  total: number;
  verified: boolean;
  guna: string;
  ga: number; // 0=baru, 1=GA, 2=non-GA existing
  rekkode: string;
  reknama: string;
  cckode: number;
  ccnama: string;
  dcnama: string;
  kdsup: string;
  supplier: string;
  bank: string;
  rekening: string;
  atasnama: string;
  gabrg: number;
  edit: number;
  pjh_link: string;
  kdbrg: string;
  mb: string;
  jenis_item: string;
  cab_item: string;
}

export interface PenyelesaianForm {
  nomor: string;
  jenis: string;
  nomerator: string;
  tanggal: string;
  tgl_bkk: string;
  no_bkk: string;
  rek_kode: string;
  rek_nama: string;
  pjh_nomor: string;
  nota: string;
  nominal: number;
  penerima: string;
  keterangan: string;
  cabang: string;
  is_edit: boolean;
  info_permintaan: {
    pjh_nomor: string;
    pjh_tanggal: string;
    pmt_nomor: string;
    pmt_tanggal: string;
    jenis_permintaan: string;
    pjh_nik: string;
    nama: string;
    bagian: string;
    lokasi: string;
  } | null;
  detail: PenyelesaianDetail[];
}

export const uangMukaPenyelesaianApi = {
  getFormData: async (nomor: string): Promise<PenyelesaianForm> => {
    const { data } = await api.get(
      `/transaksi/uang-muka/selesai/form/${encodeURIComponent(nomor)}`,
    );
    return data.data;
  },

  getAccountOptions: async (jenis: string, cabang: string) => {
    const { data } = await api.get("/transaksi/uang-muka/selesai/account", {
      params: { jenis, cabang },
    });
    return data.data as { kode: string; nama: string; cabang: string }[];
  },

  getAccountByKode: async (kode: string) => {
    const { data } = await api.get(
      `/transaksi/uang-muka/selesai/account/${encodeURIComponent(kode)}`,
    );
    return data.data;
  },

  getCostCenterOptions: async () => {
    const { data } = await api.get("/transaksi/uang-muka/selesai/cost-center");
    return data.data as { kode: number; nama: string }[];
  },

  getDcOptions: async (cckode: number) => {
    const { data } = await api.get(`/transaksi/uang-muka/selesai/dc/${cckode}`);
    return data.data as { kode: number; nama: string }[];
  },

  save: async (payload: any) => {
    const { data } = await api.post(
      "/transaksi/uang-muka/selesai/save",
      payload,
    );
    return data;
  },

  // ── Bantuan Pencarian (F1 - F5) ───────────────────────────────────────

  getListPengajuanGA: async (cabang: string) => {
    const { data } = await api.get(
      "/transaksi/uang-muka/selesai/pengajuan-ga",
      {
        params: { cabang },
      },
    );
    return data.data as any[];
  },

  getDetailPengajuanGA: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/uang-muka/selesai/pengajuan-ga/detail/${encodeURIComponent(nomor)}`,
    );
    return data.data as PenyelesaianDetail[];
  },

  getListPoExternal: async () => {
    const { data } = await api.get("/transaksi/uang-muka/selesai/po-external");
    return data.data as any[];
  },

  getListVoucher: async () => {
    const { data } = await api.get("/transaksi/uang-muka/selesai/voucher");
    return data.data as any[];
  },

  getListPermintaanGarmen: async (cabang: string) => {
    const { data } = await api.get(
      "/transaksi/uang-muka/selesai/permintaan-garmen",
      {
        params: { cabang },
      },
    );
    return data.data as any[];
  },

  getDetailPermintaanGarmen: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/uang-muka/selesai/permintaan-garmen/detail/${encodeURIComponent(nomor)}`,
    );
    return data.data as PenyelesaianDetail[];
  },

  getListInvoiceGarmen: async () => {
    const { data } = await api.get(
      "/transaksi/uang-muka/selesai/invoice-garmen",
    );
    return data.data as any[];
  },

  getDetailInvoiceGarmen: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/uang-muka/selesai/invoice-garmen/detail/${encodeURIComponent(nomor)}`,
    );
    return data.data as PenyelesaianDetail[];
  },

  createSupplier: async (payload: {
    Nama: string;
    Alamat: string;
    Kota: string;
    Telp: string;
    Hp: string;
    Fax: string;
    Contact: string;
    NpwpKode: string;
    NpwpNama: string;
    NpwpAlamat: string;
    NpwpKota: string;
    Top: number;
    TargetMitra: number;
    Keterangan: string;
    Jenis: {
      Bahan: boolean;
      Cmt: boolean;
      Acc: boolean;
      Obat: boolean;
      Sparepart: boolean;
      Atk: boolean;
      Jasa: boolean;
    };
    Aktif: string;
    RekeningList: { Bank: string; Rekening: string; AtasNama: string }[];
  }) => {
    const { data } = await api.post(
      "/transaksi/uang-muka/selesai/supplier",
      payload,
    );
    return data;
  },
};
