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
  Send, Bot, Check, Loader2, AlertCircle, Copy as CopyIcon, Sparkles,
  // Per-agent icons — matches the slugs seeded in daemon/src/context.ts.
  Search, Briefcase, Globe, Linkedin, CalendarClock, Copy as CopyTwin, RotateCcw,
  Activity, Radar, type LucideIcon,
} from 'lucide-react';

import { api } from '../lib/api';
import { Markdown } from './markdown';
import { AgentIcon } from './agent-icon';
import { Composer } from './composer';

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
// Mirrors daemon/src/context.ts DEFAULT_AGENTS where each agent ships an
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
  'content-studio':      'text-pink-400',
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

  // Home page composer hands off via `bm-pending-prompt` localStorage.
  // Pull it on mount and auto-send — the user already pressed Send on
  // the home composer, so stopping at a prefilled input and making
  // them press Send *again* felt broken (see bug report 0.4.49). The
  // value is captured into a stable pendingAutoSend ref and consumed
  // once the chat is fully mounted (thread hydrated, sendMut ready).
  const pendingAutoSendRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pending = window.localStorage.getItem('bm-pending-prompt');
    if (pending) {
      window.localStorage.removeItem('bm-pending-prompt');
      pendingAutoSendRef.current = pending;
    }
  }, []);

  // Mirrors sendMut.isPending into a ref so the 1s sync interval can
  // check it from inside its stale closure. See the detailed comment
  // on the syncThread effect below.
  const sendPendingRef = useRef(false);

  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  // Agent picker — lets the user swap the routing agent inside Chat
  // instead of having to open /team?slug=X first. When the parent
  // passes an `agent` prop (e.g. from a deep link) we initialize with
  // that, but still let the user change it for this thread.
  const [pickedAgent, setPickedAgent] = useState<string | undefined>(agent);

  useEffect(() => { setPickedAgent(agent); }, [agent]);
  const effectiveAgent = pickedAgent ?? agent;
  const agentOptions = useQuery({
    queryKey: ['chat-agent-options'],
    queryFn: async () => {
      const tree = await api.contextTree();
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
  // pull that agent's starter_prompts from its context file and surface them
  // as click-to-run scenario cards. Falls back to a single "Run X end-to-
  // end" starter so every agent has at least one obvious move.
  const derivedScenarios: ChatScenario[] = (() => {
    if (scenarios.length > 0) return scenarios;
    if (!effectiveAgent) return [];
    const a = agentOptions.data?.find((x) => x.slug === effectiveAgent);
    if (!a) return [];
    const starters = Array.isArray(a.starterPrompts) ? a.starterPrompts : [];
    if (starters.length > 0) {
      return starters.map((p) => ({
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

  // When the picker changes which agent routes the conversation, also
  // switch the persisted thread. Each agent keeps its own history under
  // `bm-team-thread-<slug>`, so picking "Deal Manager" here loads that
  // agent's past messages instead of mixing conversations.
  const effectiveThreadKey = pickedAgent
    ? `bm-team-thread-${pickedAgent}`
    : threadKey;
  const isGlobal = effectiveThreadKey === 'bm-last-thread';

  // Refs mirror state for use inside long-lived closures (the 1s sync
  // interval installed below). Without these, the interval captures
  // threadId/sendMut.isPending at effect-setup time (when threadId is
  // '' from the reset above), so every tick it thinks the thread
  // changed and re-loads — which in turn clears messages mid-stream
  // and wipes the in-flight conversation.
  const threadIdRef = useRef(threadId);
  useEffect(() => { threadIdRef.current = threadId; }, [threadId]);

  useEffect(() => {
    function syncThread() {
      if (typeof window === 'undefined') return;
      // Don't re-sync while a send is streaming — loadThread's
      // failure path wipes messages, which would kill the in-flight
      // assistant reply. The multi-tab use case this sync exists
      // for (user switches thread in another window) can safely
      // wait until the current send finishes.
      if (sendPendingRef.current) return;
      // Home→Chat handoff: when Home's composer hands off via
      // `bm-pending-prompt`, the thread id it wrote is brand-new and
      // has no server-side history. Running loadThread anyway races
      // with the auto-send's optimistic setMessages and wipes the
      // user message (the "first send shows empty" bug). Skip the
      // fetch while a handoff is pending; auto-send will populate
      // the thread from scratch.
      if (pendingAutoSendRef.current) return;
      const last = localStorage.getItem(effectiveThreadKey);
      if (last && last !== threadIdRef.current) loadThread(last);
      else if (!last && !threadIdRef.current) {
        const id = newThreadId();
        setThreadId(id);
        localStorage.setItem(effectiveThreadKey, id);
      }
    }
    // Reset visible state when threadKey changes so stale messages from
    // the previous agent don't flash before the new thread loads. Skip
    // the reset during a home handoff so the optimistic user message
    // from auto-send isn't wiped — and pick up the fresh thread id
    // Home just wrote so sendMut posts to the right thread.
    if (!pendingAutoSendRef.current) {
      setThreadId('');
      setMessages([]);
    } else if (typeof window !== 'undefined') {
      const preset = localStorage.getItem(effectiveThreadKey);
      if (preset) setThreadId(preset);
    }
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
      setMessages(Array.isArray(data.messages) ? (data.messages as Msg[]) : []);
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

  useEffect(() => {
    sendPendingRef.current = sendMut.isPending;
  }, [sendMut.isPending]);

  function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || sendMut.isPending) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    if (!override) setInput('');
    sendMut.mutate(next);
  }

  // Consume the pending home-page prompt once the component is fully
  // mounted and idle. Deferred to an effect so it runs after thread
  // hydration (which may setMessages([]) on mount) settles.
  useEffect(() => {
    const pending = pendingAutoSendRef.current;
    if (!pending) return;
    if (sendMut.isPending) return;
    pendingAutoSendRef.current = null;
    // One tick of defer lets loadThread's setMessages([]) commit first,
    // otherwise the user message gets wiped and the gallery sticks
    // around next to the Thinking... bubble (the original bug).
    const t = setTimeout(() => send(pending), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveThreadKey]);

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
          {headerRight}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && !sendMut.isPending && (
          <div className="max-w-5xl mx-auto py-6 space-y-8">
            {/* Onboarding nudge moved to a global app-shell banner
                (see components/onboarding-banner.tsx) so it shows up
                regardless of which page the user lands on, not just the
                empty-state of /. */}

            {/* Agents gallery removed — picker is now the pill inside
                the composer footer. Empty state stays clean: just the
                starter prompts for the currently-selected agent. */}

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

      <div className="border-t border-line dark:border-[#2A241D] px-6 py-4 bg-cream-light dark:bg-[#17140F]">
        <div className="max-w-3xl mx-auto">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={(text) => send(text)}
            agents={(agentOptions.data ?? []).map((a) => ({ slug: a.slug, name: a.name, tagline: a.tagline }))}
            agentSlug={effectiveAgent}
            onAgentChange={(slug) => setPickedAgent(slug)}
            onSlashCommand={(action) => {
              if (action === 'clear') {
                setMessages([]);
                setInput('');
              } else if (action === 'skills') {
                router.push('/skills');
              }
            }}
            disabled={sendMut.isPending}
          />
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onboarding banner — promotes the Company Profiler above the agent gallery
// with a one-click "Run now" CTA. Dismissed state persists per-context in
// localStorage so it doesn't badger the user after they've profiled once.
// Renders only when:
//   - a `pin: first` agent exists in the context (Company Profiler by
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
    `You are the ${pinned.name}. Profile my company end-to-end — crawl the domain + docs, infer the ICP, competitors, voice, and populate the \`us/\` tree. This is the first thing to run on a fresh context; every other agent reads from \`us/\` so this kicks everything off.`;
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

