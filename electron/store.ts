import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_SETTINGS,
  DEFAULT_WINDOW,
  MIN_WINDOW,
  SETTING_KEYS,
  type AppSettings,
  type PersistedState
} from '../shared/types';

const STATE_VERSION = 1;

function knownSettings(stored: Partial<AppSettings> | undefined): AppSettings {
  const next = { ...DEFAULT_SETTINGS };
  if (!stored) return next;
  for (const key of SETTING_KEYS) {
    if (typeof stored[key] === 'boolean') next[key] = stored[key] as boolean;
  }
  return next;
}

// minimised windows report 48x39 at -32000,-32000, dont let that get saved as the real size
function saneWindow(stored: Partial<PersistedState['window']> | undefined): PersistedState['window'] {
  const next = { ...DEFAULT_WINDOW, ...(stored ?? {}) } as PersistedState['window'];
  if (!(next.width >= MIN_WINDOW.width)) next.width = DEFAULT_WINDOW.width;
  if (!(next.height >= MIN_WINDOW.height)) next.height = DEFAULT_WINDOW.height;
  if (typeof next.x !== 'number' || typeof next.y !== 'number' || next.x < -20000 || next.y < -20000) {
    delete next.x;
    delete next.y;
  }
  return next;
}

const defaultState = (): PersistedState => ({
  version: STATE_VERSION,
  multiInstance: false,
  settings: { ...DEFAULT_SETTINGS },
  window: { ...DEFAULT_WINDOW }
});

let cache: PersistedState | null = null;
let writeTimer: NodeJS.Timeout | null = null;

const statePath = () => path.join(app.getPath('userData'), 'accounts-state.json');

export function readState(): PersistedState {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8')) as Partial<PersistedState>;
    cache = {
      version: STATE_VERSION,
      multiInstance: parsed.multiInstance === true,
      settings: knownSettings(parsed.settings),
      window: saneWindow(parsed.window)
    };
  } catch {
    cache = defaultState();
  }
  return cache;
}

export function writeState(next: Partial<PersistedState>) {
  cache = { ...readState(), ...next, version: STATE_VERSION };
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(flushState, 250);
}

export function flushState() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!cache) return;
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.error('[irradiant accounts] failed to persist state', error);
  }
}
