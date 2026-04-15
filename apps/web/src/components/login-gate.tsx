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
  const [showPaste, setShowPaste] = useState(false);
  const [authStarting, setAuthStarting] = useState(false);

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

  async function startOAuth() {
    setAuthStarting(true);
    setErr(null);
    try {
      console.log('[login] calling /api/auth/start');
      const { browserUrl } = await api.authStart();
      console.log('[login] opening browser:', browserUrl);
      const bridge = getBridge();
      if (window.bmBridge?.openExternal) {
        window.bmBridge.openExternal(browserUrl);
      } else {
        window.open(browserUrl, '_blank', 'noopener');
      }
    } catch (e: any) {
      console.error('[login] authStart failed:', e);
      setErr(e?.message || 'failed to start sign-in');
    } finally {
      setAuthStarting(false);
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

  if (health.data.zennConfigured) {
    return (
      <OnboardingGate>
        {children}
      </OnboardingGate>
    );
  }

  if (!health.data.zennConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-light p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-line p-8 shadow-sm">
          <img src="/logo.svg" alt="" width={40} height={40} className="mb-4" />
          <h1 className="text-xl font-semibold mb-1">Sign in</h1>
          <p className="text-sm text-muted mb-6">
            Sign in with your Black Magic account to link this app. Your browser
            will open, and the key will be installed automatically.
          </p>

          <button
            type="button"
            onClick={startOAuth}
            disabled={authStarting}
            className="w-full h-11 rounded-md bg-flame text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {authStarting ? 'Opening browser…' : 'Sign in with blackmagic.run'}
          </button>

          {err && (
            <div className="mt-3 text-xs text-flame bg-flame-soft rounded-md px-3 py-2">
              {err}
            </div>
          )}

          <p className="mt-3 text-[12px] text-muted text-center">
            No account?{' '}
            <a
              href="https://blackmagic.run/register"
              target="_blank"
              rel="noreferrer"
              className="text-flame underline"
              onClick={(e) => {
                if (window.bmBridge?.openExternal) {
                  e.preventDefault();
                  window.bmBridge.openExternal('https://blackmagic.run/register');
                }
              }}
            >
              Create one
            </a>
            {' '}— free tier includes starter credits.
          </p>

          <div className="my-5 border-t border-line" />

          {!showPaste ? (
            <button
              type="button"
              onClick={() => setShowPaste(true)}
              className="w-full text-xs text-muted hover:text-ink"
            >
              Paste a ck_ key manually instead
            </button>
          ) : (
            <form onSubmit={submitKey}>
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
                className="w-full h-10 rounded-md bg-ink text-white text-sm font-medium disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save key & continue'}
              </button>
            </form>
          )}

          <p className="mt-4 text-[11px] text-muted text-center">
            Stored locally at <code className="text-[11px] bg-cream-light px-1 rounded">~/BlackMagic/.bm/config.toml</code>.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const state = useQuery({ queryKey: ['onboarding'], queryFn: api.onboardingState });
  const [domain, setDomain] = useState('');
  const [whatYouSell, setWhatYouSell] = useState('');
  const [icp, setIcp] = useState('');
  const [tone, setTone] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await api.completeOnboarding({
        domain: domain.trim(),
        what_you_sell: whatYouSell.trim() || undefined,
        icp: icp.trim() || undefined,
        tone: tone.trim() || undefined,
      });
      await state.refetch();
    } catch (e: any) {
      setErr(e?.message || 'failed');
    } finally {
      setSaving(false);
    }
  }

  async function seedDemo() {
    setSaving(true);
    setErr(null);
    try {
      await api.seedDemo();
      // Also mark onboarding complete so the gate lifts.
      await api.completeOnboarding({
        domain: 'acmecloud.example',
        what_you_sell: 'Schema-first observability for serverless teams.',
        icp: '50–500 people; B2B SaaS / fintech API / dev tools; AWS or GCP; 10–80 engineers; no dedicated SRE yet',
        tone: 'Technically precise, a little dry, never breathless',
      });
      await state.refetch();
    } catch (e: any) {
      setErr(e?.message || 'failed to load demo');
    } finally {
      setSaving(false);
    }
  }

  if (state.isLoading) return <>{children}</>;
  if (!state.data?.needsOnboarding) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-light dark:bg-[#17140F] p-6">
      <form onSubmit={submit} className="w-full max-w-xl bg-white dark:bg-[#1F1B15] rounded-2xl border border-line dark:border-[#2A241D] p-8 shadow-sm">
        <img src="/logo.svg" alt="" width={40} height={40} className="mb-4 dark:invert" />
        <h1 className="text-xl font-semibold text-ink dark:text-[#F5F1EA] mb-1">Tell us about your company</h1>
        <p className="text-sm text-muted dark:text-[#8C837C] mb-4">
          Just your domain is enough — Black Magic AI will crawl your site and docs to fill in <code className="text-[11px] bg-cream-light dark:bg-[#17140F] px-1 rounded">us/company.md</code>, <code className="text-[11px] bg-cream-light dark:bg-[#17140F] px-1 rounded">product/</code>, <code className="text-[11px] bg-cream-light dark:bg-[#17140F] px-1 rounded">market/</code>, <code className="text-[11px] bg-cream-light dark:bg-[#17140F] px-1 rounded">brand/</code>, etc. You can edit anything by hand later.
        </p>

        {/* Demo shortcut */}
        <div className="mb-5 p-3 rounded-lg border border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F] flex items-center justify-between gap-3">
          <div className="text-[12px] text-muted dark:text-[#8C837C]">
            Just want to poke around? Load the fictional <strong className="text-ink dark:text-[#F5F1EA]">Acme Cloud</strong> demo vault (populated <code className="text-[11px]">us/</code> + one sample prospect + deal).
          </div>
          <button
            type="button"
            onClick={seedDemo}
            disabled={saving}
            className="shrink-0 h-8 px-3 rounded-md border border-flame text-flame text-[12px] font-medium hover:bg-flame hover:text-white transition-colors disabled:opacity-40"
          >
            Try demo
          </button>
        </div>

        <label className="block text-xs text-muted dark:text-[#8C837C] mb-1">Your company domain *</label>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          autoFocus
          required
          className="w-full mb-4 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-2 text-sm font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
        />

        <label className="block text-xs text-muted dark:text-[#8C837C] mb-1">What do you sell? (optional)</label>
        <textarea
          value={whatYouSell}
          onChange={(e) => setWhatYouSell(e.target.value)}
          rows={2}
          placeholder="One sentence — e.g. 'Infra monitoring for Kubernetes shops'"
          className="w-full mb-4 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-2 text-sm text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
        />

        <label className="block text-xs text-muted dark:text-[#8C837C] mb-1">ICP (optional)</label>
        <textarea
          value={icp}
          onChange={(e) => setIcp(e.target.value)}
          rows={3}
          placeholder={'- Series B+ SaaS, 200-2000 employees\n- Uses HubSpot or Salesforce\n- US / EU HQ'}
          className="w-full mb-4 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-2 text-sm text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
        />

        <label className="block text-xs text-muted dark:text-[#8C837C] mb-1">Tone (optional)</label>
        <input
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="e.g. direct, specific, zero corporate filler"
          className="w-full mb-4 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-2 text-sm text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
        />

        {err && <div className="mb-3 text-sm text-flame bg-flame-soft rounded-md px-3 py-2">{err}</div>}

        <button
          type="submit"
          disabled={saving || !domain.trim()}
          className="w-full h-11 rounded-md bg-flame text-white text-sm font-medium disabled:opacity-40"
        >
          {saving ? 'Setting up…' : 'Enrich & continue'}
        </button>

        <button
          type="button"
          onClick={async () => {
            // Skip — write a minimal me.md so we don't keep asking.
            await api.completeOnboarding({ domain: 'self.local', what_you_sell: '(to fill)', icp: '(to fill)' });
            state.refetch();
          }}
          className="w-full mt-2 text-xs text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]"
        >
          Skip for now
        </button>
      </form>
    </div>
  );
}
