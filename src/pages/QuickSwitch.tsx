import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Layers, Loader2, Lock, Play, Search, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RobloxAccount, VaultStatus } from '@shared/types';
import { failureMessage, withTimeout } from '../lib/asyncGuard';
import Logo from '../components/Logo';
import { Toggle } from '../components/ui';

type MultiState = { supported: boolean; enabled: boolean; error: string | null };

export default function QuickSwitch() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [accounts, setAccounts] = useState<RobloxAccount[]>([]);
  const [query, setQuery] = useState('');
  const [launching, setLaunching] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [multi, setMulti] = useState<MultiState | null>(null);
  const [multiBusy, setMultiBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await withTimeout(window.irradiant.vault.status());
      setStatus(next);
      if (!next.unlocked) {
        setAccounts([]);
        return;
      }
      const list = await withTimeout(window.irradiant.vault.list());
      if (list.ok) setAccounts(list.data);
    } catch (failure) {
      setNote({ text: failureMessage(failure), tone: 'bad' });
    }
  }, []);

  useEffect(() => {
    load();
    window.irradiant.multi.status().then(setMulti).catch(() => setMulti(null));
    const offShown = window.irradiant.quick.onShown(() => {
      setQuery('');
      setNote(null);
      load();
      window.irradiant.multi.status().then(setMulti).catch(() => undefined);
    });
    const offVault = window.irradiant.vault.onChange(() => load());
    const offMulti = window.irradiant.multi.onChange(setMulti);
    return () => {
      offShown();
      offVault();
      offMulti();
    };
  }, [load]);

  useEffect(() => {
    document.title = 'Irradiant Account Manager quick switch';
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.irradiant.quick.hide();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const launch = async (account: RobloxAccount) => {
    setLaunching(account.id);
    setNote(null);
    try {
      const result = await withTimeout(window.irradiant.vault.launch(account.id, account.placeId ?? ''));
      if (!result.ok) {
        setNote({ text: result.reason, tone: 'bad' });
        return;
      }
      setNote({ text: `Launching as ${account.alias}`, tone: 'ok' });
      window.setTimeout(() => window.irradiant.quick.hide(), 900);
    } catch (failure) {
      setNote({ text: failureMessage(failure), tone: 'bad' });
    } finally {
      setLaunching(null);
    }
  };

  const toggleMulti = async () => {
    if (!multi || multiBusy) return;
    setMultiBusy(true);
    try {
      const next = await withTimeout(window.irradiant.multi.set(!multi.enabled));
      setMulti(next);
      if (!next.enabled && next.error) setNote({ text: next.error, tone: 'bad' });
    } catch (failure) {
      setNote({ text: failureMessage(failure), tone: 'bad' });
    } finally {
      setMultiBusy(false);
    }
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) => `${account.alias} ${account.username}`.toLowerCase().includes(needle));
  }, [accounts, query]);

  return (
    <div className="quick">
      <header className="quick-head">
        <Logo size={18} />
        <span className="quick-title">Quick switch</span>
        <button className="quick-close" onClick={() => window.irradiant.quick.hide()} title="Close">
          <X size={14} />
        </button>
      </header>

      {status?.unlocked ? (
        <>
          <div className="quick-search">
            <Search size={13} color="var(--text-muted)" />
            <input
              autoFocus
              placeholder="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && visible.length > 0) launch(visible[0]);
              }}
            />
          </div>

          <div className="quick-list">
            {visible.length === 0 ? (
              <div className="quick-empty">
                <UserRound size={20} color="var(--gold-600)" />
                <span>{accounts.length === 0 ? 'no accounts stored' : 'nothing matched'}</span>
              </div>
            ) : (
              visible.map((account) => (
                <button
                  key={account.id}
                  className="quick-row"
                  onClick={() => launch(account)}
                  disabled={launching !== null}
                  title={account.placeId ? `Join place ${account.placeId}` : 'Open Roblox as this account'}
                >
                  <span className="quick-avatar">
                    {account.avatarUrl ? (
                      <img src={account.avatarUrl} alt="" draggable={false} />
                    ) : (
                      <UserRound size={16} color="var(--gold-600)" />
                    )}
                  </span>
                  <span className="quick-names">
                    <span className="quick-alias">{account.alias}</span>
                    <span className="quick-user">@{account.username}</span>
                  </span>
                  <span className="quick-go">
                    {launching === account.id ? (
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        style={{ display: 'grid' }}
                      >
                        <Loader2 size={13} />
                      </motion.span>
                    ) : (
                      <Play size={12} />
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="quick-locked">
          <Lock size={22} color="var(--gold-300)" />
          <span>{status?.exists ? 'Vault locked' : 'No vault yet'}</span>
          <button className="btn sm" onClick={() => window.irradiant.quick.openMain()}>
            Open manager
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {note ? (
          <motion.div
            className={`quick-note ${note.tone}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
          >
            {note.text}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <footer className="quick-foot">
        <span className="quick-multi">
          <Layers size={13} color={multi?.enabled ? 'var(--gold-300)' : 'var(--text-muted)'} />
          Multi instance
          {multiBusy ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              style={{ display: 'grid' }}
            >
              <Loader2 size={12} />
            </motion.span>
          ) : null}
        </span>
        <Toggle checked={Boolean(multi?.enabled)} onChange={toggleMulti} />
        <button className="quick-open" onClick={() => window.irradiant.quick.openMain()} title="Open the manager">
          <ExternalLink size={13} />
        </button>
      </footer>
    </div>
  );
}
