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

import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  Button,
} from '../../../components/ui/primitives';
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
    <PageShell>
      <PageHeader
        title="Profile your company"
        subtitle="One domain is enough. Black Magic crawls your site and fills in the us/ folder so every draft and research task is grounded in your own context."
        icon={Sparkles}
      />
      <PageBody>
        <Panel>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              label="Domain"
              hint={showDomainError ? 'Enter a valid domain like apidog.com — no scheme, no path.' : 'Your marketing site. e.g. apidog.com'}
              required
              error={showDomainError}
            >
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="apidog.com"
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
                placeholder="https://docs.apidog.com"
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
                placeholder="https://apidog.com/pricing, https://apidog.com/about"
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
                  <Link href="/vault?path=us%2Fcompany.md">
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

        <Panel className="mt-4">
          <div className="text-xs text-muted">
            <span className="text-ink dark:text-[#E6E0D8] font-medium">
              What the agent fills in:
            </span>{' '}
            company overview, product map, pricing, ICP, positioning,
            objections, brand voice, competitors, customers, team. Every
            factual claim cites a source URL; unknowns are marked
            <code> unknown</code> — never invented.
          </div>
        </Panel>
      </PageBody>
    </PageShell>
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
