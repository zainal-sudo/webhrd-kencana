/** Kategori tampilan monitoring; tidak mengubah aturan atau pesan WhatsApp. */
export function kategoriPkwt(sisaHari: number): "berakhir" | "segera" | "akan" | "aman" {
  if (sisaHari < 0) return "berakhir";
  if (sisaHari <= 7) return "segera";
  if (sisaHari <= 30) return "akan";
  return "aman";
}

export const statusPkwt = [
  { key: "berakhir", label: "Sudah Berakhir", rentang: "Tanggal akhir sebelum hari ini" },
  { key: "segera", label: "Segera", rentang: "0–7 hari lagi" },
  { key: "akan", label: "Akan Habis", rentang: "8–30 hari lagi" },
  { key: "aman", label: "Aman", rentang: "> 30 hari lagi" },
] as const;
