import api from "@/api/axios";

export interface Account {
  kode: string;
  nama: string;
  no_rekening: string;
  kelompok: string;
  kol_id: number;
  cabang: string;
  store: string;
  keterangan: string;
  status: string;
  saldo_akhir: number;
}

export interface AccountForm {
  isEdit: boolean;
  kode: string;
  nama: string;
  no_rekening: string;
  kol_id: number | null;
  cabang: string;
  store: string;
  keterangan: string;
  is_aktif: boolean;
}

export const accountApi = {
  getAll: async (): Promise<Account[]> => {
    const { data } = await api.get("/master/account");
    return data.data;
  },
  getById: async (kode: string): Promise<any> => {
    const { data } = await api.get(`/master/account/${kode}`);
    return data.data;
  },
  getKelompok: async () => {
    const { data } = await api.get("/master/account/kelompok");
    return data.data as { id: number; nama: string }[];
  },
  getCabang: async () => {
    const { data } = await api.get("/master/account/cabang");
    return data.data as { cabang: string }[];
  },
  save: async (payload: AccountForm) => {
    const { data } = await api.post("/master/account/save", payload);
    return data;
  },
  delete: async (kode: string) => {
    const { data } = await api.delete(`/master/account/${kode}`);
    return data;
  },
};
