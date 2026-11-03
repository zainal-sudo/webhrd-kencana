import api from "@/api/axios";

export interface BarangJadi {
  brg_kode: number;
  brg_nama: string;
  brg_satuan: string;
  brg_ktg_kode: string;
  brg_gdg_default: string;
  brg_merk?: string;
  brg_isstok: number;
  brg_isaktif: number;
  brg_hrgbeli: number;
  brg_hrgjual: number;
  brg_MIN_STOK: number;
  brg_MAX_STOK: number;
  brg_sup_kode?: string;
  brg_spesifikasi?: string;
  brg_hpp_terakhir?: number;
  brg_isboom?: number;
  brg_rek_kode?: string;
  ktg_nama?: string;
  gdg_nama?: string;
  sup_nama?: string;
}

export interface KomposisiItem {
  bk_brg_kode: number;
  bk_bhn_kode: number;
  bk_qty: number;
  bk_satuan: string;
  bk_nourut?: number;
  bk_spesifikasi?: string;
  bhn_nama?: string;
}

export interface BarangJadiTemplate {
  brg_kode: number;
  brg_nama: string;
  brg_satuan: string;
}

export const barangJadiApi = {
  getAll: async (): Promise<BarangJadi[]> => {
    const { data } = await api.get("/master/barang-jadi");
    return data.data;
  },
  getById: async (kode: number): Promise<BarangJadi> => {
    const { data } = await api.get(`/master/barang-jadi/${kode}`);
    return data.data;
  },
  save: async (payload: Partial<BarangJadi> & { items: KomposisiItem[] }) => {
    const { data } = await api.post("/master/barang-jadi/save", payload);
    return data;
  },
  delete: async (kode: number) => {
    const { data } = await api.delete(`/master/barang-jadi/${kode}`);
    return data;
  },
  getKomposisi: async (kode: number): Promise<KomposisiItem[]> => {
    const { data } = await api.get(`/master/barang-jadi/${kode}/komposisi`);
    return data.data;
  },
  getTemplateList: async (): Promise<BarangJadiTemplate[]> => {
    const { data } = await api.get("/master/barang-jadi/templates/list");
    return data.data;
  },
};