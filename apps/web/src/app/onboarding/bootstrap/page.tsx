'use client';

/**
 * Company Profiling Agent — first-run onboarding.
 *
 * Collects the user's domain (required) + optional docs URL and extra
 * URLs, then invokes the bundled `bootstrap-self` playbook via the
 * daemon. The playbook crawls the site, runs web_search, and populates
 * `us/company.md`, `us/product/*`, `us/brand/*`, `us/market/*`,
 * `us/competitors/*`, `us/customers/top.md`, `us/team/roster.md`, etc.
 *
 * The form stays trivial on purpose — the agent does the work.
 */

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  CircleCheck,
  Globe,
  Loader2,
  Sparkles,
} from 'lucide-react';

import { Panel, Button } from '../../../components/ui/primitives';
import { api, ApiError } from '../../../lib/api';
import { isValidDomain, normaliseDomain } from '../../../lib/validators';

type Phase = 'idle' | 'running' | 'done' | 'error';

export default function OnboardingBootstrapPage() {
  const [domain, setDomain] = useState('');
  const [docsUrl, setDocsUrl] = useState('');
  const [extraUrls, setExtraUrls] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [final, setFinal] = useState<string>('');
  const [runId, setRunId] = useState<string>('');

  const normalised = normaliseDomain(domain);
  const domainOk = isValidDomain(normalised);
  const canSubmit = domainOk && phase !== 'running';
  const showDomainError = domain.trim().length > 0 && !domainOk;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPhase('running');
    setError(null);
    setFinal('');
    try {
      const inputs: Record<string, string> = {
        domain: normaliseDomain(domain),
      };
      if (docsUrl.trim()) inputs.docs_url = docsUrl.trim();
      if (extraUrls.trim()) inputs.extra_urls = extraUrls.trim();
      const result = await api.runPlaybook('bootstrap-self', inputs);
      setFinal(result.final ?? '');
      setRunId(result.runId ?? '');
      setPhase('done');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown error',
      );
      setPhase('error');
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-cream dark:bg-[#0F0D0A]">
      <div className="max-w-3xl mx-auto px-8 pt-16 pb-20">
        {/* Brand kicker */}
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-muted dark:text-[#8C837C] mb-5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-flame" />
          First-run setup
        </div>

        {/* Huge serif title — matches blackmagic.engineering */}
        <h1 className="font-serif italic text-[44px] md:text-[64px] leading-[1.02] tracking-[-0.015em] text-ink dark:text-[#F5F1EA] mb-5">
          Tell us who you are.
        </h1>

        <p className="text-[16px] leading-[1.65] text-muted dark:text-[#8C837C] max-w-[560px] mb-10">
          One domain is enough. Black Magic crawls your site, reads your
          docs, and fills in <code className="font-mono text-[14px]">us/</code> —
          the folder every agent reads from. Every draft, brief, and research
          task gets grounded in your own context, not generic AI sludge.
        </p>

        <Panel>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              label="Domain"
              hint={showDomainError ? 'Enter a valid domain like acme.com — no scheme, no path.' : 'Your marketing site. e.g. acme.com'}
              required
              error={showDomainError}
            >
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="acme.com"
                  autoFocus
                  disabled={phase === 'running'}
                  className="w-full pl-9 pr-3 h-9 rounded-md border border-line dark:border-[#2A241D] bg-transparent text-sm text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame disabled:opacity-50"
                />
              </div>
            </Field>

            <Field
              label="Docs URL"
              hint="Optional. If present, we extract a feature map with deep_research."
            >
              <input
                value={docsUrl}
                onChange={(e) => setDocsUrl(e.target.value)}
                placeholder="https://docs.acme.com"
                disabled={phase === 'running'}
                className="w-full px-3 h-9 rounded-md border border-line dark:border-[#2A241D] bg-transparent text-sm text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame disabled:opacity-50"
              />
            </Field>

            <Field
              label="Extra URLs"
              hint="Optional, comma-separated. Pricing page, about page, whatever helps."
            >
              <input
                value={extraUrls}
                onChange={(e) => setExtraUrls(e.target.value)}
                placeholder="https://acme.com/pricing, https://acme.com/about"
                disabled={phase === 'running'}
                className="w-full px-3 h-9 rounded-md border border-line dark:border-[#2A241D] bg-transparent text-sm text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame disabled:opacity-50"
              />
            </Field>

            <div className="flex items-center gap-3 pt-1">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={!canSubmit}
              >
                {phase === 'running' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Profiling…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Build my profile
                  </>
                )}
              </Button>
              {phase === 'running' && (
                <span className="text-xs text-muted">
                  This takes ~1–3 minutes. You can navigate away — it runs
                  in the daemon.
                </span>
              )}
            </div>
          </form>
        </Panel>

        {phase === 'error' && error && (
          <Panel className="mt-4 border-flame">
            <div className="text-sm text-flame font-medium mb-1">Profiling failed</div>
            <div className="text-xs text-muted whitespace-pre-wrap break-words">
              {error}
            </div>
          </Panel>
        )}

        {phase === 'done' && (
          <Panel className="mt-4">
            <div className="flex items-start gap-3">
              <CircleCheck className="w-5 h-5 text-flame shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink dark:text-[#E6E0D8]">
                  Your profile is ready
                </div>
                <div className="text-xs text-muted mt-0.5">
                  The agent has written to <code>us/</code>. Review what was
                  filled in and edit anything that's wrong — the rest of
                  Black Magic reads from these files.
                </div>
                {final && (
                  <pre className="mt-3 text-xs whitespace-pre-wrap break-words bg-cream-light dark:bg-[#17140F] rounded-md p-3 max-h-[280px] overflow-auto">
                    {final}
                  </pre>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <Link href="/context?path=us%2Fcompany.md">
                    <Button variant="primary" size="sm">
                      Review us/company.md <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                  {runId && (
                    <Link href={`/runs/${runId}`}>
                      <Button variant="ghost" size="sm">
                        View agent run
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        )}

        {/* What the agent fills in — 3-col Multica-style grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          <FillInCard
            title="Who you are"
            copy="Company overview, product map, pricing, positioning. Pulled from your site + 10-K + about page."
          />
          <FillInCard
            title="Who you sell to"
            copy="ICP, segments, top customers, common objections. Mined from case studies and review sites."
          />
          <FillInCard
            title="How you sound"
            copy="Brand voice, do / don’t list, customer proofs. Extracted from the way you actually write today."
          />
        </div>

        <p className="mt-10 text-[12px] text-muted dark:text-[#8C837C] leading-[1.7]">
          Every factual claim cites a source URL. Unknowns are marked{' '}
          <code className="font-mono">unknown</code> — never invented. You can
          edit anything in the <code className="font-mono">us/</code> folder
          after the run.
        </p>
      </div>
    </div>
  );
}

function FillInCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-[15px] font-semibold text-ink dark:text-[#F5F1EA] leading-snug">
        {title}
      </h4>
      <p className="text-[13px] leading-[1.6] text-muted dark:text-[#8C837C]">
        {copy}
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink dark:text-[#E6E0D8]">
        {label}
        {required && <span className="text-flame ml-1">*</span>}
      </span>
      {children}
      {hint && (
        <span className={'text-[11px] ' + (error ? 'text-flame' : 'text-muted')}>
          {hint}
        </span>
      )}
    </label>
  );
}
