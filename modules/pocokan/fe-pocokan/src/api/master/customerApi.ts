import api from "@/api/axios";

export interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
  cp: string;
  piutang: number;
}

export const customerApi = {
  getAll: async (): Promise<Customer[]> => {
    const { data } = await api.get("/master/customer");
    return data.data;
  },
  getById: async (kode: string): Promise<any> => {
    const { data } = await api.get(`/master/customer/${kode}`);
    return data.data;
  },
  save: async (payload: any) => {
    const { data } = await api.post("/master/customer/save", payload);
    return data;
  },
  delete: async (kode: string) => {
    const { data } = await api.delete(`/master/customer/${kode}`);
    return data;
  },
};