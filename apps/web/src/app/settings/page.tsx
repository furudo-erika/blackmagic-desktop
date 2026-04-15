'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getBridge, setBridge } from '../../lib/bridge';
import { ExternalLink, FolderOpen, Cpu, KeyRound, Settings as SettingsIcon, Plug, Sun, Moon } from 'lucide-react';

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-muted dark:text-[#8C837C]" />
        <h2 className="text-sm font-semibold text-ink dark:text-[#F5F1EA]">{title}</h2>
      </div>
      <div className="space-y-3 text-[13px] text-muted dark:text-[#8C837C]">{children}</div>
    </section>
  );
}

function KV({ k, v, mono = false }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">{k}</span>
      <span className={'text-right text-ink dark:text-[#E6E0D8] truncate ' + (mono ? 'font-mono text-[12px]' : '')}>{v}</span>
    </div>
  );
}

export default function SettingsPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 5_000 });
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: api.listIntegrations });
  const intKeys = useQuery({ queryKey: ['integration-keys'], queryFn: api.integrationKeys });
  const bridge = getBridge();

  const [apifyDraft, setApifyDraft] = useState('');
  const [enrichDraft, setEnrichDraft] = useState('');
  const [keySaving, setKeySaving] = useState(false);
  const [keySaveMsg, setKeySaveMsg] = useState<string | null>(null);
  async function saveIntegrationKeys() {
    setKeySaving(true);
    setKeySaveMsg(null);
    try {
      const body: Record<string, string> = {};
      if (apifyDraft.trim()) body.apify_api_key = apifyDraft.trim();
      if (enrichDraft.trim()) body.enrichlayer_api_key = enrichDraft.trim();
      if (Object.keys(body).length === 0) {
        setKeySaveMsg('nothing to save');
      } else {
        await api.setIntegrationKeys(body);
        setApifyDraft('');
        setEnrichDraft('');
        setKeySaveMsg('saved');
        intKeys.refetch();
      }
    } catch (err) {
      setKeySaveMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setKeySaving(false);
    }
  }

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);
  function toggleTheme() {
    const next: 'light' | 'dark' = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('bm-theme', next);
    setTheme(next);
  }

  const [portDraft, setPortDraft] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');
  function saveBridge() {
    const port = Number(portDraft);
    if (!port || !tokenDraft.trim()) return;
    setBridge(port, tokenDraft.trim());
    location.reload();
  }

  const connected = (integrations.data?.integrations ?? []).filter((i) => i.status === 'connected');

  return (
    <div className="h-full flex flex-col bg-cream dark:bg-[#0F0D0A]">
      <header className="px-6 py-3 border-b border-line dark:border-[#2A241D]">
        <h1 className="text-base font-semibold text-ink dark:text-[#F5F1EA]">Settings</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-2xl mx-auto space-y-4">

          <Section icon={FolderOpen} title="Vault">
            <KV k="Vault path" v={health.data?.vaultPath ?? '—'} mono />
            <button
              type="button"
              onClick={() => {
                if (health.data?.vaultPath) {
                  window.open('file://' + health.data.vaultPath, '_blank');
                }
              }}
              className="text-flame text-[12px] hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" /> Open in Finder
            </button>
          </Section>

          <Section icon={Cpu} title="Engine">
            <KV k="Default model" v={health.data?.model ?? '—'} mono />
            <KV
              k="Engine"
              v={
                health.data?.engine === 'codex-cli'
                  ? <span className="text-[#7E8C67]">Codex CLI ✓</span>
                  : <span>built-in</span>
              }
            />
            <p className="text-[11px] text-muted dark:text-[#8C837C]">
              Model can be changed by editing <code className="text-[11px]">~/BlackMagic/.bm/config.toml</code>:
              {' '}<code className="text-[11px]">default_model = "gpt-5.3-codex"</code>
            </p>
          </Section>

          <Section icon={KeyRound} title="Account">
            <KV k="Signed in" v={health.data?.zennConfigured ? <span className="text-[#7E8C67]">yes</span> : <span className="text-flame">no</span>} />
            <KV k="Key" v={<code className="text-[11px]">~/BlackMagic/.bm/config.toml</code>} mono />
            <p className="text-[11px] text-muted dark:text-[#8C837C]">
              Manage all keys at{' '}
              <a
                href="https://blackmagic.run/dashboard/api-keys"
                onClick={(e) => {
                  if (window.bmBridge?.openExternal) {
                    e.preventDefault();
                    window.bmBridge.openExternal('https://blackmagic.run/dashboard/api-keys');
                  }
                }}
                target="_blank"
                rel="noreferrer"
                className="text-flame underline"
              >
                blackmagic.run/dashboard/api-keys
              </a>. Revoke this key to sign out.
            </p>
          </Section>

          <Section icon={KeyRound} title="Integration keys">
            <p className="text-[11px] text-muted dark:text-[#8C837C]">
              Bring-your-own keys for EnrichLayer (LinkedIn enrichment) and Apify
              (generic scrapers). Stored locally in{' '}
              <code className="text-[11px]">~/BlackMagic/.bm/config.toml</code> and
              read directly by the built-in tools.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  EnrichLayer
                </label>
                <input
                  type="password"
                  value={enrichDraft}
                  onChange={(e) => setEnrichDraft(e.target.value)}
                  placeholder={intKeys.data?.enrichlayer_api_key ? '••• (saved)' : 'proxycurl-compatible key'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  Apify
                </label>
                <input
                  type="password"
                  value={apifyDraft}
                  onChange={(e) => setApifyDraft(e.target.value)}
                  placeholder={intKeys.data?.apify_api_key ? '••• (saved)' : 'apify_api_… token'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2 justify-end">
                {keySaveMsg && (
                  <span className="text-[11px] text-muted dark:text-[#8C837C]">{keySaveMsg}</span>
                )}
                <button
                  onClick={saveIntegrationKeys}
                  disabled={keySaving}
                  className="h-8 px-3 rounded-md bg-flame text-white text-[12px] disabled:opacity-50"
                >
                  {keySaving ? 'Saving…' : 'Save keys'}
                </button>
              </div>
            </div>
          </Section>

          <Section icon={Plug} title="Integrations">
            {connected.length === 0 ? (
              <p className="text-[12px]">No integrations connected yet. Visit <a href="/integrations" className="text-flame underline">Integrations</a> to connect HubSpot / Gmail / Slack / etc.</p>
            ) : (
              <ul className="space-y-1">
                {connected.map((i) => (
                  <li key={i.provider} className="flex items-center justify-between text-[12px]">
                    <span className="text-ink dark:text-[#E6E0D8] capitalize">{i.provider}</span>
                    <span className="text-[11px] text-muted dark:text-[#8C837C] truncate">{i.connectedAs ?? 'connected'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section icon={SettingsIcon} title="Theme">
            <button
              onClick={toggleTheme}
              className="h-9 px-4 rounded-md border border-line dark:border-[#2A241D] hover:border-flame text-[12px] text-ink dark:text-[#E6E0D8] flex items-center gap-2"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              Switch to {theme === 'dark' ? 'light' : 'dark'}
            </button>
          </Section>

          <details className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl">
            <summary className="cursor-pointer p-5 text-sm font-semibold text-ink dark:text-[#F5F1EA]">
              Developer
            </summary>
            <div className="px-5 pb-5 space-y-3 text-[12px]">
              <KV k="Daemon port" v={String(bridge.daemonPort)} mono />
              <KV k="Local token" v={bridge.daemonToken ? bridge.daemonToken.slice(0, 8) + '…' : '—'} mono />
              <p className="text-[11px] text-muted dark:text-[#8C837C]">
                Override port/token (when running renderer outside Electron):
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={portDraft}
                  onChange={(e) => setPortDraft(e.target.value)}
                  placeholder="port"
                  className="w-24 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
                <input
                  value={tokenDraft}
                  onChange={(e) => setTokenDraft(e.target.value)}
                  placeholder="token"
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
                <button onClick={saveBridge} className="h-8 px-3 rounded-md bg-flame text-white text-[12px]">Save & reload</button>
              </div>
            </div>
          </details>

          <p className="text-[11px] text-muted dark:text-[#6B625C] text-center pt-4">
            v{health.data?.version ?? '0.1.0'} · open source · MIT
          </p>
        </div>
      </div>
    </div>
  );
}
