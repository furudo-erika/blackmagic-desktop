'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getBridge, setBridge } from '../../lib/bridge';

export default function SettingsPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health() });
  const [port, setPort] = useState('');
  const [token, setToken] = useState('');
  const [bridge, setBridgeState] = useState({ daemonPort: 0, daemonToken: '', vaultPath: '' });

  useEffect(() => {
    const b = getBridge();
    setBridgeState({ daemonPort: b.daemonPort, daemonToken: b.daemonToken, vaultPath: b.vaultPath });
    setPort(String(b.daemonPort || ''));
    setToken(b.daemonToken || '');
  }, []);

  function save() {
    setBridge(Number(port), token);
    setBridgeState({ ...bridge, daemonPort: Number(port), daemonToken: token });
  }

  const tokenPreview = bridge.daemonToken
    ? `${bridge.daemonToken.slice(0, 4)}…${bridge.daemonToken.slice(-4)}`
    : '';

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-muted">Local daemon connection and developer overrides.</p>
      </header>
      <div className="h-full overflow-y-auto px-6 py-6 space-y-6 max-w-2xl">
        <section className="bg-white rounded-xl border border-line p-4">
          <div className="text-xs uppercase tracking-wide text-muted mb-3">Daemon</div>
          {health.isLoading && <div className="text-sm text-muted">checking…</div>}
          {health.error && <div className="text-sm text-flame">{(health.error as Error).message}</div>}
          {health.data && (
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-muted">vaultPath</dt><dd className="font-mono text-xs">{health.data.vaultPath}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">model</dt><dd className="font-mono text-xs">{health.data.model}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">zennConfigured</dt><dd>{health.data.zennConfigured ? 'yes' : 'no'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">version</dt><dd className="font-mono text-xs">{health.data.version}</dd></div>
            </dl>
          )}
        </section>

        <section className="bg-white rounded-xl border border-line p-4">
          <div className="text-xs uppercase tracking-wide text-muted mb-3">Connection</div>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-muted">daemonPort</dt><dd className="font-mono text-xs">{bridge.daemonPort || '(none)'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">daemonToken</dt><dd className="font-mono text-xs">{tokenPreview || '(none)'}</dd></div>
          </dl>
        </section>

        <section className="bg-white rounded-xl border border-line p-4">
          <div className="text-xs uppercase tracking-wide text-muted mb-3">Dev override</div>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted">port</label>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="mt-1 w-full bg-cream border border-line rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-flame"
              />
            </div>
            <div>
              <label className="text-xs text-muted">token</label>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="mt-1 w-full bg-cream border border-line rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-flame"
              />
            </div>
            <button
              onClick={save}
              className="h-9 px-4 rounded-lg bg-flame text-white text-sm font-medium hover:opacity-90"
            >
              Save
            </button>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-line p-4">
          <div className="text-xs uppercase tracking-wide text-muted mb-3">Links</div>
          <div className="flex flex-col gap-2 text-sm">
            <button
              onClick={() => {
                if (health.data?.vaultPath) window.open(`file://${health.data.vaultPath}`);
              }}
              className="text-flame hover:underline text-left"
            >
              Open vault in Finder
            </button>
            <a
              href="https://blackmagic.run/docs"
              target="_blank"
              rel="noreferrer"
              className="text-flame hover:underline"
            >
              Docs
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
