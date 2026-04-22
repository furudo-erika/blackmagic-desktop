'use client';

/**
 * Reusable chat surface used by /, /chat, and /team/[slug].
 *
 * Props:
 *   - agent?: override the agent routing on the daemon side
 *   - threadKey?: localStorage key for "current thread" persistence.
 *     'bm-last-thread' (default) syncs with SidebarChats. Passing any
 *     other key (e.g. 'bm-team-thread-linkedin-outreach') isolates the
 *     thread from the sidebar — each agent tab keeps its own.
 *   - title: header text
 *   - subtitle: optional one-liner under the header
 *   - scenarios: starter prompts shown when the thread is empty
 *   - headerRight: optional trailing element in the header
 *   - bordered: show a card border (true for agent tabs, false at /)
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Send, Bot, Check, Loader2, AlertCircle, Copy as CopyIcon, ExternalLink, Sparkles,
  // Per-agent icons — matches the slugs seeded in daemon/src/vault.ts.
  Search, Briefcase, Globe, Linkedin, CalendarClock, Copy as CopyTwin, RotateCcw,
  Activity, Radar, type LucideIcon,
} from 'lucide-react';

import { api } from '../lib/api';
import { Markdown } from './markdown';
import { AgentIcon } from './agent-icon';

export type ChatScenario = { title: string; prompt: string };

type Msg = { role: 'user' | 'assistant'; content: string };

// Activity stream rendered inside the thinking bubble. Each tool call is one
// row (icon · name · chip · command tail); reasoning summary deltas land as
// a separate dimmed text block so the user sees WHY the next tool will run
// rather than just a parade of tool names. Mirrors the Tukwork / CoWork
// design reference the user pointed at.
type ActivityItem =
  | {
      kind: 'tool';
      id: string;
      status: 'pending' | 'done' | 'error';
      name: string;
      primary?: string;   // chip — filename, domain, etc.
      tail?: string;      // command / arg tail displayed after the chip
      startedAt: number;
      endedAt?: number;
    }
  | { kind: 'reasoning'; id: string; text: string };

// Extract a short, load-bearing argument to display as a chip next to the
// tool name — CoWork-style "Read Root CLAUDE.md" → chip `CLAUDE.md`.
function extractToolParts(data: any): { primary?: string; tail?: string } {
  let args: any = {};
  const raw = data?.arguments ?? data?.args ?? data?.input;
  if (typeof raw === 'string') {
    try { args = JSON.parse(raw); } catch { return { tail: raw.slice(0, 120) }; }
  } else if (raw && typeof raw === 'object') {
    args = raw;
  }
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = args?.[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
    return '';
  };
  const full =
    pick('path', 'file', 'file_path') ||
    pick('url', 'link') ||
    pick('domain') ||
    pick('linkedinUrl', 'linkedin_url') ||
    pick('query', 'q', 'search') ||
    pick('contact_path', 'sequence_path') ||
    pick('channel', 'to', 'subject') ||
    pick('old_path', 'new_path') ||
    pick('text', 'prompt') ||
    '';
  if (!full) return {};
  // Show the basename as the chip, full path as the tail — lets the user
  // see "CLAUDE.md" at a glance while still getting full provenance.
  const basename = full.split('/').pop() || full;
  const short = basename.length > 40 ? basename.slice(0, 37) + '…' : basename;
  const tail = full.length > basename.length + 1 ? full : undefined;
  return { primary: short, tail };
}

// Map an agent's frontmatter `icon:` name to the real lucide component.
// Mirrors daemon/src/vault.ts DEFAULT_AGENTS where each agent ships an
// icon name like `Radar` / `Globe` / `Linkedin` — this is the renderer
// side of that contract.
const AGENT_ICONS: Record<string, LucideIcon> = {
  Search,
  Send,
  Briefcase,
  Globe,
  Linkedin,
  CalendarClock,
  Copy: CopyTwin,
  RotateCcw,
  Activity,
  Radar,
  Sparkles,
  Bot,
};

// Color accent per agent — gives the gallery visual variety so every card
// doesn't fade into the same dark tile. Keyed by slug with sensible
// fallbacks for future agents.
const AGENT_ACCENTS: Record<string, string> = {
  'researcher':          'text-sky-400',
  'sdr':                 'text-violet-400',
  'ae':                  'text-amber-400',
  'website-visitor':     'text-emerald-400',
  'linkedin-outreach':   'text-blue-400',
  'meeting-prep':        'text-teal-400',
  'lookalike-discovery': 'text-fuchsia-400',
  'closed-lost-revival': 'text-rose-400',
  'pipeline-ops':        'text-orange-400',
  'geo-analyst':         'text-flame',
  'company-profiler':    'text-yellow-400',
};

function friendlyToolName(name: string): string {
  // snake_case → Title Case, but keep domain-specific prefixes readable.
  return name
    .split('_')
    .map((w) => w.length ? w[0]!.toUpperCase() + w.slice(1) : w)
    .join(' ');
}

function Elapsed({ startedAt }: { startedAt: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  void tick;
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (s < 60) return <>{s}s</>;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return <>{m}m {rem}s</>;
}

function newThreadId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Retained for any future plaintext dump (used only internally now — the UI
// uses extractToolParts above to render structured rows). Leaving it in place
// so downstream code that imports it doesn't break during the transition.
function formatToolLine(data: any): string {
  const name: string = data?.name ?? 'tool';
  let args: any = {};
  const raw = data?.arguments ?? data?.args ?? data?.input;
  if (typeof raw === 'string') {
    try { args = JSON.parse(raw); } catch { return `${name} ${raw.slice(0, 60)}`.trim(); }
  } else if (raw && typeof raw === 'object') {
    args = raw;
  }
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = args?.[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
    return '';
  };
  const hint =
    pick('path', 'file', 'file_path') ||
    pick('url', 'link') ||
    pick('domain') ||
    pick('linkedinUrl', 'linkedin_url') ||
    pick('query', 'q', 'search') ||
    pick('contact_path', 'sequence_path') ||
    pick('channel', 'to', 'subject') ||
    pick('old_path', 'new_path');
  const short = hint.length > 80 ? hint.slice(0, 77) + '…' : hint;
  return short ? `${name} ${short}` : name;
}

export function ChatSurface({
  agent,
  threadKey = 'bm-last-thread',
  title = 'Chat',
  subtitle,
  scenarios = DEFAULT_SCENARIOS,
  headerRight,
  bordered = false,
}: {
  agent?: string;
  threadKey?: string;
  title?: string;
  subtitle?: string;
  scenarios?: ChatScenario[];
  headerRight?: React.ReactNode;
  bordered?: boolean;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [threadId, setThreadId] = useState<string>('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  // Agent picker — lets the user swap the routing agent inside Chat
  // instead of having to open /team?slug=X first. When the parent
  // passes an `agent` prop (e.g. from a deep link) we initialize with
  // that, but still let the user change it for this thread.
  const [pickedAgent, setPickedAgent] = useState<string | undefined>(agent);

  // Inline command popover. Opens when the cursor lands right after a
  // bare `@` or `/` (no preceding non-space char). Esc closes; arrow
  // keys navigate; Enter/Tab inserts the highlighted item.
  const [popover, setPopover] = useState<
    | { kind: 'mention' | 'slash'; query: string; anchor: number; index: number }
    | null
  >(null);

  // Roster of agents in this vault — used to populate the @-mention list.
  // Same query as the sidebar/cockpit so we don't duplicate vault reads.
  const agentsForMention = useQuery({
    queryKey: ['chat-mention-agents'],
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
          return { slug, name };
        }),
      );
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return rows;
    },
    staleTime: 60_000,
  });

  // Slash commands. Pure UI helpers — `/clear` resets the local thread;
  // `/agent <slug>` switches the picker; `/skills` jumps to the catalog.
  const SLASH_COMMANDS = [
    { name: '/clear', hint: 'reset this thread', action: 'clear' as const },
    { name: '/agent', hint: 'switch which agent answers', action: 'agent' as const },
    { name: '/skills', hint: 'browse the skill catalog', action: 'skills' as const },
  ];

  // Detect @ / triggers from the current input + cursor position.
  function detectPopover(value: string, cursor: number) {
    // Walk back from cursor to either a whitespace or one of the trigger
    // chars. If we hit `@` or `/` first, we're inside a token.
    let i = cursor - 1;
    while (i >= 0) {
      const c = value[i]!;
      if (c === '@' || c === '/') {
        // Trigger must be at start-of-line or preceded by whitespace.
        if (i === 0 || /\s/.test(value[i - 1]!)) {
          const query = value.slice(i + 1, cursor);
          // Slash commands only match on the first character (no spaces).
          if (/\s/.test(query)) return null;
          return {
            kind: c === '@' ? ('mention' as const) : ('slash' as const),
            query,
            anchor: i,
          };
        }
        return null;
      }
      if (/\s/.test(c)) return null;
      i--;
    }
    return null;
  }

  function handleInputChange(value: string, cursor: number) {
    setInput(value);
    const det = detectPopover(value, cursor);
    if (det) setPopover({ ...det, index: 0 });
    else setPopover(null);
  }

  // Resolve the active option list for whichever popover kind is open.
  const popoverItems: Array<{ label: string; sublabel?: string; insert: string; meta?: any }> = (() => {
    if (!popover) return [];
    if (popover.kind === 'mention') {
      const q = popover.query.toLowerCase();
      return (agentsForMention.data ?? [])
        .filter((a) => !q || a.slug.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((a) => ({ label: a.name, sublabel: a.slug, insert: `@${a.slug}` }));
    }
    const q = popover.query.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.name.slice(1).toLowerCase().includes(q)).map((c) => ({
      label: c.name,
      sublabel: c.hint,
      insert: c.name + ' ',
      meta: c.action,
    }));
  })();

  function applyPopoverChoice(choice: { insert: string; meta?: any }) {
    if (!popover) return;
    // Slash command actions handled inline before insertion.
    if (popover.kind === 'slash') {
      if (choice.meta === 'clear') {
        setMessages([]);
        setInput('');
        setPopover(null);
        return;
      }
      if (choice.meta === 'skills') {
        window.location.href = '/skills';
        return;
      }
      // /agent → just insert; user types slug after the space.
    }
    const before = input.slice(0, popover.anchor);
    const after = input.slice(popover.anchor + 1 + popover.query.length);
    const inserted = before + choice.insert + (after.startsWith(' ') ? '' : ' ') + after;
    setInput(inserted);
    setPopover(null);
    // Restore focus + caret right after the insertion.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const pos = (before + choice.insert + ' ').length;
      el.setSelectionRange(pos, pos);
    });
  }
  useEffect(() => { setPickedAgent(agent); }, [agent]);
  const effectiveAgent = pickedAgent ?? agent;
  const agentOptions = useQuery({
    queryKey: ['chat-agent-options'],
    queryFn: async () => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'),
      );
      const rows = await Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          const fm = r.frontmatter ?? {};
          const slug = f.path.replace(/^agents\//, '').replace(/\.md$/, '');
          const name = typeof fm.name === 'string' && fm.name ? fm.name : slug;
          const starterPrompts = Array.isArray(fm.starter_prompts)
            ? (fm.starter_prompts as unknown[]).filter((p): p is string => typeof p === 'string')
            : [];
          const icon = typeof fm.icon === 'string' ? fm.icon : '';
          // Tagline = first non-empty prose line of the agent body,
          // trimmed to ~80 chars. Gives the gallery card a one-line
          // "what does this agent do" instead of showing the technical
          // slug. Falls back to empty string — the render skips the row.
          const body = (r.body ?? '').trim();
          const firstLine = body
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l && !l.startsWith('#') && !l.startsWith('-') && !l.startsWith('*'));
          const tagline = firstLine ? firstLine.replace(/^[*_`]+/, '').slice(0, 120) : '';
          const pin = typeof fm.pin === 'string' ? fm.pin : '';
          return { slug, name, starterPrompts, icon, tagline, pin };
        }),
      );
      // Sort: `pin: first` agents always lead (Company Profiler onboarding
      // flow relies on this), then alphabetical by display name.
      rows.sort((a, b) => {
        const aPin = a.pin === 'first' ? 0 : 1;
        const bPin = b.pin === 'first' ? 0 : 1;
        if (aPin !== bPin) return aPin - bPin;
        return a.name.localeCompare(b.name);
      });
      return rows;
    },
    staleTime: 60_000,
  });

  // When the caller didn't pass explicit scenarios but an agent is active,
  // pull that agent's starter_prompts from its vault file and surface them
  // as click-to-run scenario cards. Falls back to a single "Run X end-to-
  // end" starter so every agent has at least one obvious move.
  const derivedScenarios: ChatScenario[] = (() => {
    if (scenarios.length > 0) return scenarios;
    if (!effectiveAgent) return [];
    const a = agentOptions.data?.find((x) => x.slug === effectiveAgent);
    if (!a) return [];
    if (a.starterPrompts.length > 0) {
      return a.starterPrompts.map((p) => ({
        title: p.length > 48 ? p.slice(0, 45) + '…' : p,
        prompt: p,
      }));
    }
    return [
      {
        title: `Run ${a.name} end-to-end`,
        prompt: `You are the ${a.name}. Execute your full loop for my project now — don't describe what you would do, actually do it. Only stop if you hit a genuine blocker that needs a human decision.`,
      },
    ];
  })();

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-size the textarea whenever its contents change — covers typing,
  // scenario clicks, and the post-send clear. 'auto' collapses the height
  // first so scrollHeight reflects the real minimum needed, then we cap
  // at 320px and flip on the scrollbar when we'd exceed that.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, 320);
    el.style.height = next + 'px';
    el.style.overflowY = el.scrollHeight > 320 ? 'auto' : 'hidden';
  }, [input]);

  // When the picker changes which agent routes the conversation, also
  // switch the persisted thread. Each agent keeps its own history under
  // `bm-team-thread-<slug>`, so picking "Deal Manager" here loads that
  // agent's past messages instead of mixing conversations.
  const effectiveThreadKey = pickedAgent
    ? `bm-team-thread-${pickedAgent}`
    : threadKey;
  const isGlobal = effectiveThreadKey === 'bm-last-thread';

  useEffect(() => {
    function syncThread() {
      if (typeof window === 'undefined') return;
      const last = localStorage.getItem(effectiveThreadKey);
      if (last && last !== threadId) loadThread(last);
      else if (!last && !threadId) {
        const id = newThreadId();
        setThreadId(id);
        localStorage.setItem(effectiveThreadKey, id);
      }
    }
    // Reset visible state when threadKey changes so stale messages from
    // the previous agent don't flash before the new thread loads.
    setThreadId('');
    setMessages([]);
    syncThread();
    if (isGlobal) {
      window.addEventListener('storage', syncThread);
      window.addEventListener('focus', syncThread);
      const iv = setInterval(syncThread, 1000);
      return () => {
        window.removeEventListener('storage', syncThread);
        window.removeEventListener('focus', syncThread);
        clearInterval(iv);
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveThreadKey, isGlobal]);

  async function loadThread(id: string) {
    try {
      const data = await api.getChat(id);
      setThreadId(data.threadId);
      setMessages(data.messages as Msg[]);
    } catch {
      setThreadId(id);
      setMessages([]);
    }
  }

  const sendMut = useMutation({
    mutationFn: async (msgs: Msg[]) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
      setActivity([]);
      setRunStartedAt(Date.now());
      let assistantText = '';
      let runId = '';
      // Track in-flight tool calls by name so the matching `tool` completion
      // event can upgrade the right pending row to done. We key on name +
      // oldest pending because the stream doesn't carry a call_id through to
      // the UI layer.
      let toolSeq = 0;
      const pendingByName = new Map<string, string[]>();
      await api.chatStream(msgs, {
        agent: effectiveAgent,
        threadId,
        onEvent: ({ type, data }) => {
          if (type === 'meta') runId = data.runId;
          else if (type === 'text') {
            assistantText += String(data.delta ?? '');
            setMessages((prev) => {
              const copy = prev.slice();
              copy[copy.length - 1] = { role: 'assistant', content: assistantText };
              return copy;
            });
          } else if (type === 'tool_pending') {
            const id = `t-${++toolSeq}`;
            const name = String(data?.name ?? 'tool');
            const { primary, tail } = extractToolParts(data);
            const list = pendingByName.get(name) ?? [];
            list.push(id);
            pendingByName.set(name, list);
            setActivity((a) => [
              ...a,
              { kind: 'tool', id, status: 'pending', name, primary, tail, startedAt: Date.now() },
            ]);
          } else if (type === 'tool') {
            const name = String(data?.name ?? 'tool');
            const list = pendingByName.get(name) ?? [];
            const id = list.shift();
            pendingByName.set(name, list);
            setActivity((a) =>
              a.map((it) =>
                it.kind === 'tool' && it.id === id
                  ? { ...it, status: 'done', endedAt: Date.now() }
                  : it,
              ),
            );
          } else if (type === 'reasoning' || type === 'reasoning_pending') {
            const delta = typeof data?.delta === 'string' ? data.delta : typeof data?.text === 'string' ? data.text : '';
            if (!delta) return;
            setActivity((a) => {
              const last = a[a.length - 1];
              if (last && last.kind === 'reasoning') {
                const merged = { ...last, text: last.text + delta };
                return [...a.slice(0, -1), merged];
              }
              return [...a, { kind: 'reasoning', id: `r-${Date.now()}`, text: delta }];
            });
          } else if (type === 'error') {
            assistantText = assistantText
              ? assistantText + '\n\n_error_: ' + data.message
              : '⚠︎ ' + data.message;
            setMessages((prev) => {
              const copy = prev.slice();
              copy[copy.length - 1] = { role: 'assistant', content: assistantText };
              return copy;
            });
          } else if (type === 'done') {
            runId = data.runId ?? runId;
            const serverFinal = data.final != null ? String(data.final) : '';
            if (serverFinal && serverFinal !== assistantText) {
              assistantText = serverFinal;
              setMessages((prev) => {
                const copy = prev.slice();
                copy[copy.length - 1] = { role: 'assistant', content: assistantText };
                return copy;
              });
            }
          }
        },
      });
      return { runId };
    },
    onSuccess: () => {
      setActivity([]);
      setRunStartedAt(null);
      if (isGlobal) qc.invalidateQueries({ queryKey: ['sidebar-chats'] });
    },
    onError: (e: Error) => {
      setActivity([]);
      setRunStartedAt(null);
      setMessages((prev) => {
        const copy = prev.slice();
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          copy[copy.length - 1] = { role: 'assistant', content: `error: ${e.message}` };
        } else {
          copy.push({ role: 'assistant', content: `error: ${e.message}` });
        }
        return copy;
      });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sendMut.isPending]);

  function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || sendMut.isPending) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    if (!override) setInput('');
    sendMut.mutate(next);
  }

  return (
    <div
      className={
        'h-full flex flex-col' +
        (bordered ? ' bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl overflow-hidden' : '')
      }
    >
      <header className="px-6 py-3 border-b border-line dark:border-[#2A241D] flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          {sendMut.isPending && (
            <span
              className="relative flex h-2 w-2 shrink-0"
              aria-label="agent running"
              title="agent running"
            >
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-flame" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-ink dark:text-[#F5F1EA] truncate">{title}</h1>
            {subtitle && (
              <p className="text-[12px] text-muted dark:text-[#8C837C] truncate">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label
            className="inline-flex items-center gap-1.5 text-[11px] text-muted dark:text-[#8C837C]"
            title="Switch agents — each one has its own thread so you can run many in parallel"
          >
            <Bot className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Agent:</span>
            <select
              value={effectiveAgent ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v) router.push(`/agents?slug=${encodeURIComponent(v)}`);
                else setPickedAgent(undefined);
              }}
              className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-md px-2 py-1 text-[12px] text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame cursor-pointer"
            >
              <option value="">Default (Research Agent)</option>
              {(agentOptions.data ?? []).map((a) => (
                <option key={a.slug} value={a.slug}>{a.name}</option>
              ))}
            </select>
          </label>
          {headerRight}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <div className="max-w-5xl mx-auto py-6 space-y-8">
            {/* Onboarding nudge moved to a global app-shell banner
                (see components/onboarding-banner.tsx) so it shows up
                regardless of which page the user lands on, not just the
                empty-state of /. */}

            {/* Agent gallery — always visible in the empty state, not
                tucked behind the header dropdown. Each card switches the
                active agent for this thread; the currently-picked agent
                gets a flame-colored ring so there's no confusion about
                which agent will handle the next message. */}
            {(agentOptions.data?.length ?? 0) > 0 && (
              <div>
                <h2 className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-3">
                  Agents
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {(agentOptions.data ?? []).map((a) => {
                    const picked = effectiveAgent === a.slug;
                    const Icon = AGENT_ICONS[a.icon] ?? Bot;
                    const accent = AGENT_ACCENTS[a.slug] ?? 'text-muted dark:text-[#8C837C]';
                    return (
                      <button
                        key={a.slug}
                        type="button"
                        onClick={() => router.push(`/agents?slug=${encodeURIComponent(a.slug)}`)}
                        className={
                          'text-left p-4 bg-white dark:bg-[#1F1B15] border rounded-xl transition-all flex flex-col gap-2 h-full group ' +
                          (picked
                            ? 'border-flame ring-1 ring-flame/40 shadow-sm'
                            : 'border-line dark:border-[#2A241D] hover:border-flame/60 hover:-translate-y-0.5')
                        }
                      >
                        <div className="flex items-start gap-2.5">
                          <AgentIcon slug={a.slug} name={a.name} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA] truncate">{a.name}</div>
                          </div>
                        </div>
                        {a.tagline && (
                          <div className="text-[11px] text-muted dark:text-[#8C837C] line-clamp-2 leading-snug">
                            {a.tagline}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {derivedScenarios.length > 0 && (
              <div>
                <h2 className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-3">
                  {effectiveAgent ? `Starter prompts for ${agentOptions.data?.find((x) => x.slug === effectiveAgent)?.name ?? effectiveAgent}` : 'Try one of these'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {derivedScenarios.map((s) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => setInput(s.prompt)}
                      className="text-left p-3 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl hover:border-flame transition-colors"
                    >
                      <div className="text-[12px] font-semibold text-ink dark:text-[#F5F1EA]">{s.title}</div>
                      <div className="text-[11px] text-muted dark:text-[#8C837C] line-clamp-2 mt-1">
                        {s.prompt.slice(0, 140)}…
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((m, i) => {
            if (m.role === 'assistant' && !m.content) return null;
            const isLastAssistant = m.role === 'assistant' && i === messages.length - 1;
            return (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    m.role === 'user'
                      ? 'bg-ink dark:bg-[#3A322A] text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[80%] whitespace-pre-wrap'
                      : 'bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-2xl rounded-bl-sm px-5 py-3 pb-2 max-w-[90%]'
                  }
                >
                  {m.role === 'user' ? m.content : <Markdown source={m.content} />}
                  {m.role === 'assistant' && m.content && !(isLastAssistant && sendMut.isPending) && (
                    <MessageFooter content={m.content} />
                  )}
                </div>
              </div>
            );
          })}
          {sendMut.isPending && (
            <ActivityBubble activity={activity} startedAt={runStartedAt} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-line dark:border-[#2A241D] px-6 py-3 bg-cream-light dark:bg-[#17140F]">
        <div className="max-w-3xl mx-auto flex items-end gap-2 relative">
          {popover && popoverItems.length > 0 && (
            <div className="absolute bottom-full mb-2 left-0 w-80 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg shadow-lg overflow-hidden z-30">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] border-b border-line dark:border-[#2A241D]">
                {popover.kind === 'mention' ? 'Loop in agent' : 'Slash commands'}
              </div>
              <ul className="max-h-[260px] overflow-y-auto py-1">
                {popoverItems.map((it, i) => (
                  <li key={it.label}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyPopoverChoice(it);
                      }}
                      onMouseEnter={() => setPopover((p) => (p ? { ...p, index: i } : p))}
                      className={
                        'w-full text-left flex items-center gap-2 px-3 py-1.5 text-[12px] ' +
                        (i === popover.index
                          ? 'bg-flame/10 text-ink dark:text-[#F5F1EA]'
                          : 'text-ink dark:text-[#E6E0D8] hover:bg-cream dark:hover:bg-[#0F0D0A]')
                      }
                    >
                      <span className="truncate">{it.label}</span>
                      {it.sublabel && (
                        <span className="ml-auto truncate text-[10px] font-mono text-muted dark:text-[#8C837C]">
                          {it.sublabel}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="px-3 py-1.5 text-[10px] text-muted dark:text-[#8C837C] border-t border-line dark:border-[#2A241D] font-mono">
                ↑↓ navigate · ↵ select · esc cancel
              </div>
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyUp={(e) => {
              const t = e.currentTarget;
              const det = detectPopover(t.value, t.selectionStart ?? 0);
              if (det) setPopover((p) => ({ ...det, index: p?.index ?? 0 }));
              else setPopover(null);
            }}
            onClick={(e) => {
              const t = e.currentTarget;
              const det = detectPopover(t.value, t.selectionStart ?? 0);
              if (det) setPopover((p) => ({ ...det, index: p?.index ?? 0 }));
              else setPopover(null);
            }}
            onKeyDown={(e) => {
              if (popover && popoverItems.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setPopover((p) => (p ? { ...p, index: (p.index + 1) % popoverItems.length } : p));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setPopover((p) => (p ? { ...p, index: (p.index - 1 + popoverItems.length) % popoverItems.length } : p));
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  applyPopoverChoice(popoverItems[popover.index]!);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setPopover(null);
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Ask the agent… ( @ to loop in another agent · / for commands )"
            className="flex-1 resize-none bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg px-3 py-2 text-sm leading-5 text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
            style={{ minHeight: 40, maxHeight: 320 }}
          />
          <button
            onClick={() => send()}
            disabled={sendMut.isPending || !input.trim()}
            className="h-10 px-4 rounded-lg bg-flame text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// The empty-state used to carry a hardcoded list of GTM demo prompts
// (acme.com, beta-corp, jane@acme.com, …) that shipped in every bundle
// even after the scenario cards were removed in 0.3.4 — the array was
// still imported and its length gated the default copy. Leaving this
// empty kills the demo brand strings entirely; callers can still pass
// their own `scenarios` prop (the Team cockpit does).
const DEFAULT_SCENARIOS: ChatScenario[] = [];

// ---------------------------------------------------------------------------
// Activity bubble — the left-aligned card that replaces the old "thinking…"
// dot while the agent is running. Renders each reasoning paragraph and each
// tool call on its own row, with a live "Processing… Ns" elapsed timer at
// the bottom so long autonomous runs feel alive instead of opaque.
// ---------------------------------------------------------------------------
function ActivityBubble({
  activity,
  startedAt,
}: {
  activity: ActivityItem[];
  startedAt: number | null;
}) {
  return (
    <div className="flex justify-start">
      <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-2xl rounded-bl-sm px-5 py-3 text-sm max-w-[90%] w-full space-y-2">
        {activity.length === 0 ? (
          <div className="flex items-center gap-2 text-muted dark:text-[#8C837C]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-flame" />
            <span>Thinking…</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {activity.map((it) =>
              it.kind === 'reasoning' ? (
                <ReasoningRow key={it.id} text={it.text} />
              ) : (
                <ToolRow key={it.id} item={it} />
              ),
            )}
          </div>
        )}
        {startedAt && (
          <div className="flex items-center gap-1.5 pt-1 text-[11px] text-muted dark:text-[#8C837C]">
            <Loader2 className="w-3 h-3 animate-spin text-flame" />
            <span>
              Processing… <Elapsed startedAt={startedAt} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolRow({ item }: { item: Extract<ActivityItem, { kind: 'tool' }> }) {
  const Icon =
    item.status === 'done' ? Check :
    item.status === 'error' ? AlertCircle :
    Loader2;
  const iconClass =
    item.status === 'done' ? 'text-[#7E8C67]' :
    item.status === 'error' ? 'text-flame' :
    'text-flame animate-spin';
  return (
    <div className="flex items-baseline gap-2 text-[12.5px] leading-snug">
      <Icon className={`w-3.5 h-3.5 shrink-0 relative top-[2px] ${iconClass}`} />
      <span className="text-ink dark:text-[#E6E0D8] font-medium shrink-0">
        {friendlyToolName(item.name)}
      </span>
      {item.primary && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-line dark:border-[#2A241D] bg-cream dark:bg-[#0F0D0A] text-[11px] font-mono text-ink dark:text-[#E6E0D8] shrink-0">
          {item.primary}
        </span>
      )}
      {item.tail && (
        <span className="truncate text-[11px] font-mono text-muted dark:text-[#8C837C]">
          · {item.tail}
        </span>
      )}
    </div>
  );
}

function ReasoningRow({ text }: { text: string }) {
  const clean = text.trim();
  if (!clean) return null;
  return (
    <div className="flex items-baseline gap-2 text-[12.5px] leading-snug">
      <Sparkles className="w-3.5 h-3.5 shrink-0 relative top-[2px] text-muted dark:text-[#6B625C]" />
      <span className="italic text-muted dark:text-[#8C837C]">{clean}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message footer — Copy + View-as-Markdown, shown under any rendered
// assistant message. Matches the CoWork reference's "Copy · View as
// Markdown" row and gives the user a cleaner escape hatch than trying to
// select the pretty-rendered markdown.
// ---------------------------------------------------------------------------
function MessageFooter({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }
  function onView() {
    try {
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {}
  }
  return (
    <div className="mt-3 pt-2 border-t border-line/60 dark:border-[#2A241D]/60 flex items-center gap-3 text-[11px] text-muted dark:text-[#8C837C]">
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1 hover:text-flame transition-colors"
      >
        <CopyIcon className="w-3 h-3" />
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        type="button"
        onClick={onView}
        className="inline-flex items-center gap-1 hover:text-flame transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
        View as Markdown
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onboarding banner — promotes the Company Profiler above the agent gallery
// with a one-click "Run now" CTA. Dismissed state persists per-vault in
// localStorage so it doesn't badger the user after they've profiled once.
// Renders only when:
//   - a `pin: first` agent exists in the vault (Company Profiler by
//     convention seeded by the daemon)
//   - the user hasn't dismissed the banner
//   - the banner hasn't been dismissed by "Run now" completing before
// ---------------------------------------------------------------------------
function ProfilerOnboardingBanner({
  agents,
  onRun,
}: {
  agents: Array<{ slug: string; name: string; icon: string; tagline: string; starterPrompts: string[]; pin?: string }>;
  onRun: (slug: string, prompt: string) => void;
}) {
  const pinned = agents.find((a) => a.pin === 'first');
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem('bm-profiler-banner-dismissed');
      if (v === '1') setDismissed(true);
    } catch {}
  }, []);
  if (!pinned || dismissed) return null;
  function dismiss() {
    try { localStorage.setItem('bm-profiler-banner-dismissed', '1'); } catch {}
    setDismissed(true);
  }
  const Icon = AGENT_ICONS[pinned.icon] ?? Sparkles;
  const prompt =
    pinned.starterPrompts?.[0] ||
    `You are the ${pinned.name}. Profile my company end-to-end — crawl the domain + docs, infer the ICP, competitors, voice, and populate the \`us/\` tree. This is the first thing to run on a fresh vault; every other agent reads from \`us/\` so this kicks everything off.`;
  return (
    <div className="relative bg-gradient-to-br from-flame/10 to-flame/5 border border-flame/40 rounded-xl p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg bg-flame/20 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-flame" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA]">
            Start here: run {pinned.name}
          </h3>
          <span className="text-[10px] uppercase tracking-wider font-mono text-flame font-semibold">
            1 · onboarding
          </span>
        </div>
        <p className="text-[12.5px] text-muted dark:text-[#E6E0D8] mt-1 leading-relaxed">
          Every other agent in this workspace reads from your
          <code className="mx-1 px-1 rounded bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] text-[11px] font-mono">us/</code>
          folder — company profile, ICP, voice, competitors. {pinned.name} crawls your
          domain + docs, populates all of it, and unlocks the rest of the roster. Takes
          about a minute.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => onRun(pinned.slug, prompt)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-flame text-white text-[12.5px] font-medium hover:opacity-90"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Run now
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="h-8 px-3 rounded-md text-[11.5px] text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

