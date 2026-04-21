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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Bot } from 'lucide-react';

import { api } from '../lib/api';
import { Markdown } from './markdown';

export type ChatScenario = { title: string; prompt: string };

type Msg = { role: 'user' | 'assistant'; content: string };

function newThreadId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Render a tool-call line that actually tells the user what is happening.
// Previously we showed "→ list_dir" / "✓ read_file" with no hint about which
// file, URL, or domain the tool was hitting, which looked like the agent was
// churning through opaque work. Pull the most load-bearing argument (path,
// url, domain, query, …) and append it so each line reads like
// "→ read_file companies/apidog.md" instead.
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
  const qc = useQueryClient();
  const [threadId, setThreadId] = useState<string>('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streamingTools, setStreamingTools] = useState<string[]>([]);
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
          return { slug, name };
        }),
      );
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return rows;
    },
    staleTime: 60_000,
  });
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

  const isGlobal = threadKey === 'bm-last-thread';

  useEffect(() => {
    function syncThread() {
      if (typeof window === 'undefined') return;
      const last = localStorage.getItem(threadKey);
      if (last && last !== threadId) loadThread(last);
      else if (!last && !threadId) {
        const id = newThreadId();
        setThreadId(id);
        localStorage.setItem(threadKey, id);
      }
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
  }, [threadId, threadKey, isGlobal]);

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
      setStreamingTools([]);
      let assistantText = '';
      let runId = '';
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
            setStreamingTools((t) => [...t, `→ ${formatToolLine(data)}`]);
          } else if (type === 'tool') {
            setStreamingTools((t) => [...t, `✓ ${formatToolLine(data)}`]);
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
            // Always reconcile the last message to the authoritative final
            // text from the server. Earlier we only filled in when the
            // streamed text was empty, which meant a completion that
            // streamed no text deltas stayed stuck at "(empty)" even
            // though the JSON on disk held the real answer (QA BUG-004).
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
      setStreamingTools([]);
      if (isGlobal) qc.invalidateQueries({ queryKey: ['sidebar-chats'] });
    },
    onError: (e: Error) => {
      setStreamingTools([]);
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

  function send() {
    const text = input.trim();
    if (!text || sendMut.isPending) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
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
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted dark:text-[#8C837C]">
            <Bot className="w-3.5 h-3.5" />
            <select
              value={effectiveAgent ?? ''}
              onChange={(e) => setPickedAgent(e.target.value || undefined)}
              className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-md px-2 py-1 text-[12px] text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
              title="Route this message to a specific agent"
            >
              <option value="">auto (researcher)</option>
              {(agentOptions.data ?? []).map((a) => (
                <option key={a.slug} value={a.slug}>{a.name}</option>
              ))}
            </select>
          </label>
          {headerRight}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && scenarios.length > 0 && (
          <div className="max-w-3xl mx-auto py-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {scenarios.map((s) => (
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
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((m, i) => {
            // Skip the empty placeholder we push at mutation start — the
            // "thinking…" bubble below owns that slot. Otherwise the
            // Markdown renderer shows "(empty)" while tools are still
            // running, right next to "thinking…", and the UI double-renders.
            if (m.role === 'assistant' && !m.content) return null;
            return (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    m.role === 'user'
                      ? 'bg-ink dark:bg-[#3A322A] text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[80%] whitespace-pre-wrap'
                      : 'bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-2xl rounded-bl-sm px-5 py-3 max-w-[85%]'
                  }
                >
                  {m.role === 'user' ? m.content : <Markdown source={m.content} />}
                </div>
              </div>
            );
          })}
          {sendMut.isPending && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-2xl rounded-bl-sm px-4 py-3 text-sm max-w-[85%] space-y-1.5">
                <div className="flex items-center gap-2 text-muted dark:text-[#8C837C]">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-flame" />
                  </span>
                  {streamingTools.length > 0 ? 'working…' : 'thinking…'}
                </div>
                {streamingTools.length > 0 && (
                  <ul className="space-y-0.5 text-[11px] font-mono text-muted dark:text-[#8C837C]">
                    {streamingTools.slice(-6).map((t, i) => (
                      <li key={i} className="truncate">{t}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-line dark:border-[#2A241D] px-6 py-3 bg-cream-light dark:bg-[#17140F]">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Ask the agent… (Shift+Enter for newline)"
            className="flex-1 resize-none bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg px-3 py-2 text-sm leading-5 text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
            style={{ minHeight: 40, maxHeight: 320 }}
          />
          <button
            onClick={send}
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
