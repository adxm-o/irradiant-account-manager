export const MIN_COOKIE_LENGTH = 50;
export const COOKIE_PREFIX = '_|WARNING:-DO-NOT-SHARE-THIS';

export function normalizeCookie(raw: string) {
  return (raw ?? '')
    .replace(/^\s*\.?ROBLOSECURITY\s*=\s*/i, '')
    .replace(/;\s*$/, '')
    .replace(/\s+/g, '')
    .trim();
}

export function cookieProblem(raw: string): string | null {
  const cookie = normalizeCookie(raw);
  if (!cookie) return 'Paste your .ROBLOSECURITY cookie to continue';
  if (/^[\w.-]{3,20}$/.test(cookie) && !cookie.includes('|')) {
    return 'That looks like a username. Paste the .ROBLOSECURITY cookie value instead.';
  }
  if (cookie.length < MIN_COOKIE_LENGTH) {
    return `That is only ${cookie.length} characters. A real cookie is several hundred.`;
  }
  return null;
}

export function cookieWarning(raw: string): string | null {
  const cookie = normalizeCookie(raw);
  if (!cookie || cookieProblem(raw)) return null;
  if (!cookie.startsWith(COOKIE_PREFIX)) {
    return `Most cookies start with ${COOKIE_PREFIX}. Irradiant will still ask Roblox to check this one.`;
  }
  return null;
}
