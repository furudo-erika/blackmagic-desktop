'use client';

/**
 * TeamStandup — top-level overview at /team.
 *
 * Reads every agents/*.md file once, groups them by team:, then for
 * each team shows:
 *   - Who's on the team (faces + names)
 *   - What's running right now (live runs, the breathing-dot kind)
 *   - Recent shipped work (latest 5 completed runs)
 *   - Pending drafts owned by team employees
 *
 * Everything is read-only — this is the "what's the company doing
 * today?" dashboard. Click any face to open that employee's cockpit
 * via /agents?slug=X.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Inbox,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { EmployeeFace } from '../../components/employee-face';
import { PageShell, PageHeader, PageBody, Panel, SectionHeading } from '../../components/ui/primitives';

type Employee = {
  slug: string;
  name: string;
  role: string;
  team: string;
  faceSeed: string;
};

function roleFromName(name: string): string {
  return name.replace(/\s*Agent$/i, '').trim() || name;
}

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

function timeAgo(ms: number | null): string {
  if (!ms) return '—';
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function TeamStandup() {
  // 1) Employees from agents/*.md (gives us slug → team mapping).
  const employeesQ = useQuery({
    queryKey: ['standup-employees'],
    queryFn: async (): Promise<Employee[]> => {
      const tree = await api.contextTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'),
      );
      const rows = await Promise.all(files.map(async (f) => {
        const r = await api.readFile(f.path);
        const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
        const slug = f.path.replace(/^agents\//, '').replace(/\.md$/, '');
        const name = String(fm.name ?? slug);
        const team = String(fm.team ?? 'GTM');
        const faceSeed = String(fm.face_seed ?? slug);
        return { slug, name, role: roleFromName(name), team, faceSeed };
      }));
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  // 2) Live + recent runs.
  const runsQ = useQuery({
    queryKey: ['standup-runs'],
    queryFn: api.listRuns,
    refetchInterval: 15_000,
  });

  // 3) Drafts (pending outbound — counts as "being shipped").
  const draftsQ = useQuery({
    queryKey: ['standup-drafts'],
    queryFn: api.listDrafts,
    refetchInterval: 30_000,
  });

  // Build a slug → employee map and a team → employees grouping.
  const { teams, slugMap } = useMemo(() => {
    const slugMap = new Map<string, Employee>();
    const map = new Map<string, Employee[]>();
    for (const e of employeesQ.data ?? []) {
      slugMap.set(e.slug.toLowerCase(), e);
      const list = map.get(e.team) ?? [];
      list.push(e);
      map.set(e.team, list);
    }
    const teams = Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'GTM') return -1;
      if (b === 'GTM') return 1;
      return a.localeCompare(b);
    });
    return { teams, slugMap };
  }, [employeesQ.data]);

  const totalEmployees = (employeesQ.data ?? []).length;
  const allRuns = runsQ.data?.runs ?? [];
  const liveRuns = allRuns.filter((r) => !r.done);
  const recentRuns = allRuns
    .filter((r) => r.done)
    .sort((a, b) => (runStartedMs(b.runId) ?? 0) - (runStartedMs(a.runId) ?? 0))
    .slice(0, 24);

  const drafts = draftsQ.data?.drafts ?? [];
  const pendingDrafts = drafts.filter((d) => (d.status ?? 'pending') === 'pending');

  // Group runs / drafts by team via the slugMap.
  function teamOfRun(agentSlug: string | undefined): string | null {
    if (!agentSlug) return null;
    return slugMap.get(agentSlug.toLowerCase())?.team ?? null;
  }

  return (
    <PageShell>
      <PageHeader
        title="Team standup"
        subtitle={`${teams.length} ${teams.length === 1 ? 'team' : 'teams'} · ${totalEmployees} employees · ${liveRuns.length} running now · ${pendingDrafts.length} drafts pending`}
        icon={Briefcase}
      />
      <PageBody maxWidth="5xl">
        {employeesQ.isLoading ? (
          <div className="text-[13px] text-muted dark:text-[#8C837C] py-12 text-center">
            loading the standup…
          </div>
        ) : teams.length === 0 ? (
          <div className="text-[13px] text-muted dark:text-[#8C837C] py-12 text-center">
            No employees yet. Visit Company to hire your first team.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top strip: every team, click to scroll to its card. */}
            <div className="flex flex-wrap gap-2">
              {teams.map(([teamName, members]) => {
                const liveHere = liveRuns.filter((r) => teamOfRun(r.agent) === teamName).length;
                return (
                  <a
                    key={teamName}
                    href={`#team-${encodeURIComponent(teamName)}`}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] hover:border-flame/40 text-[12px]"
                  >
                    <Users className="w-3 h-3 text-muted dark:text-[#8C837C]" />
                    <span className="font-medium text-ink dark:text-[#F5F1EA]">{teamName}</span>
                    <span className="text-[10.5px] font-mono text-muted dark:text-[#8C837C]">
                      {members.length}
                    </span>
                    {liveHere > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] text-flame font-mono">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-flame" />
                        </span>
                        {liveHere}
                      </span>
                    )}
                  </a>
                );
              })}
            </div>

            {/* Per-team standup card */}
            {teams.map(([teamName, members]) => {
              const memberSlugs = new Set(members.map((m) => m.slug.toLowerCase()));
              const teamLive = liveRuns.filter((r) =>
                memberSlugs.has((r.agent ?? '').toLowerCase()),
              );
              const teamRecent = recentRuns
                .filter((r) => memberSlugs.has((r.agent ?? '').toLowerCase()))
                .slice(0, 5);
              const teamDrafts = pendingDrafts.filter((d) => {
                // Drafts don't carry an explicit agent — match by tool
                // name prefix or fallback to "any draft" inside the
                // GTM bucket. Best-effort heuristic; we just want to
                // surface volume by team.
                if (teamName === 'GTM') return true;
                const tool = (d.tool || '').toLowerCase();
                return Array.from(memberSlugs).some((s) => tool.includes(s));
              });
              return (
                <Panel
                  key={teamName}
                  className="scroll-mt-6"
                >
                  <div id={`team-${encodeURIComponent(teamName)}`} />
                  <header className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-flame/10 border border-flame/20 flex items-center justify-center">
                        <Users className="w-4 h-4 text-flame" />
                      </div>
                      <div>
                        <div className="text-[15px] font-semibold text-ink dark:text-[#F5F1EA] leading-tight">
                          {teamName}
                        </div>
                        <div className="text-[11px] font-mono text-muted dark:text-[#8C837C] mt-0.5">
                          {members.length} {members.length === 1 ? 'employee' : 'employees'}
                          {teamLive.length > 0 && ` · ${teamLive.length} running`}
                        </div>
                      </div>
                    </div>
                  </header>

                  {/* Roster */}
                  <div className="mb-5">
                    <SectionHeading className="mb-2">Roster</SectionHeading>
                    <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {members.map((m) => {
                        const isLive = teamLive.some(
                          (r) => (r.agent ?? '').toLowerCase() === m.slug.toLowerCase(),
                        );
                        return (
                          <li key={m.slug}>
                            <Link
                              href={`/agents?slug=${encodeURIComponent(m.slug)}`}
                              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-cream-light dark:hover:bg-[#17140F] transition-colors"
                            >
                              <EmployeeFace seed={m.faceSeed} name={m.name} size="sm" />
                              <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-medium text-ink dark:text-[#E6E0D8] truncate">
                                  {m.name}
                                </div>
                                <div className="text-[10px] font-mono text-muted dark:text-[#8C837C] truncate">
                                  {m.role}
                                </div>
                              </div>
                              {isLive && (
                                <span className="relative flex h-1.5 w-1.5 shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-flame" />
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    {/* Live now */}
                    <div>
                      <SectionHeading className="mb-2 flex items-center gap-1.5">
                        <Activity className="w-3 h-3" /> Live now
                      </SectionHeading>
                      {teamLive.length === 0 ? (
                        <div className="text-[12px] text-muted dark:text-[#8C837C] italic">
                          Nothing running.
                        </div>
                      ) : (
                        <ul className="space-y-1.5">
                          {teamLive.slice(0, 5).map((r) => {
                            const emp = slugMap.get((r.agent ?? '').toLowerCase());
                            return (
                              <li key={r.runId}>
                                <Link
                                  href={`/runs?id=${encodeURIComponent(r.runId)}`}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-cream-light dark:hover:bg-[#17140F]"
                                >
                                  {emp && (
                                    <EmployeeFace seed={emp.faceSeed} name={emp.name} size="xs" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[12px] text-ink dark:text-[#E6E0D8] truncate">
                                      {r.preview || r.runId}
                                    </div>
                                    <div className="text-[10px] font-mono text-muted dark:text-[#8C837C] truncate">
                                      {emp?.name ?? r.agent} · {timeAgo(runStartedMs(r.runId))}
                                    </div>
                                  </div>
                                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-flame" />
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {/* Shipped */}
                    <div>
                      <SectionHeading className="mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3" /> Recently shipped
                      </SectionHeading>
                      {teamRecent.length === 0 ? (
                        <div className="text-[12px] text-muted dark:text-[#8C837C] italic">
                          No completed runs yet.
                        </div>
                      ) : (
                        <ul className="space-y-1.5">
                          {teamRecent.map((r) => {
                            const emp = slugMap.get((r.agent ?? '').toLowerCase());
                            return (
                              <li key={r.runId}>
                                <Link
                                  href={`/runs?id=${encodeURIComponent(r.runId)}`}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-cream-light dark:hover:bg-[#17140F]"
                                >
                                  {emp && (
                                    <EmployeeFace seed={emp.faceSeed} name={emp.name} size="xs" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[12px] text-ink dark:text-[#E6E0D8] truncate">
                                      {r.preview || r.runId}
                                    </div>
                                    <div className="text-[10px] font-mono text-muted dark:text-[#8C837C] truncate">
                                      {emp?.name ?? r.agent} · {timeAgo(runStartedMs(r.runId))} ·{' '}
                                      {r.toolCalls} tool calls
                                    </div>
                                  </div>
                                  <ChevronRight className="w-3 h-3 text-muted/60 dark:text-[#6B625C] shrink-0" />
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Drafts (only for teams that own outbound — currently GTM
                      via heuristic; we still show 0 for others as a quiet
                      negative-space cue). */}
                  {teamName === 'GTM' && (
                    <div className="mt-5 pt-4 border-t border-line dark:border-[#2A241D]">
                      <SectionHeading className="mb-2 flex items-center gap-1.5">
                        <Inbox className="w-3 h-3" /> Drafts pending review
                      </SectionHeading>
                      {teamDrafts.length === 0 ? (
                        <div className="text-[12px] text-muted dark:text-[#8C837C] italic">
                          Inbox zero.
                        </div>
                      ) : (
                        <Link
                          href="/outreach"
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-flame/10 border border-flame/20 text-flame text-[12px] font-medium hover:bg-flame/15"
                        >
                          {teamDrafts.length} drafts waiting · review in Outreach
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  )}
                </Panel>
              );
            })}
          </div>
        )}
      </PageBody>
    </PageShell>
  );
}
