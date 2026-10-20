export const AGENDA_CLIENT_ID_KEY = "kencana_agenda_client_id";
const valid = (value: string | null): value is string => value !== null && /^[a-z0-9][a-z0-9_-]{15,63}$/i.test(value);

/** Browser-profile key only; not an account identifier or authentication credential. */
export async function getAgendaClientId(): Promise<string> {
  function storedId() {
    const existing = localStorage.getItem(AGENDA_CLIENT_ID_KEY);
    if (valid(existing)) return existing.toLowerCase();
    const generated = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
    // Re-read before writing in case another tab initialized this profile meanwhile.
    const concurrent = localStorage.getItem(AGENDA_CLIENT_ID_KEY);
    if (valid(concurrent)) return concurrent.toLowerCase();
    localStorage.setItem(AGENDA_CLIENT_ID_KEY, generated);
    const saved = localStorage.getItem(AGENDA_CLIENT_ID_KEY);
    if (!valid(saved)) throw new Error("ID browser agenda tidak dapat disimpan.");
    return saved.toLowerCase();
  }
  // Serialize first-time creation across tabs when Web Locks is available.
  // Do not fall back to an ephemeral ID if persistent storage is unavailable.
  return navigator.locks ? navigator.locks.request(AGENDA_CLIENT_ID_KEY, storedId) : storedId();
}
