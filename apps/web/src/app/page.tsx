'use client';

/**
 * Home / Dashboard — landing page.
 *
 * Paperclip Dashboard rhythm adapted to a file-first vault:
 *   - greeting band + active project
 *   - 4 stat cards (Companies / Contacts / Open deals / Drafts)
 *     with inline-SVG sparklines where we have 7d of signal
 *   - middle row: recent activity + pipeline by stage
 *   - bottom row: active sequences + live signals
 * Everything built on Panel primitive + `api.*` — no new data wiring.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight, Bot, Briefcase, Building2, History, Inbox,
  LayoutDashboard, Radio, Repeat, TrendingUp, Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { PageShell, PageHeader, Panel } from '../components/ui/primitives';

function runStartedMs(runId: string): number | null {
  if (runId.startsWith('codex-')) {
    const ms = Number(runId.slice('codex-'.length));
    return Number.isFinite(ms) ? ms : null;
  }
  const m = runId.match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!m) return null;
  const t = Date.parse(`${m[1]}:${m[2]}:${m[3]}.${m[4]}Z`);
  return Number.isFinite(t) ? t : null;
}
function timeAgo(ms: number | undefined): string {
  if (!ms) return '';
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Up late';
}

function bucketByDay(runs: { runId: string; costCents?: number }[], mode: 'count' | 'cost'): number[] | undefined {
  if (runs.length < 3) return undefined;
  const buckets = new Array(7).fill(0) as number[];
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - 6 * 86400_000;
  for (const r of runs) {
    const t = runStartedMs(r.runId);
    if (t == null) continue;
    const day = Math.floor((t - start) / 86400_000);
    if (day < 0 || day >= 7) continue;
    const inc = mode === 'cost' ? (r.costCents ?? 0) / 100 : 1;
    buckets[day] = (buckets[day] ?? 0) + inc;
  }
  return buckets.filter((v) => v > 0).length >= 2 ? buckets : undefined;
}

function Sparkline({ values, width = 72, height = 20 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-flame/80 shrink-0" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

function StatCard({ label, value, hint, icon: Icon, href, spark }: {
  label: string; value: string | number; hint?: string;
  icon: React.ComponentType<{ className?: string }>; href: string; spark?: number[];
}) {
  return (
    <Link
      href={href}
      className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-4 hover:border-flame transition-colors group"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C]">
          <Icon className="w-3 h-3" />{label}
        </div>
        <ArrowUpRight className="w-3.5 h-3.5 text-muted/60 dark:text-[#6B625C] opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="text-2xl font-mono font-semibold text-ink dark:text-[#F5F1EA] leading-none">{value}</div>
        {spark && spark.length >= 2 && <Sparkline values={spark} />}
      </div>
      {hint && <div className="mt-2 text-[11px] text-muted dark:text-[#8C837C]">{hint}</div>}
    </Link>
  );
}

function PanelHeader({ icon: Icon, title, trailing }: {
  icon: React.ComponentType<{ className?: string }>; title: string; trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C]">
        <Icon className="w-3 h-3" />{title}
      </div>
      {trailing}
    </div>
  );
}

export default function HomePage() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const active = projects.data?.projects.find((p) => p.id === projects.data?.active);

  const tree = useQuery({ queryKey: ['vault-tree'], queryFn: api.vaultTree, staleTime: 30_000 });
  const runs = useQuery({ queryKey: ['runs'], queryFn: api.listRuns, refetchInterval: 15_000 });
  const drafts = useQuery({ queryKey: ['drafts'], queryFn: api.listDrafts });
  const seqs = useQuery({ queryKey: ['sequences'], queryFn: api.listSequences });

  const counts = useMemo(() => {
    const files = tree.data?.tree.filter((e) => e.type === 'file') ?? [];
    return {
      companies: files.filter((f) => f.path.startsWith('companies/') && f.path.endsWith('.md')).length,
      contacts: files.filter((f) => f.path.startsWith('contacts/') && f.path.endsWith('.md')).length,
      openDeals: files.filter((f) => f.path.startsWith('deals/open/') && f.path.endsWith('.md')).length,
    };
  }, [tree.data]);

  const pendingDrafts = useMemo(
    () => (drafts.data?.drafts ?? []).filter((d) => (d.status ?? 'pending') === 'pending').length,
    [drafts.data],
  );

  const runList = runs.data?.runs ?? [];
  const runCostSpark = useMemo(() => bucketByDay(runList, 'cost'), [runList]);
  const runCountSpark = useMemo(() => bucketByDay(runList, 'count'), [runList]);
  const totalRunCost = useMemo(() => runList.reduce((s, r) => s + (r.costCents ?? 0), 0) / 100, [runList]);

  const recentRuns = useMemo(() => {
    return [...runList]
      .map((r) => ({ ...r, startedAt: runStartedMs(r.runId) ?? 0 }))
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 8);
  }, [runList]);

  const openDealFiles = useMemo(
    () => tree.data?.tree.filter((e) => e.type === 'file' && e.path.startsWith('deals/open/') && e.path.endsWith('.md')) ?? [],
    [tree.data],
  );
  const pipelineQuery = useQuery({
    queryKey: ['pipeline-stages', openDealFiles.map((f) => f.path).join('|')],
    enabled: openDealFiles.length > 0,
    queryFn: async () => {
      const all = await Promise.all(
        openDealFiles.slice(0, 50).map(async (f) => {
          const r = await api.readFile(f.path).catch(() => null);
          if (!r) return null;
          return {
            path: f.path,
            stage: String(r.frontmatter.stage ?? 'unstaged'),
            amount: Number(r.frontmatter.amount_usd ?? 0) || 0,
          };
        }),
      );
      return all.filter(Boolean) as Array<{ path: string; stage: string; amount: number }>;
    },
  });
  const pipeline = useMemo(() => {
    const m = new Map<string, { count: number; arr: number }>();
    for (const d of pipelineQuery.data ?? []) {
      const cur = m.get(d.stage) ?? { count: 0, arr: 0 };
      cur.count += 1;
      cur.arr += d.amount;
      m.set(d.stage, cur);
    }
    const entries = [...m.entries()].sort((a, b) => b[1].arr - a[1].arr);
    return { entries, max: Math.max(1, ...entries.map(([, v]) => v.count)) };
  }, [pipelineQuery.data]);

  const signalFiles = useMemo(() => {
    return (tree.data?.tree ?? [])
      .filter((e) => e.type === 'file' && e.path.startsWith('signals/') && e.path.endsWith('.md'))
      .sort((a, b) => b.path.localeCompare(a.path))
      .slice(0, 5);
  }, [tree.data]);

  const sequenceSummary = useMemo(() => {
    return (seqs.data?.sequences ?? [])
      .map((s) => ({
        path: s.path, name: s.name, active: s.enrolled.active, complete: s.enrolled.complete, touches: s.touches.length,
      }))
      .sort((a, b) => b.active - a.active)
      .slice(0, 6);
  }, [seqs.data]);

  return (
    <PageShell>
      <PageHeader
        title={`${greeting()}.`}
        subtitle={active ? `Working in ${active.name} · ${active.path}` : 'Your local AI GTM engineer. Pick a scenario in Chat or review the board below.'}
        icon={LayoutDashboard}
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Companies" value={counts.companies} hint="In vault" icon={Building2} href="/companies" />
            <StatCard label="Contacts" value={counts.contacts} hint="Across all accounts" icon={Users} href="/contacts" />
            <StatCard
              label="Open deals"
              value={counts.openDeals}
              hint={pipelineQuery.data ? `$${pipelineQuery.data.reduce((s, d) => s + d.amount, 0).toLocaleString()} total ARR` : undefined}
              icon={Briefcase}
              href="/deals"
            />
            <StatCard
              label="Drafts pending"
              value={pendingDrafts}
              hint={pendingDrafts > 0 ? 'Awaiting approve/reject' : 'Inbox zero'}
              icon={Inbox}
              href="/outreach"
            />
          </div>

          {/* Run activity strip */}
          {(runCountSpark || totalRunCost > 0) && (
            <Panel>
              <PanelHeader
                icon={TrendingUp}
                title="Run activity · last 7 days"
                trailing={<Link href="/runs" className="text-[11px] text-muted dark:text-[#8C837C] hover:text-flame">All runs →</Link>}
              />
              <div className="grid grid-cols-3 gap-6 items-end">
                <div>
                  <div className="text-[11px] text-muted dark:text-[#8C837C] mb-1">Total runs</div>
                  <div className="flex items-end gap-3">
                    <span className="text-2xl font-mono font-semibold text-ink dark:text-[#F5F1EA] leading-none">{runList.length}</span>
                    {runCountSpark && <Sparkline values={runCountSpark} width={88} height={24} />}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted dark:text-[#8C837C] mb-1">Cost · last 7d</div>
                  <div className="flex items-end gap-3">
                    <span className="text-2xl font-mono font-semibold text-ink dark:text-[#F5F1EA] leading-none">${totalRunCost.toFixed(2)}</span>
                    {runCostSpark && <Sparkline values={runCostSpark} width={88} height={24} />}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted dark:text-[#8C837C] mb-1">Tokens · total</div>
                  <div className="text-2xl font-mono font-semibold text-ink dark:text-[#F5F1EA] leading-none">
                    {runList.reduce((s, r) => s + (r.tokensIn ?? 0) + (r.tokensOut ?? 0), 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* Middle: recent activity + pipeline */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel>
              <PanelHeader
                icon={History}
                title="Recent activity"
                trailing={<Link href="/runs" className="text-[11px] text-muted dark:text-[#8C837C] hover:text-flame">View all →</Link>}
              />
              {recentRuns.length === 0 && (
                <div className="py-8 text-center text-[12px] text-muted dark:text-[#8C837C]">
                  No runs yet. Send a chat message to get started.
                </div>
              )}
              <div className="space-y-0.5">
                {recentRuns.map((r) => (
                  <Link key={r.runId} href="/runs" className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-cream-light dark:hover:bg-[#17140F] transition-colors">
                    <Bot className="w-3.5 h-3.5 text-muted dark:text-[#8C837C] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-ink dark:text-[#F5F1EA] truncate">
                        <span className="font-medium">{r.preview || r.agent || '—'}</span>
                        {r.model && <span className="ml-2 text-[11px] font-mono text-muted dark:text-[#8C837C]">{r.model}</span>}
                      </div>
                      <div className="text-[10px] text-muted dark:text-[#8C837C] truncate">
                        <span className="font-mono">{r.runId}</span>
                        {r.agent && <span className="ml-2">{r.agent}</span>}
                      </div>
                    </div>
                    <div className="text-[10px] font-mono text-muted dark:text-[#8C837C] shrink-0 text-right">
                      <div>${((r.costCents ?? 0) / 100).toFixed(2)}</div>
                      <div>{r.startedAt ? timeAgo(r.startedAt) : ''}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                icon={Briefcase}
                title="Pipeline at a glance"
                trailing={<Link href="/deals" className="text-[11px] text-muted dark:text-[#8C837C] hover:text-flame">Deals →</Link>}
              />
              {pipeline.entries.length === 0 && (
                <div className="py-8 text-center text-[12px] text-muted dark:text-[#8C837C]">
                  {openDealFiles.length === 0 ? 'No open deals yet.' : 'Loading stages…'}
                </div>
              )}
              <div className="space-y-2">
                {pipeline.entries.map(([stage, v]) => {
                  const pct = (v.count / pipeline.max) * 100;
                  return (
                    <div key={stage}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] text-ink dark:text-[#F5F1EA] capitalize">{stage}</span>
                        <span className="text-[10px] font-mono text-muted dark:text-[#8C837C]">
                          {v.count} · ${v.arr.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 bg-cream-light dark:bg-[#17140F] rounded-sm overflow-hidden">
                        <div className="h-full bg-flame/80 rounded-sm" style={{ width: `${Math.max(pct, 4)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          {/* Bottom: sequences + signals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel>
              <PanelHeader
                icon={Repeat}
                title="Active sequences"
                trailing={<Link href="/sequences" className="text-[11px] text-muted dark:text-[#8C837C] hover:text-flame">Sequences →</Link>}
              />
              {sequenceSummary.length === 0 && (
                <div className="py-8 text-center text-[12px] text-muted dark:text-[#8C837C]">No sequences defined yet.</div>
              )}
              <div className="space-y-1.5">
                {sequenceSummary.map((s) => (
                  <div key={s.path} className="flex items-center gap-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-ink dark:text-[#F5F1EA] truncate">{s.name}</div>
                      <div className="text-[10px] font-mono text-muted dark:text-[#8C837C]">
                        {s.touches} touches · {s.complete} complete
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Users className="w-3 h-3 text-muted dark:text-[#8C837C]" />
                      <span className="text-sm font-mono font-semibold text-ink dark:text-[#F5F1EA]">{s.active}</span>
                      <span className="text-[10px] text-muted dark:text-[#8C837C]">active</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                icon={Radio}
                title="Live signals"
                trailing={<Link href="/vault?path=signals" className="text-[11px] text-muted dark:text-[#8C837C] hover:text-flame">All signals →</Link>}
              />
              {signalFiles.length === 0 && (
                <div className="py-8 text-center text-[12px] text-muted dark:text-[#8C837C]">
                  No signals yet. Install the brand-monitor presets on the Triggers page.
                </div>
              )}
              <div className="space-y-0.5">
                {signalFiles.map((f) => {
                  const parts = f.path.split('/');
                  const source = parts[1] ?? 'signal';
                  const slug = parts.slice(2).join('/').replace(/\.md$/, '');
                  return (
                    <Link key={f.path} href={`/vault?path=${encodeURIComponent(f.path)}`} className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-cream-light dark:hover:bg-[#17140F] transition-colors">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-flame shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] text-ink dark:text-[#F5F1EA] truncate">{slug || f.path}</div>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] shrink-0">{source}</span>
                    </Link>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
