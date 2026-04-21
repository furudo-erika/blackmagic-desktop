// Preload for the upgrade-progress window. Exposes a narrow IPC surface:
//   window.bmUpgrade.onUpdate((payload) => …)  — fires on every poll tick
//   window.bmUpgrade.revealLog()               — opens the log in Finder
//
// The actual log path is passed in via additionalArguments and sent on
// did-finish-load via the `bm:upgrade-init` channel so the renderer can
// remember it for the Reveal button.

const { contextBridge, ipcRenderer } = require('electron');

let cachedLogPath = null;
// Recover from additionalArguments if the main ever changes plumbing.
for (const arg of process.argv) {
  const m = /^--bm-upgrade-log=(.+)$/.exec(arg);
  if (m) { cachedLogPath = m[1]; break; }
}

ipcRenderer.on('bm:upgrade-init', (_e, data) => {
  if (data && typeof data.logPath === 'string') cachedLogPath = data.logPath;
});

contextBridge.exposeInMainWorld('bmUpgrade', {
  onUpdate: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('bm:upgrade-update', (_e, payload) => {
      try { cb(payload); } catch {}
    });
  },
  revealLog: () => {
    if (!cachedLogPath) return;
    ipcRenderer.invoke('bm:upgrade-reveal-log', cachedLogPath).catch(() => {});
  },
});
