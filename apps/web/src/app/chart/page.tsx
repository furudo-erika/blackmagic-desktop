'use client';

/**
 * /chart — top-down org chart that fits in the desktop viewport.
 *
 * Sibling of /company (the team-card grid). The earlier version laid out
 * every employee as a sibling node in a single row, which blew up to ~3000
 * pixels wide and could not be read inside the desktop window. This
 * implementation uses a fluid CSS layout for the boxes and a thin SVG
 * overlay only for the connector lines, so the whole tree adapts to the
 * actual rendered width — no horizontal scroll, no cropped nodes.
 *
 * Default view: one CEO node up top, one row of team cards underneath.
 * Each team card carries the team name, headcount, and a small face stack
 * of the team's employees. Clicking a team toggles a second row that
 * reveals every employee on that team as a clickable face → /agents?slug=…
 *
 * Reads `agents/*.md` exactly the same way /company does.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Network,
  Users,
  Briefcase,
  Code2,
  HeartHandshake,
  Wallet,
  UserPlus2,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../lib/api';
import { EmployeeFace } from '../../components/employee-face';
import { PageShell, PageHeader, PageBody } from '../../components/ui/primitives';

type Employee = {
  slug: string;
  name: string;
  role: string;
  team: string;
  faceSeed: string;
};

const TEAM_ICON: Record<string, LucideIcon> = {
  GTM: Briefcase,
  Engineering: Code2,
  'Customer Success': HeartHandshake,
  'Finance & Ops': Wallet,
  Finance: Wallet,
  People: UserPlus2,
  Legal: Scale,
  Product: Briefcase,
};

function teamIcon(name: string): LucideIcon {
  return TEAM_ICON[name] ?? Users;
}

function roleFromName(name: string): string {
  return name.replace(/\s*Agent$/i, '').trim() || name;
}

export default function ChartPage() {
  const employeesQ = useQuery({
    queryKey: ['chart-employees'],
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
        return {
          slug,
          name,
          role: roleFromName(name),
          team,
          faceSeed,
        };
      }));
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const teams = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const e of employeesQ.data ?? []) {
      const list = map.get(e.team) ?? [];
      list.push(e);
      map.set(e.team, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'GTM') return -1;
      if (b === 'GTM') return 1;
      return a.localeCompare(b);
    });
  }, [employeesQ.data]);

  const totalEmployees = (employeesQ.data ?? []).length;

  return (
    <PageShell>
      <PageHeader
        title="Org chart"
        subtitle={`${teams.length} ${teams.length === 1 ? 'team' : 'teams'} · ${totalEmployees} ${totalEmployees === 1 ? 'employee' : 'employees'} · top-down hierarchy of every AI on staff.`}
        icon={Network}
      />
      <PageBody maxWidth="full">
        {employeesQ.isLoading ? (
          <div className="text-[13px] text-muted dark:text-[#8C837C] py-12 text-center">
            loading the org…
          </div>
        ) : teams.length === 0 ? (
          <div className="text-[13px] text-muted dark:text-[#8C837C] py-12 text-center">
            No employees yet. Visit Company to hire your first team.
          </div>
        ) : (
          <OrgChart teams={teams} totalEmployees={totalEmployees} />
        )}
      </PageBody>
    </PageShell>
  );
}

// ---------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------
//
// CSS does the placement; a single absolutely-positioned <svg> overlay
// is sized to the container and draws straight 1px lines between
// measured anchor points (CEO bottom → each team top, expanded team
// bottom → each employee top). The line layer is recomputed on resize
// and on expand/collapse via a ResizeObserver + useLayoutEffect.

function OrgChart({
  teams,
  totalEmployees,
}: {
  teams: Array<[string, Employee[]]>;
  totalEmployees: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const ceoRef = useRef<HTMLDivElement | null>(null);
  const teamRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const empRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());

  const [edges, setEdges] = useState<{
    w: number;
    h: number;
    ceoToTeam: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }>;
    teamToEmp: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }>;
  }>({ w: 0, h: 0, ceoToTeam: [], teamToEmp: [] });

  const recompute = () => {
    const root = containerRef.current;
    const ceoEl = ceoRef.current;
    if (!root || !ceoEl) return;
    const rRect = root.getBoundingClientRect();
    const ceoRect = ceoEl.getBoundingClientRect();
    const ceoBottom = {
      x: ceoRect.left - rRect.left + ceoRect.width / 2,
      y: ceoRect.bottom - rRect.top,
    };

    const ceoToTeam: typeof edges.ceoToTeam = [];
    const teamToEmp: typeof edges.teamToEmp = [];

    for (const [teamName] of teams) {
      const tEl = teamRefs.current.get(teamName);
      if (!tEl) continue;
      const tRect = tEl.getBoundingClientRect();
      const top = {
        x: tRect.left - rRect.left + tRect.width / 2,
        y: tRect.top - rRect.top,
      };
      ceoToTeam.push({
        x1: ceoBottom.x,
        y1: ceoBottom.y,
        x2: top.x,
        y2: top.y,
        key: `c-${teamName}`,
      });

      if (expanded === teamName) {
        const teamBottom = {
          x: tRect.left - rRect.left + tRect.width / 2,
          y: tRect.bottom - rRect.top,
        };
        const members = teams.find(([n]) => n === teamName)?.[1] ?? [];
        for (const m of members) {
          const eEl = empRefs.current.get(`${teamName}::${m.slug}`);
          if (!eEl) continue;
          const eRect = eEl.getBoundingClientRect();
          teamToEmp.push({
            x1: teamBottom.x,
            y1: teamBottom.y,
            x2: eRect.left - rRect.left + eRect.width / 2,
            y2: eRect.top - rRect.top,
            key: `t-${teamName}-${m.slug}`,
          });
        }
      }
    }

    setEdges({
      w: rRect.width,
      h: rRect.height,
      ceoToTeam,
      teamToEmp,
    });
  };

  useLayoutEffect(() => {
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, teams]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(root);
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-6">
      <div ref={containerRef} className="relative">
        {/* connector overlay — drawn behind cards */}
        <svg
          width={edges.w}
          height={edges.h}
          className="pointer-events-none absolute inset-0"
          aria-hidden
        >
          {[...edges.ceoToTeam, ...edges.teamToEmp].map((e) => (
            <line
              key={e.key}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="rgba(55,50,47,0.25)"
              strokeWidth={1}
            />
          ))}
        </svg>

        {/* CEO row */}
        <div className="relative flex justify-center">
          <div
            ref={ceoRef}
            className="rounded-xl border border-flame/30 bg-gradient-to-br from-flame/12 to-flame/[0.04] flex items-center gap-3 px-4 py-2.5 max-w-[280px]"
          >
            <EmployeeFace seed="ceo" name="CEO" size="md" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA] truncate leading-tight">
                The Company
              </div>
              <div className="text-[10.5px] font-mono text-muted dark:text-[#8C837C] truncate leading-tight mt-0.5">
                {teams.length} teams · {totalEmployees} employees
              </div>
            </div>
          </div>
        </div>

        {/* spacer so the line has room to draw */}
        <div className="h-10" />

        {/* Team row */}
        <div className="relative grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(teams.length, 6)}, minmax(0, 1fr))` }}>
          {teams.map(([teamName, members]) => {
            const isOpen = expanded === teamName;
            return (
              <TeamCard
                key={teamName}
                refCb={(el) => {
                  if (el) teamRefs.current.set(teamName, el);
                  else teamRefs.current.delete(teamName);
                }}
                name={teamName}
                members={members}
                isOpen={isOpen}
                onToggle={() => setExpanded(isOpen ? null : teamName)}
              />
            );
          })}
        </div>

        {/* Expanded employee row */}
        {expanded &&
          (() => {
            const t = teams.find(([n]) => n === expanded);
            if (!t) return null;
            const [teamName, members] = t;
            return (
              <>
                <div className="h-10" />
                <div className="relative">
                  <div className="flex flex-wrap gap-3 justify-center">
                    {members.map((m) => (
                      <Link
                        key={m.slug}
                        href={`/agents?slug=${encodeURIComponent(m.slug)}`}
                        ref={(el) => {
                          if (el) empRefs.current.set(`${teamName}::${m.slug}`, el);
                          else empRefs.current.delete(`${teamName}::${m.slug}`);
                        }}
                        className="w-[112px] rounded-xl border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] hover:border-flame/40 transition-colors flex flex-col items-center gap-1.5 px-2 py-2.5 text-center"
                        title={`${m.name} — ${m.role}`}
                      >
                        <EmployeeFace seed={m.faceSeed} name={m.name} size="md" />
                        <div className="text-[11px] font-semibold leading-tight text-ink dark:text-[#F5F1EA] w-full truncate">
                          {m.name}
                        </div>
                        <div className="text-[9.5px] font-mono leading-tight text-muted dark:text-[#8C837C] w-full truncate">
                          {m.role}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}
      </div>

      {/* hint */}
      <p className="mt-6 text-[11px] font-mono text-muted dark:text-[#8C837C] text-center">
        click a team to expand its roster.
      </p>
    </div>
  );
}

function TeamCard({
  refCb,
  name,
  members,
  isOpen,
  onToggle,
}: {
  refCb: (el: HTMLButtonElement | null) => void;
  name: string;
  members: Employee[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Icon = teamIcon(name);
  const stack = members.slice(0, 4);
  const more = Math.max(0, members.length - stack.length);
  return (
    <button
      ref={refCb}
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className={
        'w-full text-left rounded-xl px-3 py-2.5 transition-colors flex flex-col gap-2 ' +
        (isOpen
          ? 'border border-flame/40 bg-flame/[0.06]'
          : 'border border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F] hover:border-flame/30')
      }
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-6 h-6 shrink-0 rounded-md bg-flame/10 border border-flame/20 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-flame" />
        </span>
        <span className="text-[12.5px] font-semibold text-ink dark:text-[#F5F1EA] truncate">
          {name}
        </span>
        <span className="ml-auto text-[10px] font-mono text-muted dark:text-[#8C837C] shrink-0 px-1.5 py-px rounded bg-white/60 dark:bg-[#0F0D0A]/60 border border-line/60 dark:border-[#2A241D]">
          {members.length}
        </span>
      </div>
      <div className="flex items-center -space-x-1.5 min-h-[24px]">
        {stack.map((m) => (
          <EmployeeFace key={m.slug} seed={m.faceSeed} name={m.name} size="xs" ring />
        ))}
        {more > 0 && (
          <span className="ml-2 text-[10px] font-mono text-muted dark:text-[#8C837C]">
            +{more}
          </span>
        )}
      </div>
    </button>
  );
}
