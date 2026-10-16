export type AgendaStatus = "OPEN" | "SELESAI" | "BATAL";
export interface Agenda {
  id: number; creator: string; updated_by: string | null; updated_at: string | null; title: string; notes: string; date: string;
  start_time: string | null; end_time: string | null;
  visibility: "private" | "shared"; status: AgendaStatus; version: number; recipients: string[];
}
export interface AgendaUser { code: string; name: string }
export function compareAgendaCards(a: Pick<Agenda, "status" | "start_time" | "id">, b: Pick<Agenda, "status" | "start_time" | "id">): number {
  const rank: Record<AgendaStatus, number> = { OPEN: 0, SELESAI: 1, BATAL: 2 };
  return rank[a.status] - rank[b.status] || (a.start_time || "").localeCompare(b.start_time || "") || a.id - b.id;
}
export function agendaAudience(agenda: Pick<Agenda, "visibility" | "recipients">): string {
  if (agenda.visibility === "private") return "diri sendiri";
  return agenda.recipients.length ? agenda.recipients.map(code => code.toUpperCase()).join(", ") : "penerima belum tersedia";
}
export function agendaEditedAt(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (name: string) => parts.find(part => part.type === name)!.value;
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")} WIB`;
}
export function jakartaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (name: string) => parts.find(part => part.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
const dateOf = (value: string) => new Date(`${value}T00:00:00Z`);
export const dateKey = (value: Date) => value.toISOString().slice(0, 10);
export function addDays(value: string, days: number): string {
  const date = dateOf(value); date.setUTCDate(date.getUTCDate() + days); return dateKey(date);
}
export function moveMonth(value: string, amount: number): string {
  const date = dateOf(value), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + amount);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last)); return dateKey(date);
}
export function calendarDays(selected: string, mode: "month" | "week", fixedSixWeeks = false): string[] {
  const anchor = mode === "month" ? `${selected.slice(0, 7)}-01` : selected;
  const offset = (dateOf(anchor).getUTCDay() + 6) % 7;
  const start = addDays(anchor, -offset);
  if (mode === "week") return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const date = dateOf(anchor);
  const last = dateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
  const length = fixedSixWeeks ? 42 : Math.ceil((offset + Number(last.slice(-2))) / 7) * 7;
  return Array.from({ length }, (_, i) => addDays(start, i));
}
export function agendaDateLabel(value: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" }): string {
  return dateOf(value).toLocaleDateString("id-ID", { ...options, timeZone: "UTC" });
}
export function agendaTimeError(start: string, end: string): string {
  const valid = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  return (start || end) && (!valid(start) || !valid(end) || end <= start)
    ? "Isi jam mulai dan selesai; jam selesai harus setelah jam mulai." : "";
}
