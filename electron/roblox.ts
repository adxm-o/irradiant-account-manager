import { cookieProblem, normalizeCookie } from '../shared/cookie';
import type { RobloxProfile, VaultResult } from '../shared/types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const AUTH_HOST = 'https://users.roblox.com';
const THUMB_HOST = 'https://thumbnails.roblox.com';

export { normalizeCookie };

async function headshot(userId: number): Promise<string | null> {
  try {
    const response = await fetch(
      `${THUMB_HOST}/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: { imageUrl?: string }[] };
    return payload?.data?.[0]?.imageUrl ?? null;
  } catch {
    return null;
  }
}

export async function resolveFromCookie(rawCookie: string): Promise<VaultResult<RobloxProfile>> {
  const problem = cookieProblem(rawCookie);
  if (problem) return { ok: false, reason: problem };
  const cookie = normalizeCookie(rawCookie);

  let response: Response;
  try {
    response = await fetch(`${AUTH_HOST}/v1/users/authenticated`, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Cookie: `.ROBLOSECURITY=${cookie}`
      },
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    return { ok: false, reason: 'Could not reach Roblox' };
  }

  if (response.status === 401) {
    return { ok: false, reason: 'Roblox rejected that cookie. It is expired, invalidated, or incomplete.' };
  }
  if (response.status === 429) {
    return { ok: false, reason: 'Roblox is rate limiting these checks. Try again in a minute.' };
  }
  if (!response.ok) {
    return { ok: false, reason: `Roblox returned ${response.status}` };
  }

  let profile: { id?: number; name?: string; displayName?: string };
  try {
    profile = (await response.json()) as typeof profile;
  } catch {
    return { ok: false, reason: 'Roblox sent an unreadable response' };
  }

  if (!profile?.id || !profile?.name) {
    return { ok: false, reason: 'Roblox did not return a profile for that cookie' };
  }

  return {
    ok: true,
    data: {
      userId: profile.id,
      username: profile.name,
      displayName: profile.displayName ?? null,
      avatarUrl: await headshot(profile.id)
    }
  };
}
