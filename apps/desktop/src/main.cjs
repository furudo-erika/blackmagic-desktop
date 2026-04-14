// Electron main. Responsibilities:
//  1. Spawn the Node daemon as a child process.
//  2. Wait for its discovery file ~/BlackMagic/.bm/daemon.json.
//  3. Create a BrowserWindow loading either the dev URL (http://localhost:3000)
//     or the packaged static export (resources/web/index.html).
//  4. Inject daemon port + local token into window.bmBridge.

const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

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
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    daemonProcess = spawn(process.execPath, [entry], { env, stdio: 'inherit' });
  } else {
    // Dev: run with tsx from the workspace.
    const env = { ...process.env };
    const tsx = path.join(__dirname, '..', '..', '..', 'node_modules', '.bin', 'tsx');
    daemonProcess = spawn(tsx, [entry], { env, stdio: 'inherit' });
  }

  daemonProcess.on('exit', (code) => {
    console.log('[main] daemon exited with', code);
    daemonProcess = null;
  });
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        `--bm-daemon-port=${discovery.port}`,
        `--bm-daemon-token=${discovery.token}`,
        `--bm-vault-path=${VAULT_PATH}`,
      ],
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env.BM_DEV) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(process.resourcesPath, 'web', 'index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (daemonProcess) {
    try { daemonProcess.kill(); } catch {}
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
