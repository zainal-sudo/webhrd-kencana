/** Typed internal keys: SQL NULL, empty string and any literal string never collide. */
export const filterKey = (value: string | number | null): string => JSON.stringify(value === null ? null : String(value));
export function filterLabel(key: string): string {
  const value: string | null = JSON.parse(key);
  return value === null ? "(NULL / tidak tersedia)" : value === "" ? "(String kosong)" : value;
}

/** Keep normal values on the legacy wire protocol; explicit flags are opt-in. */
export function columnFilterParams(column: string, keys: string[]): Record<string, unknown> {
  const values = keys.map(key => JSON.parse(key) as string | null);
  const normal = values.filter((value): value is string => value !== null && value !== "");
  return {
    ...(normal.length ? { [`filterSet_${column}`]: normal } : {}),
    ...(values.includes(null) ? { [`filterNull_${column}`]: "1" } : {}),
    ...(values.includes("") ? { [`filterEmpty_${column}`]: "1" } : {}),
  };
}
