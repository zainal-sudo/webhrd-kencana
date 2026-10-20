export const AGENDA_LOGIN_MARKER_KEY = "kencana_agenda_login_marker";
const code = (value: string) => value.trim().toLowerCase();
interface LoginMarker { account: string; nonce: string }

/** Only successful explicit login creates a marker. Restoring a profile must not. */
export function markAgendaLogin(account: string): void {
  try {
    const nonce = typeof crypto.randomUUID === "function" ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem(AGENDA_LOGIN_MARKER_KEY, JSON.stringify({ account: code(account), nonce }));
  } catch { /* Restricted storage must not prevent login; skip this optional reminder. */ }
}
export function readAgendaLoginMarker(account: string): LoginMarker | null {
  try {
    const marker = JSON.parse(sessionStorage.getItem(AGENDA_LOGIN_MARKER_KEY) || "null");
    return marker && marker.account === code(account) && typeof marker.nonce === "string" && marker.nonce.length >= 16 ? marker : null;
  } catch { return null; }
}
export function clearAgendaLoginMarker(): void {
  try { sessionStorage.removeItem(AGENDA_LOGIN_MARKER_KEY); } catch { /* Optional UI state. */ }
}
export function consumeAgendaLoginMarker(account: string, nonce: string): boolean {
  try {
    if (readAgendaLoginMarker(account)?.nonce !== nonce) return false;
    sessionStorage.removeItem(AGENDA_LOGIN_MARKER_KEY);
    return sessionStorage.getItem(AGENDA_LOGIN_MARKER_KEY) === null;
  } catch { return false; }
}
