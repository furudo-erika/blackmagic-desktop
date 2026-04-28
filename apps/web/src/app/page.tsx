'use client';

/**
 * Home — Stark-style control center.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │  CONTROL CENTER                                      │
 *   │  Hello. What should BlackMagic do?                   │
 *   │  ┌────────────────────────────────────────────────┐  │
 *   │  │ [composer]                              [Send] │  │
 *   │  └────────────────────────────────────────────────┘  │
 *   │                                                       │
 *   │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
 *   │  │ Pending      │ │ Running jobs │ │ Recent       │ │
 *   │  │ approvals    │ │              │ │ threads      │ │
 *   │  └──────────────┘ └──────────────┘ └──────────────┘ │
 *   └──────────────────────────────────────────────────────┘
 *
 * Composer dispatches a fresh thread + routes to /chat with the
 * message preloaded via `bm-pending-prompt` localStorage. The three
 * cards pull from the existing `listDrafts`, `listRuns`, and
 * `listChats` daemon endpoints — no new API surface needed.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Inbox, Activity, MessageSquare, ChevronRight, RotateCw } from 'lucide-react';
import { api } from '../lib/api';
import { Composer, normalizeAgentMentions } from '../components/composer';

function newThreadId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
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
  if (!ms) return '';
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function HomePage() {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [homeAgent, setHomeAgent] = useState<string | undefined>(undefined);

  // First-launch gate: if us/company.md is missing or empty, the project
  // hasn't been bootstrapped yet — every agent would be flying blind.
  // Send the user to /onboarding/bootstrap so we collect their domain
  // and run bootstrap-self before they can do anything else. Cached for
  // the session via localStorage so we don't redirect repeatedly if the
  // user backs out and clicks Home again on purpose.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('bm-onboarding-skipped') === '1') return;
    let cancelled = false;
    api
      .readFile('us/company.md')
      .then((r) => {
        if (cancelled) return;
        const body = (r.body ?? '').trim();
        if (!body) router.replace('/onboarding/bootstrap');
      })
      .catch(() => {
        if (cancelled) return;
        // Missing file → onboarding
        router.replace('/onboarding/bootstrap');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Load the same agents roster the chat composer uses, for the
  // picker pill + @-mention popover. Stable across tabs because both
  // consumers query the same key.
  // Distinct cache key from chat-surface's ['chat-agent-options'] —
  // the two queries return different row shapes (Home: {slug,name,
  // tagline}; chat-surface: {slug,name,tagline,icon,pin,starterPrompts}).
  // Sharing the key crashes chat-surface when Home populated the cache
  // first (reading a.starterPrompts.length on undefined).
  const agentList = useQuery({
    queryKey: ['home-agent-options'],
    queryFn: async () => {
      const tree = await api.contextTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'),
      );
      const rows = await Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
          const slug = f.path.replace(/^agents\//, '').replace(/\.md$/, '');
          const name = typeof fm.name === 'string' && fm.name ? fm.name : slug;
          const body = (r.body ?? '').trim();
          const firstLine = body
            .split('\n').map((l) => l.trim())
            .find((l) => l && !l.startsWith('#') && !l.startsWith('-') && !l.startsWith('*'));
          const tagline = firstLine ? firstLine.replace(/^[*_`]+/, '').slice(0, 120) : '';
          return { slug, name, tagline };
        }),
      );
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return rows;
    },
    staleTime: 60_000,
  });

  const drafts = useQuery({ queryKey: ['drafts'], queryFn: api.listDrafts });
  const runs = useQuery({ queryKey: ['runs'], queryFn: api.listRuns, refetchInterval: 5_000 });
  const chats = useQuery({ queryKey: ['chats'], queryFn: api.listChats });
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });

  const pending = useMemo(
    () => (drafts.data?.drafts ?? []).filter((d) => (d.status ?? 'pending') === 'pending'),
    [drafts.data],
  );
  const running = useMemo(
    () => (runs.data?.runs ?? []).filter((r) => !r.done),
    [runs.data],
  );
  const recentThreads = useMemo(
    () => (chats.data?.threads ?? [])
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 4),
    [chats.data],
  );

  // GitHub-style activity heatmap — 14 weeks × 7 days of run counts,
  // keyed by YYYY-MM-DD. Run timestamps come from the runId itself
  // (see runStartedMs), so no new API call is needed.
  const heatmap = useMemo(() => {
    const days = 14 * 7; // 98 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Align to end-of-week (Saturday) so the grid finishes on a full column.
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));

    const counts = new Map<string, number>();
    for (const r of runs.data?.runs ?? []) {
      const ms = runStartedMs(r.runId);
      if (!ms) continue;
      const d = new Date(ms);
      d.setHours(0, 0, 0, 0);
      if (d < start || d > end) continue;
      const key = d.toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const cells: Array<{ key: string; date: Date; count: number; future: boolean }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      cells.push({ key, date: d, count: counts.get(key) ?? 0, future: d > today });
    }
    const max = Math.max(1, ...cells.map((c) => c.count));
    const total = cells.reduce((n, c) => n + c.count, 0);
    return { cells, max, total, start, end };
  }, [runs.data]);

  // Today's progress strip.
  const todayRuns = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return (runs.data?.runs ?? []).filter((r) => {
      const ms = runStartedMs(r.runId);
      return ms != null && ms >= start.getTime();
    });
  }, [runs.data]);

  // Getting-started checklist — derived from what the user has done.
  const orgName = projects.data?.projects.find((p) => p.id === projects.data?.active)?.name ?? 'BlackMagic';

  function send(textArg?: string) {
    const text = normalizeAgentMentions((textArg ?? draft).trim());
    if (!text) {
      router.push('/chat');
      return;
    }
    // If the user picked a specific agent on the home composer, route
    // the handoff through that agent's per-agent thread bucket so the
    // chat surface opens the right history. Otherwise land on the
    // global default thread (`bm-last-thread`), matching the legacy
    // home behavior.
    //
    // CRITICAL: only mint a new threadId if there isn't already one for
    // this agent — otherwise the home composer would bulldoze the
    // ongoing conversation every time the user typed here, and the
    // next render would land in a brand-new empty thread (the
    // "我又说了一个命令，agent开了新对话" bug). Reusing the existing
    // threadId means the pending prompt is appended to the live
    // conversation, which is what the user expects.
    if (typeof window !== 'undefined') {
      const threadKey = homeAgent ? `bm-team-thread-${homeAgent}` : 'bm-last-thread';
      const existing = window.localStorage.getItem(threadKey);
      const id = existing && existing.trim() ? existing : newThreadId();
      window.localStorage.setItem(threadKey, id);
      window.localStorage.setItem('bm-pending-prompt', text);
    }
    setDraft('');
    router.push(homeAgent ? `/chat?agent=${encodeURIComponent(homeAgent)}` : '/chat');
  }

  return (
    <div className="h-full overflow-y-auto bg-cream dark:bg-[#0F0D0A]">
      <div className="max-w-4xl mx-auto px-8 pt-10 pb-12">
        {/* Hero — retro pixelated landscape from the marketing site.
            Sets the brand tone before any chrome loads. Shorter
            aspect than the original (16/5 vs 16/7) so it doesn't
            overshadow the heatmap hero further down. */}
        <div className="relative rounded-2xl overflow-hidden border border-line dark:border-[#2A241D] mb-6 aspect-[16/5] bg-cream-light dark:bg-[#17140F]">
          <img
            src="/hero.webp"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-cream dark:from-[#0F0D0A] via-transparent to-transparent" />
          <div className="absolute top-3 left-4 inline-flex items-center gap-1.5 text-[10px] font-mono text-white/85 px-2 py-1 rounded-md bg-black/30 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-flame animate-pulse" />
            BlackMagic · control center
          </div>
        </div>

        {/* Headline */}
        <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted dark:text-[#8C837C] mb-2">
          Control center
        </div>
        <h1 className="text-[40px] sm:text-[48px] leading-[1.1] tracking-tight text-ink dark:text-[#F5F1EA] mb-8">
          <span className="font-semibold">Hello.</span>{' '}
          <span className="italic font-light text-muted dark:text-[#8C837C]">
            What should {orgName} do?
          </span>
        </h1>

        {/* Composer */}
        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={(text) => send(text)}
          agents={agentList.data ?? []}
          agentSlug={homeAgent}
          onAgentChange={(slug) => setHomeAgent(slug)}
          onSlashCommand={(action) => {
            if (action === 'clear') setDraft('');
            else if (action === 'skills') router.push('/skills');
          }}
        />
        <div className="mt-2 flex items-center gap-3 px-1 text-[10px] font-mono text-muted dark:text-[#8C837C]">
          <Kbd>⌘↵</Kbd> <span>send</span>
          <span>·</span>
          <Kbd>⌘K</Kbd> <span>command palette</span>
          <span>·</span>
          <span>@ agent · / commands</span>
        </div>

        {/* Activity heatmap — promoted to hero-below-composer as the
            visual signature of the app. 14-week view, full width, no
            flanking widgets stealing its thunder. */}
        <section className="mt-8 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-5">
          <header className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-muted dark:text-[#8C837C]" />
              <h2 className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C]">
                Activity
              </h2>
            </div>
            <div className="text-[10px] font-mono text-muted dark:text-[#8C837C] tabular-nums">
              {heatmap.total} runs · 14 weeks
            </div>
          </header>
          <Heatmap cells={heatmap.cells} max={heatmap.max} />
          <footer className="mt-3 flex items-center justify-between text-[10px] font-mono text-muted dark:text-[#8C837C]">
            <span>
              {heatmap.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {' → '}
              {heatmap.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
            <span className="flex items-center gap-1.5">
              less
              <span className="w-2.5 h-2.5 rounded-[2px] bg-line dark:bg-[#2A241D]" />
              <span className="w-2.5 h-2.5 rounded-[2px] bg-flame/25" />
              <span className="w-2.5 h-2.5 rounded-[2px] bg-flame/55" />
              <span className="w-2.5 h-2.5 rounded-[2px] bg-flame/80" />
              <span className="w-2.5 h-2.5 rounded-[2px] bg-flame" />
              more
            </span>
          </footer>
        </section>

        {/* KPI strip */}
        <div className="mt-4 grid grid-cols-4 gap-px bg-line dark:bg-[#2A241D] border border-line dark:border-[#2A241D] rounded-xl overflow-hidden">
          <Stat label="Today" value={todayRuns.length} hint="runs" href="/runs" />
          <Stat label="Running" value={running.length} hint="now" tone={running.length > 0 ? 'flame' : undefined} href="/runs" />
          <Stat label="Approvals" value={pending.length} hint="pending" tone={pending.length > 0 ? 'flame' : undefined} href="/outreach" />
          <Stat label="Threads" value={chats.data?.threads?.length ?? 0} hint="total" href="/chat" />
        </div>

        {/* Starter prompts — replaces the old "Quick starts" nav cards
            with click-to-send prompts tailored to the active project
            (slots filled from us/company, us/market/competitors,
            us/customers/top, us/market/icp). When the composer pill
            is set to a specific agent, the row swaps to that agent's
            own starter list. Each card click dispatches directly —
            no extra Send step, no intermediate agent-page detour. */}
        <StarterPromptRow
          agentSlug={homeAgent}
          onSend={(prompt, slug) => {
            setDraft('');
            // Same reuse rule as the composer above — don't bulldoze
            // an existing conversation just because a starter card
            // was clicked. Append to the agent's live thread instead.
            if (typeof window !== 'undefined') {
              const threadKey = slug ? `bm-team-thread-${slug}` : 'bm-last-thread';
              const existing = window.localStorage.getItem(threadKey);
              const id = existing && existing.trim() ? existing : newThreadId();
              window.localStorage.setItem(threadKey, id);
              window.localStorage.setItem('bm-pending-prompt', prompt);
            }
            router.push(slug ? `/chat?agent=${encodeURIComponent(slug)}` : '/chat');
          }}
        />

        {/* Live rows — running + pending + recent threads, compact */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            icon={Activity}
            label="Running now"
            count={running.length}
            href="/runs"
            empty="No agents running."
            items={running.slice(0, 3).map((r) => ({
              key: r.runId,
              title: r.preview || r.runId,
              meta: `${r.agent} · ${timeAgo(runStartedMs(r.runId))}`,
              href: `/runs?runId=${encodeURIComponent(r.runId)}`,
            }))}
            countTone="flame"
          />
          <Card
            icon={Inbox}
            label="Pending approvals"
            count={pending.length}
            href="/outreach"
            empty="Nothing waiting on you."
            items={pending.slice(0, 3).map((d) => ({
              key: d.id,
              title: d.subject || `Draft to ${d.to}`,
              meta: d.tool,
              href: `/outreach`,
            }))}
          />
          <Card
            icon={MessageSquare}
            label="Recent threads"
            count={recentThreads.length}
            href="/chat"
            empty="No threads yet."
            items={recentThreads.slice(0, 3).map((t) => ({
              key: t.threadId,
              title: t.preview || '(empty thread)',
              meta: timeAgo(Date.parse(t.updatedAt)),
              href: `/chat`,
              onClick: () => {
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem('bm-last-thread', t.threadId);
                }
              },
            }))}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
  tone?: 'flame';
}) {
  return (
    <Link
      href={href}
      className="bg-white dark:bg-[#1F1B15] px-4 py-3 hover:bg-cream-light dark:hover:bg-[#17140F] transition-colors"
    >
      <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C]">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={
          'text-[22px] font-semibold tabular-nums leading-none ' +
          (tone === 'flame' ? 'text-flame' : 'text-ink dark:text-[#F5F1EA]')
        }>
          {value}
        </span>
        <span className="text-[10px] font-mono text-muted dark:text-[#8C837C]">{hint}</span>
      </div>
    </Link>
  );
}

function Heatmap({
  cells,
  max,
}: {
  cells: Array<{ key: string; date: Date; count: number; future: boolean }>;
  max: number;
}) {
  // Group into columns of 7 (Sun..Sat). cells[] is ordered chronologically
  // starting from Sunday, so every 7 cells is one week column.
  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function tone(count: number, future: boolean): string {
    if (future) return 'bg-transparent';
    if (count === 0) return 'bg-cream-light dark:bg-[#17140F] border border-line/60 dark:border-[#2A241D]';
    const ratio = count / max;
    if (ratio < 0.25) return 'bg-flame/25';
    if (ratio < 0.5) return 'bg-flame/55';
    if (ratio < 0.8) return 'bg-flame/80';
    return 'bg-flame';
  }

  return (
    <div className="flex gap-[3px] overflow-x-auto">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((c) => (
            <div
              key={c.key}
              title={c.future ? '' : `${c.key} · ${c.count} run${c.count === 1 ? '' : 's'}`}
              className={`w-3 h-3 rounded-[3px] ${tone(c.count, c.future)}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] text-[10px]">
      {children}
    </kbd>
  );
}

function Card({
  icon: Icon,
  label,
  count,
  href,
  empty,
  items,
  countTone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  href: string;
  empty: string;
  items: Array<{ key: string; title: string; meta?: string; href: string; onClick?: () => void }>;
  countTone?: 'flame';
}) {
  return (
    <section className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-line dark:border-[#2A241D]">
        <Icon className="w-3.5 h-3.5 text-muted dark:text-[#8C837C]" />
        <h2 className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] flex-1 truncate">
          {label}
        </h2>
        <span className={
          'text-[11px] font-mono tabular-nums px-1.5 rounded ' +
          (countTone === 'flame' && count > 0
            ? 'text-flame bg-flame/10'
            : 'text-muted dark:text-[#8C837C]')
        }>
          {count}
        </span>
      </header>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-[12px] text-muted dark:text-[#8C837C]">{empty}</div>
      ) : (
        <ul className="divide-y divide-line dark:divide-[#2A241D]">
          {items.map((it) => (
            <li key={it.key}>
              <Link
                href={it.href}
                onClick={it.onClick}
                className="block px-4 py-2.5 hover:bg-cream-light dark:hover:bg-[#17140F]"
              >
                <div className="text-[12px] text-ink dark:text-[#E6E0D8] truncate">{it.title}</div>
                {it.meta && (
                  <div className="text-[10px] font-mono text-muted dark:text-[#8C837C] mt-0.5 truncate">
                    {it.meta}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={href}
        className="flex items-center justify-end gap-1 px-4 py-2 text-[11px] text-muted dark:text-[#8C837C] hover:text-flame border-t border-line dark:border-[#2A241D]"
      >
        View all <ChevronRight className="w-3 h-3" />
      </Link>
    </section>
  );
}

// Agent-slug → display tint for starter cards. Mirrors the per-agent
// accent palette the sidebar uses, but keyed on the handful of agents
// Home surfaces so the row reads as 6 distinct colored chips rather
// than a monochrome grid.
const STARTER_TINTS: Record<string, string> = {
  'lookalike-discovery': 'text-[#E8634A] bg-[#E8634A]/10',
  'linkedin-outreach':   'text-[#0A66C2] bg-[#0A66C2]/10',
  'website-visitor':     'text-[#3B9DA8] bg-[#3B9DA8]/10',
  'pipeline-ops':        'text-[#8BA83C] bg-[#8BA83C]/10',
  'closed-lost-revival': 'text-[#B2558E] bg-[#B2558E]/10',
  'meeting-prep':        'text-[#5B6BC7] bg-[#5B6BC7]/10',
  'outbound':            'text-[#E8634A] bg-[#E8634A]/10',
  'researcher':          'text-[#3B82F6] bg-[#3B82F6]/10',
  'content-studio':      'text-[#A21CAF] bg-[#A21CAF]/10',
  'brand-monitor':       'text-[#D97706] bg-[#D97706]/10',
  'geo-analyst':         'text-[#E11D48] bg-[#E11D48]/10',
  'company-profiler':    'text-[#F59E0B] bg-[#F59E0B]/10',
  'ae':                  'text-[#D97706] bg-[#D97706]/10',
  'sdr':                 'text-[#8B5CF6] bg-[#8B5CF6]/10',
  'x-account':           'text-[#0D9488] bg-[#0D9488]/10',
  'reply-guy':           'text-[#EA580C] bg-[#EA580C]/10',
};

const AGENT_LABEL: Record<string, string> = {
  'lookalike-discovery': 'Lookalike',
  'linkedin-outreach':   'LinkedIn',
  'website-visitor':     'Website',
  'pipeline-ops':        'Pipeline',
  'closed-lost-revival': 'Revival',
  'meeting-prep':        'Meeting prep',
  'outbound':            'Outbound',
  'researcher':          'Research',
  'content-studio':      'Content',
  'brand-monitor':       'Brand',
  'geo-analyst':         'GEO',
  'company-profiler':    'Profile',
  'ae':                  'AE desk',
  'sdr':                 'SDR',
  'x-account':           'X',
  'reply-guy':           'Reply Guy',
};

function StarterPromptRow({
  agentSlug,
  onSend,
}: {
  agentSlug: string | undefined;
  onSend: (prompt: string, slug: string) => void;
}) {
  // Fetch filled starters for the active project. When the composer
  // pill is set to a specific agent we request that agent's list; when
  // empty we request the global cross-agent best-of. Both paths return
  // `{ global, byAgent }` — we branch locally on which to render.
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['starters', agentSlug ?? '_global'],
    queryFn: () => api.getStarters(agentSlug),
    staleTime: 5 * 60_000,
  });

  const [rotation, setRotation] = useState(0);
  const cards = useMemo(() => {
    if (!data) return [] as Array<{ slug: string; prompt: string }>;
    if (agentSlug) {
      const list = data.byAgent[agentSlug] ?? [];
      const slice = 6;
      const out: Array<{ slug: string; prompt: string }> = [];
      for (let i = 0; i < Math.min(slice, list.length); i++) {
        const pick = list[(i + rotation) % list.length];
        if (pick) out.push({ slug: pick.agent, prompt: pick.prompt });
      }
      return out;
    }
    // Global: 6 best, one per agent in GLOBAL_SLUGS order. For shuffle,
    // we pull the (rotation)-th available starter of each agent when
    // possible so clicking ↻ yields a genuinely new row rather than
    // the same sentences reshuffled.
    const out: Array<{ slug: string; prompt: string }> = [];
    for (const g of data.global) {
      const list = data.byAgent[g.agent] ?? [g];
      const pick = list[rotation % Math.max(1, list.length)] ?? g;
      out.push({ slug: pick.agent, prompt: pick.prompt });
    }
    return out;
  }, [data, agentSlug, rotation]);

  return (
    <div className="mt-6">
      <div className="flex items-end justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted dark:text-[#8C837C]">
          {agentSlug
            ? `Try with ${AGENT_LABEL[agentSlug] ?? agentSlug}`
            : 'Try one of these — tailored to this project'}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setRotation((r) => r + 1); refetch(); }}
            className="text-[10px] font-mono text-muted dark:text-[#8C837C] hover:text-flame inline-flex items-center gap-1"
            title="Shuffle to another set of starters"
            disabled={isFetching}
          >
            <RotateCw className={'w-3 h-3 ' + (isFetching ? 'animate-spin' : '')} />
            shuffle
          </button>
          <Link
            href="/agents"
            className="text-[10px] font-mono text-muted dark:text-[#8C837C] hover:text-flame inline-flex items-center gap-1"
          >
            see all agents <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {isLoading && Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-cream-light dark:bg-[#17140F] border border-line/70 dark:border-[#2A241D]/70 rounded-lg px-4 py-3.5 min-h-[108px] animate-pulse"
          />
        ))}
        {!isLoading && cards.length === 0 && (
          <div className="col-span-full text-[12px] text-muted dark:text-[#8C837C] px-2 py-4">
            No starter prompts available for this project yet. Type your own
            above, or run <code className="font-mono">bootstrap-self</code> on
            the Company Profiler to fill in us/ data.
          </div>
        )}
        {!isLoading && cards.map((c, i) => (
          <StarterCard key={`${c.slug}-${i}`} card={c} onClick={() => onSend(c.prompt, c.slug)} />
        ))}
      </div>
    </div>
  );
}

function StarterCard({
  card,
  onClick,
}: {
  card: { slug: string; prompt: string };
  onClick: () => void;
}) {
  const tint = STARTER_TINTS[card.slug] ?? 'text-muted bg-muted/10';
  const label = AGENT_LABEL[card.slug] ?? card.slug;
  return (
    <button
      type="button"
      onClick={onClick}
      title={card.prompt}
      className="group text-left bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg px-4 py-3.5 transition-all flex flex-col gap-2.5 min-h-[108px] hover:border-flame/60 hover:shadow-sm hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between">
        <span className={'text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ' + tint}>
          {label}
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-muted/50 dark:text-[#6B625C] group-hover:text-flame group-hover:translate-x-0.5 transition-all" />
      </div>
      <div className="text-[12.5px] text-ink dark:text-[#E6E0D8] leading-snug line-clamp-3">
        {card.prompt}
      </div>
    </button>
  );
}
