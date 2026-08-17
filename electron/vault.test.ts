import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as vault from './vault';

let failures = 0;
const OUT = process.env.VAULT_TEST_OUT ?? path.join(os.tmpdir(), 'vault-test-result.txt');
const lines: string[] = [];

const log = (line: string) => lines.push(line);
const flush = () => {
  try {
    fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  } catch {
    failures++;
  }
};

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
  flush();
  app.exit(failures === 0 ? 0 : 1);
}

process.on('uncaughtException', (error) => {
  log(`EXCEPTION ${String(error && (error as Error).stack ? (error as Error).stack : error)}`);
  failures++;
  finish();
});

setTimeout(() => {
  log('WATCHDOG: test did not finish in time');
  failures++;
  finish();
}, 90_000);

const SECRET = '_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you.|_TESTCOOKIE123456789';

app.whenReady().then(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'irradiant-vault-'));
  app.setPath('userData', tmp);

  log('--- password mode');
  check('create succeeds', vault.createVault('password', 'correct horse battery staple').ok, true);
  check('second create rejected', vault.createVault('password', 'another password').ok, false);

  const profile = { userId: 1, username: 'Roblox', displayName: 'Roblox', avatarUrl: 'https://tr.rbxcdn.com/x' };
  const added = vault.addAccount({ alias: 'main', secret: SECRET, note: 'test note', group: 'alts' }, profile);
  check('account added', added.ok && added.data.length === 1, true);
  check('secret absent from listing', added.ok && !JSON.stringify(added.data).includes('TESTCOOKIE'), true);
  check('hint present', added.ok && added.data[0].secretHint.includes('characters'), true);

  const file = path.join(tmp, 'accounts.vault');
  const onDisk = fs.readFileSync(file, 'utf8');
  check('plaintext secret absent from disk', onDisk.includes('TESTCOOKIE'), false);
  check('username absent from disk', onDisk.includes('Roblox'), false);
  check('note absent from disk', onDisk.includes('test note'), false);
  check('file records password mode', JSON.parse(onDisk).mode, 'password');
  check('no key stored in password mode', JSON.parse(onDisk).wrappedKey, null);

  const id = added.ok ? added.data[0].id : '';
  const revealed = vault.revealSecret(id);
  check('reveal returns the secret', revealed.ok && revealed.data.secret === SECRET, true);

  vault.lockVault();
  check('listing blocked while locked', vault.listAccounts().ok, false);
  check('reveal blocked while locked', vault.revealSecret(id).ok, false);
  check('wrong password rejected', vault.unlockVault('not the password').ok, false);
  check('correct password unlocks', vault.unlockVault('correct horse battery staple').ok, true);

  const afterUnlock = vault.listAccounts();
  check('account survived lock and unlock', afterUnlock.ok && afterUnlock.data[0].alias === 'main', true);
  const reRevealed = vault.revealSecret(id);
  check('secret survived lock and unlock', reRevealed.ok && reRevealed.data.secret === SECRET, true);

  const updated = vault.updateAccount(id, { note: 'edited' });
  check('update applies', updated.ok && updated.data[0].note === 'edited' && updated.data[0].userId === 1, true);
  check('duplicate account rejected', vault.addAccount({ secret: 'another cookie' }, profile).ok, false);
  const keptSecret = vault.revealSecret(id);
  check('update preserved the secret', keptSecret.ok && keptSecret.data.secret === SECRET, true);

  const rotated = vault.changeProtection('password', 'a brand new master password');
  check('protection change succeeds', rotated.ok, true);
  vault.lockVault();
  check('old password no longer works', vault.unlockVault('correct horse battery staple').ok, false);
  check('new password works', vault.unlockVault('a brand new master password').ok, true);
  const afterRotate = vault.revealSecret(id);
  check('secret survived rekey', afterRotate.ok && afterRotate.data.secret === SECRET, true);

  check('remove works', vault.removeAccount(id).ok, true);
  const emptied = vault.listAccounts();
  check('empty after remove', emptied.ok && emptied.data.length === 0, true);

  log('--- device mode');
  log(`safeStorage available: ${safeStorage.isEncryptionAvailable()}`);
  vault.lockVault();
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'irradiant-vault2-'));
  app.setPath('userData', tmp2);

  const deviceCreated = vault.createVault('device', '');
  check('device vault created', deviceCreated.ok, true);

  if (deviceCreated.ok) {
    vault.addAccount(
      { secret: 'hunter2hunter2' },
      { userId: 156, username: 'Builderman', displayName: 'Builderman', avatarUrl: null }
    );
    const file2 = fs.readFileSync(path.join(tmp2, 'accounts.vault'), 'utf8');
    check('device file wraps a key', typeof JSON.parse(file2).wrappedKey === 'string', true);
    check('device file hides the password', file2.includes('hunter2'), false);
    vault.lockVault();
    check('device unlock needs no password', vault.unlockVault('').ok, true);
    const list2 = vault.listAccounts();
    check('device account intact', list2.ok && list2.data[0].username === 'Builderman', true);
    check('destroy works', vault.destroyVault().ok, true);
    check('vault file gone', fs.existsSync(path.join(tmp2, 'accounts.vault')), false);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(tmp2, { recursive: true, force: true });
  finish();
});
