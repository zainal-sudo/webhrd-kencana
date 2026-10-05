import { TOKEN_KEY } from "@/api/axios";

/**
 * Foto karyawan disimpan sebagai blob di kolom `tkaryawan.kar_foto` dan
 * disajikan backend pada `/api/master/karyawan/:nik/foto`. Token dikirim lewat
 * query string karena tag `<img>` tidak bisa menambah header Authorization.
 */
export function fotoUrl(nik: string | null | undefined): string {
  if (!nik) return "";
  const token = localStorage.getItem(TOKEN_KEY) || "";
  const base = `/api/master/karyawan/${encodeURIComponent(nik)}/foto`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
