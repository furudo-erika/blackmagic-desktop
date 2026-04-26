'use client';

/**
 * Dashboard — Multica Runtimes-style overview of where agents are running
 * and what they're costing. 3-panel layout:
 *
 *   [ Runtimes list | selected runtime detail (metric cards + heatmap + cost bars) ]
 *
 * A "runtime" here is one of:
 *   - local desktop (this machine, talking to the local daemon)
 *   - cloud proxy  (api.blackmagic.engineering — billed calls)
 *   - each configured project context (since each has its own runs/ dir)
 *
 * Everything renders with pure SVG for the charts to avoid adding recharts
 * as a dependency — same style as the existing /geo page.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Cloud, FolderKanban, LayoutDashboard } from 'lucide-react';
import { api } from '../../lib/api';
import { PageShell, PageHeader, PageBody, Panel } from '../../components/ui/primitives';

type RuntimeRow = {
  id: string;
  name: string;
  subtitle: string;
  icon: 'desktop' | 'cloud' | 'project';
  status: 'online' | 'offline';
};

export default function DashboardPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 15_000 });
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const runs = useQuery({ queryKey: ['runs'], queryFn: api.listRuns, refetchInterval: 15_000 });

  const runtimes: RuntimeRow[] = useMemo(() => {
    const rows: RuntimeRow[] = [];
    rows.push({
      id: 'local',
      name: 'This Mac',
      subtitle: health.data
        ? `daemon · v${health.data.version}`
        : 'daemon',
      icon: 'desktop',
      status: health.data?.ok ? 'online' : 'offline',
    });
    rows.push({
      id: 'cloud',
      name: 'Cloud (blackmagic.engineering)',
      subtitle: health.data?.zennConfigured ? 'signed in' : 'not signed in',
      icon: 'cloud',
      status: health.data?.zennConfigured ? 'online' : 'offline',
    });
    for (const p of projects.data?.projects ?? []) {
      if (p.id === projects.data?.active) continue;
      rows.push({
        id: `project:${p.id}`,
        name: p.name,
        subtitle: p.path,
        icon: 'project',
        status: 'online',
      });
    }
    return rows;
  }, [health.data, projects.data]);

  const [selected, setSelected] = useState<string>('local');
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);

  const selectedRuntime = runtimes.find((r) => r.id === selected) ?? runtimes[0];

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        subtitle="Runtimes, token usage, activity, and spend. Everything your agents did, by runtime."
        icon={LayoutDashboard}
      />
      <PageBody maxWidth="5xl">
        <div className="grid grid-cols-[240px_1fr] gap-5">
          {/* Runtimes list (left panel) */}
          <aside className="min-w-0">
            <h2 className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-2 px-1">
              Runtimes
            </h2>
            <div className="space-y-1">
              {runtimes.map((r) => (
                <RuntimeRowButton
                  key={r.id}
                  row={r}
                  selected={selected === r.id}
                  onClick={() => setSelected(r.id)}
                />
              ))}
            </div>
          </aside>

          {/* Detail panel (right) */}
          <div className="min-w-0">
            <RuntimeDetail
              runtime={selectedRuntime}
              runs={runs.data?.runs ?? []}
              windowDays={windowDays}
              onWindowChange={setWindowDays}
            />
          </div>
        </div>
      </PageBody>
    </PageShell>
  );
}

function RuntimeRowButton({
  row,
  selected,
  onClick,
}: {
  row: RuntimeRow;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = row.icon === 'desktop' ? Monitor : row.icon === 'cloud' ? Cloud : FolderKanban;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-start gap-2.5 ' +
        (selected
          ? 'bg-white dark:bg-[#1F1B15] border-flame/60'
          : 'bg-white/60 dark:bg-[#1F1B15]/60 border-line dark:border-[#2A241D] hover:border-flame/40')
      }
    >
      <div className={
        'w-8 h-8 rounded-md flex items-center justify-center shrink-0 ' +
        (selected ? 'bg-flame/10' : 'bg-cream dark:bg-[#0F0D0A]')
      }>
        <Icon className={`w-4 h-4 ${selected ? 'text-flame' : 'text-muted dark:text-[#8C837C]'}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA] truncate">
            {row.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={
            'inline-block w-1.5 h-1.5 rounded-full ' +
            (row.status === 'online' ? 'bg-[#7E8C67]' : 'bg-muted/40 dark:bg-[#6B625C]/40')
          } />
          <span className="text-[10.5px] text-muted dark:text-[#8C837C] truncate">
            {row.status} · {row.subtitle}
          </span>
        </div>
      </div>
    </button>
  );
}

function RuntimeDetail({
  runtime,
  runs,
  windowDays,
  onWindowChange,
}: {
  runtime: RuntimeRow | undefined;
  runs: Array<{ runId: string; tokensIn: number; tokensOut: number; costCents: number; done?: boolean }>;
  windowDays: 7 | 30 | 90;
  onWindowChange: (n: 7 | 30 | 90) => void;
}) {
  if (!runtime) return null;
  const Icon = runtime.icon === 'desktop' ? Monitor : runtime.icon === 'cloud' ? Cloud : FolderKanban;

  // Aggregate metrics from runs. We don't yet attribute per-runtime on the
  // daemon side, so the "This Mac" row gets the full count. Cloud and
  // project rows render zeros until the daemon surfaces a `runtime:` tag
  // on each run (batch 2).
  const agg = useMemo(() => {
    let tokensIn = 0, tokensOut = 0, costCents = 0, total = 0, ok = 0;
    if (runtime.id === 'local') {
      for (const r of runs) {
        tokensIn += r.tokensIn || 0;
        tokensOut += r.tokensOut || 0;
        costCents += r.costCents || 0;
        total += 1;
        if (r.done) ok += 1;
      }
    }
    return { tokensIn, tokensOut, costCents, total, ok };
  }, [runs, runtime.id]);

  // Build a 7×N heatmap grid from run timestamps. runId format:
  // <ISO-with-dashes>-<agent>  — e.g. 2026-04-21T09-17-21-931Z-geo-analyst
  const heatmap = useMemo(() => buildHeatmap(runs, windowDays), [runs, windowDays]);
  const dailyCost = useMemo(() => buildDailyCost(runs, windowDays), [runs, windowDays]);

  return (
    <div className="min-w-0">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-ink dark:text-[#F5F1EA]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-ink dark:text-[#F5F1EA] truncate">
              {runtime.name}
            </h2>
            <span className={
              'inline-flex items-center gap-1 text-[11px] ' +
              (runtime.status === 'online' ? 'text-[#7E8C67]' : 'text-muted dark:text-[#8C837C]')
            }>
              <span className={
                'w-1.5 h-1.5 rounded-full ' +
                (runtime.status === 'online' ? 'bg-[#7E8C67]' : 'bg-muted dark:bg-[#6B625C]')
              } />
              {runtime.status}
            </span>
            <span className="text-[11px] text-muted dark:text-[#8C837C] truncate">
              · {runtime.subtitle}
            </span>
          </div>
        </div>
      </div>

      {/* Window toggle */}
      <div className="flex items-center gap-1 mb-4">
        {([7, 30, 90] as const).map((n) => (
          <button
            key={n}
            onClick={() => onWindowChange(n)}
            className={
              'h-7 px-3 rounded-md text-[12px] font-mono transition-colors ' +
              (windowDays === n
                ? 'bg-ink dark:bg-[#F5F1EA] text-white dark:text-[#17140F]'
                : 'text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]')
            }
          >
            {n}d
          </button>
        ))}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <MetricCard label="Input tokens" value={formatNum(agg.tokensIn)} />
        <MetricCard label="Output tokens" value={formatNum(agg.tokensOut)} />
        <MetricCard label="Runs" value={String(agg.total)} />
        <MetricCard label="Spend" value={`$${(agg.costCents / 100).toFixed(2)}`} />
      </div>

      {/* Activity heatmap + Daily cost */}
      <div className="grid grid-cols-2 gap-4">
        <Panel className="p-4">
          <h3 className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-3">
            Activity
          </h3>
          <ActivityHeatmap grid={heatmap} windowDays={windowDays} />
        </Panel>
        <Panel className="p-4">
          <h3 className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-3">
            Daily cost
          </h3>
          <DailyCostChart data={dailyCost} />
        </Panel>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg p-3.5">
      <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
        {label}
      </div>
      <div className="text-[20px] font-semibold text-ink dark:text-[#F5F1EA] mt-0.5 font-mono tabular-nums">
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heatmap — 7 rows (days of week) × N cols (weeks). Intensity scaled to the
// max cell in the window. Pure SVG; mirrors GitHub's contribution chart.
// ---------------------------------------------------------------------------
function ActivityHeatmap({ grid, windowDays }: { grid: HeatCell[]; windowDays: number }) {
  // Render at native pixel size so cells stay small and tidy instead of
  // ballooning to 60px+ when the panel is wide. SVG is left-aligned
  // inside the panel.
  const cols = Math.ceil(grid.length / 7);
  const cellSize = 11;
  const gap = 3;
  const labelW = 22;
  const legendH = 14;
  const w = labelW + cols * (cellSize + gap);
  const h = 7 * (cellSize + gap) + legendH;
  const max = Math.max(1, ...grid.map((c) => c.count));

  function intensity(c: number) {
    if (c === 0) return 'rgba(120,110,100,0.12)';
    const t = Math.min(1, c / max);
    const alpha = 0.2 + t * 0.8;
    return `rgba(232,93,59,${alpha.toFixed(2)})`;
  }

  const dayLabels = ['Mon', 'Wed', 'Fri'];

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ maxWidth: '100%', height: 'auto' }}
      shapeRendering="crispEdges"
    >
      {dayLabels.map((lbl, idx) => (
        <text
          key={lbl}
          x={0}
          y={(idx * 2 + 1) * (cellSize + gap) + cellSize - 2}
          fontSize={8.5}
          fill="currentColor"
          fillOpacity={0.45}
        >
          {lbl}
        </text>
      ))}
      {grid.map((c, i) => {
        const col = Math.floor(i / 7);
        const row = i % 7;
        const x = labelW + col * (cellSize + gap);
        const y = row * (cellSize + gap);
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={cellSize}
            height={cellSize}
            rx={2}
            fill={intensity(c.count)}
          >
            <title>{`${c.date}: ${c.count} run${c.count === 1 ? '' : 's'}`}</title>
          </rect>
        );
      })}
      <text x={labelW} y={h - 2} fontSize={8.5} fill="currentColor" fillOpacity={0.45}>Less</text>
      <text x={w - 2} y={h - 2} fontSize={8.5} fill="currentColor" fillOpacity={0.45} textAnchor="end">More</text>
    </svg>
  );
}

function DailyCostChart({ data }: { data: Array<{ date: string; cents: number }> }) {
  if (data.length === 0) {
    return <div className="text-xs text-muted dark:text-[#8C837C] py-6 text-center">No runs yet.</div>;
  }
  const W = 480;
  const H = 160;
  const P = 24;
  const max = Math.max(1, ...data.map((d) => d.cents));
  const bw = (W - 2 * P) / data.length - 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[160px]">
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="currentColor" strokeOpacity={0.15} />
      {data.map((d, i) => {
        const barH = (d.cents / max) * (H - 2 * P);
        const x = P + i * ((W - 2 * P) / data.length) + 1;
        const y = H - P - barH;
        return (
          <rect key={d.date} x={x} y={y} width={bw} height={barH} fill="#E85D3B" opacity={0.85} rx={1.5}>
            <title>{`${d.date}: $${(d.cents / 100).toFixed(2)}`}</title>
          </rect>
        );
      })}
      <text x={P} y={H - 4} fontSize={9} fill="currentColor" fillOpacity={0.5}>{data[0]?.date ?? ''}</text>
      <text x={W - P} y={H - 4} fontSize={9} fill="currentColor" fillOpacity={0.5} textAnchor="end">
        {data[data.length - 1]?.date ?? ''}
      </text>
      <text x={P + 4} y={P + 10} fontSize={9} fill="currentColor" fillOpacity={0.5}>
        ${(max / 100).toFixed(2)}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------
type HeatCell = { date: string; count: number };

function parseRunTimestamp(runId: string): Date | null {
  // runId format: YYYY-MM-DDTHH-MM-SS-ms-slug
  const m = runId.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function buildHeatmap(runs: Array<{ runId: string }>, days: number): HeatCell[] {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const cells: HeatCell[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    cells.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  // Align start-of-window to Monday so the vertical columns are whole weeks.
  const startDow = start.getDay(); // 0=Sun
  const leadingBlanks = (startDow + 6) % 7; // Mon=0
  const padded: HeatCell[] = [];
  for (let i = 0; i < leadingBlanks; i++) padded.push({ date: '', count: 0 });
  padded.push(...cells);
  while (padded.length % 7) padded.push({ date: '', count: 0 });
  const byDate = new Map(padded.map((c) => [c.date, c]));
  for (const r of runs) {
    const d = parseRunTimestamp(r.runId);
    if (!d) continue;
    const k = d.toISOString().slice(0, 10);
    const cell = byDate.get(k);
    if (cell) cell.count += 1;
  }
  return padded;
}

function buildDailyCost(
  runs: Array<{ runId: string; costCents: number }>,
  days: number,
): Array<{ date: string; cents: number }> {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const bucket = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    bucket.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of runs) {
    const d = parseRunTimestamp(r.runId);
    if (!d) continue;
    const k = d.toISOString().slice(0, 10);
    if (bucket.has(k)) bucket.set(k, bucket.get(k)! + (r.costCents || 0));
  }
  return Array.from(bucket.entries()).map(([date, cents]) => ({ date, cents }));
}

function formatNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return (n / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M';
}
