import { app } from 'electron';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { multiInstanceStatus, robloxIsRunning, startMultiInstance, stopMultiInstance } from './multiInstance';

let failures = 0;
const OUT = process.env.MULTI_TEST_OUT ?? path.join(os.tmpdir(), 'multi-test-result.txt');
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
  stopMultiInstance();
  finish();
});

setTimeout(() => {
  log('WATCHDOG: did not finish in time');
  failures++;
  stopMultiInstance();
  finish();
}, 70_000);

function mutexState(name: string) {
  const script = `try { $h = [System.Threading.Mutex]::OpenExisting('${name}'); $h.Close(); 'held' } catch { 'free' }`;
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true
    }).trim();
  } catch {
    return 'error';
  }
}

function canClaim(name: string) {
  const script = `try { $c=$false; $m = New-Object System.Threading.Mutex($true,'${name}',[ref]$c); $m.Close(); 'yes' } catch { 'no' }`;
  try {
    return (
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        windowsHide: true
      }).trim() === 'yes'
    );
  } catch {
    return false;
  }
}

const SINGLETON = 'ROBLOX_singletonEvent';
const ROBLOX_OWN = 'ROBLOX_singletonMutex';

app.whenReady().then(async () => {
  check('idle status reports disabled', multiInstanceStatus().enabled, false);
  check('platform supported', multiInstanceStatus().supported, process.platform === 'win32');

  const clientRunning = robloxIsRunning();
  const robloxOwnBefore = mutexState(ROBLOX_OWN);
  const claimable = canClaim(SINGLETON);
  const mutexStateBefore = mutexState(SINGLETON);
  log(
    `baseline: roblox running=${clientRunning} name claimable=${claimable} ${SINGLETON}=${mutexState(SINGLETON)} ${ROBLOX_OWN}=${robloxOwnBefore}`
  );

  if (clientRunning) {
    check('status stays disabled while a client is open', multiInstanceStatus().enabled, false);
    check('a running client is reported as a blocker', multiInstanceStatus().robloxRunning, true);
    log('SKIPPED: a Roblox client is open. Turning multi instance on would close it, so the live claim is skipped.');
    log('note: close every Roblox client and rerun for the success path');
    finish();
    return;
  }

  const started = await startMultiInstance();

  if (!claimable) {
    check('refuses when the name is not free', started.enabled, false);
    check('explains why', Boolean(started.error), true);
    check(`${ROBLOX_OWN} is never touched`, mutexState(ROBLOX_OWN), robloxOwnBefore);
    log('note: another process owns the singleton name, free it and rerun for the success path');
    finish();
    return;
  }

  check('start reports enabled', started.enabled, true);
  check('start reports no error', started.error, null);
  check(`${SINGLETON} is held while on`, mutexState(SINGLETON), 'held');
  check(`${ROBLOX_OWN} is left alone`, mutexState(ROBLOX_OWN), robloxOwnBefore);

  const second = await startMultiInstance();
  check('starting twice is a no-op', second.enabled, true);

  const stopped = stopMultiInstance();
  check('stop reports disabled', stopped.enabled, false);

  const heldByOtherAtStart = mutexStateBefore === 'held';

  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (heldByOtherAtStart) {
    log('note: another process already held the name, release is not observable here');
  } else {
    check(`${SINGLETON} released after stop`, mutexState(SINGLETON), 'free');
  }
  check(`${ROBLOX_OWN} still untouched`, mutexState(ROBLOX_OWN), robloxOwnBefore);

  const restarted = await startMultiInstance();
  check('can start again after stopping', restarted.enabled, true);
  stopMultiInstance();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  if (!heldByOtherAtStart) check(`${SINGLETON} released again`, mutexState(SINGLETON), 'free');

  finish();
});
