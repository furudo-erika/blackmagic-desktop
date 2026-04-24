// Preload: expose a small bridge so the renderer knows where the daemon is
// and which local token to use. Nothing else — renderer talks to the daemon
// over fetch.

const { contextBridge, ipcRenderer } = require('electron');

function arg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

// shell.* is not exposed in sandboxed preload — route through IPC.
contextBridge.exposeInMainWorld('bmBridge', {
  daemonPort: Number(arg('bm-daemon-port')) || 0,
  daemonToken: arg('bm-daemon-token'),
  contextPath: arg('bm-context-path'),
  platform: process.platform,
  appVersion: arg('bm-app-version'),
  openExternal: (url) => ipcRenderer.invoke('bm:open-external', String(url)),
  pickFolder: () => ipcRenderer.invoke('bm:pick-folder'),
  notify: (payload) => ipcRenderer.invoke('bm:notify', payload),
  // Main process pushes {currentVersion, latestVersion} when R2's version.json
  // reports a newer release. Renderer renders an "upgrade via brew" banner.
  onUpdateAvailable: (cb) => {
    const handler = (_evt, payload) => cb(payload);
    ipcRenderer.on('bm:update-available', handler);
    return () => ipcRenderer.removeListener('bm:update-available', handler);
  },
});
