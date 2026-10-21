export type PenilaianFormType = "tanpa-bawahan" | "dengan-bawahan";

export interface PenilaianEmployee {
  nik: string;
  nama: string;
  jabatan: string | null;
  bagian: string | null;
  pabrik: string | null;
  statusKerja: string | null;
}

export interface PenilaianAccess {
  employee: PenilaianEmployee;
  formType: PenilaianFormType;
  expiresAt: string;
}

export interface LegacyDocument {
  getElementById: (id: string) => HTMLElement | null;
  querySelectorAll: (selector: string) => NodeListOf<Element>;
  createElement: Document["createElement"];
  body: HTMLElement;
}

export interface LegacyRuntime {
  generatePDFBlob: () => Promise<Blob>;
  validateForm: () => boolean;
  resetForm: () => void;
  executeSharePDF: () => Promise<void>;
  getScores: () => (number | null)[];
  getAspek: () => { nama: string; detail: string; bobot?: number }[];
  getKeteranganByAspek: (index: number, score: number) => string;
}

export interface PenilaianResult {
  pdfBlob: Blob;
  filename: string;
  text: string;
}
