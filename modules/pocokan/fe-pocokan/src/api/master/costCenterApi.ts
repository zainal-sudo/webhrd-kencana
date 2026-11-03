import api from "@/api/axios";

export interface CostCenterDetail {
  nama: string;
  pakai?: boolean;
}

export interface CostCenter {
  kode: string;
  nama: string;
  detail: CostCenterDetail[];
}

export const costCenterApi = {
  getAll: async (): Promise<CostCenter[]> => {
    const { data } = await api.get("/master/cost-center");
    return data.data;
  },
  getById: async (kode: string): Promise<CostCenter> => {
    const { data } = await api.get(`/master/cost-center/${kode}`);
    return data.data;
  },
  save: async (payload: {
    isEdit: boolean;
    kode?: string;
    nama: string;
    detail: CostCenterDetail[];
  }) => {
    const { data } = await api.post("/master/cost-center/save", payload);
    return data;
  },
  delete: async (kode: string) => {
    const { data } = await api.delete(`/master/cost-center/${kode}`);
    return data;
  },
};
