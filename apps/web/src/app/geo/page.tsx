'use client';

// GEO dashboard. Reads from daemon's /api/geo/* endpoints — the daemon stores
// every daily run under signals/geo/runs/<date>/<model>/ and we aggregate
// here on demand. Charts are hand-rolled SVG to avoid pulling in recharts.

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Radar, Play, Plus, Trash2, Loader2 } from 'lucide-react';
import { api, type GeoBrand, type GeoBrandRow, type GeoGapRow, type GeoDomainRow, type GeoPrompt, type GeoModel, type GeoBrandDeltaRow, type GeoDomainDeltaRow, type GeoTrendOverlay, type GeoDeltaMeta } from '../../lib/api';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { PageShell, PageHeader, PageBody, Panel, Button } from '../../components/ui/primitives';
import { ExportPDFButton } from '../../components/export-pdf-button';

const MODEL_LABELS: Record<GeoModel, string> = {
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
  google_ai_overview: 'Google AI Overview',
};

export default function GeoPage() {
  const qc = useQueryClient();
  const [modelFilter, setModelFilter] = useState<GeoModel | ''>('');
  const [windowDays, setWindowDays] = useState<7 | 14 | 28>(14);

  const range = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - windowDays * 24 * 60 * 60 * 1000);
    return { start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) };
  }, [windowDays]);

  const filter = { ...range, ...(modelFilter ? { model: modelFilter } : {}) };

  const cfg = useQuery({ queryKey: ['geo-config'], queryFn: api.geoConfig });
  const prompts = useQuery({ queryKey: ['geo-prompts'], queryFn: api.geoPrompts });
  const runs = useQuery({ queryKey: ['geo-runs'], queryFn: api.geoRuns, refetchInterval: 30_000 });
  const delta = useQuery({ queryKey: ['geo-delta', filter], queryFn: () => api.geoDelta(filter) });
  const gap = useQuery({ queryKey: ['geo-gap', filter], queryFn: () => api.geoGapSources({ ...filter, limit: 25 }) });

  const usBrand = cfg.data?.brands.find((b) => b.is_us);
  const sov = useQuery({
    queryKey: ['geo-sov-overlay', usBrand?.id, filter],
    queryFn: () => api.geoSovTrendOverlay({ brand_id: usBrand!.id, ...filter }),
    enabled: !!usBrand?.id,
  });

  const runMut = useMutation({
    mutationFn: () => api.geoRun({}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['geo-runs'] });
      qc.invalidateQueries({ queryKey: ['geo-delta'] });
      qc.invalidateQueries({ queryKey: ['geo-gap'] });
      qc.invalidateQueries({ queryKey: ['geo-sov-overlay'] });
    },
  });

  // Live progress for "Run now". Polls server-side `_progress.json`
  // independently of `runMut.isPending` so the strip survives tab
  // switches (the React state resets on remount, but the daemon's
  // run keeps going). Fast poll while running, slow background poll
  // otherwise so we cheaply detect a freshly-started run; no poll at
  // all if we've never seen any progress data.
  const runProgress = useQuery({
    queryKey: ['geo-run-progress'],
    queryFn: api.geoRunProgress,
    enabled: true,
    refetchInterval: (query) => {
      const data = query.state.data as { progress?: { running?: boolean } | null } | undefined;
      const prog = data?.progress;
      if (prog && prog.running === true) return 1500;
      if (prog) return 5000;
      return false;
    },
  });

  // True whenever this client kicked off a run OR the daemon reports a
  // run still in flight (covers the post-tab-switch remount case).
  const runActive = runMut.isPending || runProgress.data?.progress?.running === true;

  const today = new Date().toISOString().slice(0, 10);
  const needsConfig = (cfg.data?.brands ?? []).length === 0;
  const latestRun = runs.data?.runs?.slice(-1)[0];

  return (
    <PageShell>
      <PageHeader
        title="GEO"
        subtitle="Generative Engine Optimization — track how ChatGPT, Perplexity, and Google AI Overview cite you vs competitors."
        icon={Radar}
        trailing={
          <div className="flex items-center gap-2 print:hidden">
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value) as 7 | 14 | 28)}
              className="h-8 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 text-[12px] font-mono"
            >
              <option value={7}>7d</option>
              <option value={14}>14d</option>
              <option value={28}>28d</option>
            </select>
            <select
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value as GeoModel | '')}
              className="h-8 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 text-[12px] font-mono"
            >
              <option value="">All models</option>
              <option value="chatgpt">ChatGPT</option>
              <option value="perplexity">Perplexity</option>
              <option value="google_ai_overview">AI Overview</option>
            </select>
            <ExportPDFButton filename={`geo-${today}.pdf`} sectionTitle="GEO" />
            <Button variant="primary" onClick={() => runMut.mutate()} disabled={runActive}>
              {runActive ? (
                <Loader2 className="w-3 h-3 mr-1 inline animate-spin" />
              ) : (
                <Play className="w-3 h-3 mr-1 inline" />
              )}
              {runActive
                ? (runProgress.data?.progress
                    ? `Running ${runProgress.data.progress.done}/${runProgress.data.progress.total}`
                    : 'Starting…')
                : 'Run now'}
            </Button>
          </div>
        }
      />
      <PageBody maxWidth="5xl">
        {needsConfig && (
          <Panel className="p-4 mb-4 border-flame/40">
            <div className="text-sm text-ink dark:text-[#F5F1EA] font-semibold">No brands configured yet</div>
            <p className="text-xs text-muted dark:text-[#8C837C] mt-1">
              Add your brand + competitors below to start tracking. At least one must have <code>is_us: true</code>.
            </p>
          </Panel>
        )}

        {runActive && runProgress.data?.progress && (
          <Panel className="p-3 mb-4 border-flame/40 print:hidden">
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-flame" />
                <span className="font-semibold text-ink dark:text-[#F5F1EA] shrink-0">
                  {runProgress.data.progress.done}/{runProgress.data.progress.total}
                </span>
                <span className="text-muted dark:text-[#8C837C] truncate font-mono">
                  {runProgress.data.progress.current
                    ? `${runProgress.data.progress.current.model} · ${runProgress.data.progress.current.prompt_id}`
                    : 'queueing…'}
                </span>
              </div>
              <div className="text-[11px] font-mono text-muted dark:text-[#8C837C] shrink-0">
                {runProgress.data.progress.ok} ok · {runProgress.data.progress.error} err
              </div>
            </div>
            <div className="mt-2 h-1 w-full bg-cream dark:bg-[#0F0D0A] rounded-full overflow-hidden">
              <div
                className="h-full bg-flame transition-all duration-500"
                style={{
                  width: `${Math.min(100, (runProgress.data.progress.done / Math.max(1, runProgress.data.progress.total)) * 100)}%`,
                }}
              />
            </div>
          </Panel>
        )}

        {latestRun && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            <Stat label="Last run" value={latestRun.date} />
            <Stat label="Prompts" value={latestRun.prompts_total} />
            <Stat label="Runs ok" value={latestRun.runs_ok} />
            <Stat label="Errors" value={latestRun.runs_error} tone={latestRun.runs_error > 0 ? 'bad' : 'ok'} />
          </div>
        )}
        {runMut.isError && (
          <Panel className="p-3 mb-4 border-flame/40">
            <div className="text-xs font-semibold text-flame mb-1">
              {/already running|GEO_RUN_LOCKED|409/i.test(String((runMut.error as Error)?.message ?? ''))
                ? 'Already running — see progress above'
                : `Run failed: ${(runMut.error as Error)?.message ?? 'unknown error'}`}
            </div>
          </Panel>
        )}
        {runMut.data?.errors && runMut.data.errors.length > 0 && (
          <Panel className="p-3 mb-4 border-flame/40">
            <div className="text-xs font-semibold text-flame mb-1">Last run reported {runMut.data.errors.length} errors</div>
            <pre className="text-[11px] font-mono whitespace-pre-wrap">
              {runMut.data.errors.slice(0, 5).map((e) => `${e.model} / ${e.prompt_id}: ${e.error}`).join('\n')}
            </pre>
          </Panel>
        )}

        {(() => {
          const meta = delta.data?.meta;
          const fallback = meta?.fallback_applied ?? 'none';
          const sovTitle =
            fallback === 'shrink_to_latest_pair' && meta
              ? `Share of Voice — most recent run vs previous run (${meta.window_actual.current.start} vs ${meta.window_actual.prior?.start ?? '—'})`
              : fallback === 'no_prior_data'
                ? `Share of Voice — ${windowDays}d (no prior data — run again to see deltas)`
                : `Share of Voice — ${windowDays}d, Δ vs prior ${windowDays}d`;
          const showInsufficientBanner = !!meta && meta.runs_in_prior === 0;
          const newHeader = fallback === 'shrink_to_latest_pair' ? 'Domains added since last run' : 'New domains this period';
          const lostHeader = fallback === 'shrink_to_latest_pair' ? 'Domains dropped since last run' : 'Lost domains this period';
          const gainsHeader = fallback === 'shrink_to_latest_pair' ? 'Citation gains since last run' : 'Biggest citation gains';
          const lossesHeader = fallback === 'shrink_to_latest_pair' ? 'Citation losses since last run' : 'Biggest citation losses';
          return (
            <>
              {delta.data?.movers && <MoversRow movers={delta.data.movers} fallback={fallback} />}

              {showInsufficientBanner && (
                <Panel className="p-3 mb-4 border-flame/30">
                  <div className="text-xs text-ink dark:text-[#E6E0D8]">
                    Only {meta!.runs_in_current} run{meta!.runs_in_current === 1 ? '' : 's'} in the last {windowDays} days.
                    {fallback === 'shrink_to_latest_pair'
                      ? ' Deltas compare your latest run to the previous run instead.'
                      : ' Run GEO again to see what changed.'}
                    {' '}{windowDays}-day trends start once you&apos;ve run on at least 3 different days in each window.
                  </div>
                </Panel>
              )}

              <div className="grid grid-cols-2 gap-4 mb-4">
                <Panel className="p-4">
                  <SectionTitle>{sovTitle}</SectionTitle>
                  <BrandsBarChart rows={delta.data?.brands ?? []} />
                </Panel>
                <Panel className="p-4">
                  <SectionTitle>Your SoV — current vs prior period</SectionTitle>
                  {!usBrand ? (
                    <div className="text-xs text-muted dark:text-[#8C837C] py-8 text-center">
                      Mark a brand with <code>is_us: true</code> to see your trend.
                    </div>
                  ) : (
                    <SovOverlayChart overlay={sov.data} />
                  )}
                </Panel>
              </div>

              {fallback === 'no_prior_data' ? (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Panel className="p-4">
                    <SectionTitle>Run again to see what changed</SectionTitle>
                    <div className="text-xs text-muted dark:text-[#8C837C] py-8 text-center">
                      Citation gains and losses appear after a second sweep.
                    </div>
                  </Panel>
                  <Panel className="p-4">
                    <SectionTitle>Run again to see what changed</SectionTitle>
                    <div className="text-xs text-muted dark:text-[#8C837C] py-8 text-center">
                      Domain churn appears after a second sweep.
                    </div>
                  </Panel>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Panel className="p-4">
                    <SectionTitle>{gainsHeader}</SectionTitle>
                    <DomainDeltaTable rows={delta.data?.domains_top_up ?? []} />
                  </Panel>
                  <Panel className="p-4">
                    <SectionTitle>{lossesHeader}</SectionTitle>
                    <DomainDeltaTable rows={delta.data?.domains_top_down ?? []} />
                  </Panel>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 mb-4">
                {fallback === 'no_prior_data' ? (
                  <Panel className="p-4 col-span-2">
                    <SectionTitle>Run again to see what changed</SectionTitle>
                    <div className="text-xs text-muted dark:text-[#8C837C] py-8 text-center">
                      New and lost domains require at least two sweeps to compare.
                    </div>
                  </Panel>
                ) : (
                  <>
                    <Panel className="p-4">
                      <SectionTitle>{newHeader}</SectionTitle>
                      <DomainDeltaTable rows={delta.data?.domains_new ?? []} compact />
                    </Panel>
                    <Panel className="p-4">
                      <SectionTitle>{lostHeader}</SectionTitle>
                      <DomainDeltaTable rows={delta.data?.domains_lost ?? []} compact />
                    </Panel>
                  </>
                )}
                <Panel className="p-4">
                  <SectionTitle>Gap sources (competitors cited, you&apos;re not)</SectionTitle>
                  <GapTable rows={gap.data?.rows ?? []} />
                </Panel>
              </div>
            </>
          );
        })()}

        <Panel className="p-4 mb-4">
          <SectionTitle>Brands</SectionTitle>
          <BrandsEditor brands={cfg.data?.brands ?? []} models={cfg.data?.models ?? ['chatgpt', 'perplexity', 'google_ai_overview']} onSaved={() => qc.invalidateQueries({ queryKey: ['geo-config'] })} />
        </Panel>

        <Panel className="p-4 mb-4">
          <SectionTitle>Seed prompts ({prompts.data?.prompts.length ?? 0})</SectionTitle>
          <PromptsEditor prompts={prompts.data?.prompts ?? []} onChanged={() => qc.invalidateQueries({ queryKey: ['geo-prompts'] })} />
        </Panel>

        <Panel className="p-4">
          <SectionTitle>Recent daily runs</SectionTitle>
          <RunsTable runs={runs.data?.runs ?? []} />
        </Panel>
      </PageBody>
    </PageShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'bad' }) {
  const toneCls = tone === 'bad' ? 'text-flame' : tone === 'ok' ? 'text-[#7E8C67]' : 'text-ink dark:text-[#F5F1EA]';
  return (
    <Panel className="px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">{label}</div>
      <div className={`text-lg font-semibold ${toneCls}`}>{value}</div>
    </Panel>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-3">{children}</h2>;
}

// Horizontal bar chart of brand SoV with Δ column vs prior period.
function BrandsBarChart({ rows }: { rows: GeoBrandDeltaRow[] }) {
  if (rows.length === 0) return <div className="text-xs text-muted dark:text-[#8C837C] py-8 text-center">No runs yet.</div>;
  const max = Math.max(...rows.map((r) => r.sov), 0.01);
  return (
    <div className="space-y-2">
      {rows.slice(0, 10).map((r) => {
        const deltaPp = r.sov_delta * 100;
        const up = deltaPp > 0.05;
        const down = deltaPp < -0.05;
        const deltaTone = up ? 'text-[#7E8C67]' : down ? 'text-flame' : 'text-muted dark:text-[#8C837C]';
        return (
          <div key={r.brand_id} className="flex items-center gap-2">
            <div className="w-28 truncate text-[12px] text-ink dark:text-[#E6E0D8]">{r.name}</div>
            <div className="flex-1 h-5 bg-cream dark:bg-[#0F0D0A] rounded overflow-hidden relative">
              <div className="absolute inset-y-0 left-0 bg-flame/30" style={{ width: `${(r.sov_prev / max) * 100}%` }} />
              <div className="absolute inset-y-0 left-0 bg-flame" style={{ width: `${(r.sov / max) * 100}%` }} />
            </div>
            <div className="w-14 text-right text-[11px] font-mono text-muted dark:text-[#8C837C]">{(r.sov * 100).toFixed(1)}%</div>
            <div className={`w-16 text-right text-[11px] font-mono ${deltaTone} flex items-center justify-end gap-0.5`}>
              {up ? <ArrowUp className="w-3 h-3" /> : down ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {Math.abs(deltaPp).toFixed(1)}pp
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MoversRow({ movers, fallback }: { movers: NonNullable<ReturnType<typeof api.geoDelta> extends Promise<infer R> ? R extends { movers: infer M } ? M : never : never>; fallback: GeoDeltaMeta['fallback_applied'] }) {
  const shrunk = fallback === 'shrink_to_latest_pair';
  const noPrior = fallback === 'no_prior_data';
  if (noPrior) {
    return (
      <div className="grid grid-cols-1 gap-3 mb-4">
        <Panel className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">Change since last run</div>
          <div className="text-xs text-muted dark:text-[#8C837C]">Run again to see what changed.</div>
        </Panel>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      <MoverCard label={shrunk ? 'SoV gain since last run' : 'Biggest SoV gain'} brand={movers.brand_sov_up} tone="up" />
      <MoverCard label={shrunk ? 'SoV drop since last run' : 'Biggest SoV drop'} brand={movers.brand_sov_down} tone="down" />
      <DomainMoverCard label={shrunk ? 'Top domain added' : 'Top new domain'} domain={movers.new_domain} tone="up" />
      <DomainMoverCard label={shrunk ? 'Top domain dropped' : 'Top lost domain'} domain={movers.lost_domain} tone="down" />
    </div>
  );
}

function MoverCard({ label, brand, tone }: { label: string; brand: GeoBrandDeltaRow | null; tone: 'up' | 'down' }) {
  const color = tone === 'up' ? 'text-[#7E8C67]' : 'text-flame';
  const Icon = tone === 'up' ? ArrowUp : ArrowDown;
  return (
    <Panel className="px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">{label}</div>
      {brand ? (
        <>
          <div className="text-sm font-semibold text-ink dark:text-[#F5F1EA] truncate">{brand.name}</div>
          <div className={`text-xs font-mono ${color} flex items-center gap-1`}>
            <Icon className="w-3 h-3" />
            {(brand.sov_delta * 100 >= 0 ? '+' : '') + (brand.sov_delta * 100).toFixed(1)}pp
            <span className="text-muted dark:text-[#8C837C] ml-1">
              ({(brand.sov_prev * 100).toFixed(1)}% → {(brand.sov * 100).toFixed(1)}%)
            </span>
          </div>
        </>
      ) : (
        <div className="text-xs text-muted dark:text-[#8C837C]">—</div>
      )}
    </Panel>
  );
}

function DomainMoverCard({ label, domain, tone }: { label: string; domain: GeoDomainDeltaRow | null; tone: 'up' | 'down' }) {
  const color = tone === 'up' ? 'text-[#7E8C67]' : 'text-flame';
  const Icon = tone === 'up' ? ArrowUp : ArrowDown;
  return (
    <Panel className="px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">{label}</div>
      {domain ? (
        <>
          <div className="text-sm font-semibold text-ink dark:text-[#F5F1EA] truncate font-mono">{domain.domain}</div>
          <div className={`text-xs font-mono ${color} flex items-center gap-1`}>
            <Icon className="w-3 h-3" />
            {tone === 'up' ? `+${domain.citation_count} cites` : `-${domain.prev_citation_count} cites`}
          </div>
        </>
      ) : (
        <div className="text-xs text-muted dark:text-[#8C837C]">—</div>
      )}
    </Panel>
  );
}

// Two-line SoV chart: current window solid, prior window dashed, aligned by
// day-index so the user can compare "same day last period" side by side.
function SovOverlayChart({ overlay }: { overlay?: GeoTrendOverlay }) {
  if (!overlay) return <div className="text-xs text-muted dark:text-[#8C837C] py-8 text-center">Loading…</div>;
  const { current, prior } = overlay;
  if (current.length < 2) return <div className="text-xs text-muted dark:text-[#8C837C] py-8 text-center">Need 2+ days of runs to draw a trend.</div>;
  const W = 560;
  const H = 160;
  const P = 24;
  const max = Math.max(...current.map((p) => p.sov), ...prior.map((p) => p.sov), 0.01);
  const xStep = (W - 2 * P) / Math.max(1, overlay.window.days - 1);
  const pathFor = (pts: typeof current) => pts.map((p, i) => {
    const x = P + p.day_index * xStep;
    const y = H - P - (p.sov / max) * (H - 2 * P);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastCur = current[current.length - 1];
  const lastPrior = prior[prior.length - 1];
  const delta = (lastCur?.sov ?? 0) - (lastPrior?.sov ?? 0);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[160px]">
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="currentColor" strokeOpacity={0.15} />
        <line x1={P} y1={P} x2={P} y2={H - P} stroke="currentColor" strokeOpacity={0.15} />
        {prior.length > 0 && <path d={pathFor(prior)} fill="none" stroke="#E85D3B" strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="4 3" />}
        <path d={pathFor(current)} fill="none" stroke="#E85D3B" strokeWidth={2} />
        {current.map((p) => {
          const x = P + p.day_index * xStep;
          const y = H - P - (p.sov / max) * (H - 2 * P);
          return <circle key={`c-${p.date}`} cx={x} cy={y} r={2.5} fill="#E85D3B" />;
        })}
        <text x={P} y={H - 4} fontSize={9} fill="currentColor" fillOpacity={0.5}>{overlay.window.start}</text>
        <text x={W - P} y={H - 4} fontSize={9} fill="currentColor" fillOpacity={0.5} textAnchor="end">{overlay.window.end}</text>
        <text x={P + 4} y={P + 10} fontSize={9} fill="currentColor" fillOpacity={0.5}>{(max * 100).toFixed(1)}%</text>
      </svg>
      <div className="flex items-center gap-4 mt-2 text-[11px]">
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-flame" />current</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-flame/40" style={{ borderStyle: 'dashed' }} />prior</span>
        <span className={`font-mono ml-auto ${delta >= 0 ? 'text-[#7E8C67]' : 'text-flame'}`}>
          Δ end-of-period: {(delta * 100 >= 0 ? '+' : '') + (delta * 100).toFixed(1)}pp
        </span>
      </div>
    </div>
  );
}

function DomainDeltaTable({ rows, compact = false }: { rows: GeoDomainDeltaRow[]; compact?: boolean }) {
  if (rows.length === 0) return <div className="text-xs text-muted dark:text-[#8C837C] py-8 text-center">None.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="text-[10px] uppercase tracking-wider text-muted dark:text-[#6B625C] font-mono">
          <tr>
            <th className="text-left py-1">Domain</th>
            {!compact && <th className="text-right">Prev</th>}
            <th className="text-right">Now</th>
            <th className="text-right">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tone = r.status === 'new' ? 'text-[#7E8C67]' : r.status === 'lost' ? 'text-flame' : r.delta > 0 ? 'text-[#7E8C67]' : r.delta < 0 ? 'text-flame' : 'text-muted dark:text-[#8C837C]';
            const sign = r.delta > 0 ? '+' : '';
            return (
              <tr key={r.domain} className="border-t border-line/50 dark:border-[#2A241D]/50">
                <td className="py-1 font-mono truncate max-w-[220px]">
                  {r.domain}
                  {r.status === 'new' && <span className="ml-1 text-[9px] text-[#7E8C67] font-semibold">NEW</span>}
                  {r.status === 'lost' && <span className="ml-1 text-[9px] text-flame font-semibold">LOST</span>}
                </td>
                {!compact && <td className="text-right text-muted dark:text-[#8C837C]">{r.prev_citation_count}</td>}
                <td className="text-right">{r.citation_count}</td>
                <td className={`text-right font-mono ${tone}`}>{sign}{r.delta}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GapTable({ rows }: { rows: GeoGapRow[] }) {
  if (rows.length === 0) return <div className="text-xs text-muted dark:text-[#8C837C] py-8 text-center">No gap sources (yet). Needs competitor mentions in stored runs.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="text-[10px] uppercase tracking-wider text-muted dark:text-[#6B625C] font-mono">
          <tr><th className="text-left py-1">Domain</th><th className="text-left">Cites brands</th><th className="text-right">#</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.domain} className="border-t border-line/50 dark:border-[#2A241D]/50">
              <td className="py-1 font-mono truncate max-w-[220px]">{r.domain}</td>
              <td className="text-[11px] truncate max-w-[160px]">{r.cited_for_brands.join(', ')}</td>
              <td className="text-right">{r.citation_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunsTable({ runs }: { runs: Array<{ date: string; runs_ok: number; runs_error: number; prompts_total: number; models: GeoModel[]; duration_ms: number }> }) {
  if (runs.length === 0) return <div className="text-xs text-muted dark:text-[#8C837C] py-8 text-center">No runs yet. Hit "Run now" to do your first sweep.</div>;
  return (
    <table className="w-full text-[12px]">
      <thead className="text-[10px] uppercase tracking-wider text-muted dark:text-[#6B625C] font-mono">
        <tr><th className="text-left py-1">Date</th><th className="text-left">Models</th><th className="text-right">Prompts</th><th className="text-right">OK</th><th className="text-right">Err</th><th className="text-right">Duration</th></tr>
      </thead>
      <tbody>
        {runs.slice().reverse().slice(0, 20).map((r) => (
          <tr key={r.date} className="border-t border-line/50 dark:border-[#2A241D]/50">
            <td className="py-1 font-mono">{r.date}</td>
            <td className="text-[10px]">{r.models.map((m) => MODEL_LABELS[m]).join(', ')}</td>
            <td className="text-right">{r.prompts_total}</td>
            <td className="text-right text-[#7E8C67]">{r.runs_ok}</td>
            <td className={`text-right ${r.runs_error > 0 ? 'text-flame' : ''}`}>{r.runs_error}</td>
            <td className="text-right font-mono text-[10px]">{(r.duration_ms / 1000).toFixed(1)}s</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BrandsEditor({ brands, models, onSaved }: { brands: GeoBrand[]; models: GeoModel[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<GeoBrand[]>(brands.length > 0 ? brands : [{ id: 'us', name: '', is_us: true, aliases: [], domains: [] }]);
  const [modelsDraft, setModelsDraft] = useState<GeoModel[]>(models);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function update(i: number, patch: Partial<GeoBrand>) {
    setDraft(draft.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  }
  function remove(i: number) { setDraft(draft.filter((_, idx) => idx !== i)); }
  function add() {
    setDraft([...draft, { id: `brand-${Math.random().toString(36).slice(2, 6)}`, name: '', aliases: [], domains: [] }]);
  }
  async function save() {
    setSaving(true); setMsg(null);
    try {
      await api.geoSaveConfig({ brands: draft, models: modelsDraft });
      setMsg('saved');
      onSaved();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally { setSaving(false); }
  }
  function toggleModel(m: GeoModel) {
    setModelsDraft(modelsDraft.includes(m) ? modelsDraft.filter((x) => x !== m) : [...modelsDraft, m]);
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3 text-[11px]">
        <span className="text-muted dark:text-[#8C837C]">Models:</span>
        {(['chatgpt', 'perplexity', 'google_ai_overview'] as GeoModel[]).map((m) => (
          <label key={m} className="flex items-center gap-1">
            <input type="checkbox" checked={modelsDraft.includes(m)} onChange={() => toggleModel(m)} />
            {MODEL_LABELS[m]}
          </label>
        ))}
      </div>
      <div className="space-y-2">
        {draft.map((b, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center text-[12px]">
            <input
              value={b.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Brand name"
              className="col-span-3 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1 font-mono"
            />
            <input
              value={(b.aliases ?? []).join(', ')}
              onChange={(e) => update(i, { aliases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="aliases, comma-separated"
              className="col-span-3 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1 font-mono"
            />
            <input
              value={(b.domains ?? []).join(', ')}
              onChange={(e) => update(i, { domains: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="domains.com, comma-separated"
              className="col-span-4 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1 font-mono"
            />
            <label className="col-span-1 flex items-center gap-1 text-[11px]">
              <input type="checkbox" checked={!!b.is_us} onChange={(e) => update(i, { is_us: e.target.checked })} />
              us
            </label>
            <button onClick={() => remove(i)} className="col-span-1 text-flame text-[11px] flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> del
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Button variant="secondary" onClick={add}><Plus className="w-3 h-3 mr-1 inline" />Add brand</Button>
        <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        {msg && <span className="text-[11px] text-muted dark:text-[#8C837C]">{msg}</span>}
      </div>
    </div>
  );
}

function PromptsEditor({ prompts, onChanged }: { prompts: GeoPrompt[]; onChanged: () => void }) {
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');

  async function add() {
    const t = text.trim();
    if (!t) return;
    const tagList = tags.split(',').map((s) => s.trim()).filter(Boolean);
    await api.geoAddPrompt({ text: t, tags: tagList.length > 0 ? tagList : undefined });
    setText(''); setTags(''); onChanged();
  }
  async function del(id: string) {
    await api.geoDeletePrompt(id);
    onChanged();
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Prompt text (as a real user would type)"
          className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
        />
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tags (optional)"
          className="w-48 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-2 py-1.5 text-[12px] font-mono"
        />
        <Button variant="primary" onClick={add}><Plus className="w-3 h-3 mr-1 inline" />Add</Button>
      </div>
      <div className="max-h-[280px] overflow-y-auto border border-line/50 dark:border-[#2A241D]/50 rounded-md">
        <table className="w-full text-[12px]">
          <tbody>
            {prompts.slice().reverse().map((p) => (
              <tr key={p.id} className="border-t border-line/50 dark:border-[#2A241D]/50 first:border-t-0">
                <td className="py-1.5 px-2">{p.text}</td>
                <td className="py-1.5 px-2 text-[10px] text-muted dark:text-[#6B625C] font-mono whitespace-nowrap">{(p.tags ?? []).join(', ')}</td>
                <td className="py-1.5 px-2 w-8">
                  <button onClick={() => del(p.id)} className="text-flame"><Trash2 className="w-3 h-3" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
