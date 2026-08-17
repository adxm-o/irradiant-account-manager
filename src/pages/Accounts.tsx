import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Copy,
  Play,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type AccountDraft, type RobloxAccount, type VaultMode, type VaultResult, type VaultStatus } from '@shared/types';
import { cookieProblem, cookieWarning } from '@shared/cookie';
import { failureMessage, withTimeout } from '../lib/asyncGuard';
import { Badge, Card, SectionLabel, Toggle } from '../components/ui';
import { useApp } from '../state/AppState';

const emptyDraft = (): AccountDraft & { id?: string } => ({
  alias: '',
  secret: '',
  note: '',
  group: '',
  placeId: ''
});

export default function AccountsPage() {
  const { toast } = useApp();
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [accounts, setAccounts] = useState<RobloxAccount[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [setupMode, setSetupMode] = useState<VaultMode>('device');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [editing, setEditing] = useState<(AccountDraft & { id?: string }) | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<RobloxAccount | null>(null);

  const [cookieError, setCookieError] = useState<string | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);
  const [multi, setMulti] = useState<{
    supported: boolean;
    enabled: boolean;
    error: string | null;
    robloxRunning: boolean;
    blockers: { name: string; pid: number; label: string }[];
  } | null>(null);
  const [multiBusy, setMultiBusy] = useState(false);

  useEffect(() => {
    window.irradiant.multi
      .status()
      .then(setMulti)
      .catch(() =>
        setMulti({ supported: false, enabled: false, error: 'Unavailable', robloxRunning: false, blockers: [] })
      );
  }, []);

  const toggleMulti = async () => {
    if (!multi || multiBusy) return;
    setMultiBusy(true);
    try {
      const next = await withTimeout(window.irradiant.multi.set(!multi.enabled));
      setMulti(next);
      if (next.enabled) toast('Multi instance on', 'ok');
      else if (next.error) toast(next.error, 'bad');
      else toast('Multi instance off');
    } catch (failure) {
      toast(failureMessage(failure), 'bad');
    } finally {
      setMultiBusy(false);
    }
  };

  const refreshStatus = useCallback(async () => {
    try {
      const next = await withTimeout(window.irradiant.vault.status());
      setStatus(next);
      if (!next.unlocked) {
        setAccounts([]);
        setRevealed({});
        return;
      }
      const list = await withTimeout(window.irradiant.vault.list());
      if (list.ok) setAccounts(list.data);
      else setError(list.reason);
    } catch (failure) {
      setError(failureMessage(failure));
      setStatus((prev) => prev ?? { exists: false, unlocked: false, mode: null, count: 0, deviceEncryptionAvailable: false, path: '' });
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const run = useCallback(
    async <T,>(work: () => Promise<VaultResult<T>>, onSuccess: (data: T) => void, onFailure?: (reason: string) => void) => {
      setBusy(true);
      setError(null);
      try {
        const result = await withTimeout(work());
        if (!result.ok) {
          if (onFailure) onFailure(result.reason);
          else setError(result.reason);
          return false;
        }
        onSuccess(result.data);
        return true;
      } catch (failure) {
        const message = failureMessage(failure);
        if (onFailure) onFailure(message);
        else setError(message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const createVault = async () => {
    if (setupMode === 'password') {
      if (password.length < 8) {
        setError('Use at least 8 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Those passwords do not match');
        return;
      }
    }
    const done = await run(
      () => window.irradiant.vault.create(setupMode, password),
      () => {
        setPassword('');
        setConfirmPassword('');
        toast('Vault created on this device', 'ok');
      }
    );
    if (done) refreshStatus();
  };

  const unlock = async () => {
    if (status?.mode === 'password' && !password) {
      setError('Enter your master password');
      return;
    }
    const done = await run(
      () => window.irradiant.vault.unlock(password),
      () => setPassword('')
    );
    if (done) refreshStatus();
  };

  const lock = async () => {
    try {
      await withTimeout(window.irradiant.vault.lock());
      setRevealed({});
      toast('Vault locked');
    } catch (failure) {
      setError(failureMessage(failure));
    }
    refreshStatus();
  };

  const save = async () => {
    if (!editing) return;

    const needsCookie = !editing.id || Boolean(editing.secret.trim());
    if (needsCookie) {
      const problem = cookieProblem(editing.secret);
      if (problem) {
        setCookieError(problem);
        setError(null);
        return;
      }
    }
    setCookieError(null);

    const isEdit = Boolean(editing.id);
    await run(
      () =>
        isEdit
          ? window.irradiant.vault.update(editing.id as string, {
              alias: editing.alias,
              note: editing.note,
              group: editing.group,
              placeId: editing.placeId,
              ...(editing.secret.trim() ? { secret: editing.secret } : {})
            })
          : window.irradiant.vault.add(editing),
      (data) => {
        setAccounts(data);
        setEditing(null);
        toast(isEdit ? 'Account updated' : 'Account stored', 'ok');
      },
      (reason) => setCookieError(reason)
    );
  };

  const launch = async (account: RobloxAccount) => {
    setLaunching(account.id);
    await run(
      () => window.irradiant.vault.launch(account.id, account.placeId ?? ''),
      (data) => {
        toast(
          data.placeId ? `Launching ${account.alias} into ${data.placeId}` : `Launching Roblox as ${account.alias}`,
          'ok'
        );
      },
      (reason) => toast(reason, 'bad')
    );
    setLaunching(null);
  };

  const refresh = async (account: RobloxAccount) => {
    await run(
      () => window.irradiant.vault.refresh(account.id),
      (data) => {
        setAccounts(data);
        toast(`${account.alias} refreshed`, 'ok');
      },
      (reason) => toast(reason, 'bad')
    );
  };

  const refreshAll = async () => {
    for (const account of accounts) {
      await run(
        () => window.irradiant.vault.refresh(account.id),
        (data) => setAccounts(data),
        (reason) => toast(`${account.alias}: ${reason}`, 'bad')
      );
    }
    toast('Profiles refreshed', 'ok');
  };

  const reveal = async (account: RobloxAccount) => {
    if (revealed[account.id]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[account.id];
        return next;
      });
      return;
    }
    await run(
      () => window.irradiant.vault.reveal(account.id),
      (data) => setRevealed((prev) => ({ ...prev, [account.id]: data.secret })),
      (reason) => toast(reason, 'bad')
    );
  };

  const copySecret = async (account: RobloxAccount) => {
    await run(
      () => window.irradiant.vault.reveal(account.id),
      async (data) => {
        try {
          await navigator.clipboard.writeText(data.secret);
          toast('Cookie copied to clipboard', 'ok');
        } catch {
          toast('Clipboard is unavailable', 'bad');
        }
      },
      (reason) => toast(reason, 'bad')
    );
  };

  const remove = async (account: RobloxAccount) => {
    setConfirmDelete(null);
    await run(
      () => window.irradiant.vault.remove(account.id),
      (data) => {
        setAccounts(data);
        toast('Account removed', 'ok');
      },
      (reason) => toast(reason, 'bad')
    );
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) =>
      `${account.alias} ${account.username} ${account.group} ${account.note}`.toLowerCase().includes(needle)
    );
  }, [accounts, query]);

  if (!status) return null;

  if (!status.exists) {
    return (
      <>
        <div className="page-head">
          <h2>Roblox Accounts</h2>
        </div>
        <Card>
          <div className="vault-setup">
            <ShieldCheck size={30} color="var(--gold-300)" />
            <h3>Create your local vault</h3>
            <p>
              Cookies are encrypted with AES-256-GCM and stored only on this computer. Nothing is ever sent to
              Irradiant. A cookie goes to Roblox itself, over HTTPS, only to read back the username, id and avatar
              that belong to it.
            </p>

            <div className="vault-modes">
              <button
                className={`vault-mode ${setupMode === 'device' ? 'on' : ''}`}
                onClick={() => setSetupMode('device')}
                disabled={!status.deviceEncryptionAvailable}
              >
                <strong>Device encryption</strong>
                <span>
                  The key is sealed by Windows and tied to your user account. Opens automatically, no password to type.
                </span>
              </button>
              <button
                className={`vault-mode ${setupMode === 'password' ? 'on' : ''}`}
                onClick={() => setSetupMode('password')}
              >
                <strong>Master password</strong>
                <span>
                  The key is derived from a password with scrypt. Strongest option, and the file stays unreadable even
                  if it is copied off this machine.
                </span>
              </button>
            </div>

            {setupMode === 'password' ? (
              <div className="vault-fields">
                <input
                  className="field"
                  type="password"
                  placeholder="master password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <input
                  className="field"
                  type="password"
                  placeholder="confirm password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
            ) : null}

            {error ? <div className="vault-error">{error}</div> : null}

            <button className="btn primary" onClick={createVault} disabled={busy}>
              <ShieldCheck size={14} />
              Create vault
            </button>
            {setupMode === 'password' ? (
              <p className="vault-warn">There is no recovery. Forgetting the password means losing the vault.</p>
            ) : null}
          </div>
        </Card>
      </>
    );
  }

  if (!status.unlocked) {
    return (
      <>
        <div className="page-head">
          <h2>Roblox Accounts</h2>
        </div>
        <Card>
          <div className="vault-setup">
            <Lock size={28} color="var(--gold-300)" />
            <h3>Vault locked</h3>
            {status.mode === 'password' ? (
              <>
                <p>Enter your master password to open the vault.</p>
                <input
                  className="field"
                  style={{ maxWidth: 280 }}
                  type="password"
                  placeholder="master password"
                  value={password}
                  autoFocus
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && unlock()}
                />
              </>
            ) : (
              <p>This vault is sealed by Windows for your user account.</p>
            )}
            {error ? <div className="vault-error">{error}</div> : null}
            <button className="btn primary" onClick={unlock} disabled={busy}>
              <LockOpen size={14} />
              Unlock
            </button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h2>Roblox Accounts</h2>
      </div>

      <div className="hub-controls">
        <div className="hub-search">
          <Search size={15} color="var(--text-muted)" />
          <input
            className="hub-search-input"
            placeholder="search accounts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button className="btn sm" onClick={() => setEditing(emptyDraft())}>
          <Plus size={14} />
          Add account
        </button>
        <button className="btn sm" onClick={refreshAll} disabled={busy || accounts.length === 0} title="Refresh profiles">
          <RefreshCw size={14} />
        </button>
        <button className="btn sm" onClick={lock} title="Lock vault">
          <Lock size={14} />
        </button>
      </div>

      {multi ? (
        <div className={`multi-bar ${multi.enabled ? 'on' : ''}`}>
          <span className="multi-icon">
            <Layers size={16} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="multi-title">
              Multi instance
              {multi.enabled ? <Badge tone="ok">On</Badge> : <Badge tone="neutral">Off</Badge>}
            </div>
            <div className="multi-sub">
              {!multi.supported
                ? 'Only available on Windows'
                : multi.enabled
                  ? 'Keep this window open and launch your clients after switching this on.'
                  : multiBusy
                    ? 'Closing anything already holding the Roblox launch handle'
                    : 'Run several accounts at once. Switching this on closes anything Roblox already has running.'}
            </div>
            {multi.error && !multiBusy ? <div className="multi-error">{multi.error}</div> : null}
          </div>
          {multiBusy ? (
            <span className="multi-working">
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ display: 'grid' }}
              >
                <Loader2 size={14} />
              </motion.span>
              {multi.enabled ? 'Releasing' : 'Starting'}
            </span>
          ) : null}
          <Toggle checked={multi.enabled} onChange={toggleMulti} />
        </div>
      ) : null}

      <SectionLabel
        title={`${visible.length} account${visible.length === 1 ? '' : 's'} · ${
          status.mode === 'password' ? 'master password' : 'device encryption'
        }`}
      />

      {visible.length === 0 ? (
        <div className="hub-empty">
          <UserRound size={24} color="var(--gold-600)" />
          <p>{accounts.length === 0 ? 'no accounts stored yet' : 'nothing matched that search'}</p>
          {accounts.length === 0 ? (
            <button className="btn sm" onClick={() => setEditing(emptyDraft())}>
              Add your first account
            </button>
          ) : null}
        </div>
      ) : (
        <div className="account-grid">
          <AnimatePresence mode="popLayout">
            {visible.map((account, index) => (
              <motion.div
                key={account.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.28, delay: Math.min(index * 0.03, 0.2), ease: [0.22, 1, 0.36, 1] }}
                className="account-card"
              >
                <div className="account-head">
                  <span className="account-avatar">
                    {account.avatarUrl ? (
                      <img src={account.avatarUrl} alt="" draggable={false} />
                    ) : (
                      <UserRound size={20} color="var(--gold-600)" />
                    )}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="account-alias">{account.alias}</div>
                    <div className="account-username">
                      @{account.username}
                      {account.userId ? <span className="account-id">· {account.userId}</span> : null}
                    </div>
                  </div>
                  {account.group ? <Badge tone="neutral">{account.group}</Badge> : null}
                </div>

                <div className="account-cred">
                  <span className="account-kind">
                    <KeyRound size={12} />
                    .ROBLOSECURITY
                  </span>
                  <code className="account-secret mono">
                    {revealed[account.id] ?? '•'.repeat(18)}
                  </code>
                </div>

                {account.note ? <div className="account-note">{account.note}</div> : null}

                <div className="account-actions">
                  <button
                    className="btn sm primary"
                    onClick={() => launch(account)}
                    disabled={launching === account.id}
                    title={account.placeId ? `Join place ${account.placeId}` : 'Open Roblox signed in as this account'}
                  >
                    {launching === account.id ? (
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        style={{ display: 'grid' }}
                      >
                        <Loader2 size={13} />
                      </motion.span>
                    ) : (
                      <Play size={13} />
                    )}
                    {launching === account.id ? 'Starting' : 'Launch'}
                  </button>
                  <button className="btn sm" onClick={() => reveal(account)}>
                    {revealed[account.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                    {revealed[account.id] ? 'Hide' : 'Reveal'}
                  </button>
                  <button className="btn sm icon" title="Copy credential" onClick={() => copySecret(account)}>
                    <Copy size={13} />
                  </button>
                  <button
                    className="btn sm icon"
                    title="Refresh avatar"
                    onClick={() => refresh(account)}
                  >
                    <RefreshCw size={13} />
                  </button>
                  <button
                    className="btn sm icon"
                    title="Edit"
                    onClick={() =>
                      setEditing({
                        id: account.id,
                        alias: account.alias,
                        secret: '',
                        note: account.note,
                        group: account.group,
                        placeId: account.placeId ?? ''
                      })
                    }
                  >
                    <Pencil size={13} />
                  </button>
                  <button className="btn sm icon danger" title="Remove" onClick={() => setConfirmDelete(account)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {editing ? (
          <motion.div
            className="modal-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!busy) { setEditing(null); setCookieError(null); } }}
          >
            <motion.div
              className="modal account-modal"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              <button className="modal-close" onClick={() => { setEditing(null); setCookieError(null); }}>
                <X size={15} />
              </button>
              <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{editing.id ? 'Edit account' : 'Add account'}</h3>

              <label className="field-label">
                .ROBLOSECURITY cookie{editing.id ? ' (leave empty to keep the stored one)' : ''}
              </label>
              <textarea
                className={`field ${cookieError ? 'invalid' : ''}`}
                style={{ minHeight: 92, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}
                placeholder="_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you..."
                value={editing.secret}
                autoFocus
                onChange={(event) => {
                  setEditing({ ...editing, secret: event.target.value });
                  if (cookieError) setCookieError(null);
                }}
              />

              <AnimatePresence initial={false}>
                {cookieError ? (
                  <motion.div
                    className="field-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                  >
                    <AlertTriangle size={13} />
                    <span>{cookieError}</span>
                  </motion.div>
                ) : cookieWarning(editing.secret) ? (
                  <motion.div
                    className="field-warn"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                  >
                    <AlertTriangle size={13} />
                    <span>{cookieWarning(editing.secret)}</span>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <p className="field-hint">
                The username, user id and avatar are read from the cookie by asking Roblox who it belongs to. Nothing
                else is sent, and the cookie itself never leaves this machine except to Roblox.
              </p>

              <label className="field-label">Label</label>
              <input
                className="field"
                placeholder="optional, defaults to the Roblox username"
                value={editing.alias}
                onChange={(event) => setEditing({ ...editing, alias: event.target.value })}
              />

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Group</label>
                  <input
                    className="field"
                    placeholder="optional"
                    value={editing.group}
                    onChange={(event) => setEditing({ ...editing, group: event.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Note</label>
                  <input
                    className="field"
                    placeholder="optional"
                    value={editing.note}
                    onChange={(event) => setEditing({ ...editing, note: event.target.value })}
                  />
                </div>
              </div>

              <label className="field-label">Default place id</label>
              <input
                className="field"
                placeholder="optional, leave empty to open the Roblox app"
                value={editing.placeId ?? ''}
                onChange={(event) => setEditing({ ...editing, placeId: event.target.value.replace(/[^\d]/g, '') })}
              />
              <p className="field-hint">
                Launch joins this place directly. It is the number in a game URL, for example
                roblox.com/games/<strong>606849621</strong>/Jailbreak.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
                <button className="btn ghost" onClick={() => { setEditing(null); setCookieError(null); }} disabled={busy}>
                  Cancel
                </button>
                <button className="btn primary" onClick={save} disabled={busy}>
                  {busy ? (
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      style={{ display: 'grid' }}
                    >
                      <Loader2 size={14} />
                    </motion.span>
                  ) : null}
                  {busy ? 'Checking with Roblox' : editing.id ? 'Save changes' : 'Store account'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete ? (
          <motion.div
            className="modal-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              className="modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              onClick={(event) => event.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Remove account</h3>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-dim)' }}>
                {confirmDelete.alias} and its stored credential will be deleted from the vault. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn ghost" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button className="btn primary" onClick={() => remove(confirmDelete)}>
                  Remove
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
