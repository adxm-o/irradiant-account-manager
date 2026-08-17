import { shell } from 'electron';
import { normalizeCookie } from '../shared/cookie';
import type { VaultResult } from '../shared/types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TICKET_URL = 'https://auth.roblox.com/v1/authentication-ticket/';
const PLACE_LAUNCHER = 'https://assetgame.roblox.com/game/PlaceLauncher.ashx';

function ticketRequest(cookie: string, csrfToken: string | null) {
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Referer: 'https://www.roblox.com/',
    Origin: 'https://www.roblox.com',
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Cookie: `.ROBLOSECURITY=${cookie}`
  };
  if (csrfToken) headers['X-CSRF-TOKEN'] = csrfToken;
  return fetch(TICKET_URL, { method: 'POST', headers, body: '', signal: AbortSignal.timeout(15_000) });
}

async function fetchTicket(cookie: string): Promise<VaultResult<string>> {
  let response: Response;
  try {
    response = await ticketRequest(cookie, null);
  } catch {
    return { ok: false, reason: 'Could not reach Roblox to start the session' };
  }

  if (response.status === 403) {
    const token = response.headers.get('x-csrf-token');
    if (!token) return { ok: false, reason: 'Roblox refused the request and sent no CSRF token' };
    try {
      response = await ticketRequest(cookie, token);
    } catch {
      return { ok: false, reason: 'Could not reach Roblox to start the session' };
    }
  }

  if (response.status === 401) {
    return { ok: false, reason: 'Roblox rejected the cookie. Refresh this account and try again.' };
  }
  if (response.status === 429) {
    return { ok: false, reason: 'Roblox is rate limiting launches. Wait a minute and try again.' };
  }
  if (!response.ok) {
    return { ok: false, reason: `Roblox returned ${response.status} when starting the session` };
  }

  const ticket = response.headers.get('rbx-authentication-ticket');
  if (!ticket) return { ok: false, reason: 'Roblox did not return a launch ticket' };
  return { ok: true, data: ticket };
}

// key:value pairs glued with +, so the launcher url has to be encoded, it has ? and & in it
export function buildUri(ticket: string, placeId: string) {
  const parts = ['roblox-player:1'];
  const tracker = Math.floor(Math.random() * 1e11) + 1e11;

  if (placeId) {
    const placeLauncherUrl = `${PLACE_LAUNCHER}?request=RequestGame&browserTrackerId=${tracker}&placeId=${placeId}&isPlayTogetherGame=false`;
    parts.push('launchmode:play');
    parts.push(`gameinfo:${ticket}`);
    parts.push(`launchtime:${Date.now()}`);
    parts.push(`placelauncherurl:${encodeURIComponent(placeLauncherUrl)}`);
  } else {
    parts.push('launchmode:app');
    parts.push(`gameinfo:${ticket}`);
    parts.push(`launchtime:${Date.now()}`);
  }

  parts.push(`browsertrackerid:${tracker}`);
  parts.push('robloxLocale:en_us');
  parts.push('gameLocale:en_us');
  parts.push('channel:');

  return parts.join('+');
}

export async function launchAccount(rawCookie: string, placeId: string): Promise<VaultResult<{ placeId: string }>> {
  const cookie = normalizeCookie(rawCookie);
  if (!cookie) return { ok: false, reason: 'This account has no cookie stored' };

  const cleanPlace = (placeId ?? '').trim();
  if (cleanPlace && !/^\d+$/.test(cleanPlace)) {
    return { ok: false, reason: 'A place id is all digits, for example 606849621' };
  }

  const ticket = await fetchTicket(cookie);
  if (!ticket.ok) return ticket;

  try {
    await shell.openExternal(buildUri(ticket.data, cleanPlace));
  } catch {
    return { ok: false, reason: 'Windows could not hand the launch to Roblox. Is the Roblox player installed?' };
  }

  return { ok: true, data: { placeId: cleanPlace } };
}
