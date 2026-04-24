'use client';

// Lead pipeline — manual E2E trigger for enrich → score → route → CRM sync.
// The heavy lifting is in the daemon (`pipeline.ts` + `enrich_score_route`
// tool); this page is a thin client that shows the current rubric, lets the
// user paste a domain + optional overrides, and renders the per-target
// results (context + each connected CRM).
//
// Why this page exists: scoring and routing used to be prompt-driven — the
// LLM was asked to "stamp an icp_score based on us/market/icp.md". That's
// non-deterministic and didn't push back to the CRMs. This page calls the
// deterministic rule engine in the daemon instead, and syncs to every CRM
// the user has connected (HubSpot, Attio, Salesforce, Pipedrive).

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Play, CheckCircle2, XCircle, MinusCircle, Loader2, ScrollText, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { PageShell, PageHeader, PageBody, Panel, Button, SectionHeading, StatusBadge } from '../../components/ui/primitives';

export default function PipelinePage() {
  const [domain, setDomain] = useState('');
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [employees, setEmployees] = useState('');
  const [hq, setHq] = useState('');
  const [techStack, setTechStack] = useState('');

  const rubric = useQuery({ queryKey: ['pipeline-rubric'], queryFn: api.pipelineRubric });

  const run = useMutation({
    mutationFn: async () => {
      const record: Record<string, unknown> = {};
      if (industry) record.industry = industry;
      if (employees) record.employee_count = Number(employees);
      if (hq) record.hq = hq;
      if (techStack) record.tech_stack = techStack.split(',').map((s) => s.trim()).filter(Boolean);
      return api.pipelineRun({
        domain: domain.trim(),
        ...(name ? { name } : {}),
        ...(Object.keys(record).length ? { record } : {}),
      });
    },
  });

  const result = run.data?.data;

  return (
    <PageShell>
      <PageHeader title="Pipeline" subtitle="Enrich → score → route → sync to every connected CRM" />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Rubric snapshot */}
          <Panel className="p-5 lg:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <ScrollText className="w-3.5 h-3.5 text-muted dark:text-[#8C837C]" />
              <h2 className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA]">ICP rubric</h2>
              {rubric.data?.rubric.revision && (
                <span className="text-[11px] font-mono text-muted dark:text-[#8C837C]">
                  rev {rubric.data.rubric.revision}
                </span>
              )}
            </div>
            {rubric.isLoading ? (
              <div className="text-[12px] text-muted">loading…</div>
            ) : (rubric.data?.rubric.rules.length ?? 0) === 0 ? (
              <div className="text-[12px] text-muted">
                No rules configured yet. Edit <code className="font-mono text-[11px] px-1 bg-cream-light dark:bg-[#17140F] rounded">us/market/icp.md</code> and add a <code className="font-mono text-[11px]">rubric:</code> block.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {rubric.data!.rubric.rules.map((r) => (
                  <li key={r.id} className="flex items-baseline gap-2 text-[12px]">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#3F7EC7]/10 text-[#3F7EC7] shrink-0">
                      +{r.weight}
                    </span>
                    <span className="font-medium truncate">{r.id}</span>
                    <span className="text-muted text-[11px] truncate font-mono">
                      {Object.entries(r.when).filter(([k]) => k !== 'field').map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(' ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-muted dark:text-[#8C837C]" />
              <h3 className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA]">Routing rules</h3>
            </div>
            {rubric.isLoading ? null : (
              <ul className="mt-2 space-y-1 text-[12px]">
                {rubric.data!.routing.rules.map((r, i) => (
                  <li key={i} className="truncate">
                    → <span className="font-medium">{r.owner.name ?? r.owner.id}</span>{' '}
                    <span className="text-muted font-mono text-[11px]">if {JSON.stringify(r.match)}</span>
                  </li>
                ))}
                {rubric.data!.routing.default && (
                  <li className="text-muted">
                    · default → <span className="font-medium">{rubric.data!.routing.default.name ?? rubric.data!.routing.default.id}</span>
                  </li>
                )}
              </ul>
            )}
          </Panel>

          {/* Run form */}
          <Panel className="p-5 lg:col-span-2">
            <h2 className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA] mb-3">Run pipeline</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <div className="text-[11px] uppercase tracking-wider font-mono text-muted mb-1">Domain *</div>
                <input
                  className="w-full h-9 px-3 rounded-md bg-cream-light dark:bg-[#17140F] border border-line dark:border-[#2A241D] text-[13px]"
                  placeholder="acme.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </label>
              <label className="block">
                <div className="text-[11px] uppercase tracking-wider font-mono text-muted mb-1">Name</div>
                <input
                  className="w-full h-9 px-3 rounded-md bg-cream-light dark:bg-[#17140F] border border-line dark:border-[#2A241D] text-[13px]"
                  placeholder="Acme Corp"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block">
                <div className="text-[11px] uppercase tracking-wider font-mono text-muted mb-1">Industry</div>
                <input
                  className="w-full h-9 px-3 rounded-md bg-cream-light dark:bg-[#17140F] border border-line dark:border-[#2A241D] text-[13px]"
                  placeholder="SaaS"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                />
              </label>
              <label className="block">
                <div className="text-[11px] uppercase tracking-wider font-mono text-muted mb-1">Employees</div>
                <input
                  className="w-full h-9 px-3 rounded-md bg-cream-light dark:bg-[#17140F] border border-line dark:border-[#2A241D] text-[13px]"
                  placeholder="250"
                  value={employees}
                  onChange={(e) => setEmployees(e.target.value)}
                />
              </label>
              <label className="block">
                <div className="text-[11px] uppercase tracking-wider font-mono text-muted mb-1">HQ</div>
                <input
                  className="w-full h-9 px-3 rounded-md bg-cream-light dark:bg-[#17140F] border border-line dark:border-[#2A241D] text-[13px]"
                  placeholder="United States"
                  value={hq}
                  onChange={(e) => setHq(e.target.value)}
                />
              </label>
              <label className="block">
                <div className="text-[11px] uppercase tracking-wider font-mono text-muted mb-1">Tech stack (comma-sep)</div>
                <input
                  className="w-full h-9 px-3 rounded-md bg-cream-light dark:bg-[#17140F] border border-line dark:border-[#2A241D] text-[13px]"
                  placeholder="nextjs, vercel, typescript"
                  value={techStack}
                  onChange={(e) => setTechStack(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button
                onClick={() => run.mutate()}
                disabled={!domain.trim() || run.isPending}
                className="inline-flex items-center gap-2"
              >
                {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run enrich → score → route → sync
              </Button>
              <span className="text-[11px] text-muted">
                Fields you leave blank are filled in by enrich_company.
              </span>
            </div>

            {run.error && (
              <div className="mt-4 p-3 rounded-md border border-[#E8634A]/40 bg-[#E8634A]/10 text-[13px] text-[#E8634A]">
                {(run.error as Error).message}
              </div>
            )}

            {result && (
              <div className="mt-5 space-y-5">
                <div className="flex items-baseline gap-4">
                  <SectionHeading>Score</SectionHeading>
                  <div className="text-2xl font-semibold tabular-nums text-ink dark:text-[#F5F1EA]">{result.score.score}</div>
                  <div className="text-[11px] font-mono text-muted dark:text-[#8C837C]">rev {result.score.rubricVersion}</div>
                </div>
                {result.score.reasons.length > 0 && (
                  <ul className="text-[13px] leading-relaxed space-y-0.5 text-muted dark:text-[#8C837C]">
                    {result.score.reasons.map((r, i) => (
                      <li key={i}>· {r}</li>
                    ))}
                  </ul>
                )}

                <div className="flex items-baseline gap-4">
                  <SectionHeading>Route</SectionHeading>
                  <div className="text-[13px] font-medium text-ink dark:text-[#F5F1EA]">
                    {result.route.assignee ? (result.route.assignee.name ?? result.route.assignee.id) : 'unassigned'}
                  </div>
                  <div className="text-[11px] font-mono text-muted dark:text-[#8C837C] truncate">{result.route.rule}</div>
                </div>

                <div>
                  <SectionHeading className="mb-2">Sync targets</SectionHeading>
                  <div className="space-y-1.5">
                    {Object.entries(result.targets).map(([target, r]) => {
                      const tone = r.skipped ? 'muted' : r.ok ? 'ok' : 'bad';
                      const label = r.skipped ? 'skipped' : r.ok ? 'ok' : 'failed';
                      const Icon = r.skipped ? MinusCircle : r.ok ? CheckCircle2 : XCircle;
                      const iconColor = r.skipped
                        ? 'text-muted dark:text-[#8C837C]'
                        : r.ok
                          ? 'text-[#3FA36B]'
                          : 'text-[#E8634A]';
                      return (
                        <div key={target} className="flex items-center gap-2 text-[13px]">
                          <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
                          <span className="font-medium capitalize w-20 text-ink dark:text-[#E6E0D8]">{target}</span>
                          <StatusBadge tone={tone}>{label}</StatusBadge>
                          <span className="text-muted dark:text-[#8C837C] font-mono text-[11px] truncate">
                            {r.skipped ? 'no credentials' : r.ok ? (r.data?.path ?? `id: ${r.data?.id ?? '—'}${r.data?.updated ? ' · updated' : ''}`) : r.error}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </PageBody>
    </PageShell>
  );
}
