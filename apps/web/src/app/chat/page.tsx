'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Markdown } from '../../components/markdown';
import { Send, MessageSquare } from 'lucide-react';

type Msg = { role: 'user' | 'assistant'; content: string };

function newThreadId() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export default function ChatPage() {
  const qc = useQueryClient();
  const [threadId, setThreadId] = useState<string>('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const [lastMeta, setLastMeta] = useState<{ runId: string; costCents: number; tokensIn?: number; tokensOut?: number } | null>(null);

  useEffect(() => {
    function syncThread() {
      const last = typeof window !== 'undefined' ? localStorage.getItem('bm-last-thread') : null;
      if (last && last !== threadId) loadThread(last);
      else if (!last && !threadId) {
        const id = newThreadId();
        setThreadId(id);
        localStorage.setItem('bm-last-thread', id);
      }
    }
    syncThread();
    window.addEventListener('storage', syncThread);
    window.addEventListener('focus', syncThread);
    const iv = setInterval(syncThread, 1000);
    return () => {
      window.removeEventListener('storage', syncThread);
      window.removeEventListener('focus', syncThread);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  async function loadThread(id: string) {
    try {
      const data = await api.getChat(id);
      setThreadId(data.threadId);
      setMessages(data.messages as Msg[]);
      setLastMeta(null);
    } catch {
      setThreadId(id);
      setMessages([]);
      setLastMeta(null);
    }
  }

  const [streamingTools, setStreamingTools] = useState<string[]>([]);
  const sendMut = useMutation({
    mutationFn: async (msgs: Msg[]) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
      setStreamingTools([]);
      let assistantText = '';
      let runId = '';
      await api.chatStream(msgs, {
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
            setStreamingTools((t) => [...t, `→ ${data.name}`]);
          } else if (type === 'tool') {
            setStreamingTools((t) => [...t, `✓ ${data.name}`]);
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
            if (!assistantText && data.final) {
              assistantText = String(data.final);
              setMessages((prev) => {
                const copy = prev.slice();
                copy[copy.length - 1] = { role: 'assistant', content: assistantText };
                return copy;
              });
            }
          }
        },
      });
      return { runId, assistantText };
    },
    onSuccess: ({ runId }) => {
      setLastMeta({ runId, costCents: 0 });
      setStreamingTools([]);
      qc.invalidateQueries({ queryKey: ['sidebar-chats'] });
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
    <div className="h-full flex flex-col">
      <header className="px-6 py-3 border-b border-line dark:border-[#2A241D] flex items-center">
        <h1 className="text-base font-semibold text-ink dark:text-[#F5F1EA]">Chat</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <div className="max-w-3xl mx-auto py-10">
            <div className="text-center mb-6">
              <MessageSquare className="w-8 h-8 mx-auto mb-3 text-muted dark:text-[#8C837C] opacity-50" />
              <h2 className="text-base font-semibold text-ink dark:text-[#F5F1EA] mb-1">
                What do you want to do?
              </h2>
              <p className="text-sm text-muted dark:text-[#8C837C]">
                Pick a scenario, edit the <span className="font-mono text-flame">[bracketed]</span> bits, and send. Or just type your own.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                {
                  title: 'High-intent visitor',
                  prompt: 'A visitor from [acme.com] just hit our pricing page twice. Deanonymize the company, qualify against our ICP (from CLAUDE.md), research recent news, and draft a first-touch email to the most likely champion. Save everything under companies/, contacts/, drafts/.',
                },
                {
                  title: 'Lookalike outbound',
                  prompt: 'We just closed-won [acme.com] at $[48000] ACV. Find 25 lookalike companies (industry, size, stack), identify a likely buying committee at each, and draft an outbound sequence that anchors on the Acme outcome. Save to companies/, contacts/, drafts/.',
                },
                {
                  title: 'Closed-lost analysis',
                  prompt: 'The deal at [deals/closed-lost/beta-corp.md] just moved to lost. Pull the full history, analyze why (compare against our last 20 losses), extract any competitor intel, and propose 3 concrete process changes with owners. Append findings to the deal file and draft a Slack-style team post in drafts/.',
                },
                {
                  title: 'Meeting prep',
                  prompt: 'I have a meeting with [jane@acme.com] in 2 hours. Pull everything we know about her + Acme, surface the 3-5 freshest news items, review her engagement with us, and write me a <150-word pre-call brief with agenda, 3 discovery questions, and the trap to avoid. Save to drafts/.',
                },
                {
                  title: 'Pipeline health scan',
                  prompt: 'Scan deals/open/ for stale deals (no activity in [7] days), missing next-steps in proposal+ stages, and at-risk late-stage deals (close date pushed twice+, silent champion, competitor resurfacing). Rank by ARR at risk and propose one concrete recovery action per deal. Notify the owner via a drafts/ Slack DM.',
                },
                {
                  title: 'LinkedIn intent',
                  prompt: 'Someone at [acme.com] just commented on my latest LinkedIn post about [topic]. Enrich the person + company, research what might be driving their engagement, and draft a <=60-word LinkedIn DM that references their comment without being creepy. Save to drafts/.',
                },
                {
                  title: 'Deep research an account',
                  prompt: 'Deep research [acme.com]. Use the deep_research tool to build a 7-section account brief: one-liner + firmographics, last-12mo events, GTM motion, tech stack, likely buying committee, top 3 competitors, and one trigger we can anchor outreach on. Every fact cited with a URL. Save to companies/acme-com.md.',
                },
                {
                  title: 'Create a Playbook',
                  prompt: 'Create a new Playbook called [weekly-competitor-scan] that: lists our 5 key competitors from CLAUDE.md, runs deep_research on each for last-7-day activity (launches, hires, pricing changes, reviews), and saves a consolidated weekly-<date>.md to knowledge/ with callouts for anything we should respond to.',
                },
              ].map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => setInput(s.prompt)}
                  className="text-left p-4 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl hover:border-flame hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-flame" />
                    <span className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA]">{s.title}</span>
                  </div>
                  <div className="text-[11px] text-muted dark:text-[#8C837C] line-clamp-2">
                    {s.prompt.slice(0, 110)}…
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((m, i) => (
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
          ))}
          {sendMut.isPending && messages[messages.length - 1]?.content === '' && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-2xl rounded-bl-sm px-4 py-3 text-sm max-w-[85%] space-y-1.5">
                <div className="flex items-center gap-2 text-muted dark:text-[#8C837C]">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-flame animate-pulse" />
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
        {lastMeta && (
          <div className="max-w-3xl mx-auto mb-2 text-[10px] font-mono text-muted dark:text-[#6B625C] flex items-center gap-3">
            <span>run {lastMeta.runId}</span>
            {lastMeta.tokensIn != null && (
              <span>in {lastMeta.tokensIn} / out {lastMeta.tokensOut}</span>
            )}
            <span>{(lastMeta.costCents / 100).toFixed(2)} USD</span>
          </div>
        )}
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea
            ref={(el) => {
              if (!el) return;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 320) + 'px';
            }}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 320) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Ask the agent… (Shift+Enter for newline)"
            className="flex-1 resize-y bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg px-3 py-2 text-sm leading-5 text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame overflow-y-auto"
            style={{ minHeight: 56, maxHeight: 320 }}
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
