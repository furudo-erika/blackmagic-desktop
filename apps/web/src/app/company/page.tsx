'use client';

/**
 * /company — editable org chart for the Black Magic AI company.
 *
 * This intentionally merges the old Company team grid and Chart page into one
 * surface. Agents still live in `agents/*.md`; the editable fields are the
 * frontmatter values Black Magic already uses: `name`, `team`, `face_seed`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Building2,
  Check,
  ChevronRight,
  Maximize2,
  Minus,
  Network,
  Plus,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { EmployeeFace } from '../../components/employee-face';

type Employee = {
  slug: string;
  path: string;
  name: string;
  role: string;
  team: string;
  reportsTo: string;
  faceSeed: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

type OrgNode =
  | { kind: 'company'; id: 'company'; name: string; reports: OrgNode[] }
  | { kind: 'team'; id: string; name: string; team: string; members: Employee[]; reports: OrgNode[] }
  | { kind: 'employee'; id: string; name: string; employee: Employee; reports: OrgNode[] };

type LayoutNode = {
  source: OrgNode;
  id: string;
  name: string;
  x: number;
  y: number;
  children: LayoutNode[];
};

const CARD_W = 200;
const CARD_H = 92;
const GAP_X = 32;
const GAP_Y = 80;
const PADDING = 60;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const TOUCH_MOVE_THRESHOLD = 6;

type Point = {
  x: number;
  y: number;
};

type TouchGesture = {
  mode: 'pan' | 'pinch' | null;
  startPoint: Point;
  startPan: Point;
  startZoom: number;
  startDistance: number;
  startCenter: Point;
  moved: boolean;
};

const TEAM_BLURBS: Record<string, string> = {
  GTM: 'Pipeline, outbound, research, brand.',
  Engineering: 'Code review, on-call triage, deploys, release notes.',
  'Customer Success': 'Onboarding, support inbox, churn rescue, health scoring.',
  Customer: 'Onboarding, support inbox, churn rescue, health scoring.',
  Finance: 'Bookkeeping, AR chasing, expense review, runway forecasting.',
  'Finance & Ops': 'Bookkeeping, AR chasing, expense review, runway forecasting.',
  People: 'Sourcing, screening, interview scheduling, onboarding kits.',
  Legal: 'Contract review, NDA turnaround, vendor risk, compliance flags.',
  Product: 'User research, spec drafting, release narratives.',
};

function blurbFor(team: string): string {
  return TEAM_BLURBS[team] ?? 'Custom team — define what this group owns.';
}

function roleFromName(name: string): string {
  return name.replace(/\s*Agent$/i, '').trim() || name;
}

function sortTeams(a: string, b: string): number {
  if (a === 'GTM') return -1;
  if (b === 'GTM') return 1;
  return a.localeCompare(b);
}

function reportsToEmployeeSlug(reportsTo: string): string | null {
  return reportsTo.startsWith('employee:') ? reportsTo.slice('employee:'.length) : null;
}

function wouldCreateReportsCycle(employees: Employee[], slug: string, managerSlug: string): boolean {
  if (slug === managerSlug) return true;
  const bySlug = new Map(employees.map((employee) => [employee.slug, employee]));
  const seen = new Set<string>();
  let cursor: string | null = managerSlug;
  while (cursor) {
    if (cursor === slug) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const next = bySlug.get(cursor);
    cursor = next ? reportsToEmployeeSlug(next.reportsTo) : null;
  }
  return false;
}

function orgTreeFromTeams(teams: ReadonlyArray<readonly [string, Employee[]]>, employees: Employee[]): OrgNode[] {
  const employeeNodes = new Map<string, OrgNode>();
  for (const employee of employees) {
    employeeNodes.set(employee.slug, {
      kind: 'employee',
      id: `employee:${employee.slug}`,
      name: employee.name,
      employee,
      reports: [],
    });
  }

  const attached = new Set<string>();
  for (const employee of employees) {
    const managerSlug = reportsToEmployeeSlug(employee.reportsTo);
    if (!managerSlug || wouldCreateReportsCycle(employees, employee.slug, managerSlug)) continue;
    const manager = employeeNodes.get(managerSlug);
    const report = employeeNodes.get(employee.slug);
    if (!manager || !report) continue;
    manager.reports.push(report);
    attached.add(employee.slug);
  }

  return [{
    kind: 'company',
    id: 'company',
    name: 'The Company',
    reports: teams.map(([team, members]) => ({
      kind: 'team' as const,
      id: `team:${team}`,
      name: team,
      team,
      members,
      reports: members
        .filter((employee) => !attached.has(employee.slug))
        .map((employee) => employeeNodes.get(employee.slug))
        .filter((node): node is OrgNode => Boolean(node)),
    })),
  }];
}

function subtreeWidth(node: OrgNode): number {
  if (node.reports.length === 0) return CARD_W;
  const childrenW = node.reports.reduce((sum, child) => sum + subtreeWidth(child), 0);
  const gaps = (node.reports.length - 1) * GAP_X;
  return Math.max(CARD_W, childrenW + gaps);
}

function layoutTree(node: OrgNode, x: number, y: number): LayoutNode {
  const totalW = subtreeWidth(node);
  const children: LayoutNode[] = [];
  if (node.reports.length > 0) {
    const childrenW = node.reports.reduce((sum, child) => sum + subtreeWidth(child), 0);
    const gaps = (node.reports.length - 1) * GAP_X;
    let childX = x + (totalW - childrenW - gaps) / 2;
    for (const child of node.reports) {
      const childW = subtreeWidth(child);
      children.push(layoutTree(child, childX, y + CARD_H + GAP_Y));
      childX += childW + GAP_X;
    }
  }
  return {
    source: node,
    id: node.id,
    name: node.name,
    x: x + (totalW - CARD_W) / 2,
    y,
    children,
  };
}

function layoutForest(roots: OrgNode[]): LayoutNode[] {
  let x = PADDING;
  const out: LayoutNode[] = [];
  for (const root of roots) {
    const width = subtreeWidth(root);
    out.push(layoutTree(root, x, PADDING));
    x += width + GAP_X;
  }
  return out;
}

function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const out: LayoutNode[] = [];
  const visit = (node: LayoutNode) => {
    out.push(node);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

function collectEdges(nodes: LayoutNode[]): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const out: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  const visit = (node: LayoutNode) => {
    for (const child of node.children) {
      out.push({ parent: node, child });
      visit(child);
    }
  };
  nodes.forEach(visit);
  return out;
}

function clampZoom(value: number): number {
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
}

function touchPoint(touch: React.Touch): Point {
  return { x: touch.clientX, y: touch.clientY };
}

function touchDistance(a: React.Touch, b: React.Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function touchCenter(a: React.Touch, b: React.Touch, container: HTMLElement): Point {
  const rect = container.getBoundingClientRect();
  return {
    x: (a.clientX + b.clientX) / 2 - rect.left,
    y: (a.clientY + b.clientY) / 2 - rect.top,
  };
}

export default function CompanyPage() {
  const qc = useQueryClient();
  const viewportRef = useRef<HTMLElement | null>(null);
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [pendingTeam, setPendingTeam] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [dropTeam, setDropTeam] = useState<string | null>(null);
  const [dropManagerSlug, setDropManagerSlug] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.92);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const touchGesture = useRef<TouchGesture>({
    mode: null,
    startPoint: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 },
    startZoom: 1,
    startDistance: 0,
    startCenter: { x: 0, y: 0 },
    moved: false,
  });
  const suppressNextCardClick = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);

  const employeesQ = useQuery({
    queryKey: ['company-employees'],
    queryFn: loadEmployees,
  });

  const employees = employeesQ.data ?? [];
  const teams = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const employee of employees) {
      const list = map.get(employee.team) ?? [];
      list.push(employee);
      map.set(employee.team, list);
    }
    return Array.from(map.entries())
      .map(([team, members]) => [team, members.sort((a, b) => a.name.localeCompare(b.name))] as const)
      .sort(([a], [b]) => sortTeams(a, b));
  }, [employees]);

  const selected = selectedSlug ? employees.find((employee) => employee.slug === selectedSlug) ?? null : null;
  const orgTree = useMemo(() => orgTreeFromTeams(teams, employees), [teams, employees]);
  const layout = useMemo(() => layoutForest(orgTree), [orgTree]);
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const edges = useMemo(() => collectEdges(layout), [layout]);
  const bounds = useMemo(() => {
    if (allNodes.length === 0) return { width: 800, height: 600 };
    let maxX = 0;
    let maxY = 0;
    for (const node of allNodes) {
      maxX = Math.max(maxX, node.x + CARD_W);
      maxY = Math.max(maxY, node.y + CARD_H);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes]);

  const fitChart = () => {
    const viewport = viewportRef.current;
    if (!viewport || bounds.width === 0 || bounds.height === 0) return;
    const scaleX = (viewport.clientWidth - 40) / bounds.width;
    const scaleY = (viewport.clientHeight - 40) / bounds.height;
    const nextZoom = Math.min(scaleX, scaleY, 1);
    setZoom(Number(nextZoom.toFixed(3)));
    setPan({
      x: Math.round((viewport.clientWidth - bounds.width * nextZoom) / 2),
      y: Math.round((viewport.clientHeight - bounds.height * nextZoom) / 2),
    });
  };

  useEffect(() => {
    fitChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.width, bounds.height]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => fitChart());
    observer.observe(viewport);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.width, bounds.height]);

  useEffect(() => {
    return () => {
      if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
    };
  }, []);

  const zoomTowardPoint = useCallback((nextZoom: number, point: Point) => {
    setZoom((currentZoom) => {
      const clamped = clampZoom(nextZoom);
      const scale = clamped / currentZoom;
      setPan((currentPan) => ({
        x: point.x - scale * (point.x - currentPan.x),
        y: point.y - scale * (point.y - currentPan.y),
      }));
      return Number(clamped.toFixed(3));
    });
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    zoomTowardPoint(zoom * factor, point);
  }, [zoom, zoomTowardPoint]);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLElement>) => {
    if (event.touches.length >= 2 && viewportRef.current) {
      const [first, second] = [event.touches[0]!, event.touches[1]!];
      touchGesture.current = {
        mode: 'pinch',
        startPoint: { x: 0, y: 0 },
        startPan: pan,
        startZoom: zoom,
        startDistance: touchDistance(first, second),
        startCenter: touchCenter(first, second, viewportRef.current),
        moved: false,
      };
      return;
    }

    const touch = event.touches[0];
    if (!touch) return;
    touchGesture.current = {
      mode: 'pan',
      startPoint: touchPoint(touch),
      startPan: pan,
      startZoom: zoom,
      startDistance: 0,
      startCenter: { x: 0, y: 0 },
      moved: false,
    };
  }, [pan, zoom]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || !touchGesture.current.mode) return;

    if (event.touches.length >= 2) {
      const [first, second] = [event.touches[0]!, event.touches[1]!];
      const distance = touchDistance(first, second);
      const center = touchCenter(first, second, viewport);

      if (touchGesture.current.mode !== 'pinch' || touchGesture.current.startDistance === 0) {
        touchGesture.current = {
          mode: 'pinch',
          startPoint: { x: 0, y: 0 },
          startPan: pan,
          startZoom: zoom,
          startDistance: distance,
          startCenter: center,
          moved: false,
        };
        return;
      }

      const gesture = touchGesture.current;
      const nextZoom = clampZoom(gesture.startZoom * (distance / gesture.startDistance));
      const scale = nextZoom / gesture.startZoom;
      const dx = center.x - gesture.startCenter.x;
      const dy = center.y - gesture.startCenter.y;
      gesture.moved =
        gesture.moved ||
        Math.abs(distance - gesture.startDistance) > TOUCH_MOVE_THRESHOLD ||
        Math.hypot(dx, dy) > TOUCH_MOVE_THRESHOLD;
      setZoom(Number(nextZoom.toFixed(3)));
      setPan({
        x: center.x - scale * (gesture.startCenter.x - gesture.startPan.x),
        y: center.y - scale * (gesture.startCenter.y - gesture.startPan.y),
      });
      return;
    }

    const touch = event.touches[0];
    if (!touch || touchGesture.current.mode !== 'pan') return;
    const dx = touch.clientX - touchGesture.current.startPoint.x;
    const dy = touch.clientY - touchGesture.current.startPoint.y;
    touchGesture.current.moved = touchGesture.current.moved || Math.hypot(dx, dy) > TOUCH_MOVE_THRESHOLD;
    setPan({
      x: touchGesture.current.startPan.x + dx,
      y: touchGesture.current.startPan.y + dy,
    });
  }, [pan, zoom]);

  const handleTouchEnd = useCallback(() => {
    if (touchGesture.current.moved) {
      suppressNextCardClick.current = true;
      if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = window.setTimeout(() => {
        suppressNextCardClick.current = false;
        suppressClickTimerRef.current = null;
      }, 400);
    }
    touchGesture.current = {
      mode: null,
      startPoint: { x: 0, y: 0 },
      startPan: pan,
      startZoom: zoom,
      startDistance: 0,
      startCenter: { x: 0, y: 0 },
      moved: false,
    };
  }, [pan, zoom]);

  const invalidateOrg = () => {
    qc.invalidateQueries({ queryKey: ['company-employees'] });
    qc.invalidateQueries({ queryKey: ['chart-employees'] });
    qc.invalidateQueries({ queryKey: ['standup-employees'] });
    qc.invalidateQueries({ queryKey: ['sidebar-agents'] });
    qc.invalidateQueries({ queryKey: ['agents-meta'] });
  };

  const updateEmployee = useMutation({
    mutationFn: saveEmployee,
    onSuccess: invalidateOrg,
  });

  const moveEmployee = useMutation({
    mutationFn: async ({ slug, team, reportsTo }: { slug: string; team: string; reportsTo?: string }) => {
      const employee = employees.find((row) => row.slug === slug);
      if (!employee) return;
      await saveEmployee({ employee, patch: { team, reportsTo: reportsTo ?? `team:${team}` } });
    },
    onSuccess: invalidateOrg,
  });

  const assignManager = useMutation({
    mutationFn: async ({ slug, managerSlug }: { slug: string; managerSlug: string }) => {
      const employee = employees.find((row) => row.slug === slug);
      const manager = employees.find((row) => row.slug === managerSlug);
      if (!employee || !manager || wouldCreateReportsCycle(employees, slug, managerSlug)) return;
      await saveEmployee({ employee, patch: { team: manager.team, reportsTo: `employee:${manager.slug}` } });
    },
    onSuccess: invalidateOrg,
  });

  const totalEmployees = employees.length;

  return (
    <div className="h-full flex flex-col bg-cream dark:bg-[#0F0D0A] min-h-0 overflow-hidden">
      <header className="shrink-0 border-b border-line dark:border-[#2A241D] px-6 py-4 bg-cream-light dark:bg-[#17140F]">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-flame/10 border border-flame/20 flex items-center justify-center shrink-0">
            <Network className="w-4.5 h-4.5 text-flame" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[18px] leading-tight font-semibold tracking-tight text-ink dark:text-[#F5F1EA]">
              Company org chart
            </h1>
            <p className="text-[12px] text-muted dark:text-[#8C837C] leading-snug mt-0.5">
              {teams.length} {teams.length === 1 ? 'team' : 'teams'} · {totalEmployees}{' '}
              {totalEmployees === 1 ? 'employee' : 'employees'} · drag employees between teams, click to edit
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.45, Number((value - 0.1).toFixed(2))))}
              className="w-8 h-8 rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] flex items-center justify-center text-muted hover:text-ink dark:hover:text-[#F5F1EA]"
              title="Zoom out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                fitChart();
              }}
              className="w-8 h-8 rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] flex items-center justify-center text-muted hover:text-ink dark:hover:text-[#F5F1EA]"
              title="Reset zoom"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))}
              className="w-8 h-8 rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] flex items-center justify-center text-muted hover:text-ink dark:hover:text-[#F5F1EA]"
              title="Zoom in"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setAddTeamOpen(true)}
              className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#37322F] text-white text-[12px] font-medium hover:bg-[#2A2520] dark:bg-[#F5F1EA] dark:text-[#17140F] dark:hover:bg-white"
            >
              <Plus className="w-3.5 h-3.5" />
              Add team
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden px-6 py-5">
        <div className="h-full max-w-7xl mx-auto grid grid-cols-[minmax(0,1fr)_320px] gap-4">
          <section
            ref={viewportRef}
            className="min-h-0 overflow-hidden bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl relative"
            style={{ cursor: panning ? 'grabbing' : 'grab', touchAction: 'none', overscrollBehavior: 'contain' }}
            onMouseDown={(event) => {
              if (event.button !== 0) return;
              const target = event.target as HTMLElement;
              if (target.closest('[data-org-node]')) return;
              setPanning(true);
              panStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
            }}
            onMouseMove={(event) => {
              if (!panning) return;
              setPan({
                x: panStart.current.panX + event.clientX - panStart.current.x,
                y: panStart.current.panY + event.clientY - panStart.current.y,
              });
            }}
            onMouseUp={() => setPanning(false)}
            onMouseLeave={() => setPanning(false)}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            {employeesQ.isLoading ? (
              <div className="text-[13px] text-muted dark:text-[#8C837C] py-12 text-center">loading the org...</div>
            ) : teams.length === 0 ? (
              <div className="text-[13px] text-muted dark:text-[#8C837C] py-12 text-center">
                No employees yet. Add a team to get started.
              </div>
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
              >
                <div className="relative" style={{ width: bounds.width, height: bounds.height }}>
                  <svg className="absolute inset-0 pointer-events-none" width={bounds.width} height={bounds.height} aria-hidden>
                    {edges.map(({ parent, child }) => {
                      const x1 = parent.x + CARD_W / 2;
                      const y1 = parent.y + CARD_H;
                      const x2 = child.x + CARD_W / 2;
                      const y2 = child.y;
                      const midY = (y1 + y2) / 2;
                      return (
                        <path
                          key={`${parent.id}-${child.id}`}
                          d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                          fill="none"
                          stroke="rgba(55,50,47,0.24)"
                          strokeWidth={1.5}
                        />
                      );
                    })}
                  </svg>
                  {allNodes.map((node) => {
                    if (node.source.kind === 'company') {
                      return (
                        <CompanyNode
                          key={node.id}
                          node={node}
                          teamsCount={teams.length}
                          employeesCount={totalEmployees}
                        />
                      );
                    }
                    if (node.source.kind === 'team') {
                      return (
                        <TeamNode
                          key={node.id}
                          node={node}
                          activeDrop={node.source.kind === 'team' && dropTeam === node.source.team}
                          onAddEmployee={() => {
                            if (node.source.kind === 'team') setPendingTeam(node.source.team);
                          }}
                          onDragEnter={() => {
                            if (node.source.kind === 'team') setDropTeam(node.source.team);
                          }}
                          onDragLeave={() => setDropTeam((current) =>
                            node.source.kind === 'team' && current === node.source.team ? null : current,
                          )}
                          onDrop={(slug) => {
                            setDropTeam(null);
                            if (node.source.kind === 'team') moveEmployee.mutate({ slug, team: node.source.team });
                          }}
                        />
                      );
                    }
                    return (
                      <EmployeeNode
                        key={node.id}
                        node={node}
                        selected={node.source.kind === 'employee' && selectedSlug === node.source.employee.slug}
                        activeDrop={node.source.kind === 'employee' && dropManagerSlug === node.source.employee.slug}
                        onDragEnter={() => {
                          if (node.source.kind === 'employee') setDropManagerSlug(node.source.employee.slug);
                        }}
                        onDragLeave={() => setDropManagerSlug((current) =>
                          node.source.kind === 'employee' && current === node.source.employee.slug ? null : current,
                        )}
                        onDrop={(slug) => {
                          setDropManagerSlug(null);
                          if (node.source.kind === 'employee') {
                            assignManager.mutate({ slug, managerSlug: node.source.employee.slug });
                          }
                        }}
                        onSelect={() => {
                          if (suppressNextCardClick.current) {
                            suppressNextCardClick.current = false;
                            return;
                          }
                          if (node.source.kind === 'employee') setSelectedSlug(node.source.employee.slug);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <Inspector
            employee={selected}
            teams={teams.map(([team]) => team)}
            saving={updateEmployee.isPending}
            error={updateEmployee.error instanceof Error ? updateEmployee.error.message : null}
            onSave={(patch) => {
              if (!selected) return;
              updateEmployee.mutate({ employee: selected, patch });
            }}
          />
        </div>
      </div>

      {addTeamOpen && (
        <AddTeamModal
          existingTeams={teams.map((entry) => entry[0])}
          onCancel={() => setAddTeamOpen(false)}
          onSuccess={() => {
            setAddTeamOpen(false);
            invalidateOrg();
          }}
        />
      )}

      {pendingTeam !== null && (
        <AddEmployeeModal
          team={pendingTeam}
          onCancel={() => setPendingTeam(null)}
          onSuccess={() => {
            setPendingTeam(null);
            invalidateOrg();
          }}
        />
      )}
    </div>
  );
}

function CompanyNode({
  node,
  teamsCount,
  employeesCount,
}: {
  node: LayoutNode;
  teamsCount: number;
  employeesCount: number;
}) {
  return (
    <div
      data-org-node
      className="absolute rounded-xl border border-flame/30 bg-gradient-to-br from-flame/12 to-flame/[0.04] flex items-center gap-3 px-4 py-2.5 shadow-sm"
      style={{ left: node.x, top: node.y, width: CARD_W, minHeight: CARD_H }}
    >
      <EmployeeFace seed="ceo" name="CEO" size="md" />
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA] truncate leading-tight">
          The Company
        </div>
        <div className="text-[10.5px] font-mono text-muted dark:text-[#8C837C] truncate leading-tight mt-0.5">
          {teamsCount} teams · {employeesCount} employees
        </div>
      </div>
    </div>
  );
}

function TeamNode({
  node,
  activeDrop,
  onAddEmployee,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  node: LayoutNode;
  activeDrop: boolean;
  onAddEmployee: () => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (slug: string) => void;
}) {
  if (node.source.kind !== 'team') return null;
  return (
    <div
      data-org-node
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        event.preventDefault();
        const slug = event.dataTransfer.getData('text/plain');
        if (slug) onDrop(slug);
      }}
      className={
        'absolute rounded-xl border px-3 py-2.5 transition-colors shadow-sm ' +
        (activeDrop
          ? 'border-flame/60 bg-flame/[0.06]'
          : 'border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F]')
      }
      style={{ left: node.x, top: node.y, width: CARD_W, minHeight: CARD_H }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA] truncate">{node.source.team}</div>
          <div className="text-[10.5px] font-mono text-muted dark:text-[#8C837C]">{node.source.members.length} employees</div>
        </div>
        <button
          type="button"
          onClick={onAddEmployee}
          className="text-[11px] text-muted dark:text-[#8C837C] hover:text-flame inline-flex items-center gap-1 shrink-0"
          title="Add employee to this team"
        >
          <UserPlus className="w-3.5 h-3.5" />
          add
        </button>
      </div>
      <p className="text-[11px] text-muted dark:text-[#8C837C] leading-snug line-clamp-2">{blurbFor(node.source.team)}</p>
    </div>
  );
}

function EmployeeNode({
  node,
  selected,
  activeDrop,
  onDragEnter,
  onDragLeave,
  onDrop,
  onSelect,
}: {
  node: LayoutNode;
  selected: boolean;
  activeDrop: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (slug: string) => void;
  onSelect: () => void;
}) {
  if (node.source.kind !== 'employee') return null;
  const employee = node.source.employee;
  return (
    <button
      data-org-node
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', employee.slug);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        event.preventDefault();
        const slug = event.dataTransfer.getData('text/plain');
        if (slug && slug !== employee.slug) onDrop(slug);
      }}
      onClick={onSelect}
      className={
        'absolute text-left rounded-xl border px-2.5 py-2 flex items-center gap-2 transition-colors shadow-sm ' +
        (activeDrop
          ? 'border-flame/70 bg-flame/[0.06]'
          : selected
          ? 'border-flame/50 bg-white dark:bg-[#1F1B15]'
          : 'border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] hover:border-flame/30')
      }
      style={{ left: node.x, top: node.y, width: CARD_W, minHeight: CARD_H }}
      title={`${employee.name} · ${employee.team}`}
    >
      <EmployeeFace seed={employee.faceSeed} name={employee.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-ink dark:text-[#E6E0D8] truncate">{employee.name}</div>
        <div className="text-[10px] font-mono text-muted dark:text-[#8C837C] truncate">{employee.role}</div>
      </div>
      <ChevronRight className="w-3 h-3 text-muted/60 dark:text-[#6B625C] shrink-0" />
    </button>
  );
}

function Inspector({
  employee,
  teams,
  saving,
  error,
  onSave,
}: {
  employee: Employee | null;
  teams: string[];
  saving: boolean;
  error: string | null;
  onSave: (patch: Partial<Pick<Employee, 'name' | 'team' | 'faceSeed' | 'reportsTo'>>) => void;
}) {
  const [draft, setDraft] = useState({ name: '', team: '', faceSeed: '' });
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);

  if (employee && employee.slug !== loadedSlug) {
    setLoadedSlug(employee.slug);
    setDraft({ name: employee.name, team: employee.team, faceSeed: employee.faceSeed });
  }

  if (!employee) {
    return (
      <aside className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-5">
        <div className="w-10 h-10 rounded-lg bg-flame/10 border border-flame/20 flex items-center justify-center mb-3">
          <Bot className="w-4 h-4 text-flame" />
        </div>
        <div className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA]">Select an employee</div>
        <p className="text-[12px] text-muted dark:text-[#8C837C] leading-snug mt-1">
          Click a card to edit its name, team, and avatar seed. Drag cards between teams to update the org.
        </p>
      </aside>
    );
  }

  const dirty = draft.name !== employee.name || draft.team !== employee.team || draft.faceSeed !== employee.faceSeed;

  return (
    <aside className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-5 overflow-y-auto">
      <div className="flex items-center gap-3 mb-5">
        <EmployeeFace seed={draft.faceSeed || employee.faceSeed} name={draft.name || employee.name} size="lg" ring />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA] truncate">{employee.name}</div>
          <div className="text-[10.5px] font-mono text-muted dark:text-[#8C837C] truncate">{employee.path}</div>
        </div>
      </div>

      <Field label="Name">
        <input
          value={draft.name}
          onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
      </Field>
      <Field label="Team">
        <input
          value={draft.team}
          list="blackmagic-teams"
          onChange={(event) => setDraft((value) => ({ ...value, team: event.target.value }))}
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
        <datalist id="blackmagic-teams">
          {teams.map((team) => <option key={team} value={team} />)}
        </datalist>
      </Field>
      <Field label="Avatar seed">
        <input
          value={draft.faceSeed}
          onChange={(event) => setDraft((value) => ({ ...value, faceSeed: event.target.value }))}
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
        <div className="mt-1 text-[11px] text-muted dark:text-[#8C837C]">
          Changing this changes the generated face. Keep it stable once users recognize the employee.
        </div>
      </Field>

      {error && <div className="mb-3 text-[11px] text-flame">{error}</div>}

      <button
        type="button"
        disabled={!dirty || saving || !draft.name.trim() || !draft.team.trim()}
        onClick={() => onSave({
          name: draft.name.trim(),
          team: draft.team.trim(),
          faceSeed: draft.faceSeed.trim() || employee.slug,
        })}
        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-medium bg-[#37322F] text-white hover:bg-[#2A2520] disabled:opacity-40 disabled:cursor-not-allowed dark:bg-[#F5F1EA] dark:text-[#17140F] dark:hover:bg-white"
      >
        <Check className="w-3.5 h-3.5" />
        {saving ? 'Saving...' : dirty ? 'Save employee' : 'Saved'}
      </button>

      <Link
        href={`/agents?slug=${encodeURIComponent(employee.slug)}`}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-medium border border-line dark:border-[#2A241D] text-muted hover:text-ink dark:hover:text-[#F5F1EA]"
      >
        Open cockpit
      </Link>
    </aside>
  );
}

function AddTeamModal({
  existingTeams,
  onCancel,
  onSuccess,
}: {
  existingTeams: string[];
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [teamName, setTeamName] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const lower = new Set(existingTeams.map((team) => team.toLowerCase()));
  const dup = teamName.trim().length > 0 && lower.has(teamName.trim().toLowerCase());

  const create = useMutation({
    mutationFn: () => createEmployeeStub({
      team: teamName.trim(),
      employeeName: employeeName.trim() || 'New Employee',
    }),
    onSuccess,
  });

  const canSubmit = teamName.trim().length > 0 && !dup && !create.isPending;

  return (
    <Modal title="Add a team" onClose={onCancel}>
      <p className="text-[12px] text-muted dark:text-[#8C837C] leading-snug mb-4">
        A team is stored as the `team:` value in each employee's agent file.
      </p>
      <Field label="Team name">
        <input
          autoFocus
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder="e.g. Engineering, Customer Success, Finance"
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
        {dup && <div className="mt-1 text-[11px] text-flame">That team already exists.</div>}
      </Field>
      <Field label="First employee">
        <input
          value={employeeName}
          onChange={(event) => setEmployeeName(event.target.value)}
          placeholder="e.g. Code Reviewer"
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
      </Field>
      {create.error && <div className="mb-3 text-[11px] text-flame">{(create.error as Error).message}</div>}
      <ModalActions
        onCancel={onCancel}
        onConfirm={() => create.mutate()}
        confirmLabel={create.isPending ? 'Creating...' : 'Create team'}
        confirmDisabled={!canSubmit}
      />
    </Modal>
  );
}

function AddEmployeeModal({
  team,
  onCancel,
  onSuccess,
}: {
  team: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [employeeName, setEmployeeName] = useState('');
  const create = useMutation({
    mutationFn: () => createEmployeeStub({
      team,
      employeeName: employeeName.trim() || 'New Employee',
    }),
    onSuccess,
  });
  return (
    <Modal title={`Hire into ${team}`} onClose={onCancel}>
      <p className="text-[12px] text-muted dark:text-[#8C837C] leading-snug mb-4">
        This writes a new editable agent markdown file.
      </p>
      <Field label="Employee role / name">
        <input
          autoFocus
          value={employeeName}
          onChange={(event) => setEmployeeName(event.target.value)}
          placeholder="e.g. Bug Triage, Onboarding Specialist"
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
      </Field>
      {create.error && <div className="mb-3 text-[11px] text-flame">{(create.error as Error).message}</div>}
      <ModalActions
        onCancel={onCancel}
        onConfirm={() => create.mutate()}
        confirmLabel={create.isPending ? 'Hiring...' : 'Hire'}
        confirmDisabled={employeeName.trim().length === 0 || create.isPending}
      />
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[440px] max-w-[94vw] bg-cream-light dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-line dark:border-[#2A241D]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-flame" />
            <div className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA]">{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function ModalActions({
  onCancel,
  onConfirm,
  confirmLabel,
  confirmDisabled,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 mt-4">
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1.5 text-[12px] text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]"
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={confirmDisabled}
        onClick={onConfirm}
        className="px-4 py-1.5 rounded-full text-[12px] font-medium bg-[#37322F] text-white hover:bg-[#2A2520] disabled:opacity-40 disabled:cursor-not-allowed dark:bg-[#F5F1EA] dark:text-[#17140F] dark:hover:bg-white"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

async function loadEmployees(): Promise<Employee[]> {
  const tree = await api.contextTree();
  const files = tree.tree.filter(
    (file) => file.type === 'file' && file.path.startsWith('agents/') && file.path.endsWith('.md'),
  );
  const rows = await Promise.all(files.map(async (file) => {
    const record = await api.readFile(file.path);
    const fm = (record.frontmatter ?? {}) as Record<string, unknown>;
    const slug = file.path.replace(/^agents\//, '').replace(/\.md$/, '');
    const name = String(fm.name ?? slug);
    const team = String(fm.team ?? 'GTM');
    const reportsTo = String(fm.reports_to ?? `team:${team}`);
    const faceSeed = String(fm.face_seed ?? slug);
    return {
      slug,
      path: file.path,
      name,
      role: roleFromName(name),
      team,
      reportsTo,
      faceSeed,
      frontmatter: fm,
      body: record.body,
    };
  }));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

async function saveEmployee({
  employee,
  patch,
}: {
  employee: Employee;
  patch: Partial<Pick<Employee, 'name' | 'team' | 'faceSeed' | 'reportsTo'>>;
}): Promise<void> {
  const team = patch.team ?? employee.team;
  const frontmatter = {
    ...employee.frontmatter,
    name: patch.name ?? employee.name,
    team,
    reports_to: patch.reportsTo ?? (patch.team && patch.team !== employee.team ? `team:${team}` : employee.reportsTo),
    face_seed: patch.faceSeed ?? employee.faceSeed,
  };
  await api.writeFile(employee.path, serializeMarkdown(frontmatter, employee.body));
}

function serializeMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const lines = Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${formatYamlValue(value)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`;
}

function formatYamlValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(formatYamlValue).join(', ')}]`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value);
  if (/^[A-Za-z0-9_.@/ -]+$/.test(text) && !/^\s|\s$/.test(text)) return text;
  return JSON.stringify(text);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'new-employee';
}

async function createEmployeeStub({
  team,
  employeeName,
}: {
  team: string;
  employeeName: string;
}): Promise<void> {
  const slug = slugify(employeeName);
  const path = `agents/${slug}.md`;
  const body = `---
kind: agent
name: ${employeeName}
slug: ${slug}
team: ${team}
reports_to: team:${team}
icon: Bot
face_seed: ${slug}
model: gpt-5.5
revision: 1
tools:
  - read_file
  - write_file
  - list_dir
  - grep
temperature: 0.3
---

You are ${employeeName} on the ${team} team. Replace this prompt with the
specific job-to-be-done for this employee: the tools they should reach for,
the files they read, the deliverables they produce.

## Default behavior

- Read the relevant context files first.
- Act with the tools you have; never halt for permission.
- End every run with a 3-5 bullet summary.
`;
  await api.writeFile(path, body);
}
