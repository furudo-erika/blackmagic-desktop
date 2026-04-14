'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getBridge, setBridge } from '../lib/bridge';

export function LoginGate({ children }: { children: React.ReactNode }) {
  const [bridgeReady, setBridgeReady] = useState(false);
  const [portDraft, setPortDraft] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');

  useEffect(() => {
    const b = getBridge();
    setBridgeReady(b.daemonPort > 0 && !!b.daemonToken);
  }, []);

  const health = useQuery({
    queryKey: ['health', bridgeReady],
    queryFn: api.health,
    enabled: bridgeReady,
    refetchInterval: (q) => (q.state.data?.zennConfigured ? false : 2000),
  });

  const [keyDraft, setKeyDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submitKey(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await api.setApiKey(keyDraft.trim());
      await health.refetch();
    } catch (e: any) {
      setErr(e?.message || 'failed to save');
    } finally {
      setSaving(false);
    }
  }

  function submitBridge(e: React.FormEvent) {
    e.preventDefault();
    const port = Number(portDraft);
    if (!port || !tokenDraft.trim()) return;
    setBridge(port, tokenDraft.trim());
    setBridgeReady(true);
  }

  if (!bridgeReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-light p-6">
        <form onSubmit={submitBridge} className="w-full max-w-md bg-white rounded-2xl border border-line p-8 shadow-sm">
          <img src="/logo.svg" alt="" width={40} height={40} className="mb-4" />
          <h1 className="text-xl font-semibold mb-1">Developer: connect to daemon</h1>
          <p className="text-sm text-muted mb-6">
            You're running the web UI outside Electron. Paste the port + token from
            <code className="mx-1 text-[11px] bg-cream-light px-1 rounded">~/BlackMagic/.bm/daemon.json</code>.
          </p>
          <label className="block text-xs text-muted mb-1">Port</label>
          <input
            type="number"
            value={portDraft}
            onChange={(e) => setPortDraft(e.target.value)}
            placeholder="45781"
            className="w-full mb-3 bg-white border border-line rounded-md px-3 py-2 text-sm"
          />
          <label className="block text-xs text-muted mb-1">Token</label>
          <input
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            placeholder="base64-ish local token"
            className="w-full mb-4 bg-white border border-line rounded-md px-3 py-2 text-sm font-mono"
          />
          <button type="submit" className="w-full h-10 rounded-md bg-flame text-white text-sm font-medium">
            Connect
          </button>
        </form>
      </div>
    );
  }

  if (health.isLoading || !health.data) {
    return <div className="min-h-screen flex items-center justify-center text-muted text-sm">Connecting to daemon…</div>;
  }

  if (!health.data.zennConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-light p-6">
        <form onSubmit={submitKey} className="w-full max-w-md bg-white rounded-2xl border border-line p-8 shadow-sm">
          <img src="/logo.svg" alt="" width={40} height={40} className="mb-4" />
          <h1 className="text-xl font-semibold mb-1">Sign in</h1>
          <p className="text-sm text-muted mb-6">
            Paste your <code className="text-[11px] bg-cream-light px-1 rounded">ck_…</code> key to unlock the agent.
            Get one from{' '}
            <a
              href="https://blackmagic.run/dashboard/billing"
              target="_blank"
              rel="noreferrer"
              className="text-flame underline"
            >
              blackmagic.run
            </a>{' '}
            (free tier includes starter credits).
          </p>
          <label className="block text-xs text-muted mb-1">API key</label>
          <input
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="ck_xxxxxxxxxxxx"
            autoFocus
            className="w-full mb-3 bg-white border border-line rounded-md px-3 py-2 text-sm font-mono"
          />
          {err && <div className="mb-3 text-sm text-flame">{err}</div>}
          <button
            type="submit"
            disabled={saving || !keyDraft.trim().startsWith('ck_')}
            className="w-full h-10 rounded-md bg-flame text-white text-sm font-medium disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save key & continue'}
          </button>
          <p className="mt-4 text-[11px] text-muted text-center">
            Stored locally at <code className="text-[11px] bg-cream-light px-1 rounded">~/BlackMagic/.bm/config.toml</code>.
            Never uploaded.
          </p>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
