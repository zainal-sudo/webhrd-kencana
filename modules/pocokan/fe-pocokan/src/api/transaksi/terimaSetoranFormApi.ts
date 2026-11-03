import api from "@/api/axios";

export interface TerimaSetoranFormHdr {
  Nomor: string;
  TglSetor: string;
  TglVerifikasi: string | null;
  UserCreate: string;
  UserVerifikasi: string;
  Cabang: string;
}

export interface TerimaSetoranDtl1Row {
  Jenis: string;
  TglTransfer: string | null;
  KdCus: string;
  NamaCus: string;
  Alamat: string;
  Invoice: string;
  Nominal: number;
}

export interface TerimaSetoranDtl2Row {
  Jenis: string;
  NominalSetor: number;
  NominalVerifikasi: number;
}

export interface TerimaSetoranFormData {
  hdr: TerimaSetoranFormHdr;
  dtl1: TerimaSetoranDtl1Row[];
  dtl2: TerimaSetoranDtl2Row[];
}

export interface TerimaSetoranSavePayload {
  nomor: string;
  diVerifikasi: boolean;
  tglVerifikasi: string | null;
  detail2: { jenis: string; nominalv: number }[];
}

export const terimaSetoranFormApi = {
  getForm: async (nomor: string): Promise<TerimaSetoranFormData> => {
    const { data } = await api.get(
      `/transaksi/terima-setoran/form/${encodeURIComponent(nomor)}`,
    );
    return data.data as TerimaSetoranFormData;
  },
  save: async (payload: TerimaSetoranSavePayload) => {
    const { data } = await api.post(
      "/transaksi/terima-setoran/form/save",
      payload,
    );
    return data;
  },
};
