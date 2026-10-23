/** In-memory registry. Values and credentials are never persisted or logged. */
export interface DraftSource {
  title: string;
  dirty: () => boolean;
  state: () => unknown;
  busy?: () => boolean;
  enabled?: () => boolean;
}
interface DraftEntry extends DraftSource { saved?: string }
const drafts = new Map<string, Map<symbol, DraftEntry>>();
const saving = new Map<string, number>();
type SaveTicket = { submitted: { entry: DraftEntry; state: string }[] };
const tickets = new Map<string, Set<SaveTicket>>();
const approved = new Set<string>();
const listeners = new Set<() => void>();
export const APPLICATION_DRAFT = "$application";
export function formState(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item) ?? "null";
}
export function publishDrafts() { for (const listener of listeners) listener(); }
export function registerDraft(id: string, source: DraftSource) {
  const token = Symbol(id), entry: DraftEntry = { ...source };
  if (!drafts.has(id)) drafts.set(id, new Map());
  drafts.get(id)!.set(token, entry);
  publishDrafts();
  return {
    rebase() { delete entry.saved; publishDrafts(); },
    dispose() {
      drafts.get(id)?.delete(token);
      if (!drafts.get(id)?.size) drafts.delete(id);
      publishDrafts();
    },
  };
}
export function isTabDirty(id: string): boolean {
  return [...(drafts.get(id)?.values() || [])].some(entry => (entry.enabled?.() ?? true) && (entry.saved === undefined
    ? entry.dirty() : formState(entry.state()) !== entry.saved));
}
export function isTabBusy(id: string): boolean {
  return !!saving.get(id) || [...(drafts.get(id)?.values() || [])].some(entry => entry.busy?.());
}
export function protectedTabIds(): string[] {
  return [...new Set([...drafts.keys(), ...saving.keys()])].filter(id => isTabDirty(id) || isTabBusy(id));
}
function titleFor(id: string) { return drafts.get(id)?.values().next().value?.title || "form"; }
export function confirmDraftNavigation(id: string): boolean {
  if (approved.has(id)) return true;
  const dirty = [id, APPLICATION_DRAFT].filter(isTabDirty);
  if (!dirty.length) return true;
  return window.confirm(`Ada perubahan yang belum disimpan pada ${dirty.map(titleFor).join(", ")}. Tetap pindah halaman? Isian tetap tersedia selama tab form masih terbuka.`);
}
export function confirmDraftDiscard(ids: string[]): boolean {
  const targets = [...new Set(ids)].filter(id => !approved.has(id));
  if (targets.some(isTabBusy)) {
    window.alert("Penyimpanan atau proses masih berjalan. Tunggu sampai selesai sebelum menutup tab atau keluar.");
    return false;
  }
  const dirty = targets.filter(isTabDirty);
  return !dirty.length || window.confirm(`Ada perubahan yang belum disimpan pada ${dirty.map(titleFor).join(", ")}. Lanjutkan? Draft pada tab yang ditutup akan hilang.`);
}
export async function discardDraftsAndRun(ids: string[], operation: () => Promise<unknown>) {
  if (!confirmDraftDiscard(ids)) return false;
  const added = ids.filter(id => !approved.has(id));
  added.forEach(id => approved.add(id));
  try { return await operation(); }
  finally { added.forEach(id => approved.delete(id)); }
}
export function beginDraftSave(id: string) {
  const ticket: SaveTicket = { submitted: [...(drafts.get(id)?.values() || [])].map(entry => ({ entry, state: formState(entry.state()) })) };
  if (!tickets.has(id)) tickets.set(id, new Set());
  tickets.get(id)!.add(ticket);
  saving.set(id, (saving.get(id) || 0) + 1);
  publishDrafts();
  let finished = false;
  return (success: boolean) => {
    if (finished) return;
    finished = true;
    if (success) for (const item of ticket.submitted) item.entry.saved = item.state;
    tickets.get(id)?.delete(ticket);
    if (!tickets.get(id)?.size) tickets.delete(id);
    const remaining = (saving.get(id) || 1) - 1;
    if (remaining) saving.set(id, remaining); else saving.delete(id);
    publishDrafts();
  };
}
/** Called immediately before the actual mutation, after asynchronous validation. */
export function checkpointDraftSave(id: string) {
  for (const ticket of tickets.get(id) || []) ticket.submitted = [...(drafts.get(id)?.values() || [])].map(entry => ({ entry, state: formState(entry.state()) }));
}
export function clearDrafts() { drafts.clear(); saving.clear(); tickets.clear(); approved.clear(); publishDrafts(); }

export function installDraftBrowserHooks(notify: (message: string) => void) {
  let attached = false, hidden = document.visibilityState === "hidden";
  const unload = (event: BeforeUnloadEvent) => {
    if (!protectedTabIds().length) return;
    event.preventDefault(); event.returnValue = "";
  };
  const sync = () => {
    const needed = protectedTabIds().length > 0;
    if (needed === attached) return;
    attached = needed;
    if (needed) window.addEventListener("beforeunload", unload);
    else window.removeEventListener("beforeunload", unload);
  };
  const visibility = () => {
    if (document.visibilityState === "hidden") hidden = true;
    else if (hidden) {
      hidden = false;
      if (protectedTabIds().some(isTabDirty)) notify("Ada perubahan yang belum disimpan. Kembali ke tab form untuk menyimpan perubahan Anda.");
    }
  };
  listeners.add(sync); sync();
  document.addEventListener("visibilitychange", visibility);
  return () => {
    listeners.delete(sync);
    window.removeEventListener("beforeunload", unload);
    document.removeEventListener("visibilitychange", visibility);
  };
}
