const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function periodePinjaman(tanggal: string, angsuran: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || !Number.isInteger(angsuran) || angsuran <= 0) return null;
  const date = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== tanggal || tanggal < "1000-01-01") return null;
  const [tahun, bulan, hari] = tanggal.split("-").map(Number);
  const awal = tahun * 12 + bulan - 1 + (hari > 20 ? 1 : 0);
  const label = (offset: number) => `${BULAN[offset % 12]} ${Math.floor(offset / 12)}`;
  if (angsuran > 1200) return `${label(awal)} – ${label(awal + angsuran - 1)} (${angsuran} periode)`;
  return Array.from({ length: angsuran }, (_, i) => label(awal + i)).join(", ");
}

export function rupiah(value: unknown): string {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "—";
  return `Rp${Number(value).toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
}
