export const SITE_URL = 'https://irradiant.org';

export type RobloxAccount = {
  id: string;
  alias: string;
  username: string;
  userId: number;
  displayName: string | null;
  avatarUrl: string | null;
  note: string;
  group: string;
  placeId: string;
  addedAt: number;
  updatedAt: number;
  refreshedAt: number;
  secretHint: string;
};

export type AccountDraft = {
  alias?: string;
  secret: string;
  note?: string;
  group?: string;
  placeId?: string;
};

export type AccountEdit = {
  alias?: string;
  note?: string;
  group?: string;
  placeId?: string;
  secret?: string;
};

export type RobloxProfile = {
  userId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type VaultMode = 'password' | 'device';

export type VaultStatus = {
  exists: boolean;
  unlocked: boolean;
  mode: VaultMode | null;
  count: number;
  deviceEncryptionAvailable: boolean;
  path: string;
};

export type VaultResult<T = undefined> = { ok: true; data: T } | { ok: false; reason: string };

export type AppSettings = {
  closeToTray: boolean;
  trayClickOpensQuick: boolean;
  quickAlwaysOnTop: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  closeToTray: true,
  trayClickOpensQuick: true,
  quickAlwaysOnTop: true
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];

export type PersistedState = {
  version: number;
  multiInstance: boolean;
  settings: AppSettings;
  window: { width: number; height: number; x?: number; y?: number; maximized: boolean };
};

export const DEFAULT_WINDOW = { width: 820, height: 600, maximized: false };

export const MIN_WINDOW = { width: 660, height: 500 };
