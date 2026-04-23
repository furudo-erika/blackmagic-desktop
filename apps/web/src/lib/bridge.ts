// Dev fallback: when running in `next dev` outside Electron, read overrides
// from localStorage. The Electron preload injects window.bmBridge directly.

declare global {
  interface Window {
    bmBridge?: {
      daemonPort: number;
      daemonToken: string;
      vaultPath: string;
      platform: string;
      appVersion?: string;
      openExternal?: (url: string) => void;
      pickFolder?: () => Promise<string | null>;
      notify?: (payload: {
        title?: string;
        body: string;
        subtitle?: string;
        silent?: boolean;
      }) => Promise<boolean>;
      onUpdateAvailable?: (
        cb: (payload: {
          currentVersion: string;
          latestVersion: string;
          brewCommand: string;
        }) => void,
      ) => () => void;
    };
  }
}

export function getBridge() {
  if (typeof window === 'undefined') {
    return { daemonPort: 0, daemonToken: '', vaultPath: '', platform: 'web' };
  }
  if (window.bmBridge && window.bmBridge.daemonPort) return window.bmBridge;

  const port = Number(localStorage.getItem('bm_daemon_port') || '0');
  const token = localStorage.getItem('bm_daemon_token') || '';
  const vaultPath = localStorage.getItem('bm_vault_path') || '';
  return { daemonPort: port, daemonToken: token, vaultPath, platform: 'web' };
}

export function setBridge(port: number, token: string, vaultPath = '') {
  if (typeof window === 'undefined') return;
  localStorage.setItem('bm_daemon_port', String(port));
  localStorage.setItem('bm_daemon_token', token);
  if (vaultPath) localStorage.setItem('bm_vault_path', vaultPath);
}
