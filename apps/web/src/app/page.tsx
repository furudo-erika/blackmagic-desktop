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
import { ArrowRight, Inbox, Activity, MessageSquare, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';

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

  const orgName = projects.data?.projects.find((p) => p.id === projects.data?.active)?.name ?? 'BlackMagic';

  function send() {
    const text = draft.trim();
    if (!text) {
      router.push('/chat');
      return;
    }
    const id = newThreadId();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('bm-last-thread', id);
      window.localStorage.setItem('bm-pending-prompt', text);
    }
    router.push('/chat');
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

        {/* Composer */}
        <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-2xl shadow-sm overflow-hidden">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask, plan, automate…"
            rows={2}
            className="w-full resize-none bg-transparent border-0 px-5 py-4 text-[15px] text-ink dark:text-[#E6E0D8] placeholder:text-muted/70 dark:placeholder:text-[#6B625C] focus:outline-none"
            style={{ minHeight: 80, maxHeight: 240 }}
          />
          <div className="flex items-center justify-between px-3 py-2 border-t border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F]">
            <div className="flex items-center gap-3 text-[10px] font-mono text-muted dark:text-[#8C837C]">
              <Kbd>⌘↵</Kbd> <span>send</span>
              <span>·</span>
              <Kbd>⌘K</Kbd> <span>command palette</span>
            </div>
            <button
              type="button"
              onClick={send}
              className="inline-flex items-center gap-1.5 bg-flame text-white text-[13px] font-medium px-4 py-1.5 rounded-md hover:opacity-90 transition-opacity"
            >
              Send <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
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
            icon={Activity}
            label="Running jobs"
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
