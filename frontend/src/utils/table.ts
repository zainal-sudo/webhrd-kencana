/** Util sort & filter lokal untuk tabel laporan (data sudah di memori). */

export type SortDir = "asc" | "desc";

export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  const aNull = a === null || a === undefined || a === "";
  const bNull = b === null || b === undefined || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && a !== "" && b !== "") {
    return na - nb;
  }
  return String(a).localeCompare(String(b), "id", { numeric: true });
}

export function sortByKey<T>(
  rows: T[],
  key: string,
  dir: SortDir,
  pick: (row: T, key: string) => unknown
): T[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((ra, rb) => compareValues(pick(ra, key), pick(rb, key)) * mul);
}

export function filterByColumns<T>(
  rows: T[],
  filters: Record<string, string>,
  keys: string[],
  pick: (row: T, key: string) => unknown
): T[] {
  const active = keys.filter((k) => filters[k] && String(filters[k]).trim() !== "");
  if (active.length === 0) return rows;
  return rows.filter((r) =>
    active.every((k) => {
      const v = pick(r, k);
      if (v === null || v === undefined) return false;
      return String(v).toLowerCase().includes(String(filters[k]).trim().toLowerCase());
    })
  );
}

export function nextSort(
  currentKey: string | null,
  currentDir: SortDir | null,
  key: string
): { key: string | null; dir: SortDir | null } {
  if (currentKey !== key) return { key, dir: "asc" };
  if (currentDir === "asc") return { key, dir: "desc" };
  return { key: null, dir: null };
}

export function sortIconName(key: string, sortKey: string | null, dir: SortDir | null): string {
  if (sortKey !== key || !dir) return "unfold_more";
  return dir === "asc" ? "arrow_upward" : "arrow_downward";
}

export function filterByValueSets<T>(
  rows: T[],
  sets: Record<string, string[]>,
  keys: string[],
  pick: (row: T, key: string) => unknown
): T[] {
  const active = keys.filter(
    (k) => Array.isArray(sets[k]) && sets[k].length > 0
  );
  if (active.length === 0) return rows;
  return rows.filter((r) =>
    active.every((k) => {
      const v = pick(r, k);
      const s = v === null || v === undefined ? "" : String(v);
      return sets[k].includes(s);
    })
  );
}

export function distinctValues<T>(
  rows: T[],
  key: string,
  pick: (row: T, key: string) => unknown
): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = pick(r, key);
    if (v === null || v === undefined) continue;
    const s = String(v);
    if (s === "") continue;
    set.add(s);
  }
  return [...set].sort((a, b) =>
    a.localeCompare(b, "id", { numeric: true })
  );
}
