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

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Inbox, Activity, MessageSquare, ChevronRight, CheckCircle2, Circle, Clapperboard, Smile, Image as ImageIcon, Images, Rocket, AtSign, Send, ScrollText, ScanSearch, MousePointerClick, CalendarDays, Target, Swords, TrendingUp, LineChart } from 'lucide-react';
import { api } from '../lib/api';
import { Composer } from '../components/composer';

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

  // Load the same agents roster the chat composer uses, for the
  // picker pill + @-mention popover. Stable across tabs because both
  // consumers query the same key.
  const agentList = useQuery({
    queryKey: ['chat-agent-options'],
    queryFn: async () => {
      const tree = await api.vaultTree();
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
  const vaultTree = useQuery({ queryKey: ['vault-tree'], queryFn: api.vaultTree, staleTime: 60_000 });

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
  const agentCount = useMemo(
    () => (vaultTree.data?.tree ?? []).filter(
      (f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'),
    ).length,
    [vaultTree.data],
  );
  const totalRuns = runs.data?.runs?.length ?? 0;
  const totalDrafts = drafts.data?.drafts?.length ?? 0;
  const steps = [
    { label: 'Open a project vault', done: !!projects.data?.active },
    { label: 'Install an agent', done: agentCount > 0, href: '/agents' },
    { label: 'Run your first agent', done: totalRuns > 0, href: '/agents' },
    { label: 'Review a draft before sending', done: totalDrafts > 0, href: '/outreach' },
  ];
  const stepsDone = steps.filter((s) => s.done).length;

  const orgName = projects.data?.projects.find((p) => p.id === projects.data?.active)?.name ?? 'BlackMagic';

  // Quick-start click → load the template into the composer. We also
  // scroll the composer into view so a tall screen doesn't leave the
  // user confused about where the text landed, and we focus the
  // textarea so their next keypress replaces the placeholder.
  function prefill(text: string) {
    setDraft(text);
    if (typeof window !== 'undefined') {
      // Give React one paint to push the value in, then focus the
      // first textarea in the composer and select the first bracket
      // placeholder so typing replaces it in one shot.
      requestAnimationFrame(() => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea',
        );
        if (!ta) return;
        ta.focus();
        const match = text.match(/\[([^\]]+)\]/);
        if (match && match.index !== undefined) {
          ta.setSelectionRange(match.index, match.index + match[0].length);
        } else {
          ta.setSelectionRange(text.length, text.length);
        }
        ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  function send(textArg?: string) {
    const text = (textArg ?? draft).trim();
    if (!text) {
      router.push('/chat');
      return;
    }
    // If the user picked a specific agent on the home composer, route
    // the handoff through that agent's per-agent thread bucket so the
    // chat surface opens the right history. Otherwise land on the
    // global default thread (`bm-last-thread`), matching the legacy
    // home behavior.
    const id = newThreadId();
    if (typeof window !== 'undefined') {
      const threadKey = homeAgent ? `bm-team-thread-${homeAgent}` : 'bm-last-thread';
      window.localStorage.setItem(threadKey, id);
      window.localStorage.setItem('bm-pending-prompt', text);
    }
    setDraft('');
    router.push(homeAgent ? `/chat?agent=${encodeURIComponent(homeAgent)}` : '/chat');
  }

  return (
    <div className="h-full overflow-y-auto bg-cream dark:bg-[#0F0D0A]">
      <div className="max-w-4xl mx-auto px-8 pt-10 pb-12">
        {/* Hero — retro pixelated landscape from the marketing site,
            sets the brand tone before the user sees any chrome. */}
        <div className="relative rounded-2xl overflow-hidden border border-line dark:border-[#2A241D] mb-8 aspect-[16/7] bg-cream-light dark:bg-[#17140F]">
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

        {/* Composer — same component used at /chat. Keeps UX (agent
            picker, @-mention, slash commands, auto-size) identical
            between the two surfaces. */}
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
        {/* Keyboard hint strip under the composer — stays as a footer
            callout here since Home has more real estate than /chat. */}
        <div className="mt-2 flex items-center gap-3 px-1 text-[10px] font-mono text-muted dark:text-[#8C837C]">
          <Kbd>⌘↵</Kbd> <span>send</span>
          <span>·</span>
          <Kbd>⌘K</Kbd> <span>command palette</span>
          <span>·</span>
          <span>@ agent · / commands</span>
        </div>

        {/* Quick starts — skill shortcuts grouped into two buckets so
            the grid doesn't just look like a pile of random cards.
            Click a card to prefill the composer with a ready-to-edit
            invocation template; cursor auto-selects the first
            [bracket placeholder] so the user's next keypress replaces
            it. "See all agents →" routes to /agents because the
            agent-grouped view reads better than the raw /skills list
            for someone who just wants to know "what can this do". */}
        <div className="mt-8">
          <div className="flex items-end justify-between mb-3">
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted dark:text-[#8C837C]">
              Quick starts
            </div>
            <Link
              href="/agents"
              className="text-[10px] font-mono text-muted dark:text-[#8C837C] hover:text-flame inline-flex items-center gap-1"
            >
              See all agents <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="text-[10px] uppercase tracking-wider font-mono text-muted/70 dark:text-[#6B625C] mb-2">
            Content
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {QUICK_STARTS_CONTENT.map((q) => (
              <QuickStartCard
                key={q.title}
                icon={q.icon}
                tint={q.tint}
                title={q.title}
                subtitle={q.subtitle}
                onClick={() => prefill(q.prompt)}
              />
            ))}
          </div>

          <div className="text-[10px] uppercase tracking-wider font-mono text-muted/70 dark:text-[#6B625C] mb-2">
            Intelligence & ops
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {QUICK_STARTS_INTEL.map((q) => (
              <QuickStartCard
                key={q.title}
                icon={q.icon}
                tint={q.tint}
                title={q.title}
                subtitle={q.subtitle}
                onClick={() => prefill(q.prompt)}
              />
            ))}
          </div>
        </div>

        {/* Today strip — live KPIs at a glance */}
        <div className="mt-8 grid grid-cols-4 gap-px bg-line dark:bg-[#2A241D] border border-line dark:border-[#2A241D] rounded-xl overflow-hidden">
          <Stat label="Today" value={todayRuns.length} hint="runs" href="/runs" />
          <Stat label="Running" value={running.length} hint="now" tone={running.length > 0 ? 'flame' : undefined} href="/runs" />
          <Stat label="Approvals" value={pending.length} hint="pending" tone={pending.length > 0 ? 'flame' : undefined} href="/outreach" />
          <Stat label="Threads" value={chats.data?.threads?.length ?? 0} hint="total" href="/chat" />
        </div>

        {/* Activity heatmap + getting-started */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          <section className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-4">
            <header className="flex items-center justify-between mb-3">
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

          <section className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-4">
            <header className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C]">
                Getting started
              </h2>
              <span className="text-[10px] font-mono tabular-nums text-muted dark:text-[#8C837C]">
                {stepsDone}/{steps.length}
              </span>
            </header>
            <div className="h-1 bg-cream-light dark:bg-[#17140F] rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-flame transition-all"
                style={{ width: `${(stepsDone / steps.length) * 100}%` }}
              />
            </div>
            <ul className="space-y-1.5">
              {steps.map((s) => (
                <li key={s.label}>
                  {s.href ? (
                    <Link href={s.href} className="flex items-center gap-2 text-[12px] hover:text-flame">
                      {s.done ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-flame shrink-0" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-muted dark:text-[#6B625C] shrink-0" />
                      )}
                      <span className={s.done ? 'text-muted dark:text-[#8C837C] line-through' : 'text-ink dark:text-[#E6E0D8]'}>
                        {s.label}
                      </span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 text-[12px]">
                      {s.done ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-flame shrink-0" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-muted dark:text-[#6B625C] shrink-0" />
                      )}
                      <span className={s.done ? 'text-muted dark:text-[#8C837C] line-through' : 'text-ink dark:text-[#E6E0D8]'}>
                        {s.label}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

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

// Quick-start shortcuts — split into two groups so the grid actually
// tells a user what the product is for. "Content" is the Hypereal /
// drafting side; "Intelligence & ops" is the monitoring / research /
// inbox-and-calendar side. Clicking a card prefills the composer with
// a template that has [bracket placeholders]; prefill() on Home selects
// the first bracket so the user's next keystroke replaces it.
type QuickStart = {
  icon: React.ComponentType<{ className?: string }>;
  tint: string; // tailwind text-* color for the icon + matching bg-*/10 tile
  title: string;
  subtitle: string;
  prompt: string;
};

const QUICK_STARTS_CONTENT: QuickStart[] = [
  {
    icon: Clapperboard,
    tint: 'text-[#E8634A] bg-[#E8634A]/10',
    title: 'Announcement video',
    subtitle: '8-sec launch clip',
    prompt: 'Use the announcement-video skill.\nTopic: [what are you announcing?]\nAspect: 16:9',
  },
  {
    icon: Smile,
    tint: 'text-[#D79B3C] bg-[#D79B3C]/10',
    title: 'UGC testimonial',
    subtitle: 'Faux-UGC for paid ads',
    prompt: 'Use the ugc-video skill.\nPersona: [e.g. dev in hoodie at home desk]\nTalking point: [what do they say about the product?]',
  },
  {
    icon: ImageIcon,
    tint: 'text-[#C9547C] bg-[#C9547C]/10',
    title: 'Blog hero image',
    subtitle: 'Editorial hero for a post',
    prompt: 'Use the blog-post-hero skill.\nPost path: [path to the .md or CMS slug]\nStyle: editorial',
  },
  {
    icon: Images,
    tint: 'text-[#8B6FD6] bg-[#8B6FD6]/10',
    title: 'Social carousel',
    subtitle: '5-slide LinkedIn pack',
    prompt: 'Use the social-carousel skill.\nTopic: [what is the carousel about?]\nSlides: 5\nNetwork: linkedin',
  },
  {
    icon: Rocket,
    tint: 'text-[#3F7EC7] bg-[#3F7EC7]/10',
    title: 'Product Hunt kit',
    subtitle: 'Thumb + gallery + copy',
    prompt: 'Use the product-hunt-kit skill.\nLaunch name: [what are you launching on PH?]\nTagline: [one-line pitch, ≤60 chars]',
  },
  {
    icon: AtSign,
    tint: 'text-[#3FA0C7] bg-[#3FA0C7]/10',
    title: 'Launch tweet thread',
    subtitle: '7-tweet thread w/ hero',
    prompt: 'Use the launch-tweet-thread skill.\nFeature: [what are you launching?]\nTweets: 7',
  },
  {
    icon: Send,
    tint: 'text-[#3FA36B] bg-[#3FA36B]/10',
    title: 'Cold email sequence',
    subtitle: '3-touch drafts',
    prompt: 'Use the cold-email-sequence skill.\nICP: [who are you writing to?]\nOffer: [one-line offer]',
  },
  {
    icon: ScrollText,
    tint: 'text-[#8C847A] bg-[#8C847A]/10',
    title: 'Founder update',
    subtitle: 'Monthly investor draft',
    prompt: 'Use the founder-monthly-update skill.\nMonth: [YYYY-MM]',
  },
];

const QUICK_STARTS_INTEL: QuickStart[] = [
  {
    icon: ScanSearch,
    tint: 'text-[#B2558E] bg-[#B2558E]/10',
    title: 'Brand monitor',
    subtitle: 'Daily mention sweep',
    prompt: 'Use the brand-monitor-apify skill. Scan Reddit, X, and the open web for mentions of my brand from the last 24h, classify them, and write today\'s signal file.',
  },
  {
    icon: MousePointerClick,
    tint: 'text-[#3B9DA8] bg-[#3B9DA8]/10',
    title: 'Visitor sweep',
    subtitle: 'Yesterday\'s RB2B hits',
    prompt: 'Use the rb2b-visitor-sweep skill. Pull yesterday\'s identified site visitors, score HOT/WARM against us/market/icp.md, and drop them into companies/ + contacts/.',
  },
  {
    icon: Inbox,
    tint: 'text-[#3FA36B] bg-[#3FA36B]/10',
    title: 'Inbox triage',
    subtitle: 'Who needs a reply today',
    prompt: 'Use the inbox-triage skill. Classify my unread Gmail from the last 24h into REPLY_TODAY / FYI / SPAM and write today\'s digest.',
  },
  {
    icon: CalendarDays,
    tint: 'text-[#5B6BC7] bg-[#5B6BC7]/10',
    title: 'Meeting digest',
    subtitle: 'Tomorrow\'s prep briefs',
    prompt: 'Use the meeting-digest skill. Pull tomorrow\'s Google Calendar meetings, enrich external attendees via CRM + Gmail, and write prep briefs.',
  },
  {
    icon: Target,
    tint: 'text-[#E8634A] bg-[#E8634A]/10',
    title: 'GEO brand sweep',
    subtitle: 'AI SOV across ChatGPT/PPX',
    prompt: 'Run the daily GEO brand sweep — execute every prompt under signals/geo/prompts/ across ChatGPT, Perplexity, and Google AI Overviews, then report share-of-voice + gaps.',
  },
  {
    icon: Swords,
    tint: 'text-[#D79B3C] bg-[#D79B3C]/10',
    title: 'Competitor radar',
    subtitle: 'Weekly intel pack',
    prompt: 'Use the competitor-radar skill. Sweep each competitor listed in us/market/competitors.md for product-page diffs, new pricing, and notable posts this week.',
  },
  {
    icon: TrendingUp,
    tint: 'text-[#8BA83C] bg-[#8BA83C]/10',
    title: 'GA traffic brief',
    subtitle: 'SURGE / DROP / CONVERT',
    prompt: 'Use the ga-traffic-brief skill. Pull the last 28 days from Google Analytics 4, flag SURGE / DROP / CONVERT pages, and report top action.',
  },
  {
    icon: LineChart,
    tint: 'text-[#3F7EC7] bg-[#3F7EC7]/10',
    title: 'GSC content brief',
    subtitle: 'REWRITE / PUSH / GAP',
    prompt: 'Use the gsc-content-brief skill. Scan Search Console for queries worth rewriting, pushing, or chasing (GAP) and propose the top 5 actions.',
  },
];

function QuickStartCard({
  icon: Icon,
  tint,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl px-4 py-3.5 hover:border-flame/60 hover:shadow-sm hover:-translate-y-0.5 transition-all flex flex-col gap-2.5 min-h-[108px]"
    >
      <div className="flex items-center justify-between">
        <div className={'w-9 h-9 rounded-lg flex items-center justify-center ' + tint}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-muted/50 dark:text-[#6B625C] group-hover:text-flame group-hover:translate-x-0.5 transition-all" />
      </div>
      <div>
        <div className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA] leading-tight">
          {title}
        </div>
        <div className="text-[11px] text-muted dark:text-[#8C837C] mt-1 leading-snug">
          {subtitle}
        </div>
      </div>
    </button>
  );
}
