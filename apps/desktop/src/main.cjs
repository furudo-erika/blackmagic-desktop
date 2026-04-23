// Electron main. Responsibilities:
//  1. Spawn the Node daemon as a child process.
//  2. Wait for its discovery file ~/BlackMagic/.bm/daemon.json.
//  3. Create a BrowserWindow loading either the dev URL (http://localhost:<port>)
//     or the packaged static export (resources/web/index.html).
//  4. Inject daemon port + local token into window.bmBridge.

const { app, BrowserWindow, Menu, Notification, ipcMain, shell, nativeImage, dialog } = require('electron');
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

// Native macOS notification. Uses Electron's Notification (not osascript)
// so the notification is attributed to `run.blackmagic.desktop` and shows
// up under "BlackMagic AI" in System Settings → Notifications. osascript
// notifications are attributed to Script Editor and get silently dropped
// unless the user has opened that permission slot — which nobody does.
function notify({ title, body, subtitle, silent } = {}) {
  try {
    if (!Notification.isSupported()) return false;
    const n = new Notification({
      title: title || APP_NAME,
      subtitle: subtitle || undefined,
      body: body || '',
      silent: Boolean(silent),
    });
    n.show();
    return true;
  } catch (err) {
    console.error('[main] notify failed:', err);
    return false;
  }
}

ipcMain.handle('bm:notify', (_e, payload) => {
  if (!payload || typeof payload !== 'object') return false;
  return notify({
    title: typeof payload.title === 'string' ? payload.title : undefined,
    body: typeof payload.body === 'string' ? payload.body : '',
    subtitle: typeof payload.subtitle === 'string' ? payload.subtitle : undefined,
    silent: Boolean(payload.silent),
  });
});

// Warmup: on first-ever run fire a silent notification so macOS adds
// BlackMagic AI to System Settings → Notifications and prompts the user
// to allow/deny. Without this the first time we try to notify anything
// the permission slot doesn't exist yet and the notification drops.
function warmupNotificationsOnce() {
  try {
    const flag = path.join(app.getPath('userData'), '.notif-warmed');
    if (fs.existsSync(flag)) return;
    notify({
      title: APP_NAME,
      body: 'Notifications enabled. You can turn these off in System Settings → Notifications.',
      silent: true,
    });
    fs.mkdirSync(path.dirname(flag), { recursive: true });
    fs.writeFileSync(flag, String(Date.now()), 'utf-8');
  } catch (err) {
    console.error('[main] notification warmup failed:', err);
  }
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

// Show a real Electron progress window tracking the brew upgrade. Keeps
// the user looking at something with a progress bar + scrolling log tail
// until brew finishes, then exits + relaunches. Previous versions either
// silently exited (0.4.14 and earlier) or spawned a Terminal.app tail
// (0.4.17) — both looked broken to users. A proper BrowserWindow with a
// native progress bar ships actual feedback.
let progressWindow = null;

function openProgressWindow(logPath) {
  try {
    const win = new BrowserWindow({
      width: 760,
      height: 620,
      resizable: true,
      minWidth: 560,
      minHeight: 420,
      minimizable: true,
      maximizable: false,
      title: 'Upgrading BlackMagic AI',
      backgroundColor: '#17140F',
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        preload: path.join(__dirname, 'preload-upgrade.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        additionalArguments: [`--bm-upgrade-log=${logPath}`],
      },
    });
    const htmlPath = app.isPackaged
      ? path.join(process.resourcesPath, 'upgrade-progress.html')
      : path.join(__dirname, '..', 'resources', 'upgrade-progress.html');
    win.loadFile(htmlPath);
    win.setAlwaysOnTop(true, 'floating');
    win.show();
    return win;
  } catch (err) {
    console.warn('[main] progress window failed to open:', err?.message || err);
    return null;
  }
}

function pollLogAndPush(win, logPath, flagPath) {
  let lastSize = 0;
  const start = Date.now();
  const interval = setInterval(() => {
    if (win.isDestroyed()) { clearInterval(interval); return; }
    try {
      const stat = fs.statSync(logPath);
      if (stat.size !== lastSize) {
        lastSize = stat.size;
        const raw = fs.readFileSync(logPath, 'utf-8');
        const tail = raw.slice(-6000);
        // Coarse stage detection — keep the HTML script and this in sync.
        const lower = tail.toLowerCase();
        let pct = null;
        let stage = null;
        if (lower.includes('brew exit=') || lower.includes('reinstall exit=')) { pct = 95; stage = 'Finishing…'; }
        else if (lower.includes('purging')) { pct = 85; stage = 'Installing the new version…'; }
        else if (lower.includes('moving') || lower.includes('linking')) { pct = 80; stage = 'Moving app into place…'; }
        else if (lower.includes('fetching') || lower.includes('downloading')) { pct = 40; stage = 'Downloading the DMG…'; }
        else if (lower.includes('refreshing tap') || lower.includes('updating homebrew')) { pct = 15; stage = 'Refreshing Homebrew tap…'; }
        else if (lower.includes('auto-upgrade starting')) { pct = 5; stage = 'Starting upgrade…'; }
        win.webContents.send('bm:upgrade-update', { log: tail, pct, stage });
      }
    } catch {}
    // Flag file appears when brew script finishes. Read its contents for
    // exit status — "ok" or a non-zero number.
    if (fs.existsSync(flagPath)) {
      clearInterval(interval);
      let ok = true;
      try {
        const flag = fs.readFileSync(flagPath, 'utf-8').trim();
        ok = flag === 'ok' || flag === '0';
      } catch {}
      try { win.webContents.send('bm:upgrade-update', { done: true, ok }); } catch {}
      // Give the user ~2s to read the final state, then exit. If the
      // upgrade succeeded the shell script will re-open the app after
      // it sees the main process is gone.
      setTimeout(() => {
        try { if (!win.isDestroyed()) win.close(); } catch {}
        app.exit(0);
      }, 2200);
    }
    // Safety net: if the log never grows for 4 minutes, bail out.
    if (Date.now() - start > 4 * 60 * 1000 && lastSize === 0) {
      clearInterval(interval);
      try { win.webContents.send('bm:upgrade-update', { done: true, ok: false }); } catch {}
      setTimeout(() => app.exit(0), 2500);
    }
  }, 500);
}

// IPC for the progress window — lets the user hit "Reveal log" in Finder.
ipcMain.handle('bm:upgrade-reveal-log', (_e, logPath) => {
  try { shell.showItemInFolder(logPath); } catch {}
});

// Spawn a detached upgrader shell script. The shell waits for the main
// window to exit (we keep it alive only while the progress window is
// open — brew's atomic `.app` replacement happens at the very end after
// the download, so keeping a second Electron window up during download
// is safe), runs `brew upgrade`, writes a flag file when done, and then
// re-opens the app. Output is captured to a log that the progress
// window tails in real time.
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
  const flagPath = path.join(logDir, `upgrade-done-${Date.now()}.flag`);

  // Pre-create the log so the progress window's tail has something to
  // read from frame zero.
  try { fs.writeFileSync(logPath, `[upgrade log] ${new Date().toISOString()}\n`, 'utf-8'); } catch {}

  // Hide all existing windows so the user focuses on the progress UI.
  // The main window stays alive until we app.exit() below — we don't
  // close it here to avoid firing the "window-all-closed → quit" path.
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.hide(); } catch {}
  }

  // Pop the progress window.
  progressWindow = openProgressWindow(logPath);
  if (progressWindow) {
    // Drive the log-to-UI plumbing.
    pollLogAndPush(progressWindow, logPath, flagPath);
    // Hand the real log path to the renderer so "Reveal log" can open
    // the right file (additionalArguments is preload-visible only).
    progressWindow.webContents.on('did-finish-load', () => {
      try { progressWindow.webContents.send('bm:upgrade-init', { logPath }); } catch {}
    });
  } else {
    // Fallback: native notification if the progress window couldn't open.
    notify({
      title: APP_NAME,
      subtitle: 'Upgrade started',
      body: 'Downloading the latest version. Watch ~/Library/Logs/BlackMagic AI/ for progress.',
    });
  }

  const pid = process.pid;
  const script = `#!/bin/sh
set -u
exec >>"${logPath}" 2>&1
echo "[$(date -u +%FT%TZ)] auto-upgrade starting; main pid ${pid} stays alive for progress window"
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
echo "[$(date -u +%FT%TZ)] done; signalling progress window"
# Write a status marker so the Electron progress window can branch on
# ok vs fail. Polls every 500ms waiting for this file.
if [ "$status" -eq 0 ]; then echo ok > "${flagPath}"; else echo "$status" > "${flagPath}"; fi

# Wait for the progress window's parent Electron process to exit before
# relaunching. If we run open -a while the old app is still alive, macOS
# just foregrounds the old process instead of launching the replaced
# binary. Cap at 20s.
for i in $(seq 1 40); do
  if ! pgrep -f "/Applications/BlackMagic AI.app/Contents/MacOS/BlackMagic AI" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
# Extra belt-and-suspenders: kill any lingering app/daemon processes so
# the re-open comes up clean.
pkill -9 -f "/Applications/BlackMagic AI.app" 2>/dev/null || true
sleep 1
if [ "$status" -eq 0 ]; then
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
  // Intentionally NOT calling app.exit() here. The progress window needs
  // the main Electron process alive to receive IPC updates. pollLogAndPush
  // will call app.exit(0) once brew has written the flag file and the user
  // has seen the "complete" state for ~2s. The shell script then reopens
  // the replaced app bundle.
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
