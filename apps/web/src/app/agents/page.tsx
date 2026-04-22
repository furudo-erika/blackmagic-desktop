'use client';

/**
 * /agents — 3-pane agents workspace.
 *
 *   [ agents (240) | threads for selected agent (260) | chat (rest) ]
 *
 * Slack/Discord shape: navigation → list → content. Pick agent on the
 * left, pick a past thread (or start a new one) in the middle, chat on
 * the right. URL state keeps `?slug=` and `?thread=` so any pane can
 * deep-link. ChatSurface is the same component the home page uses, so
 * `@`-mention popovers, `/`-slash commands, streaming, and per-agent
 * thread persistence all carry over.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot, Plus, Sparkles, Search, Briefcase, Globe, Linkedin,
  CalendarClock, Copy as CopyIcon, RotateCcw, Activity, Radar, Send,
  MessageSquare, Trash2,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../lib/api';
import { ChatSurface } from '../../components/chat-surface';

const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  Bot, Globe, Linkedin, CalendarClock, Copy: CopyIcon, RotateCcw,
  Activity, Radar, Search, Briefcase, Send, Sparkles,
};

type Agent = {
  path: string;
  slug: string;
  name: string;
  icon: string;
  pinned: boolean;
};

type Thread = {
  threadId: string;
  agent: string;
  updatedAt: string;
  preview: string;
  count: number;
};

const STARTER_AGENT = `---
name: "new-agent"
description: "What this agent does in one line."
model: "claude-sonnet-4-5"
temperature: 0.3
tools:
  - read_file
  - write_file
  - deep_research
---

# New agent

Describe the role in more detail here. This markdown body is the system
prompt the model will see.
`;

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

function timeAgo(iso: string | undefined): string {
  if (!iso) return '';
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(d) || d < 0) return '';
  if (d < 60) return `${Math.floor(d)}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

function AgentsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedSlug = params.get('slug') ?? '';
  const selectedThreadId = params.get('thread') ?? '';
  const [filter, setFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newErr, setNewErr] = useState<string | null>(null);
  const qc = useQueryClient();

  const agents = useQuery({
    queryKey: ['agents-list-pane'],
    queryFn: async (): Promise<Agent[]> => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'),
      );
      const rows = await Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
          const slug = f.path.replace(/^agents\//, '').replace(/\.md$/, '');
          return {
            path: f.path,
            slug,
            name: String(fm.name ?? slug),
            icon: typeof fm.icon === 'string' ? fm.icon : 'Bot',
            pinned: String(fm.pin ?? '') === 'first',
          };
        }),
      );
      rows.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return rows;
    },
  });

  const runs = useQuery({ queryKey: ['runs'], queryFn: api.listRuns, refetchInterval: 30_000 });
  const liveSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const r of runs.data?.runs ?? []) {
      if (r.done) continue;
      const t = runStartedMs(r.runId);
      if (t == null || Date.now() - t > 5 * 60_000) continue;
      const slug = (r.agent ?? '').toLowerCase();
      if (slug) set.add(slug);
    }
    return set;
  }, [runs.data]);

  const chats = useQuery({
    queryKey: ['chats'],
    queryFn: api.listChats,
    refetchInterval: 15_000,
  });

  const list = agents.data ?? [];
  const q = filter.trim().toLowerCase();
  const filtered = q
    ? list.filter((a) => a.slug.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
    : list;

  // Auto-select first agent if nothing selected.
  useEffect(() => {
    if (!selectedSlug && filtered[0]) {
      router.replace(`/agents?slug=${encodeURIComponent(filtered[0].slug)}`);
    }
  }, [selectedSlug, filtered, router]);

  const selected = filtered.find((a) => a.slug === selectedSlug) ?? filtered[0];

  // Threads for the selected agent — most-recent first.
  const agentThreads = useMemo<Thread[]>(() => {
    if (!selected) return [];
    return (chats.data?.threads ?? [])
      .filter((t) => (t.agent ?? '').toLowerCase() === selected.slug.toLowerCase())
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [chats.data, selected]);

  const deleteThread = useMutation({
    mutationFn: (id: string) => api.deleteChat(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chats'] }),
  });

  // When the agent changes and the URL has no ?thread=, prime ?thread=
  // from the agent's most-recent existing chat (if any). Otherwise leave
  // it empty so the right pane mounts a fresh ChatSurface.
  useEffect(() => {
    if (!selected) return;
    if (selectedThreadId) return;
    const last = agentThreads[0]?.threadId;
    if (last) {
      router.replace(`/agents?slug=${encodeURIComponent(selected.slug)}&thread=${encodeURIComponent(last)}`);
    }
  }, [selected?.slug, selectedThreadId, agentThreads, router, selected]);

  // Push the chosen thread into ChatSurface's localStorage slot before
  // it mounts, so its on-mount syncThread() picks it up. ChatSurface
  // remounts because of the `key` prop further down.
  useEffect(() => {
    if (typeof window === 'undefined' || !selected) return;
    const slot = `bm-team-thread-${selected.slug}`;
    if (selectedThreadId) {
      window.localStorage.setItem(slot, selectedThreadId);
    } else {
      window.localStorage.removeItem(slot);
    }
  }, [selected?.slug, selectedThreadId, selected]);

  function selectThread(threadId: string) {
    if (!selected) return;
    router.replace(
      `/agents?slug=${encodeURIComponent(selected.slug)}&thread=${encodeURIComponent(threadId)}`,
    );
  }

  function newThread() {
    if (!selected) return;
    // Empty thread param → ChatSurface mints a fresh threadId on mount.
    router.replace(`/agents?slug=${encodeURIComponent(selected.slug)}&thread=`);
  }

  async function createAgent() {
    setNewErr(null);
    const slug = newSlug.trim().replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    if (!slug) {
      setNewErr('letters/digits/dashes only');
      return;
    }
    const path = `agents/${slug}.md`;
    const seeded = STARTER_AGENT.replace('new-agent', slug);
    try {
      await api.writeFile(path, seeded);
      setShowNew(false);
      setNewSlug('');
      router.push(`/vault?path=${encodeURIComponent(path)}`);
    } catch (e) {
      setNewErr((e as Error).message || 'failed');
    }
  }

  return (
    <div className="h-full flex bg-cream dark:bg-[#0F0D0A] min-h-0">
      {/* Pane 1: agents */}
      <aside className="w-[240px] shrink-0 border-r border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F] flex flex-col min-h-0">
        <div className="px-3 py-3 border-b border-line dark:border-[#2A241D]">
          <div className="flex items-center gap-1.5 mb-2">
            <Bot className="w-4 h-4 text-flame" />
            <h1 className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA] flex-1">Agents</h1>
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              title="New agent"
              className="w-5 h-5 rounded hover:bg-white dark:hover:bg-[#1F1B15] flex items-center justify-center"
            >
              <Plus className="w-3.5 h-3.5 text-muted dark:text-[#8C837C]" />
            </button>
          </div>
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted dark:text-[#8C837C]" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="w-full bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-md pl-6 pr-2 py-1 text-[11px] text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
            />
          </div>
          {showNew && (
            <form onSubmit={(e) => { e.preventDefault(); createAgent(); }} className="mt-2 flex flex-col gap-1">
              <input
                autoFocus
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="slug"
                className="w-full bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-md px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-flame"
              />
              {newErr && <span className="text-[10px] text-flame">{newErr}</span>}
              <div className="flex gap-1">
                <button type="submit" className="flex-1 bg-flame text-white text-[11px] py-1 rounded">Create</button>
                <button type="button" onClick={() => { setShowNew(false); setNewErr(null); setNewSlug(''); }} className="flex-1 text-[11px] py-1 rounded border border-line dark:border-[#2A241D]">Cancel</button>
              </div>
            </form>
          )}
        </div>

        <ul className="flex-1 overflow-y-auto py-1">
          {agents.isLoading && (
            <li className="px-3 py-2 text-[11px] text-muted dark:text-[#8C837C]">loading…</li>
          )}
          {!agents.isLoading && filtered.length === 0 && (
            <li className="px-3 py-2 text-[11px] text-muted dark:text-[#8C837C]">
              {q ? 'no match' : 'no agents'}
            </li>
          )}
          {filtered.map((a) => {
            const Icon = AGENT_ICON_MAP[a.icon] ?? Bot;
            const isSel = selected?.slug === a.slug;
            const isLive = liveSlugs.has(a.slug.toLowerCase());
            return (
              <li key={a.path}>
                <a
                  href={`/agents?slug=${encodeURIComponent(a.slug)}`}
                  className={
                    'flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors border-l-2 ' +
                    (isSel
                      ? 'bg-white dark:bg-[#1F1B15] border-flame text-ink dark:text-[#F5F1EA] font-semibold'
                      : 'border-transparent text-ink/80 dark:text-[#E6E0D8] hover:bg-white/60 dark:hover:bg-[#1F1B15]/60')
                  }
                >
                  <Icon className={'w-3.5 h-3.5 shrink-0 ' + (isSel ? 'text-flame' : 'text-muted dark:text-[#8C837C]')} />
                  <span className="truncate flex-1">{a.name}</span>
                  {isLive && (
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-flame" />
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Pane 2: threads for the selected agent */}
      <aside className="w-[260px] shrink-0 border-r border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] flex flex-col min-h-0">
        <div className="px-3 py-3 border-b border-line dark:border-[#2A241D] flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-muted dark:text-[#8C837C]" />
          <h2 className="text-[12px] font-semibold text-ink dark:text-[#F5F1EA] flex-1 truncate">
            {selected ? `${selected.name} threads` : 'Threads'}
          </h2>
          <button
            type="button"
            onClick={newThread}
            disabled={!selected}
            title="New thread"
            className="w-5 h-5 rounded hover:bg-cream-light dark:hover:bg-[#17140F] flex items-center justify-center disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5 text-muted dark:text-[#8C837C]" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-1">
          {chats.isLoading && (
            <li className="px-3 py-2 text-[11px] text-muted dark:text-[#8C837C]">loading…</li>
          )}
          {!chats.isLoading && agentThreads.length === 0 && selected && (
            <li className="px-3 py-3 text-[11px] text-muted dark:text-[#8C837C] leading-snug">
              No threads yet. Start chatting on the right — your first message
              creates a new thread automatically.
            </li>
          )}
          {agentThreads.map((t) => {
            const isSel = t.threadId === selectedThreadId;
            const ago = timeAgo(t.updatedAt);
            return (
              <li key={t.threadId} className="group relative">
                <button
                  type="button"
                  onClick={() => selectThread(t.threadId)}
                  className={
                    'w-full text-left flex flex-col gap-0.5 px-3 py-2 transition-colors border-l-2 ' +
                    (isSel
                      ? 'bg-cream-light dark:bg-[#17140F] border-flame'
                      : 'border-transparent hover:bg-cream-light/60 dark:hover:bg-[#17140F]/60')
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className={'text-[12px] truncate flex-1 ' + (isSel ? 'font-semibold text-ink dark:text-[#F5F1EA]' : 'text-ink dark:text-[#E6E0D8]')}>
                      {t.preview || '(empty thread)'}
                    </span>
                    {ago && (
                      <span className="text-[10px] font-mono text-muted dark:text-[#8C837C] shrink-0">{ago}</span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-muted dark:text-[#8C837C]">
                    {t.count} msg{t.count === 1 ? '' : 's'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this thread?')) deleteThread.mutate(t.threadId);
                  }}
                  title="Delete thread"
                  className="absolute right-2 top-2 w-5 h-5 rounded opacity-0 group-hover:opacity-100 hover:bg-white dark:hover:bg-[#1F1B15] flex items-center justify-center transition-opacity"
                >
                  <Trash2 className="w-3 h-3 text-muted dark:text-[#8C837C] hover:text-flame" />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Pane 3: chat */}
      <div className="flex-1 min-w-0 min-h-0">
        {selected ? (
          <ChatSurface
            // Remount when agent OR explicit thread selection changes,
            // so ChatSurface re-runs syncThread against the freshly
            // primed localStorage slot.
            key={`${selected.slug}:${selectedThreadId || 'fresh'}`}
            agent={selected.slug}
            threadKey={`bm-team-thread-${selected.slug}`}
            title={`Chat with ${selected.name}`}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted dark:text-[#8C837C]">
            Pick an agent on the left.
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted dark:text-[#8C837C]">loading…</div>}>
      <AgentsInner />
    </Suspense>
  );
}
