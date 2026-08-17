import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { MultiInstanceStatus } from './multiInstance';
import type {
  AccountDraft,
  AccountEdit,
  AppSettings,
  PersistedState,
  RobloxAccount,
  VaultMode,
  VaultResult,
  VaultStatus
} from '../shared/types';

type Unsubscribe = () => void;

function on<T>(channel: string, handler: (payload: T) => void): Unsubscribe {
  const listener = (_event: IpcRendererEvent, payload: T) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onState: (handler: (state: { maximized: boolean; focused: boolean }) => void) => on('window:state', handler)
  },
  app: {
    info: (): Promise<{
      version: string;
      electron: string;
      chrome: string;
      node: string;
      platform: string;
      userData: string;
    }> => ipcRenderer.invoke('app:info'),
    quit: () => ipcRenderer.invoke('app:quit')
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    showItem: (target: string) => ipcRenderer.invoke('shell:show-item', target)
  },
  state: {
    read: (): Promise<PersistedState> => ipcRenderer.invoke('state:read'),
    write: (patch: Partial<PersistedState>) => ipcRenderer.invoke('state:write', patch)
  },
  settings: {
    write: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:write', patch),
    onChange: (handler: (next: AppSettings) => void) => on('settings:changed', handler)
  },
  quick: {
    show: () => ipcRenderer.invoke('quick:show'),
    hide: () => ipcRenderer.invoke('quick:hide'),
    openMain: () => ipcRenderer.invoke('quick:open-main'),
    onShown: (handler: () => void) => on('quick:shown', handler)
  },
  multi: {
    status: (): Promise<MultiInstanceStatus> => ipcRenderer.invoke('multi:status'),
    set: (enabled: boolean): Promise<MultiInstanceStatus> => ipcRenderer.invoke('multi:set', enabled),
    closeBlockers: (): Promise<MultiInstanceStatus> => ipcRenderer.invoke('multi:close-blockers'),
    onChange: (handler: (status: MultiInstanceStatus) => void) => on('multi:changed', handler)
  },
  vault: {
    status: (): Promise<VaultStatus> => ipcRenderer.invoke('vault:status'),
    create: (mode: VaultMode, password: string): Promise<VaultResult<VaultStatus>> =>
      ipcRenderer.invoke('vault:create', mode, password),
    unlock: (password: string): Promise<VaultResult<VaultStatus>> => ipcRenderer.invoke('vault:unlock', password),
    lock: (): Promise<VaultStatus> => ipcRenderer.invoke('vault:lock'),
    list: (): Promise<VaultResult<RobloxAccount[]>> => ipcRenderer.invoke('vault:list'),
    add: (draft: AccountDraft): Promise<VaultResult<RobloxAccount[]>> => ipcRenderer.invoke('vault:add', draft),
    update: (id: string, patch: AccountEdit): Promise<VaultResult<RobloxAccount[]>> =>
      ipcRenderer.invoke('vault:update', id, patch),
    refresh: (id: string): Promise<VaultResult<RobloxAccount[]>> => ipcRenderer.invoke('vault:refresh', id),
    launch: (id: string, placeId: string): Promise<VaultResult<{ placeId: string }>> =>
      ipcRenderer.invoke('vault:launch', id, placeId),
    remove: (id: string): Promise<VaultResult<RobloxAccount[]>> => ipcRenderer.invoke('vault:remove', id),
    reveal: (id: string): Promise<VaultResult<{ secret: string }>> => ipcRenderer.invoke('vault:reveal', id),
    changeProtection: (mode: VaultMode, password: string): Promise<VaultResult<VaultStatus>> =>
      ipcRenderer.invoke('vault:change-protection', mode, password),
    destroy: (): Promise<VaultResult<VaultStatus>> => ipcRenderer.invoke('vault:destroy'),
    onChange: (handler: (status: VaultStatus) => void) => on('vault:changed', handler)
  }
};

contextBridge.exposeInMainWorld('irradiant', api);

export type IrradiantApi = typeof api;
