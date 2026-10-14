/** Compare JSON form data without treating object property order as a change. */
export function sameFormState(left: unknown, right: unknown): boolean {
  const ordered = (_key: string, value: any) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value;
  return JSON.stringify(left, ordered) === JSON.stringify(right, ordered);
}
