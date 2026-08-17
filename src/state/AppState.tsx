import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types';

export type Toast = { id: string; message: string; tone: 'info' | 'ok' | 'bad' };

export type View = 'accounts' | 'settings';

type AppInfo = {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  userData: string;
};

type AppContextValue = {
  ready: boolean;
  appInfo: AppInfo | null;
  view: View;
  setView: (view: View) => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  toasts: Toast[];
  toast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const uid = () => Math.random().toString(36).slice(2, 10);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [view, setView] = useState<View>('accounts');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = uid();
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 3200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [info, state] = await Promise.all([window.irradiant.app.info(), window.irradiant.state.read()]);
        if (cancelled) return;
        setAppInfo(info);
        setSettings({ ...DEFAULT_SETTINGS, ...state.settings });
      } catch {
        // defaults will do
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => window.irradiant.settings.onChange(setSettings), []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    const next = await window.irradiant.settings.write(patch);
    setSettings(next);
  }, []);

  return (
    <AppContext.Provider
      value={{ ready, appInfo, view, setView, settings, updateSettings, toasts, toast, dismissToast }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
