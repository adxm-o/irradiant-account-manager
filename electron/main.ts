import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { flushState, readState, writeState } from './store';
import { normalizeCookie, resolveFromCookie } from './roblox';
import { launchAccount } from './launch';
import {
  closeBlockers,
  multiInstanceStatus,
  reapOrphanHolders,
  startMultiInstance,
  stopMultiInstance
} from './multiInstance';
import {
  addAccount,
  changeProtection,
  createVault,
  destroyVault,
  listAccounts,
  lockVault,
  removeAccount,
  revealSecret,
  unlockVault,
  updateAccount,
  vaultStatus
} from './vault';
import { MIN_WINDOW } from '../shared/types';
import type { AccountDraft, AccountEdit, AppSettings, PersistedState, VaultMode } from '../shared/types';

const DEV_URL = 'http://localhost:5274';
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

const QUICK_WIDTH = 320;
const QUICK_HEIGHT = 452;

let win: BrowserWindow | null = null;
let quick: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let hiddenAt = 0;

const settings = () => readState().settings;

function resolveIcon() {
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const candidates = app.isPackaged
    ? [path.join(root, 'icon.ico')]
    : [path.join(root, 'build', 'icon.ico'), path.join(root, 'build', 'icon.png'), path.join(root, 'public', 'logo.png')];
  return candidates.find((candidate) => existsSync(candidate));
}

function loadView(target: BrowserWindow, hash: string) {
  if (isDev) target.loadURL(hash ? `${DEV_URL}/#${hash}` : DEV_URL);
  else target.loadFile(path.join(__dirname, '../dist/index.html'), hash ? { hash } : undefined);
}

function createWindow() {
  const saved = readState().window;

  win = new BrowserWindow({
    icon: resolveIcon(),
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: MIN_WINDOW.width,
    minHeight: MIN_WINDOW.height,
    useContentSize: true,
    show: false,
    frame: false,
    backgroundColor: '#070707',
    title: 'Irradiant Accounts',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false
    }
  });

  if (saved.maximized) win.maximize();

  win.once('ready-to-show', () => {
    win?.show();
    win?.focus();
  });

  const reportWindowState = () => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('window:state', { maximized: win.isMaximized(), focused: win.isFocused() });
  };

  win.on('maximize', reportWindowState);
  win.on('unmaximize', reportWindowState);
  win.on('focus', reportWindowState);
  win.on('blur', reportWindowState);

  // content bounds to match useContentSize, mixing the two shrinks the window a bit every lauch
  const persistBounds = () => {
    if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) return;
    const maximized = win.isMaximized();
    if (maximized) {
      writeState({ window: { ...readState().window, maximized } });
      return;
    }
    const bounds = win.getContentBounds();
    writeState({ window: { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y, maximized } });
  };

  win.on('resize', persistBounds);
  win.on('move', persistBounds);

  win.on('close', (event) => {
    if (quitting || !settings().closeToTray || !tray) return;
    event.preventDefault();
    flushState();
    win?.hide();
  });

  win.on('closed', () => {
    win = null;
    if (quitting) return;
    quitting = true;
    app.quit();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  loadView(win, '');
}

function showMain() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createQuick() {
  quick = new BrowserWindow({
    width: QUICK_WIDTH,
    height: QUICK_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: settings().quickAlwaysOnTop,
    backgroundColor: '#0a0908',
    title: 'Irradiant quick switch',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false
    }
  });

  quick.on('blur', () => {
    if (quick && !quick.isDestroyed() && quick.isVisible()) {
      hiddenAt = Date.now();
      quick.hide();
    }
  });

  quick.on('closed', () => {
    quick = null;
  });

  quick.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  loadView(quick, 'quick');
}

function positionQuick(target: BrowserWindow) {
  const point = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(point);
  const x = Math.round(Math.min(Math.max(point.x - QUICK_WIDTH / 2, workArea.x + 8), workArea.x + workArea.width - QUICK_WIDTH - 8));
  const y = Math.round(workArea.y + workArea.height - QUICK_HEIGHT - 8);
  target.setBounds({ x, y, width: QUICK_WIDTH, height: QUICK_HEIGHT });
}

function showQuick() {
  if (!quick || quick.isDestroyed()) createQuick();
  if (!quick) return;
  positionQuick(quick);
  quick.setAlwaysOnTop(settings().quickAlwaysOnTop);
  quick.show();
  quick.focus();
  quick.webContents.send('quick:shown');
}

function toggleQuick() {
  if (quick && !quick.isDestroyed() && quick.isVisible()) {
    hiddenAt = Date.now();
    quick.hide();
    return;
  }
  // tray click blurs the panel first, without this it just reopens right after closing
  if (Date.now() - hiddenAt < 250) return;
  showQuick();
}

function trayMenu() {
  const status = vaultStatus();
  const stored = listAccounts();
  const multi = multiInstanceStatus();

  const accountItems = stored.ok
    ? stored.data.slice(0, 12).map((account) => ({
        label: account.alias,
        click: async () => {
          const secret = revealSecret(account.id);
          if (!secret.ok) return;
          await launchAccount(secret.data.secret, account.placeId ?? '');
        }
      }))
    : [];

  return Menu.buildFromTemplate([
    { label: 'Quick switch', click: showQuick },
    { label: 'Open Irradiant Accounts', click: showMain },
    { type: 'separator' },
    ...(accountItems.length > 0
      ? [{ label: 'Launch as', submenu: accountItems }]
      : [{ label: status.unlocked ? 'No accounts stored' : 'Vault locked', enabled: false }]),
    { type: 'separator' },
    {
      label: 'Multi instance',
      type: 'checkbox' as const,
      checked: multi.enabled,
      enabled: multi.supported,
      click: async (item: { checked: boolean }) => {
        const next = item.checked ? await startMultiInstance() : stopMultiInstance();
        writeState({ multiInstance: next.enabled });
        broadcast('multi:changed', next);
        refreshTray();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]);
}

function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(trayMenu());
}

function createTray() {
  const iconPath = resolveIcon();
  const image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(image.isEmpty() ? image : image.resize({ width: 16, height: 16 }));
  tray.setToolTip('Irradiant Accounts');
  tray.on('click', () => (settings().trayClickOpensQuick ? toggleQuick() : showMain()));
  tray.on('double-click', showMain);
  refreshTray();
}

function broadcast(channel: string, payload: unknown) {
  for (const target of [win, quick]) {
    if (target && !target.isDestroyed()) target.webContents.send(channel, payload);
  }
}

// only our own two windows get to touch the vault
function ownWindow(event: IpcMainInvokeEvent | IpcMainEvent) {
  return [win, quick].some(
    (target) => target && !target.isDestroyed() && target.webContents.id === event.sender.id
  );
}

function handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!ownWindow(event)) throw new Error('rejected: unknown sender');
    return listener(event, ...args);
  });
}

function registerIpc() {
  handle('window:minimize', () => win?.minimize());
  handle('window:toggle-maximize', () => {
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  handle('window:close', () => win?.close());
  handle('window:is-maximized', () => win?.isMaximized() ?? false);

  handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    userData: app.getPath('userData')
  }));

  handle('app:quit', () => {
    quitting = true;
    flushState();
    app.quit();
  });

  handle('shell:open-external', (_event, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url);
    return false;
  });

  handle('shell:show-item', (_event, target: string) => {
    if (target) shell.showItemInFolder(target);
  });

  handle('state:read', () => readState());
  handle('state:write', (_event, patch: Partial<PersistedState>) => {
    writeState(patch);
    return true;
  });

  handle('settings:write', (_event, patch: Partial<AppSettings>) => {
    const next = { ...settings(), ...patch };
    writeState({ settings: next });
    if (quick && !quick.isDestroyed()) quick.setAlwaysOnTop(next.quickAlwaysOnTop);
    broadcast('settings:changed', next);
    return next;
  });

  handle('quick:hide', () => quick?.hide());
  handle('quick:show', () => showQuick());
  handle('quick:open-main', () => {
    quick?.hide();
    showMain();
  });

  handle('multi:status', () => multiInstanceStatus());
  handle('multi:close-blockers', () => {
    closeBlockers();
    return multiInstanceStatus();
  });
  handle('multi:set', async (_event, enabled: boolean) => {
    const status = enabled ? await startMultiInstance() : stopMultiInstance();
    writeState({ multiInstance: status.enabled });
    broadcast('multi:changed', status);
    refreshTray();
    return status;
  });

  handle('vault:status', () => vaultStatus());
  handle('vault:create', (_event, mode: VaultMode, password: string) => {
    const result = createVault(mode, password ?? '');
    refreshTray();
    return result;
  });
  handle('vault:unlock', (_event, password: string) => {
    const result = unlockVault(password ?? '');
    refreshTray();
    broadcast('vault:changed', vaultStatus());
    return result;
  });
  handle('vault:lock', () => {
    const status = lockVault();
    refreshTray();
    broadcast('vault:changed', status);
    if (quick && !quick.isDestroyed() && quick.isVisible()) quick.hide();
    return status;
  });
  handle('vault:list', () => listAccounts());

  handle('vault:add', async (_event, draft: AccountDraft) => {
    const profile = await resolveFromCookie(draft?.secret ?? '');
    if (!profile.ok) return profile;
    const result = addAccount({ ...draft, secret: normalizeCookie(draft.secret) }, profile.data);
    refreshTray();
    broadcast('vault:changed', vaultStatus());
    return result;
  });

  handle('vault:update', async (_event, id: string, patch: AccountEdit) => {
    const done = async () => {
      if (!patch?.secret) return updateAccount(id, patch ?? {});
      const profile = await resolveFromCookie(patch.secret);
      if (!profile.ok) return profile;
      return updateAccount(id, { ...patch, secret: normalizeCookie(patch.secret) }, profile.data);
    };
    const result = await done();
    refreshTray();
    broadcast('vault:changed', vaultStatus());
    return result;
  });

  handle('vault:refresh', async (_event, id: string) => {
    const stored = revealSecret(id);
    if (!stored.ok) return stored;
    const profile = await resolveFromCookie(stored.data.secret);
    if (!profile.ok) return profile;
    const result = updateAccount(id, {}, profile.data);
    broadcast('vault:changed', vaultStatus());
    return result;
  });

  handle('vault:launch', async (_event, id: string, placeId: string) => {
    const stored = revealSecret(id);
    if (!stored.ok) return stored;
    const launched = await launchAccount(stored.data.secret, placeId ?? '');
    if (!launched.ok) return launched;
    updateAccount(id, { placeId: launched.data.placeId });
    return launched;
  });

  handle('vault:remove', (_event, id: string) => {
    const result = removeAccount(id);
    refreshTray();
    broadcast('vault:changed', vaultStatus());
    return result;
  });
  handle('vault:reveal', (_event, id: string) => revealSecret(id));
  handle('vault:change-protection', (_event, mode: VaultMode, password: string) =>
    changeProtection(mode, password ?? '')
  );
  handle('vault:destroy', () => {
    const result = destroyVault();
    refreshTray();
    broadcast('vault:changed', vaultStatus());
    return result;
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', showMain);

  // renderers only ever load our own page, dont let anything navigate away or ask for permissions
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      const allowed = isDev ? url.startsWith(DEV_URL) : url.startsWith('file://');
      if (!allowed) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    contents.session.setPermissionCheckHandler(() => false);
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('gg.irradiant.accounts');
    registerIpc();
    createWindow();
    createTray();
    createQuick();
    reapOrphanHolders();
    if (readState().multiInstance) startMultiInstance().then(refreshTray);
    app.on('activate', showMain);
  });

  app.on('window-all-closed', () => {
    if (tray && !tray.isDestroyed() && settings().closeToTray) return;
    stopMultiInstance();
    flushState();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    stopMultiInstance();
    lockVault();
    flushState();
    if (tray && !tray.isDestroyed()) tray.destroy();
    tray = null;
  });
}
