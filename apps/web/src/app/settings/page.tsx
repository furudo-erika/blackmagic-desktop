'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getBridge, setBridge } from '../../lib/bridge';
import { ExternalLink, FolderOpen, Cpu, KeyRound, Settings as SettingsIcon, Plug, Sun, Moon, FileText } from 'lucide-react';
import { PageShell, PageHeader, PageBody } from '../../components/ui/primitives';
import { Markdown } from '../../components/markdown';

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
  const vault = health.data?.vaultPath ?? '~/BlackMagic';
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: api.listIntegrations });
  const intKeys = useQuery({ queryKey: ['integration-keys'], queryFn: api.integrationKeys });
  const bridge = getBridge();

  const [apifyDraft, setApifyDraft] = useState('');
  const [enrichDraft, setEnrichDraft] = useState('');
  const [hubspotDraft, setHubspotDraft] = useState('');
  const [apolloDraft, setApolloDraft] = useState('');
  const [attioDraft, setAttioDraft] = useState('');
  const [feishuAppIdDraft, setFeishuAppIdDraft] = useState('');
  const [feishuAppSecretDraft, setFeishuAppSecretDraft] = useState('');
  const [feishuWebhookDraft, setFeishuWebhookDraft] = useState('');
  const [metabaseUrlDraft, setMetabaseUrlDraft] = useState('');
  const [metabaseKeyDraft, setMetabaseKeyDraft] = useState('');
  const [supabaseUrlDraft, setSupabaseUrlDraft] = useState('');
  const [supabaseKeyDraft, setSupabaseKeyDraft] = useState('');
  const [slackDraft, setSlackDraft] = useState('');
  const [resendDraft, setResendDraft] = useState('');
  const [fromEmailDraft, setFromEmailDraft] = useState('');
  const [linkedinCookieDraft, setLinkedinCookieDraft] = useState('');
  const [keySaving, setKeySaving] = useState(false);
  const [keySaveMsg, setKeySaveMsg] = useState<string | null>(null);
  async function saveIntegrationKeys() {
    setKeySaving(true);
    setKeySaveMsg(null);
    try {
      const body: Record<string, string> = {};
      if (apifyDraft.trim()) body.apify_api_key = apifyDraft.trim();
      if (enrichDraft.trim()) body.enrichlayer_api_key = enrichDraft.trim();
      if (hubspotDraft.trim()) body.hubspot_api_key = hubspotDraft.trim();
      if (apolloDraft.trim()) body.apollo_api_key = apolloDraft.trim();
      if (attioDraft.trim()) body.attio_api_key = attioDraft.trim();
      if (feishuAppIdDraft.trim()) body.feishu_app_id = feishuAppIdDraft.trim();
      if (feishuAppSecretDraft.trim()) body.feishu_app_secret = feishuAppSecretDraft.trim();
      if (feishuWebhookDraft.trim()) body.feishu_webhook_url = feishuWebhookDraft.trim();
      if (metabaseUrlDraft.trim()) body.metabase_site_url = metabaseUrlDraft.trim();
      if (metabaseKeyDraft.trim()) body.metabase_api_key = metabaseKeyDraft.trim();
      if (supabaseUrlDraft.trim()) body.supabase_url = supabaseUrlDraft.trim();
      if (supabaseKeyDraft.trim()) body.supabase_service_role_key = supabaseKeyDraft.trim();
      if (slackDraft.trim()) body.slack_webhook_url = slackDraft.trim();
      if (resendDraft.trim()) body.resend_api_key = resendDraft.trim();
      if (fromEmailDraft.trim()) body.from_email = fromEmailDraft.trim();
      if (linkedinCookieDraft.trim()) body.linkedin_cookie = linkedinCookieDraft.trim();
      if (Object.keys(body).length === 0) {
        setKeySaveMsg('nothing to save');
      } else {
        await api.setIntegrationKeys(body);
        setApifyDraft('');
        setEnrichDraft('');
        setHubspotDraft('');
        setApolloDraft('');
        setAttioDraft('');
        setFeishuAppIdDraft('');
        setFeishuAppSecretDraft('');
        setFeishuWebhookDraft('');
        setMetabaseUrlDraft('');
        setMetabaseKeyDraft('');
        setSupabaseUrlDraft('');
        setSupabaseKeyDraft('');
        setSlackDraft('');
        setResendDraft('');
        setFromEmailDraft('');
        setLinkedinCookieDraft('');
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
    <PageShell>
      <PageHeader
        title="Settings"
        subtitle="Vault path, default model, billing key and developer options — anything that affects this device."
        icon={SettingsIcon}
      />
      <PageBody maxWidth="2xl">
        <div className="space-y-4">

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
              Model can be changed by editing{' '}
              <code className="text-[11px]">{vault}/.bm/config.toml</code>:
              {' '}
              <code className="text-[11px]">
                default_model = "{health.data?.model ?? 'gpt-5.3-codex'}"
              </code>
            </p>
          </Section>

          <Section icon={KeyRound} title="Account">
            <KV k="Signed in" v={health.data?.zennConfigured ? <span className="text-[#7E8C67]">yes</span> : <span className="text-flame">no</span>} />
            <KV k="Key" v={<code className="text-[11px]">{vault}/.bm/config.toml</code>} mono />
            <p className="text-[11px] text-muted dark:text-[#8C837C]">
              Manage all keys at{' '}
              <a
                href="https://blackmagic.engineering/dashboard/api-keys"
                onClick={(e) => {
                  if (window.bmBridge?.openExternal) {
                    e.preventDefault();
                    window.bmBridge.openExternal('https://blackmagic.engineering/dashboard/api-keys');
                  }
                }}
                target="_blank"
                rel="noreferrer"
                className="text-flame underline"
              >
                blackmagic.engineering/dashboard/api-keys
              </a>. Revoke this key to sign out.
            </p>
          </Section>

          <Section icon={KeyRound} title="Integration keys">
            <p className="text-[11px] text-muted dark:text-[#8C837C]">
              Bring-your-own keys for EnrichLayer, Apify, HubSpot CRM, Slack,
              Resend email and LinkedIn session cookie. Stored locally in{' '}
              <code className="text-[11px]">{vault}/.bm/config.toml</code> and
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
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  HubSpot
                </label>
                <input
                  type="password"
                  value={hubspotDraft}
                  onChange={(e) => setHubspotDraft(e.target.value)}
                  placeholder={intKeys.data?.hubspot_api_key ? '••• (saved)' : 'pat-… Private App token'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  Apollo
                </label>
                <input
                  type="password"
                  value={apolloDraft}
                  onChange={(e) => setApolloDraft(e.target.value)}
                  placeholder={intKeys.data?.apollo_api_key ? '••• (saved)' : 'Apollo API key'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  Attio
                </label>
                <input
                  type="password"
                  value={attioDraft}
                  onChange={(e) => setAttioDraft(e.target.value)}
                  placeholder={intKeys.data?.attio_api_key ? '••• (saved)' : 'Attio API key (Bearer token)'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  Feishu app id
                </label>
                <input
                  type="text"
                  value={feishuAppIdDraft}
                  onChange={(e) => setFeishuAppIdDraft(e.target.value)}
                  placeholder={intKeys.data?.feishu_app_id ? '••• (saved)' : 'cli_xxxxxxxxxxxx'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  Feishu secret
                </label>
                <input
                  type="password"
                  value={feishuAppSecretDraft}
                  onChange={(e) => setFeishuAppSecretDraft(e.target.value)}
                  placeholder={intKeys.data?.feishu_app_secret ? '••• (saved)' : 'app secret'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  Feishu webhook
                </label>
                <input
                  type="password"
                  value={feishuWebhookDraft}
                  onChange={(e) => setFeishuWebhookDraft(e.target.value)}
                  placeholder={intKeys.data?.feishu_webhook_url ? '••• (saved)' : 'https://open.feishu.cn/open-apis/bot/v2/hook/…'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  Metabase URL
                </label>
                <input
                  type="text"
                  value={metabaseUrlDraft}
                  onChange={(e) => setMetabaseUrlDraft(e.target.value)}
                  placeholder={intKeys.data?.metabase_site_url ? '••• (saved)' : 'https://metabase.yourco.com'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  Metabase key
                </label>
                <input
                  type="password"
                  value={metabaseKeyDraft}
                  onChange={(e) => setMetabaseKeyDraft(e.target.value)}
                  placeholder={intKeys.data?.metabase_api_key ? '••• (saved)' : 'mb_api_… (Admin → API Keys)'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  Supabase URL
                </label>
                <input
                  type="text"
                  value={supabaseUrlDraft}
                  onChange={(e) => setSupabaseUrlDraft(e.target.value)}
                  placeholder={intKeys.data?.supabase_url ? '••• (saved)' : 'https://xxxx.supabase.co'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  Supabase key
                </label>
                <input
                  type="password"
                  value={supabaseKeyDraft}
                  onChange={(e) => setSupabaseKeyDraft(e.target.value)}
                  placeholder={intKeys.data?.supabase_service_role_key ? '••• (saved)' : 'service_role eyJhbGci…'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  Slack webhook
                </label>
                <input
                  type="password"
                  value={slackDraft}
                  onChange={(e) => setSlackDraft(e.target.value)}
                  placeholder={intKeys.data?.slack_webhook_url ? '••• (saved)' : 'https://hooks.slack.com/services/…'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  Resend
                </label>
                <input
                  type="password"
                  value={resendDraft}
                  onChange={(e) => setResendDraft(e.target.value)}
                  placeholder={intKeys.data?.resend_api_key ? '••• (saved)' : 're_… API key'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-36 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  From email
                </label>
                <input
                  type="text"
                  value={fromEmailDraft}
                  onChange={(e) => setFromEmailDraft(e.target.value)}
                  placeholder={intKeys.data?.from_email ? '••• (saved)' : 'Name <you@yourdomain.com>'}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
                />
              </div>
              <div className="flex items-start gap-2">
                <label className="w-36 mt-1.5 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
                  LinkedIn cookie
                </label>
                <textarea
                  value={linkedinCookieDraft}
                  onChange={(e) => setLinkedinCookieDraft(e.target.value)}
                  placeholder={intKeys.data?.linkedin_cookie ? '••• (saved) — paste new li_at=… to rotate' : 'li_at=…; JSESSIONID=…  (optional, required only for DM automation — ToS-grey-area)'}
                  rows={2}
                  className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono resize-none"
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

          <Section icon={FileText} title="What's new">
            <ChangelogBlock />
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
            v{health.data?.version ?? '…'} · open source · MIT
          </p>
        </div>
      </PageBody>
    </PageShell>
  );
}

function ChangelogBlock() {
  const changelog = useQuery({
    queryKey: ['changelog'],
    queryFn: api.changelog,
    staleTime: 5 * 60_000,
  });
  if (changelog.isLoading) {
    return <div className="text-[12px] text-muted dark:text-[#8C837C]">Loading…</div>;
  }
  if (changelog.isError) {
    return <div className="text-[12px] text-flame">Failed to load changelog.</div>;
  }
  const content = changelog.data?.content ?? '';
  return (
    <div className="max-h-[420px] overflow-y-auto pr-2 prose prose-sm dark:prose-invert max-w-none text-[12.5px]">
      <Markdown source={content} />
    </div>
  );
}
