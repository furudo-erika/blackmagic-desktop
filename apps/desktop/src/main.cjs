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
// Source of truth for "what is the latest version" is the Homebrew cask
// in the user-facing tap repo. We stopped packaging to R2, so the old
// version.json manifest there is stale and unreliable. Parsing the cask
// gives us exactly what `brew upgrade --cask blackmagic-ai` will install.
const CASK_URL = 'https://raw.githubusercontent.com/blackmagic-ai/homebrew-tap/main/Casks/blackmagic-ai.rb';
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

// Fetch the latest version directly from the Homebrew cask. Cache-busted
// (GitHub's raw CDN respects the query param). Network failures are
// non-fatal — offline users aren't bricked.
async function fetchLatestCaskVersion() {
  try {
    const url = `${CASK_URL}?t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const m = text.match(/^\s*version\s+"([^"]+)"/m);
    return m ? m[1] : null;
  } catch (err) {
    console.warn('[main] cask fetch failed:', err?.message || err);
    return null;
  }
}

// Hard-gate: if this build isn't the latest the cask offers, block with
// a brew-upgrade dialog. Source of truth is the cask file — never
// packaging to R2 again, so anything comparing against version.json
// would lie.
async function enforceMinVersion() {
  if (upgradeInProgress) return;
  const current = app.getVersion();
  const target = await fetchLatestCaskVersion();
  if (!target) return;
  if (cmpVersion(current, target) >= 0) return;
  try {

    const brewCmd = 'brew upgrade --cask blackmagic-ai';
    const brewPath = resolveBrewPath();
    const canAutoUpgrade = !!brewPath;

    const buttons = canAutoUpgrade
      ? ['Upgrade and relaunch', 'Copy command and quit', 'Quit']
      : ['Copy command and quit', 'Quit'];
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Update required',
      message: `BlackMagic AI ${current} is out of date.`,
      detail: canAutoUpgrade
        ? `The latest version is ${target}. "Upgrade and relaunch" runs \`${brewCmd}\` for you and reopens the app when it finishes. Or copy the command and upgrade yourself.`
        : `The latest version is ${target}. Homebrew wasn't found on PATH — run this in Terminal, then reopen:\n\n  ${brewCmd}`,
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
      noLink: true,
    });

    if (canAutoUpgrade && choice === 0) {
      launchBrewUpgradeAndRelaunch(brewPath);
      // launchBrewUpgradeAndRelaunch quits the app itself after spawning
      // the detached upgrader, so brew can replace the .app bundle.
      return;
    }

    if ((canAutoUpgrade ? choice === 1 : choice === 0)) {
      try {
        require('electron').clipboard.writeText(brewCmd);
      } catch {}
    }
    app.exit(0);
  } catch (err) {
    console.warn('[main] version-gate check failed:', err?.message || err);
  }
}

// Homebrew installs to /opt/homebrew (Apple Silicon) or /usr/local (Intel).
// Spawned processes from a .app bundle don't inherit the user's shell PATH,
// so we have to probe the known locations directly.
function resolveBrewPath() {
  if (process.platform !== 'darwin') return null;
  const fs = require('node:fs');
  for (const p of ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

// Guard against double-firing: users would hit the upgrade button a
// second time when the first attempt showed no feedback, spawning two
// brew processes that collided on the download lock and both failed.
// Once true, further version-gate prompts no-op.
let upgradeInProgress = false;

// Spawn a detached upgrader shell script, then quit this app so brew can
// move the new .app bundle into /Applications. The script waits for the
// current process to exit, runs `brew upgrade`, and re-opens the app.
// Output is captured to a log in the user's Library/Logs so a failed
// upgrade leaves a breadcrumb instead of vanishing silently.
function launchBrewUpgradeAndRelaunch(brewPath) {
  if (upgradeInProgress) return;
  upgradeInProgress = true;
  const { spawn } = require('node:child_process');
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const logDir = path.join(os.homedir(), 'Library', 'Logs', 'BlackMagic AI');
  try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
  const logPath = path.join(logDir, `auto-upgrade-${Date.now()}.log`);

  // Pre-create the log file so the progress Terminal has something to
  // tail — otherwise `tail -f` would spin on a non-existent path.
  try { fs.writeFileSync(logPath, `[upgrade log] ${new Date().toISOString()}\n`, 'utf-8'); } catch {}

  // Open a Terminal.app window that tails the upgrade log. This gives the
  // user a real visible window showing brew's download progress + install
  // steps in real time, so the "I clicked upgrade and nothing happened"
  // experience is gone. Terminal auto-closes when the tail's sentinel file
  // appears (upgrade-complete.flag), then relaunches the app.
  const flagPath = path.join(logDir, `upgrade-done-${Date.now()}.flag`);
  const progressCmd = [
    `clear`,
    `printf '\\e]0;BlackMagic AI — Upgrading\\a'`,
    `echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'`,
    `echo '   BlackMagic AI — Upgrading via Homebrew'`,
    `echo '   This window will close + reopen the app when done.'`,
    `echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'`,
    `echo`,
    // Follow the log file, but also exit the tail as soon as the flag
    // file appears. The subshell running tail watches the flag in the
    // background and kills itself when it sees it.
    `( tail -f "${logPath}" & tpid=$!; while [ ! -f "${flagPath}" ]; do sleep 0.5; done; sleep 2; kill $tpid 2>/dev/null )`,
    `echo`,
    `echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'`,
    `echo '   Upgrade finished. Reopening BlackMagic AI…'`,
    `echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'`,
    `sleep 1`,
    // Close this Terminal tab/window. `osascript` runs outside the bundle
    // being replaced so it's safe.
    `osascript -e 'tell application "Terminal" to close (every window whose name contains "Upgrading")' 2>/dev/null || true`,
  ].join('; ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  try {
    spawn('/usr/bin/osascript', [
      '-e',
      `tell application "Terminal" to do script "${progressCmd}"`,
      '-e',
      'tell application "Terminal" to activate',
    ], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // Fallback: silent notification. User won't see progress but at least
    // knows something is happening.
    try {
      spawn('/usr/bin/osascript', [
        '-e',
        'display notification "Downloading the latest version. Watch ~/Library/Logs/BlackMagic AI/auto-upgrade-*.log for progress." with title "BlackMagic AI" subtitle "Upgrade started"',
      ], { detached: true, stdio: 'ignore' }).unref();
    } catch {}
  }

  const pid = process.pid;
  const script = `#!/bin/sh
set -u
exec >>"${logPath}" 2>&1
echo "[$(date -u +%FT%TZ)] auto-upgrade starting; waiting for pid ${pid}"
# Wait up to 30s for the old app to fully exit so brew can replace it.
for i in $(seq 1 60); do
  if ! kill -0 ${pid} 2>/dev/null; then break; fi
  sleep 0.5
done
# Clean any abandoned zombie daemon processes from prior upgrade attempts.
# macOS won't let brew replace the .app while any process in it is alive.
pkill -9 -f "/Applications/BlackMagic AI.app" 2>/dev/null || true
# Clear stale download locks from a killed earlier upgrade — otherwise
# brew refuses with "A brew upgrade process has already locked ..." and
# exits 1, leaving the user on the old version.
rm -f ~/Library/Caches/Homebrew/downloads/*BlackMagic*incomplete* 2>/dev/null || true
rm -f ~/Library/Caches/Homebrew/Cask/blackmagic-ai--*.incomplete 2>/dev/null || true
echo "[$(date -u +%FT%TZ)] refreshing tap: ${brewPath} update --quiet"
"${brewPath}" update --quiet
echo "[$(date -u +%FT%TZ)] running: ${brewPath} upgrade --cask blackmagic-ai --greedy"
"${brewPath}" upgrade --cask blackmagic-ai --greedy
status=$?
echo "[$(date -u +%FT%TZ)] brew exit=$status"
# brew refuses to upgrade if it thinks we're already at latest (stale tap
# cache, cask auto-updates disabled, etc). Detect that and force a
# reinstall so the relaunch loop actually breaks.
if [ "$status" -eq 0 ]; then
  installed=$("${brewPath}" list --cask --versions blackmagic-ai 2>/dev/null | awk '{print $2}')
  latest=$("${brewPath}" info --cask --json=v2 blackmagic-ai 2>/dev/null | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["casks"][0]["version"])' 2>/dev/null)
  echo "[$(date -u +%FT%TZ)] post-upgrade: installed=$installed latest=$latest"
  if [ -n "$installed" ] && [ -n "$latest" ] && [ "$installed" != "$latest" ]; then
    echo "[$(date -u +%FT%TZ)] forcing reinstall to pick up $latest"
    "${brewPath}" reinstall --cask blackmagic-ai
    status=$?
    echo "[$(date -u +%FT%TZ)] reinstall exit=$status"
  fi
fi
echo "[$(date -u +%FT%TZ)] done; signalling progress Terminal to close"
# Signal the progress Terminal (tail -f) that we're done. It watches for
# this file and kills its tail + closes the window.
touch "${flagPath}"
if [ "$status" -eq 0 ]; then
  # Brief pause so the Terminal has time to show the "Upgrade finished"
  # banner before we relaunch the app on top of it.
  sleep 2
  open -a "BlackMagic AI"
else
  /usr/bin/osascript -e 'display notification "brew upgrade failed — see ~/Library/Logs/BlackMagic AI" with title "BlackMagic AI"'
fi
`;
  const scriptPath = path.join(os.tmpdir(), `blackmagic-auto-upgrade-${Date.now()}.sh`);
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  const child = spawn('/bin/sh', [scriptPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  console.log('[main] auto-upgrader spawned; log:', logPath);
  app.exit(0);
}

// Soft "newer version available" check. Distribution is brew-only. On
// every launch we poll the Homebrew cask file and, if a newer version
// exists, push an IPC event to the renderer so it can show a banner
// with `brew upgrade --cask blackmagic-ai`.
async function notifyIfNewerAvailable(win) {
  if (!app.isPackaged) return;
  const current = app.getVersion();
  const latest = await fetchLatestCaskVersion();
  if (!latest || cmpVersion(current, latest) >= 0) return;
  win.webContents.send('bm:update-available', {
    currentVersion: current,
    latestVersion: latest,
    brewCommand: 'brew upgrade --cask blackmagic-ai',
  });
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

// Kill the daemon child reliably. Previously we only sent SIGTERM on
// window-all-closed, but on macOS that event fires only when the user
// closes the last window (≠ quitting), so fast app restarts + auto-
// upgrade relaunches piled up zombie daemon processes — users were
// seeing ten+ copies of the daemon after a few upgrade prompts.
// `before-quit` + `will-quit` are the real shutdown hooks; sigterm
// first, then escalate to sigkill if the child is still alive after
// 2s.
function stopDaemon() {
  if (!daemonProcess) return;
  const proc = daemonProcess;
  daemonProcess = null;
  try { proc.kill('SIGTERM'); } catch {}
  setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch {}
  }, 2000).unref?.();
}

app.on('before-quit', stopDaemon);
app.on('will-quit', stopDaemon);

app.on('window-all-closed', () => {
  // On non-darwin platforms closing the last window quits the app.
  // On macOS we stay alive for the dock/activate behavior — but that
  // means stopDaemon() must not run here, it runs on before-quit.
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Belt-and-suspenders: if this Electron process is killed externally
// (Force Quit, upgrade script, crash), the SIGINT/SIGTERM handlers
// still try to take the daemon down with us.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopDaemon();
    app.exit(0);
  });
}
