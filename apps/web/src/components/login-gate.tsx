'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getBridge, setBridge } from '../lib/bridge';
import { ProjectPicker } from './project-picker';

export function LoginGate({ children }: { children: React.ReactNode }) {
  // Start as null on both SSR and first client render so the initial tree
  // matches. Real value is set in useEffect after mount, so any
  // `window`-dependent branching happens post-hydration.
  const [bridgeReady, setBridgeReady] = useState<boolean | null>(null);
  useEffect(() => {
    const b = getBridge();
    setBridgeReady(b.daemonPort > 0 && !!b.daemonToken);
  }, []);
  const [portDraft, setPortDraft] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');

  // Project picker: shown after bridge-ready the first time, or when the
  // sidebar dispatches "bm:open-project-picker".
  const [seenPicker, setSeenPicker] = useState(false);
  const [forcePicker, setForcePicker] = useState(false);
  useEffect(() => {
    setSeenPicker(localStorage.getItem('bm-projects-seen') === '1');
    const handler = () => setForcePicker(true);
    window.addEventListener('bm:open-project-picker', handler);
    return () => window.removeEventListener('bm:open-project-picker', handler);
  }, []);
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: api.listProjects,
    enabled: !!bridgeReady,
  });
  const showPicker =
    bridgeReady &&
    (forcePicker ||
      (!seenPicker && (projects.data?.projects?.length ?? 0) > 1));

  // Fix: when the picker is skipped on first launch (single-project case),
  // the daemon's VAULT_ROOT never gets set by `activateProject`. Queries
  // then return empty / stale until the user manually switches projects.
  // Force-activate the registered `active` project once per session.
  const [vaultHydrated, setVaultHydrated] = useState(false);
  useEffect(() => {
    if (!bridgeReady || vaultHydrated) return;
    const active = projects.data?.active;
    if (!active) return;
    api
      .activateProject(active)
      .catch(() => {
        /* best-effort — ignore */
      })
      .finally(() => setVaultHydrated(true));
  }, [bridgeReady, vaultHydrated, projects.data?.active]);

  const health = useQuery({
    queryKey: ['health', bridgeReady],
    queryFn: api.health,
    enabled: !!bridgeReady,
    refetchInterval: (q) => (q.state.data?.zennConfigured ? false : 2000),
  });

  useEffect(() => {
    if (health.data?.zennConfigured) {
      localStorage.setItem('bm-projects-seen', '1');
    }
  }, [health.data?.zennConfigured]);

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

  // Pre-mount: bridgeReady === null. Render a neutral placeholder so the
  // SSR output matches the client first render.
  if (bridgeReady === null) {
    return <div className="min-h-screen flex items-center justify-center text-muted text-sm">Starting…</div>;
  }

  if (!bridgeReady) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-cream-light p-6"
        style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F1EA', padding: 24, position: 'relative', zIndex: 100 }}
      >
        <form
          onSubmit={submitBridge}
          className="w-full max-w-md bg-white rounded-2xl border border-line p-8 shadow-sm"
          style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16, border: '1px solid rgba(55,50,47,0.08)', padding: 32, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
        >
          <img src="/logo.svg" alt="" width={40} height={40} className="mb-4" style={{ marginBottom: 16 }} />
          <h1 className="text-xl font-semibold mb-1" style={{ fontSize: 20, fontWeight: 600, marginBottom: 4, color: '#1A1614' }}>Developer: connect to daemon</h1>
          <p className="text-sm text-muted mb-6" style={{ fontSize: 14, color: '#605A57', marginBottom: 24 }}>
            You're running the web UI outside Electron. Paste the port + token from
            <code className="mx-1 text-[11px] bg-cream-light px-1 rounded" style={{ margin: '0 4px', fontSize: 11, background: '#F5F1EA', padding: '1px 4px', borderRadius: 3 }}>~/BlackMagic/.bm/daemon.json</code>.
          </p>
          <label className="block text-xs text-muted mb-1" style={{ display: 'block', fontSize: 12, color: '#605A57', marginBottom: 4 }}>Port</label>
          <input
            type="number"
            value={portDraft}
            onChange={(e) => setPortDraft(e.target.value)}
            placeholder="45781"
            className="w-full mb-3 bg-white border border-line rounded-md px-3 py-2 text-sm"
            style={{ width: '100%', marginBottom: 12, background: '#fff', border: '1px solid rgba(55,50,47,0.12)', borderRadius: 6, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }}
          />
          <label className="block text-xs text-muted mb-1" style={{ display: 'block', fontSize: 12, color: '#605A57', marginBottom: 4 }}>Token</label>
          <input
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            placeholder="base64-ish local token"
            className="w-full mb-4 bg-white border border-line rounded-md px-3 py-2 text-sm font-mono"
            style={{ width: '100%', marginBottom: 16, background: '#fff', border: '1px solid rgba(55,50,47,0.12)', borderRadius: 6, padding: '8px 12px', fontSize: 14, fontFamily: 'ui-monospace, Menlo, monospace', boxSizing: 'border-box' }}
          />
          <button
            type="submit"
            className="w-full h-10 rounded-md bg-flame text-white text-sm font-medium"
            style={{ width: '100%', height: 40, borderRadius: 6, background: '#E8523A', color: '#fff', fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer' }}
          >
            Connect
          </button>
        </form>
      </div>
    );
  }

  if (showPicker) {
    return (
      <ProjectPicker
        mode="page"
        onActivated={() => {
          localStorage.setItem('bm-projects-seen', '1');
          setSeenPicker(true);
          setForcePicker(false);
        }}
      />
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
        domain: 'vercel.com',
        what_you_sell: 'The Frontend Cloud — develop, preview, and ship Next.js and any other frontend.',
        icp: '50–5,000 people; B2B SaaS / e-commerce / AI-native; Next.js or migrating to it; 5–200 web engineers',
        tone: 'Precise, developer-first, quietly confident — allergic to marketing puff',
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
            Just want to poke around? Load the <strong className="text-ink dark:text-[#F5F1EA]">Vercel</strong> demo vault (populated <code className="text-[11px]">us/</code> + one sample prospect + deal).
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

