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
  vaultPath: arg('bm-vault-path'),
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke('bm:open-external', String(url)),
});
