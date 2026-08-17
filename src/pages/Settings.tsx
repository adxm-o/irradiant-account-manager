import { AnimatePresence, motion } from 'framer-motion';
import { FolderOpen, KeyRound, Lock, MonitorSmartphone, ShieldCheck, Trash2, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { type VaultMode, type VaultStatus } from '@shared/types';
import { failureMessage, withTimeout } from '../lib/asyncGuard';
import { Card, CardRow, SectionLabel, SettingRow, Toggle } from '../components/ui';
import { useApp } from '../state/AppState';

export default function SettingsPage() {
  const { settings, updateSettings, appInfo, toast } = useApp();
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [mode, setMode] = useState<VaultMode>('device');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDestroy, setConfirmDestroy] = useState(false);

  const unchanged = mode === status?.mode && (mode === 'device' || (!password && !confirmPassword));

  const refresh = useCallback(async () => {
    try {
      const next = await withTimeout(window.irradiant.vault.status());
      setStatus(next);
      if (next.mode) setMode(next.mode);
    } catch (failure) {
      toast(failureMessage(failure), 'bad');
    }
  }, [toast]);

  useEffect(() => {
    refresh();
    return window.irradiant.vault.onChange(setStatus);
  }, [refresh]);

  const applyProtection = async () => {
    if (mode === 'password') {
      if (password.length < 8) {
        toast('Use at least 8 characters', 'bad');
        return;
      }
      if (password !== confirmPassword) {
        toast('Those passwords do not match', 'bad');
        return;
      }
    }
    setBusy(true);
    try {
      const result = await withTimeout(window.irradiant.vault.changeProtection(mode, password));
      if (!result.ok) {
        toast(result.reason, 'bad');
        return;
      }
      setStatus(result.data);
      setPassword('');
      setConfirmPassword('');
      toast(mode === 'password' ? 'Master password set' : 'Vault sealed by Windows', 'ok');
    } catch (failure) {
      toast(failureMessage(failure), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    const next = await window.irradiant.vault.lock();
    setStatus(next);
    toast('Vault locked');
  };

  const destroy = async () => {
    setConfirmDestroy(false);
    setBusy(true);
    try {
      const result = await withTimeout(window.irradiant.vault.destroy());
      if (!result.ok) {
        toast(result.reason, 'bad');
        return;
      }
      setStatus(result.data);
      toast('Vault deleted', 'ok');
    } catch (failure) {
      toast(failureMessage(failure), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h2>Settings</h2>
      </div>

      <SectionLabel title="Window and tray" />
      <Card>
        <SettingRow
          title="Close to tray"
          description="Pressing X hides the window and keeps the tray icon running. Turn this off to quit instead."
        >
          <Toggle checked={settings.closeToTray} onChange={(next) => updateSettings({ closeToTray: next })} />
        </SettingRow>
        <SettingRow
          title="Tray click opens quick switch"
          description="Left clicking the tray icon opens the small switcher. Off means it opens this window instead."
        >
          <Toggle
            checked={settings.trayClickOpensQuick}
            onChange={(next) => updateSettings({ trayClickOpensQuick: next })}
          />
        </SettingRow>
        <SettingRow
          title="Quick switch stays on top"
          description="Keeps the switcher above other windows, including a running Roblox client."
        >
          <Toggle checked={settings.quickAlwaysOnTop} onChange={(next) => updateSettings({ quickAlwaysOnTop: next })} />
        </SettingRow>
        <SettingRow title="Quick switch" description="Open the switcher now to see where it lands.">
          <button className="btn sm" onClick={() => window.irradiant.quick.show()}>
            <Zap size={13} />
            Open
          </button>
        </SettingRow>
      </Card>

      <div style={{ height: 18 }} />

      <SectionLabel title="Vault" />
      <Card delay={0.05}>
        <CardRow
          label="Protection"
          value={status?.mode === 'password' ? 'Master password' : status?.mode === 'device' ? 'Device encryption' : 'No vault yet'}
        />
        <CardRow label="Accounts stored" value={status?.unlocked ? status.count : 'locked'} />
        <SettingRow title="Show the vault file" description="Opens the folder it lives in. The file itself is ciphertext.">
          <button className="btn sm" onClick={() => status?.path && window.irradiant.shell.showItem(status.path)}>
            <FolderOpen size={13} />
            Show
          </button>
        </SettingRow>
        {status?.unlocked ? (
          <SettingRow title="Lock now" description="Clears the key from memory. Accounts stay encrypted on disk.">
            <button className="btn sm" onClick={lock}>
              <Lock size={13} />
              Lock
            </button>
          </SettingRow>
        ) : null}
      </Card>

      {status?.unlocked ? (
        <>
          <div style={{ height: 18 }} />
          <SectionLabel title="Change protection" />
          <Card delay={0.1}>
            <div className="prot-body">
            <div className="prot-seg">
              <span className={`prot-pill ${mode === 'password' ? 'right' : ''}`} aria-hidden />
              <button
                className={`prot-opt ${mode === 'device' ? 'on' : ''}`}
                onClick={() => setMode('device')}
                disabled={!status.deviceEncryptionAvailable}
              >
                <MonitorSmartphone size={13} />
                Device encryption
              </button>
              <button className={`prot-opt ${mode === 'password' ? 'on' : ''}`} onClick={() => setMode('password')}>
                <KeyRound size={13} />
                Master password
              </button>
            </div>

            <p className="prot-desc">
              {mode === 'device'
                ? 'Windows seals the key for your user account, so the vault opens on its own. It will not open for another user or on another machine.'
                : 'The key is derived from your password with scrypt. Strongest option, and the file stays unreadable even if it is copied off this machine.'}
            </p>

            {mode === 'password' ? (
              <div className="prot-fields">
                <label className="prot-field">
                  <span>New password</span>
                  <input
                    className="field"
                    type="password"
                    placeholder="at least 8 characters"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <label className="prot-field">
                  <span>Confirm</span>
                  <input
                    className="field"
                    type="password"
                    placeholder="type it again"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && applyProtection()}
                  />
                </label>
              </div>
            ) : null}
            </div>

            <div className="prot-foot">
              <span>
                Currently {status.mode === 'password' ? 'a master password' : 'device encryption'}
                {unchanged ? '' : ', changing to ' + (mode === 'password' ? 'a master password' : 'device encryption')}
              </span>
              <button className="btn primary" onClick={applyProtection} disabled={busy || unchanged}>
                <ShieldCheck size={14} />
                Apply
              </button>
            </div>
          </Card>
        </>
      ) : null}

      {status?.exists ? (
        <>
          <div style={{ height: 18 }} />
          <SectionLabel title="Danger" />
          <Card delay={0.15}>
            <SettingRow
              title="Delete the vault"
              description="Removes every stored account and the file itself. There is no recovery."
            >
              <button className="btn sm icon danger" onClick={() => setConfirmDestroy(true)} disabled={busy}>
                <Trash2 size={13} />
              </button>
            </SettingRow>
          </Card>
        </>
      ) : null}

      <div style={{ height: 18 }} />

      <SectionLabel title="About" />
      <Card delay={0.2}>
        <CardRow label="Version" value={appInfo?.version ?? '...'} mono />
        <CardRow label="Electron" value={appInfo?.electron ?? '...'} mono />
      </Card>

      <AnimatePresence>
        {confirmDestroy ? (
          <motion.div
            className="modal-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmDestroy(false)}
          >
            <motion.div
              className="modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              onClick={(event) => event.stopPropagation()}
            >
              <button className="modal-close" onClick={() => setConfirmDestroy(false)}>
                <X size={15} />
              </button>
              <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Delete the vault</h3>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-dim)' }}>
                Every stored account and its cookie is removed from this computer. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn ghost" onClick={() => setConfirmDestroy(false)}>
                  Cancel
                </button>
                <button className="btn primary" onClick={destroy}>
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
