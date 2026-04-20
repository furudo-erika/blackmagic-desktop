// Electron main. Responsibilities:
//  1. Spawn the Node daemon as a child process.
//  2. Wait for its discovery file ~/BlackMagic/.bm/daemon.json.
//  3. Create a BrowserWindow loading either the dev URL (http://localhost:<port>)
//     or the packaged static export (resources/web/index.html).
//  4. Inject daemon port + local token into window.bmBridge.

const { app, BrowserWindow, Menu, ipcMain, shell, nativeImage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
// electron-updater removed — distribution is brew-only. notifyIfNewerAvailable
// below pokes the renderer so it can show an "upgrade via brew" banner.

const APP_NAME = 'BlackMagic AI';
const VERSION_MANIFEST_URL = 'https://pub-d259d1d2737843cb8bcb2b1ff98fc9c6.r2.dev/blackmagic-desktop/version.json';
const DOWNLOAD_PAGE_URL = 'https://pub-d259d1d2737843cb8bcb2b1ff98fc9c6.r2.dev/blackmagic-desktop/index.html';
const RESOURCES = path.join(__dirname, '..', 'resources');
const ICON_PNG = path.join(RESOURCES, 'icon.png');
const ICON_ICNS = path.join(RESOURCES, 'icon.icns');
const WEB_DEV_PORT = process.env.BM_WEB_PORT || '7823';

// Force the app name before app.whenReady(). In dev, macOS still reads
// CFBundleName from Electron.app/Contents/Info.plist (= "Electron") for the
// menu bar, but app.setName controls the Dock tooltip, notifications, and
// user-data dir.
app.setName(APP_NAME);
process.title = APP_NAME;

// Dev-mode Dock icon. Packaged builds get this via electron-builder's icon
// config; in dev we inject it at runtime.
if (process.platform === 'darwin' && app.dock) {
  try {
    const img = nativeImage.createFromPath(ICON_PNG);
    if (img.isEmpty()) console.error('[main] icon.png empty:', ICON_PNG);
    else app.dock.setIcon(img);
  } catch (err) {
    console.error('[main] setIcon failed:', err);
  }
}

// Menu bar: rewrite the application menu so even in dev the first item is
// "BlackMagic AI" instead of "Electron".
function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [];
  if (isMac) {
    template.push({
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }
  template.push(
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Open vault folder',
          click: () => shell.openPath(process.env.BM_VAULT_PATH || path.join(os.homedir(), 'BlackMagic')),
        },
      ],
    },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const VAULT_PATH = process.env.BM_VAULT_PATH || path.join(os.homedir(), 'BlackMagic');
const DISCOVERY_PATH = path.join(VAULT_PATH, '.bm', 'daemon.json');

let daemonProcess = null;

function resolveDaemonEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'daemon', 'index.js');
  }
  return path.join(__dirname, '..', '..', '..', 'daemon', 'src', 'index.ts');
}

function startDaemon() {
  // Remove stale discovery file so we can detect a fresh one.
  try { fs.unlinkSync(DISCOVERY_PATH); } catch {}

  const entry = resolveDaemonEntry();

  if (app.isPackaged) {
    // Electron's binary runs plain Node scripts when ELECTRON_RUN_AS_NODE=1.
    // The daemon is a single esbuild bundle, so no node_modules lookup is needed.
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      BM_WEB_ROOT: path.join(process.resourcesPath, 'web'),
      BM_APP_VERSION: app.getVersion(),
    };
    daemonProcess = spawn(process.execPath, [entry], { env, stdio: 'inherit' });
  } else {
    // Dev: run with tsx from the workspace.
    const env = { ...process.env, BM_APP_VERSION: app.getVersion() };
    const tsx = path.join(__dirname, '..', '..', '..', 'node_modules', '.bin', 'tsx');
    daemonProcess = spawn(tsx, [entry], { env, stdio: 'inherit' });
  }

  daemonProcess.on('exit', (code) => {
    console.log('[main] daemon exited with', code);
    daemonProcess = null;
  });
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const started = Date.now();
  // Next.js dev compiles on first hit, so we accept any response (even 500/404)
  // — what matters is that the server is listening.
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  console.warn('[main] dev server did not respond in time:', url);
}

async function waitForDiscovery(timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const raw = fs.readFileSync(DISCOVERY_PATH, 'utf-8');
      const j = JSON.parse(raw);
      if (j.port && j.token) return j;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('daemon did not start in time');
}

async function createWindow() {
  startDaemon();
  const discovery = await waitForDiscovery();

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#FBFAF8',
    icon: fs.existsSync(ICON_PNG) ? ICON_PNG : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        `--bm-daemon-port=${discovery.port}`,
        `--bm-daemon-token=${discovery.token}`,
        `--bm-vault-path=${VAULT_PATH}`,
        `--bm-app-version=${app.getVersion()}`,
      ],
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env.BM_DEV) {
    const devUrl = `http://localhost:${WEB_DEV_PORT}`;
    await waitForHttp(devUrl);
    win.loadURL(devUrl);
    if (process.env.BM_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    // The packaged daemon serves the static UI at /. Same-origin with the
    // REST API — no CORS, no file:// asset-path weirdness.
    win.loadURL(`http://127.0.0.1:${discovery.port}/`);
  }
  return win;
}

ipcMain.handle('bm:pick-folder', async () => {
  try {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths?.length) return null;
    return res.filePaths[0];
  } catch (err) {
    console.error('[main] pickFolder failed:', err);
    return null;
  }
});

ipcMain.handle('bm:open-external', async (_event, url) => {
  if (typeof url !== 'string') return false;
  // Allow http/https only.
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    await shell.openExternal(url);
    return true;
  } catch (err) {
    console.error('[main] openExternal failed:', err);
    return false;
  }
});

// Compare semver-ish "a.b.c" strings. Returns -1/0/1.
function cmpVersion(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// Hard-gate: fetch the R2 manifest and refuse to run if this build isn't the
// latest. Updates ship fast; we can't support a long tail of stale clients,
// so every launch either matches manifest.latestVersion or is blocked with a
// brew-upgrade dialog. Cache-busted so CDN can never serve a stale answer.
// Network failures are non-fatal — offline users aren't bricked.
async function enforceMinVersion() {
  const current = app.getVersion();
  try {
    const url = `${VERSION_MANIFEST_URL}?t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return;
    const manifest = await res.json();
    const min = manifest.minVersion;
    const latest = manifest.latestVersion;
    const target = latest || min;
    if (!target) return;
    if (cmpVersion(current, target) >= 0) return;

    const brewCmd = 'brew upgrade --cask blackmagic-ai';
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Update required',
      message: `BlackMagic AI ${current} is out of date.`,
      detail:
        `The latest version is ${target}. Run this in Terminal, then reopen:\n\n  ${brewCmd}\n\n` +
        `"Copy command" puts it on your clipboard; "Quit" closes the app so the upgrade can replace it.`,
      buttons: ['Copy command and quit', 'Quit'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (choice === 0) {
      try {
        require('electron').clipboard.writeText(brewCmd);
      } catch {}
    }
    app.exit(0);
  } catch (err) {
    console.warn('[main] version-gate check failed:', err?.message || err);
  }
}

// Soft "newer version available" check. We no longer ship auto-updates via
// electron-updater — distribution is brew-only. On every launch we poll the
// same R2 manifest and, if a newer version exists, push an IPC event to the
// renderer so it can show a banner with `brew upgrade --cask blackmagic-ai`.
async function notifyIfNewerAvailable(win) {
  if (!app.isPackaged) return;
  const current = app.getVersion();
  try {
    const url = `${VERSION_MANIFEST_URL}?t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return;
    const manifest = await res.json();
    const latest = manifest.latestVersion;
    if (!latest || cmpVersion(current, latest) >= 0) return;
    win.webContents.send('bm:update-available', {
      currentVersion: current,
      latestVersion: latest,
      brewCommand: 'brew upgrade --cask blackmagic-ai',
    });
  } catch (err) {
    console.warn('[main] upgrade nudge check failed:', err?.message || err);
  }
}

app.whenReady().then(async () => {
  buildAppMenu();
  await enforceMinVersion();
  const win = await createWindow();
  if (win) {
    // Delay slightly so the renderer has time to mount its listener.
    setTimeout(() => notifyIfNewerAvailable(win), 3000);
  }
});

app.on('window-all-closed', () => {
  if (daemonProcess) {
    try { daemonProcess.kill(); } catch {}
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
