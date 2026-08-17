import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildUri, launchAccount } from './launch';

let failures = 0;
const OUT = process.env.LAUNCH_TEST_OUT ?? path.join(os.tmpdir(), 'launch-test-result.txt');
const lines: string[] = [];
const log = (line: string) => lines.push(line);

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    log(`FAIL ${label}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
  } else {
    log(`ok   ${label}`);
  }
}

function finish() {
  log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
  try {
    fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  } catch {
    failures++;
  }
  app.exit(failures === 0 ? 0 : 1);
}

process.on('uncaughtException', (error) => {
  log(`EXCEPTION ${String(error)}`);
  failures++;
  finish();
});

setTimeout(() => {
  log('WATCHDOG: did not finish in time');
  failures++;
  finish();
}, 80_000);

const FAKE_COOKIE = `_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you.|_${'A'.repeat(300)}`;

app.whenReady().then(async () => {
  const appUri = buildUri('TICKET123', '');
  const playUri = buildUri('TICKET123', '606849621');
  log(`app uri : ${appUri}`);
  log(`play uri: ${playUri.slice(0, 150)}...`);

  check('app uri scheme', appUri.startsWith('roblox-player:1+'), true);
  check('app uri uses app launchmode', appUri.includes('+launchmode:app+'), true);
  check('app uri carries the ticket', appUri.includes('gameinfo:TICKET123'), true);
  check('app uri has no place launcher', appUri.includes('placelauncherurl'), false);
  check('play uri uses play launchmode', playUri.includes('+launchmode:play+'), true);
  check('play uri carries the ticket', playUri.includes('gameinfo:TICKET123'), true);
  check('play uri encodes the launcher url', playUri.includes('placelauncherurl:https%3A%2F%2Fassetgame.roblox.com'), true);
  check('play uri carries the place id', decodeURIComponent(playUri).includes('placeId=606849621'), true);
  check('play uri requests a game', decodeURIComponent(playUri).includes('request=RequestGame'), true);
  check('uri has a launch time', /launchtime:\d{10,}/.test(appUri), true);

  const empty = await launchAccount('', '');
  check('empty cookie refused', !empty.ok && empty.reason, 'This account has no cookie stored');

  const badPlace = await launchAccount(FAKE_COOKIE, 'jailbreak');
  check('non numeric place refused', !badPlace.ok && badPlace.reason.startsWith('A place id is all digits'), true);

  const spacedPlace = await launchAccount(FAKE_COOKIE, '  606849621  ');
  check('padded place id accepted past validation', !spacedPlace.ok && !spacedPlace.reason.includes('place id'), true);

  const invalid = await launchAccount(FAKE_COOKIE, '');
  check('invalid cookie surfaces a clear reason', !invalid.ok && invalid.reason.includes('rejected the cookie'), true);
  check('invalid cookie never launches', invalid.ok, false);

  finish();
});
