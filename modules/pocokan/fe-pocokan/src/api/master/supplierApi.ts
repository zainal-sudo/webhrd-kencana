import api from "@/api/axios";

export interface Supplier {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  fax: string;
  telp: string;
  cp: string;
  hutang: number;
  top: number;
  bank: string;
  rekening: string;
  atasNama: string;
  cabang: string;
  email: string;
}

export const supplierApi = {
  getAll: async (): Promise<Supplier[]> => {
    const { data } = await api.get("/master/supplier");
    return data.data;
  },
  getById: async (kode: string): Promise<Supplier> => {
    const { data } = await api.get(`/master/supplier/${kode}`);
    return data.data;
  },
  save: async (payload: any) => {
    const { data } = await api.post("/master/supplier/save", payload);
    return data;
  },
  delete: async (kode: string) => {
    const { data } = await api.delete(`/master/supplier/${kode}`);
    return data;
  },
};