/** Typed internal keys: SQL NULL, empty string and any literal string never collide. */
export const filterKey = (value: string | number | null): string => JSON.stringify(value === null ? null : String(value));

function parseFilterKey(key: string): string | null {
  try {
    return JSON.parse(key) as string | null;
  } catch {
    // Legacy / externally supplied raw value: treat it literally instead of
    // throwing while building request params (which surfaced as a "network error").
    return key;
  }
}

export function filterLabel(key: string): string {
  const value = parseFilterKey(key);
  return value === null ? "(NULL / tidak tersedia)" : value === "" ? "(String kosong)" : value;
}

/** Keep normal values on the legacy wire protocol; explicit flags are opt-in. */
export function columnFilterParams(column: string, keys: string[]): Record<string, unknown> {
  const values = keys.map(parseFilterKey);
  const normal = values.filter((value): value is string => value !== null && value !== "");
  return {
    ...(normal.length ? { [`filterSet_${column}`]: normal } : {}),
    ...(values.includes(null) ? { [`filterNull_${column}`]: "1" } : {}),
    ...(values.includes("") ? { [`filterEmpty_${column}`]: "1" } : {}),
  };
}

/**
 * Inverse protocol: send only the values the user hid. When a popup hides one
 * or two choices out of a long list, inclusion would put every other value in
 * the URL, exceeding the server header limit and killing the request.
 * NULL rows stay visible unless Blank itself was hidden; hiding Blank on a
 * string column excludes both NULL and empty strings (they share one choice).
 */
export function columnExcludeParams(column: string, keys: string[]): Record<string, unknown> {
  const values = keys.map(parseFilterKey);
  const normal = values.filter((value): value is string => value !== null && value !== "");
  return {
    ...(normal.length ? { [`filterNotSet_${column}`]: normal } : {}),
    ...(values.includes(null) ? { [`filterNotNull_${column}`]: "1" } : {}),
    ...(values.includes("") ? { [`filterNotEmpty_${column}`]: "1" } : {}),
  };
}

/** One popup choice for NULL/empty strings; numeric/date empties are not valid choices. */
export function combineBlankKeys(keys: string[], valueType: "string" | "number" | "date" = "string"): string[] {
  return [...new Set(keys.flatMap((key) => {
    const value = parseFilterKey(key);
    if (value === "" && valueType !== "string") return [];
    return [value === "" ? filterKey(null) : key];
  }))];
}

/** Expand the single Blank choice back onto the existing typed wire protocol. */
export function expandBlankKeys(keys: string[], valueType: "string" | "number" | "date" = "string"): string[] {
  return [...new Set(keys.flatMap((key) =>
    key === filterKey(null) && valueType === "string" ? [key, filterKey("")] : [key],
  ))];
}
