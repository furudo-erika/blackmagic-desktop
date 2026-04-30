'use client';

/**
 * /chart — node-graph org chart visualization.
 *
 * Sibling of /company (the team-card grid). Where /company optimizes for
 * "what does each team do, and who's on it", /chart optimizes for the
 * spatial / hierarchical view: a single CEO node at the top, branching
 * down to teams, branching down to employees. Hand-rolled SVG so we
 * don't drag in a graph layout library — the whole tree is small (≤ ~30
 * nodes in any realistic project) and a deterministic top-down dagre-
 * style layout is ~50 lines.
 *
 * Reads `agents/*.md` exactly the same way /company does, so adding an
 * employee in one shows up in both views immediately.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Network,
  Users,
  Briefcase,
  ChevronRight,
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
  Engineering: Network,
  'Customer Success': Users,
  'Finance & Ops': Building2,
  People: Users,
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
// Three rows:
//   row 0: Company (single node, centered)
//   row 1: Teams   (one node per team, evenly spaced)
//   row 2: Employees (clustered under their team)
//
// We compute employee x-positions cluster-by-cluster, then place each
// team node at the center of its employee cluster. Finally we center
// the company node over the median team. This keeps the diagram
// readable when one team has 8 employees and another has 1 — the wide
// teams get their own breathing room.

const EMP_W = 140;
const EMP_GAP_X = 16;
const TEAM_GAP_X = 48;
const ROW_PAD = 24;
const COMPANY_Y = 32;
const TEAM_Y = 200;
const EMP_Y = 380;

function OrgChart({
  teams,
  totalEmployees,
}: {
  teams: Array<[string, Employee[]]>;
  totalEmployees: number;
}) {
  // Compute x-positions cluster by cluster.
  const layout = useMemo(() => {
    let cursor = ROW_PAD;
    const clusters = teams.map(([teamName, members]) => {
      const w = members.length * EMP_W + Math.max(0, members.length - 1) * EMP_GAP_X;
      const start = cursor;
      const employees = members.map((e, i) => ({
        emp: e,
        x: start + i * (EMP_W + EMP_GAP_X) + EMP_W / 2,
      }));
      const teamCx = start + w / 2;
      cursor += w + TEAM_GAP_X;
      return { teamName, members, employees, teamCx, teamW: w };
    });
    const totalW = Math.max(720, cursor - TEAM_GAP_X + ROW_PAD);
    const companyCx = totalW / 2;
    return { clusters, totalW, companyCx };
  }, [teams]);

  const height = EMP_Y + 110;

  return (
    <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-4 overflow-x-auto">
      <svg
        width={layout.totalW}
        height={height}
        viewBox={`0 0 ${layout.totalW} ${height}`}
        className="block"
      >
        <defs>
          <linearGradient id="bm-link" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E8523A" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#E8523A" stopOpacity="0.12" />
          </linearGradient>
        </defs>

        {/* Edges: company → each team */}
        {layout.clusters.map(({ teamName, teamCx }) => (
          <CurvePath
            key={`c-${teamName}`}
            x1={layout.companyCx}
            y1={COMPANY_Y + 70}
            x2={teamCx}
            y2={TEAM_Y + 8}
          />
        ))}

        {/* Edges: team → each employee */}
        {layout.clusters.map(({ teamName, teamCx, employees }) =>
          employees.map(({ emp, x }) => (
            <CurvePath
              key={`t-${teamName}-${emp.slug}`}
              x1={teamCx}
              y1={TEAM_Y + 70}
              x2={x}
              y2={EMP_Y + 8}
            />
          )),
        )}

        {/* Company node */}
        <CompanyNode cx={layout.companyCx} cy={COMPANY_Y} totalEmployees={totalEmployees} teams={teams.length} />

        {/* Team nodes */}
        {layout.clusters.map(({ teamName, teamCx, members }) => (
          <TeamNode key={`tn-${teamName}`} cx={teamCx} cy={TEAM_Y} name={teamName} members={members} />
        ))}

        {/* Employee nodes */}
        {layout.clusters.flatMap(({ employees }) =>
          employees.map(({ emp, x }) => (
            <EmployeeNode key={`en-${emp.slug}`} cx={x} cy={EMP_Y} emp={emp} />
          )),
        )}
      </svg>
    </div>
  );
}

function CurvePath({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  // Smooth top-down cubic — control points placed half-way vertically
  // so wide spans stay graceful.
  const my = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
  return <path d={d} fill="none" stroke="url(#bm-link)" strokeWidth={1.5} />;
}

function CompanyNode({
  cx,
  cy,
  totalEmployees,
  teams,
}: {
  cx: number;
  cy: number;
  totalEmployees: number;
  teams: number;
}) {
  const w = 240;
  const h = 78;
  const x = cx - w / 2;
  return (
    <g>
      <foreignObject x={x} y={cy} width={w} height={h}>
        <div
          className="w-full h-full rounded-xl border border-flame/30 bg-gradient-to-br from-flame/12 to-flame/[0.04] flex items-center gap-3 px-3.5"
        >
          <EmployeeFace seed="ceo" name="CEO" size="md" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-ink dark:text-[#F5F1EA] truncate">
              The Company
            </div>
            <div className="text-[10.5px] font-mono text-muted dark:text-[#8C837C] truncate">
              {teams} teams · {totalEmployees} employees
            </div>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function TeamNode({
  cx,
  cy,
  name,
  members,
}: {
  cx: number;
  cy: number;
  name: string;
  members: Employee[];
}) {
  const w = 200;
  const h = 78;
  const x = cx - w / 2;
  const Icon = teamIcon(name);
  const stack = members.slice(0, 4);
  return (
    <g>
      <foreignObject x={x} y={cy} width={w} height={h}>
        <div className="w-full h-full rounded-xl border border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F] flex flex-col px-3 py-2 gap-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 shrink-0 rounded-md bg-flame/10 border border-flame/20 flex items-center justify-center">
              <Icon className="w-3.5 h-3.5 text-flame" />
            </span>
            <span className="text-[12px] font-semibold text-ink dark:text-[#F5F1EA] truncate">
              {name}
            </span>
            <span className="ml-auto text-[10px] font-mono text-muted dark:text-[#8C837C] shrink-0">
              {members.length}
            </span>
          </div>
          <div className="flex -space-x-1.5 items-center">
            {stack.map((m) => (
              <EmployeeFace key={m.slug} seed={m.faceSeed} name={m.name} size="xs" ring />
            ))}
            {members.length > stack.length && (
              <span className="ml-1 text-[10px] font-mono text-muted dark:text-[#8C837C]">
                +{members.length - stack.length}
              </span>
            )}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function EmployeeNode({ cx, cy, emp }: { cx: number; cy: number; emp: Employee }) {
  const w = EMP_W;
  const h = 88;
  const x = cx - w / 2;
  return (
    <g>
      <foreignObject x={x} y={cy} width={w} height={h}>
        <Link
          href={`/agents?slug=${encodeURIComponent(emp.slug)}`}
          className="w-full h-full rounded-xl border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] hover:border-flame/40 transition-colors flex flex-col items-center justify-center gap-1.5 px-2 py-2 text-center group"
          title={`${emp.name} — ${emp.role}`}
        >
          <EmployeeFace seed={emp.faceSeed} name={emp.name} size="md" />
          <div className="text-[11px] font-semibold leading-tight text-ink dark:text-[#F5F1EA] truncate w-full">
            {emp.name}
          </div>
          <div className="text-[9.5px] font-mono leading-tight text-muted dark:text-[#8C837C] truncate w-full">
            {emp.role}
          </div>
        </Link>
      </foreignObject>
    </g>
  );
}
