import { app, safeStorage } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AccountDraft,
  AccountEdit,
  RobloxAccount,
  RobloxProfile,
  VaultMode,
  VaultResult,
  VaultStatus
} from '../shared/types';

type StoredAccount = RobloxAccount & { secret: string };

type VaultFile = {
  version: number;
  mode: VaultMode;
  kdf: { salt: string; N: number; r: number; p: number } | null;
  wrappedKey: string | null;
  iv: string;
  data: string;
  tag: string;
};

const VERSION = 1;
const SCRYPT = { N: 32768, r: 8, p: 1 };
const KEY_BYTES = 32;
const IV_BYTES = 12;

let key: Buffer | null = null;
let accounts: StoredAccount[] = [];
let mode: VaultMode | null = null;
// kdf has to stick around after unlock, every save re-derives off the same salt or the file wont open again
let kdf: VaultFile['kdf'] = null;

const vaultPath = () => path.join(app.getPath('userData'), 'accounts.vault');

const uid = () => crypto.randomBytes(8).toString('hex');

function deviceEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function readFile(): VaultFile | null {
  try {
    const raw = fs.readFileSync(vaultPath(), 'utf8');
    const parsed = JSON.parse(raw) as VaultFile;
    if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function deriveKey(password: string, salt: Buffer) {
  return crypto.scryptSync(password, salt, KEY_BYTES, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 256 * 1024 * 1024
  });
}

function encryptVault(): VaultResult {
  if (!key || !mode) return { ok: false, reason: 'Vault is locked' };
  if (mode === 'password' && !kdf) return { ok: false, reason: 'The vault is missing its key settings' };
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(accounts), 'utf8'), cipher.final()]);

  let wrappedKey: string | null = null;
  if (mode === 'device') {
    if (!deviceEncryptionAvailable()) return { ok: false, reason: 'This device cannot store the key securely' };
    wrappedKey = safeStorage.encryptString(key.toString('base64')).toString('base64');
  }

  const file: VaultFile = {
    version: VERSION,
    mode,
    kdf: mode === 'password' ? kdf : null,
    wrappedKey,
    iv: iv.toString('base64'),
    data: payload.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };

  try {
    fs.mkdirSync(path.dirname(vaultPath()), { recursive: true });
    fs.writeFileSync(vaultPath(), JSON.stringify(file, null, 2), { encoding: 'utf8', mode: 0o600 });
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, reason: `Could not write the vault: ${String(error)}` };
  }
}

function decryptWith(file: VaultFile, candidate: Buffer): StoredAccount[] | null {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', candidate, Buffer.from(file.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(file.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(file.data, 'base64')), decipher.final()]);
    const parsed = JSON.parse(plain.toString('utf8'));
    return Array.isArray(parsed) ? (parsed as StoredAccount[]) : null;
  } catch {
    return null;
  }
}

function redact(account: StoredAccount): RobloxAccount {
  const { secret, ...rest } = account;
  return { ...rest, placeId: rest.placeId ?? '', secretHint: secret ? `${secret.length} characters stored` : 'empty' };
}

export function vaultStatus(): VaultStatus {
  const file = readFile();
  return {
    exists: Boolean(file),
    unlocked: Boolean(key),
    mode: mode ?? file?.mode ?? null,
    count: key ? accounts.length : 0,
    deviceEncryptionAvailable: deviceEncryptionAvailable(),
    path: vaultPath()
  };
}

export function createVault(nextMode: VaultMode, password: string): VaultResult<VaultStatus> {
  if (readFile()) return { ok: false, reason: 'A vault already exists on this machine' };

  accounts = [];

  if (nextMode === 'password') {
    if (password.length < 8) return { ok: false, reason: 'Use at least 8 characters' };
    const salt = crypto.randomBytes(16);
    kdf = { salt: salt.toString('base64'), ...SCRYPT };
    key = deriveKey(password, salt);
    mode = 'password';
  } else {
    if (!deviceEncryptionAvailable()) return { ok: false, reason: 'This device cannot store the key securely' };
    kdf = null;
    key = crypto.randomBytes(KEY_BYTES);
    mode = 'device';
  }

  const written = encryptVault();
  if (!written.ok) return written;
  return { ok: true, data: vaultStatus() };
}

export function unlockVault(password: string): VaultResult<VaultStatus> {
  const file = readFile();
  if (!file) return { ok: false, reason: 'No vault on this machine yet' };

  if (file.mode === 'device') {
    if (!file.wrappedKey) return { ok: false, reason: 'The stored key is missing' };
    try {
      const unwrapped = safeStorage.decryptString(Buffer.from(file.wrappedKey, 'base64'));
      const candidate = Buffer.from(unwrapped, 'base64');
      const loaded = decryptWith(file, candidate);
      if (!loaded) return { ok: false, reason: 'The vault could not be decrypted on this device' };
      key = candidate;
      mode = 'device';
      kdf = null;
      accounts = loaded;
      return { ok: true, data: vaultStatus() };
    } catch {
      return { ok: false, reason: 'This vault belongs to a different Windows user or machine' };
    }
  }

  if (!file.kdf) return { ok: false, reason: 'The vault is missing its key settings' };
  const candidate = deriveKey(password, Buffer.from(file.kdf.salt, 'base64'));
  const loaded = decryptWith(file, candidate);
  if (!loaded) return { ok: false, reason: 'Wrong master password' };
  key = candidate;
  mode = 'password';
  kdf = file.kdf;
  accounts = loaded;
  return { ok: true, data: vaultStatus() };
}

export function lockVault(): VaultStatus {
  if (key) key.fill(0);
  key = null;
  accounts = [];
  mode = null;
  kdf = null;
  return vaultStatus();
}

export function listAccounts(): VaultResult<RobloxAccount[]> {
  if (!key) return { ok: false, reason: 'Vault is locked' };
  return { ok: true, data: accounts.map(redact) };
}

export function addAccount(draft: AccountDraft, profile: RobloxProfile): VaultResult<RobloxAccount[]> {
  if (!key) return { ok: false, reason: 'Vault is locked' };
  if (!draft.secret) return { ok: false, reason: 'A cookie is required' };
  if (accounts.some((item) => item.userId === profile.userId)) {
    return { ok: false, reason: `${profile.username} is already in the vault` };
  }

  const now = Date.now();
  accounts.push({
    id: uid(),
    alias: (draft.alias ?? '').trim() || profile.username,
    username: profile.username,
    userId: profile.userId,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    note: (draft.note ?? '').trim(),
    group: (draft.group ?? '').trim(),
    placeId: (draft.placeId ?? '').trim(),
    addedAt: now,
    updatedAt: now,
    refreshedAt: now,
    secretHint: '',
    secret: draft.secret
  });

  const written = encryptVault();
  if (!written.ok) return written;
  return listAccounts();
}

export function updateAccount(id: string, patch: AccountEdit, profile?: RobloxProfile): VaultResult<RobloxAccount[]> {
  if (!key) return { ok: false, reason: 'Vault is locked' };
  const account = accounts.find((item) => item.id === id);
  if (!account) return { ok: false, reason: 'That account is no longer in the vault' };

  if (patch.alias !== undefined) account.alias = patch.alias.trim() || account.username;
  if (patch.note !== undefined) account.note = patch.note.trim();
  if (patch.group !== undefined) account.group = patch.group.trim();
  if (patch.placeId !== undefined) account.placeId = patch.placeId.trim();
  if (patch.secret) account.secret = patch.secret;

  if (profile) {
    const clash = accounts.find((item) => item.id !== id && item.userId === profile.userId);
    if (clash) return { ok: false, reason: `${profile.username} is already stored as ${clash.alias}` };
    account.username = profile.username;
    account.userId = profile.userId;
    account.displayName = profile.displayName;
    account.avatarUrl = profile.avatarUrl;
    account.refreshedAt = Date.now();
  }

  account.updatedAt = Date.now();

  const written = encryptVault();
  if (!written.ok) return written;
  return listAccounts();
}

export function removeAccount(id: string): VaultResult<RobloxAccount[]> {
  if (!key) return { ok: false, reason: 'Vault is locked' };
  const next = accounts.filter((item) => item.id !== id);
  if (next.length === accounts.length) return { ok: false, reason: 'That account is no longer in the vault' };
  accounts = next;
  const written = encryptVault();
  if (!written.ok) return written;
  return listAccounts();
}

export function revealSecret(id: string): VaultResult<{ secret: string }> {
  if (!key) return { ok: false, reason: 'Vault is locked' };
  const account = accounts.find((item) => item.id === id);
  if (!account) return { ok: false, reason: 'That account is no longer in the vault' };
  return { ok: true, data: { secret: account.secret } };
}

export function changeProtection(nextMode: VaultMode, password: string): VaultResult<VaultStatus> {
  if (!key) return { ok: false, reason: 'Unlock the vault first' };

  if (nextMode === 'password') {
    if (password.length < 8) return { ok: false, reason: 'Use at least 8 characters' };
    const salt = crypto.randomBytes(16);
    kdf = { salt: salt.toString('base64'), ...SCRYPT };
    key = deriveKey(password, salt);
    mode = 'password';
  } else {
    if (!deviceEncryptionAvailable()) return { ok: false, reason: 'This device cannot store the key securely' };
    kdf = null;
    key = crypto.randomBytes(KEY_BYTES);
    mode = 'device';
  }

  const written = encryptVault();
  if (!written.ok) return written;
  return { ok: true, data: vaultStatus() };
}

export function destroyVault(): VaultResult<VaultStatus> {
  lockVault();
  try {
    if (fs.existsSync(vaultPath())) fs.rmSync(vaultPath());
  } catch (error) {
    return { ok: false, reason: `Could not remove the vault: ${String(error)}` };
  }
  return { ok: true, data: vaultStatus() };
}
