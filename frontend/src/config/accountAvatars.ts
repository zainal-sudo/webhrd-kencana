/** Add normalized account codes here to override the automatic avatar choice. */
export const ACCOUNT_AVATARS: Readonly<Record<string, number>> = {
  hrd: 2,
  super: 12,
  p1: 1,
  p2: 7,
  p4: 9,
};

export const AVATAR_COUNT = 12;

export function accountAvatarNumber(username: string): number | null {
  const code = username.trim().toLowerCase();
  if (!code) return null;
  if (Object.prototype.hasOwnProperty.call(ACCOUNT_AVATARS, code)) return ACCOUNT_AVATARS[code];
  // FNV-1a gives new accounts a stable choice without storage or external requests.
  let hash = 2166136261;
  for (const character of code) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % AVATAR_COUNT + 1;
}
