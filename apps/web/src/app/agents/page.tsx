'use client';

/**
 * /agents?slug=<agent> — agent workspace, step-by-step run viewer.
 *
 * Three stacked panels above an inline chat composer:
 *   INPUT       — what the user asked (last prompt) + run params
 *   PROCESSING  — tool calls + reasoning, live timeline
 *   OUTPUT      — files written / drafts created (scanned from tool calls)
 *
 * Pulls the most-recent run for this agent via the existing
 * `listRuns` + `getRun` daemon endpoints, polls every 2s while the
 * run is live. Sending a message kicks off a new run via
 * `runAgent` and the polling loop picks it up.
 *
 * Static-export-safe: dynamic agent identity lives in `?slug=`.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PreflightModal } from '../../components/preflight-modal';
import {
  Bot, Sparkles, Search, Briefcase, Globe, Linkedin,
  CalendarClock, Copy as CopyIcon, RotateCcw, Activity, Radar, Send,
  Play, ChevronRight, ChevronDown, FileOutput, FileInput, Loader2, Check, AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../lib/api';
import { AgentIcon, hasAgentTheme } from '../../components/agent-icon';
import { Markdown } from '../../components/markdown';
import { Composer } from '../../components/composer';

const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  Bot, Globe, Linkedin, CalendarClock, Copy: CopyIcon, RotateCcw,
  Activity, Radar, Search, Briefcase, Send, Sparkles,
};

type AgentMeta = {
  slug: string;
  name: string;
  icon: string;
  tagline: string;
  starters: string[];
};

type Run = {
  runId: string;
  agent: string;
  preview?: string;
  done?: boolean;
  status?: 'running' | 'completed' | 'failed' | 'blocked' | 'canceled';
  toolCalls: number;
  costCents: number;
};

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

function elapsedShort(startMs: number | null, endMs?: number): string {
  if (!startMs) return '';
  const dur = ((endMs ?? Date.now()) - startMs) / 1000;
  if (dur < 60) return `${Math.floor(dur)}s`;
  if (dur < 3600) return `${Math.floor(dur / 60)}m ${Math.floor(dur % 60)}s`;
  return `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m`;
}

function deriveTagline(fm: Record<string, unknown>, body: string, fallbackName: string): string {
  const explicit =
    (typeof fm.tagline === 'string' && fm.tagline) ||
    (typeof fm.description === 'string' && fm.description) ||
    '';
  const candidate = explicit || body;
  let text = candidate.trim();
  text = text.replace(/^#+\s.*$/m, '').trim();
  text = text.replace(/^You\s+(are|own)\s+(the\s+)?[^.]*\.\s*/i, '');
  text = text.replace(/^Your\s+(job|role|task)\s+is\s+to\s+/i, '');
  const firstSentence = text.split(/(?<=[.?!])\s+/)[0] ?? '';
  const trimmed = firstSentence.replace(/[`*_#]/g, '').trim();
  if (trimmed.length > 0 && trimmed.length < 200) return trimmed;
  return `${fallbackName} agent`;
}

// Pull a load-bearing arg out of a tool call so the timeline shows
// "Read CLAUDE.md" instead of just "Read".
function toolChip(args: any): string {
  let parsed: any = args;
  if (typeof args === 'string') {
    try { parsed = JSON.parse(args); } catch { return args.slice(0, 60); }
  }
  if (!parsed || typeof parsed !== 'object') return '';
  const pick = (...ks: string[]) => {
    for (const k of ks) {
      const v = parsed?.[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  const full =
    pick('path', 'file', 'file_path') ||
    pick('url', 'link', 'domain') ||
    pick('linkedinUrl', 'linkedin_url') ||
    pick('query', 'q', 'search') ||
    pick('contact_path', 'sequence_path') ||
    pick('subject', 'to', 'channel') ||
    '';
  if (!full) return '';
  const base = full.split('/').pop() || full;
  return base.length > 50 ? base.slice(0, 47) + '…' : base;
}

function toolPath(args: any): string | null {
  let parsed: any = args;
  if (typeof args === 'string') {
    try { parsed = JSON.parse(args); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const v = parsed.path ?? parsed.file ?? parsed.file_path ?? parsed.target;
  return typeof v === 'string' ? v : null;
}

function friendlyTool(name: string): string {
  return name
    .split('_')
    .map((w) => w.length ? w[0]!.toUpperCase() + w.slice(1) : w)
    .join(' ');
}

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'create_file', 'apply_patch', 'append_file']);

function AgentsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const slug = params.get('slug') ?? '';
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');

  // All agents — used to render hero + handle bare /agents fallback.
  const allAgents = useQuery({
    queryKey: ['agents-meta'],
    queryFn: async (): Promise<AgentMeta[]> => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'),
      );
      const rows = await Promise.all(files.map(async (f) => {
        const r = await api.readFile(f.path);
        const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
        const s = f.path.replace(/^agents\//, '').replace(/\.md$/, '');
        const name = String(fm.name ?? s);
        const starters = Array.isArray(fm.starter_prompts)
          ? (fm.starter_prompts as unknown[]).map(String).filter(Boolean)
          : [];
        return {
          slug: s,
          name,
          icon: typeof fm.icon === 'string' ? fm.icon : 'Bot',
          tagline: deriveTagline(fm, r.body, name),
          starters,
        };
      }));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return rows;
    },
  });

  const fallbackSlug = useMemo(() => {
    const last = typeof window !== 'undefined' ? window.localStorage.getItem('bm-last-agent') : null;
    if (last && (allAgents.data ?? []).some((a) => a.slug === last)) return last;
    return allAgents.data?.[0]?.slug ?? '';
  }, [allAgents.data]);

  useEffect(() => {
    if (!slug && fallbackSlug) {
      router.replace(`/agents?slug=${encodeURIComponent(fallbackSlug)}`);
    }
  }, [slug, fallbackSlug, router]);

  useEffect(() => {
    if (slug && typeof window !== 'undefined') {
      window.localStorage.setItem('bm-last-agent', slug);
    }
  }, [slug]);

  const agent = (allAgents.data ?? []).find((a) => a.slug === slug);

  // All runs — find the latest one for this agent.
  const runsQ = useQuery({
    queryKey: ['runs'],
    queryFn: api.listRuns,
    refetchInterval: 5_000,
    enabled: !!slug,
  });
  const latestRun = useMemo<Run | undefined>(() => {
    return (runsQ.data?.runs ?? [])
      .filter((r) => (r.agent ?? '').toLowerCase() === slug.toLowerCase())
      .sort((a, b) => (runStartedMs(b.runId) ?? 0) - (runStartedMs(a.runId) ?? 0))[0];
  }, [runsQ.data, slug]);

  const isLive = !!latestRun && !latestRun.done;

  // Pull the latest run's full state — meta, prompt, tool calls.
  const runDetail = useQuery({
    queryKey: ['run-detail', latestRun?.runId],
    queryFn: () => api.getRun(latestRun!.runId),
    enabled: !!latestRun,
    refetchInterval: isLive ? 2_000 : false,
  });

  // Kick off a new run for this agent. Refreshes runs query so polling
  // picks it up immediately.
  const kickoff = useMutation({
    mutationFn: ({ task, force }: { task: string; force?: boolean }) =>
      api.runAgent(slug, task, { force }),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  const [preflightOpen, setPreflightOpen] = useState(false);
  const [pendingTask, setPendingTask] = useState<string>('');

  function send(text?: string) {
    const v = (text ?? draft).trim();
    if (!v || !slug || kickoff.isPending) return;
    // Run preflight FIRST — if the agent needs Apify / us/* files /
    // CLI tools, the modal collects those before the run fires.
    setPendingTask(v);
    setPreflightOpen(true);
  }

  const stopMut = useMutation({
    mutationFn: (id: string) => api.stopRun(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runs'] }),
  });

  if (!slug) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted dark:text-[#8C837C]">
        {allAgents.isLoading ? 'loading…' : 'no agents in this project'}
      </div>
    );
  }
  if (!agent) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted dark:text-[#8C837C]">
        loading agent…
      </div>
    );
  }

  const FallbackIcon = AGENT_ICON_MAP[agent.icon] ?? Bot;

  // Derive the three panels' contents from the latest run.
  const startedMs = latestRun ? runStartedMs(latestRun.runId) : null;
  const toolCalls: any[] = runDetail.data?.toolCalls ?? [];
  const inputPrompt: string =
    runDetail.data?.prompt ||
    runDetail.data?.messages?.[0]?.content ||
    '';

  // Output paths = unique file paths written during the run.
  const outputPaths: string[] = [];
  const seen = new Set<string>();
  for (const tc of toolCalls) {
    const name = String(tc.name ?? tc.tool ?? '');
    if (!WRITE_TOOLS.has(name)) continue;
    const p = toolPath(tc.arguments ?? tc.args ?? tc.input);
    if (p && !seen.has(p)) {
      seen.add(p);
      outputPaths.push(p);
    }
  }

  return (
    <div className="h-full flex flex-col bg-cream dark:bg-[#0F0D0A] min-h-0">
      {/* Hero */}
      <header className="shrink-0 border-b border-line dark:border-[#2A241D] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-start gap-3">
          {hasAgentTheme(agent.slug) ? (
            <AgentIcon slug={agent.slug} name={agent.name} size="lg" />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-flame/10 border border-flame/20 flex items-center justify-center shrink-0">
              <FallbackIcon className="w-5 h-5 text-flame" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink dark:text-[#F5F1EA] truncate">{agent.name}</h1>
              <span className="text-[11px] font-mono text-muted dark:text-[#8C837C]">{slug}</span>
              <span className={
                'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full ' +
                (isLive
                  ? 'bg-flame/10 text-flame'
                  : 'bg-cream-light dark:bg-[#17140F] text-muted dark:text-[#8C837C]')
              }>
                <span className={'w-1.5 h-1.5 rounded-full ' + (isLive ? 'bg-flame animate-pulse' : 'bg-muted/40 dark:bg-[#6B625C]')} />
                {isLive ? `Running · ${elapsedShort(startedMs)}` : 'Idle'}
              </span>
              {isLive && latestRun && (
                <button
                  type="button"
                  onClick={() => stopMut.mutate(latestRun.runId)}
                  className="ml-auto text-[11px] text-muted dark:text-[#8C837C] hover:text-flame"
                >
                  Stop
                </button>
              )}
            </div>
            <p className="text-[12px] text-muted dark:text-[#8C837C] mt-0.5 leading-snug">
              {agent.tagline}
            </p>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        <div className="max-w-4xl mx-auto space-y-4">
          <Panel
            label="Input"
            icon={FileInput}
            status={inputPrompt ? 'collected' : 'awaiting'}
          >
            {inputPrompt ? (
              <InputPreview source={inputPrompt} />
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-muted dark:text-[#8C837C]">
                  Nothing in flight. Send a message below or pick a starter:
                </p>
                {agent.starters.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {agent.starters.slice(0, 4).map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => send(p)}
                        disabled={kickoff.isPending}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F] text-ink dark:text-[#E6E0D8] hover:border-flame hover:text-flame transition-colors max-w-md"
                      >
                        <Play className="w-3 h-3 shrink-0" />
                        <span className="truncate">{p}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted/70 dark:text-[#6B625C]">
                    (no starter prompts in <code className="font-mono">{`agents/${slug}.md`}</code>)
                  </p>
                )}
              </div>
            )}
          </Panel>

          <Panel
            label="Processing"
            icon={Loader2}
            status={
              !latestRun ? 'idle' :
              isLive ? `step ${toolCalls.length} · ${elapsedShort(startedMs)}` :
              `${toolCalls.length} steps · ${elapsedShort(startedMs, runStartedMs(latestRun.runId)! + 1)}` // placeholder end
            }
            statusClass={isLive ? 'text-flame' : 'text-muted dark:text-[#8C837C]'}
            spinIcon={isLive}
          >
            {!latestRun || (toolCalls.length === 0 && !isLive) ? (
              <p className="text-[12px] text-muted dark:text-[#8C837C]">
                {!latestRun ? 'No runs yet for this agent.' : 'No tool calls in this run.'}
              </p>
            ) : (
              <ol className="space-y-1.5">
                {toolCalls.map((tc, i) => {
                  const name = friendlyTool(String(tc.name ?? tc.tool ?? 'tool'));
                  const chip = toolChip(tc.arguments ?? tc.args ?? tc.input);
                  const status: 'pending' | 'done' | 'error' =
                    tc.error ? 'error' :
                    tc.result !== undefined || tc.endedAt || tc.completed ? 'done' :
                    i === toolCalls.length - 1 && isLive ? 'pending' : 'done';
                  return (
                    <li key={tc.id ?? i} className="flex items-start gap-2 text-[12px]">
                      <span className="shrink-0 mt-0.5">
                        {status === 'done' ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : status === 'error' ? (
                          <AlertCircle className="w-3 h-3 text-rose-500" />
                        ) : (
                          <Loader2 className="w-3 h-3 text-flame animate-spin" />
                        )}
                      </span>
                      <span className="text-ink dark:text-[#E6E0D8]">{name}</span>
                      {chip && (
                        <span className="font-mono text-[11px] px-1.5 py-0 rounded bg-cream-light dark:bg-[#17140F] text-muted dark:text-[#8C837C] truncate max-w-md">
                          {chip}
                        </span>
                      )}
                    </li>
                  );
                })}
                {isLive && (
                  <li className="flex items-center gap-2 text-[11px] text-muted/70 dark:text-[#6B625C] mt-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    waiting for next step…
                  </li>
                )}
              </ol>
            )}
          </Panel>

          <Panel
            label="Output"
            icon={FileOutput}
            status={
              outputPaths.length === 0
                ? (isLive ? 'pending' : '—')
                : `${outputPaths.length} file${outputPaths.length === 1 ? '' : 's'}`
            }
          >
            {outputPaths.length === 0 ? (
              <p className="text-[12px] text-muted dark:text-[#8C837C]">
                {isLive ? 'Nothing written yet — agent is still gathering input.' : 'This run did not write any files.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {outputPaths.map((p) => (
                  <li key={p}>
                    <Link
                      href={`/vault?path=${encodeURIComponent(p)}`}
                      className="inline-flex items-center gap-1.5 text-[12px] font-mono text-flame hover:underline"
                    >
                      <FileOutput className="w-3 h-3" />
                      {p}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {latestRun && !isLive && runDetail.data?.final && (
              <div className="mt-3 border-t border-line dark:border-[#2A241D] pt-3">
                <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-2">
                  Final answer
                </div>
                <div className="bg-cream-light dark:bg-[#17140F] border border-line dark:border-[#2A241D] rounded-md p-4 max-h-[420px] overflow-auto">
                  <Markdown source={runDetail.data.final} />
                </div>
              </div>
            )}
            {latestRun && (
              <Link
                href={`/runs?runId=${encodeURIComponent(latestRun.runId)}`}
                className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted dark:text-[#8C837C] hover:text-flame"
              >
                Full run details <ChevronRight className="w-3 h-3" />
              </Link>
            )}
          </Panel>
        </div>
      </div>

      {/* Composer — same rounded-card component Home + /chat use, so
          the input UX is identical everywhere. Submit routes through
          the existing preflight modal before kicking off the run. */}
      <div className="shrink-0 border-t border-line dark:border-[#2A241D] px-6 py-4 bg-cream-light dark:bg-[#17140F]">
        <div className="max-w-4xl mx-auto">
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={(text) => send(text)}
            agents={[]}
            placeholder={isLive
              ? `Add context for the running ${agent.name}… ( @ to loop in another agent · / for commands )`
              : `Tell ${agent.name} what to do… ( @ to loop in another agent · / for commands )`}
            submitLabel={kickoff.isPending ? 'Starting…' : isLive ? 'Add' : 'Run'}
            disabled={kickoff.isPending}
            showKeyboardHints={false}
          />
          {kickoff.error && (
            <div className="mt-2 text-[11px] text-flame">
              {(kickoff.error as Error).message}
            </div>
          )}
        </div>
      </div>

      {preflightOpen && slug && (
        <PreflightModal
          kind="agent"
          slug={slug}
          onCancel={() => setPreflightOpen(false)}
          onRun={({ inputs, force }) => {
            setPreflightOpen(false);
            // If the agent accepts extra inputs (from frontmatter
            // inputs:), append them to the task so the prompt sees them
            // as "<key>: <value>" lines. Simple, works without a bigger
            // task-format refactor.
            const extras = Object.entries(inputs)
              .filter(([, v]) => v && v.toString().trim())
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n');
            const task = extras ? `${pendingTask}\n\n${extras}` : pendingTask;
            kickoff.mutate({ task, force });
          }}
        />
      )}
    </div>
  );
}

function Panel({
  label,
  icon: Icon,
  status,
  statusClass,
  spinIcon,
  children,
}: {
  label: string;
  icon: LucideIcon;
  status?: string;
  statusClass?: string;
  spinIcon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-line dark:border-[#2A241D]">
        <Icon className={'w-3.5 h-3.5 text-muted dark:text-[#8C837C] ' + (spinIcon ? 'animate-spin' : '')} />
        <h2 className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] flex-1">
          {label}
        </h2>
        {status && (
          <span className={'text-[11px] font-mono ' + (statusClass ?? 'text-muted dark:text-[#8C837C]')}>
            {status}
          </span>
        )}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted dark:text-[#8C837C]">loading…</div>}>
      <AgentsInner />
    </Suspense>
  );
}

// One-line summary of the prompt — markdown headings/emphasis stripped so
// the collapsed state reads as a plain sentence instead of literal `**` noise.
function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function InputPreview({ source }: { source: string }) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(() => {
    const flat = stripMarkdown(source);
    return flat.length > 140 ? flat.slice(0, 140) + '…' : flat;
  }, [source]);

  return (
    <div>
      {!open ? (
        <p className="text-[12px] text-ink dark:text-[#E6E0D8] leading-relaxed">
          {summary}
        </p>
      ) : (
        <div className="text-[12px] leading-relaxed">
          <Markdown source={source} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-mono text-muted dark:text-[#8C837C] hover:text-flame"
      >
        {open ? (
          <>Hide <ChevronDown className="w-3 h-3 rotate-180" /></>
        ) : (
          <>Show full prompt <ChevronDown className="w-3 h-3" /></>
        )}
      </button>
    </div>
  );
}
