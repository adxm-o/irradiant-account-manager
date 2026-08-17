import { execFileSync, spawn, type ChildProcess } from 'node:child_process';

export type Blocker = { name: string; pid: number; label: string };

export type MultiInstanceStatus = {
  supported: boolean;
  enabled: boolean;
  error: string | null;
  robloxRunning: boolean;
  blockers: Blocker[];
};

const BLOCKER_LABELS: Record<string, string> = {
  'robloxplayerbeta.exe': 'Roblox client',
  'robloxstudiobeta.exe': 'Roblox Studio',
  'studiomcp.exe': 'Roblox Studio helper',
  'robloxcrashhandler.exe': 'Roblox crash handler',
  'bloxstrap.exe': 'Bloxstrap',
  'fishstrap.exe': 'Fishstrap',
  'multibloxy.exe': 'MultiBloxy',
  'real.exe': 'Real',
  'solara.exe': 'Solara',
  'xeno.exe': 'Xeno',
  'wave.exe': 'Wave',
  'delta.exe': 'Delta',
  'swift.exe': 'Swift',
  'krnl.exe': 'KRNL'
};

// roblox makes an Event with this name and quits if its already there. we grab the name first with a
// mutex, different object type, same name, so the client cant claim it and just carries on launching.
// has to live in a seperate process or the handle goes with whatever made it
const SINGLETON_NAME = 'ROBLOX_singletonEvent';

const HOLDER_TAG = 'IrradiantAccountsSingletonHolder';

const holderScript = (parentPid: number) => `
# ${HOLDER_TAG}
$ErrorActionPreference = 'Stop'
try {
  $created = $false
  $global:singleton = New-Object System.Threading.Mutex($true, '${SINGLETON_NAME}', [ref]$created)
  Write-Output 'READY'
} catch {
  Write-Output ('FAILED ' + $_.Exception.Message)
  exit 1
}
while ($true) {
  Start-Sleep -Seconds 2
  if (-not (Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue)) { exit 0 }
}
`;

export function reapOrphanHolders() {
  if (!supported()) return 0;
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*${HOLDER_TAG}*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }`
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 10_000 }
    );
    cache = null;
    return output.split(/\r?\n/).filter((line) => /^\d+$/.test(line.trim())).length;
  } catch {
    return 0;
  }
}

const SIBLING_TAG = 'IrradiantSingletonHolder';

function siblingHoldsIt() {
  if (!supported()) return false;
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*${SIBLING_TAG}*' }).Count`
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 10_000 }
    );
    return Number(output.trim()) > 0;
  } catch {
    return false;
  }
}

let child: ChildProcess | null = null;
let lastError: string | null = null;

const supported = () => process.platform === 'win32';

const CACHE_TTL = 1500;
let cache: { at: number; value: Blocker[] } | null = null;

export function listBlockers(force = false): Blocker[] {
  if (!supported()) return [];
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) return cache.value;

  const blockers: Blocker[] = [];
  try {
    const output = execFileSync('tasklist.exe', ['/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 16 * 1024 * 1024
    });
    for (const line of output.split(/\r?\n/)) {
      const match = /^"([^"]+)","(\d+)"/.exec(line);
      if (!match) continue;
      const label = BLOCKER_LABELS[match[1].toLowerCase()];
      if (label) blockers.push({ name: match[1], pid: Number(match[2]), label });
    }
  } catch {
    return cache?.value ?? [];
  }

  cache = { at: Date.now(), value: blockers };
  return blockers;
}

export function closeBlockers(): { closed: number; failed: string[] } {
  const failed: string[] = [];
  const targets = listBlockers(true);
  if (targets.length === 0) return { closed: 0, failed };

  try {
    const args: string[] = [];
    for (const blocker of targets) args.push('/PID', String(blocker.pid));
    execFileSync('taskkill.exe', [...args, '/F', '/T'], { windowsHide: true, timeout: 10_000 });
  } catch {
    for (const blocker of targets) {
      try {
        execFileSync('taskkill.exe', ['/PID', String(blocker.pid), '/F'], { windowsHide: true, timeout: 6000 });
      } catch {
        failed.push(blocker.name);
      }
    }
  }

  cache = null;
  return { closed: targets.length - failed.length, failed };
}

export function robloxIsRunning() {
  if (!supported()) return false;
  try {
    const output = execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq RobloxPlayerBeta.exe', '/NH'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000
    });
    return output.toLowerCase().includes('robloxplayerbeta.exe');
  } catch {
    return false;
  }
}

export function multiInstanceStatus(): MultiInstanceStatus {
  const blockers = Boolean(child) && !child?.killed ? [] : listBlockers();
  return {
    supported: supported(),
    enabled: Boolean(child) && !child?.killed,
    error: lastError,
    robloxRunning: blockers.some((item) => item.name.toLowerCase() === 'robloxplayerbeta.exe'),
    blockers
  };
}

function blockerSentence() {
  const blockers = listBlockers();
  if (blockers.length === 0) {
    if (siblingHoldsIt()) {
      return 'The main Irradiant app already has multi instance on. Turn it off there, then try again.';
    }
    return 'Something else already owns the Roblox launch handle. A reboot clears it if nothing obvious is running.';
  }
  const listed = blockers.map((item) => `${item.label} (${item.name})`).join(', ');
  return `${listed} still running. Close it and try again.`;
}

export function stopMultiInstance(): MultiInstanceStatus {
  if (child) {
    const active = child;
    child = null;
    try {
      active.kill();
    } catch {
      lastError = 'Could not release the Roblox singleton';
    }
  }
  return multiInstanceStatus();
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startMultiInstance(): Promise<MultiInstanceStatus> {
  if (!supported()) {
    lastError = 'Multi instance is a Windows feature';
    return multiInstanceStatus();
  }
  if (child && !child.killed) return multiInstanceStatus();

  lastError = null;
  reapOrphanHolders();

  for (let attempt = 0; attempt < 3; attempt++) {
    if (listBlockers(true).length > 0) {
      closeBlockers();
      for (let wait = 0; wait < 10; wait++) {
        await delay(150);
        if (listBlockers(true).length === 0) break;
      }
    }

    const status = await claimSingleton();
    if (status.enabled) return status;

    const clashed = Boolean(lastError) && listBlockers(true).length > 0;
    if (!clashed) return status;
  }

  lastError = blockerSentence();
  return multiInstanceStatus();
}

function claimSingleton(): Promise<MultiInstanceStatus> {
  return new Promise((resolve) => {
    let own: ChildProcess | null = null;
    try {
      child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          holderScript(process.pid)
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (error) {
      lastError = `Could not start the holder: ${String(error)}`;
      child = null;
      resolve(multiInstanceStatus());
      return;
    }

    own = child;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve(multiInstanceStatus());
    };

    own.stdout?.on('data', (chunk: Buffer) => {
      if (child !== own) return;
      const line = chunk.toString('utf8').trim();
      if (line.startsWith('READY')) {
        settle();
        return;
      }
      if (line.startsWith('FAILED')) {
        const detail = line.replace('FAILED', '').trim();
        const clash = /different type|cannot be created|already exists/i.test(detail);
        lastError = clash ? blockerSentence() : detail || 'Windows refused the launch handle';
        stopMultiInstance();
        settle();
      }
    });

    own.on('error', (error) => {
      if (child !== own) return;
      lastError = error.message;
      child = null;
      settle();
    });

    own.on('exit', (code) => {
      if (child !== own) return;
      child = null;
      if (code !== 0 && code !== null) lastError = `The holder stopped with code ${code}`;
      settle();
    });

    setTimeout(() => {
      if (!settled && child === own) lastError = 'The holder did not report back in time';
      settle();
    }, 8000);
  });
}
