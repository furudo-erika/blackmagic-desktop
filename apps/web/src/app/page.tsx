'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Markdown } from '../components/markdown';
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

  // Sync thread with sidebar: read localStorage both on mount and on focus.
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
      // Append a placeholder assistant bubble we'll mutate as deltas arrive.
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
      <header className="px-6 py-4 border-b border-line dark:border-[#2A241D] flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink dark:text-[#F5F1EA]">Chat</h1>
          <p className="text-xs text-muted dark:text-[#8C837C]">
            {threadId && <>Thread <code className="text-[11px]">{threadId}</code> · </>}
            Vault stays local. Only LLM prompts leave.
          </p>
        </div>
        <div className="text-[11px] font-mono text-muted dark:text-[#8C837C]">
          gpt-5.3
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <div className="max-w-xl mx-auto text-center py-16 text-muted dark:text-[#8C837C] text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="mb-2">Ask the agent to do something in your vault.</p>
            <ul className="space-y-1 text-xs">
              <li>&ldquo;Enrich acme.com and save to companies/.&rdquo;</li>
              <li>&ldquo;List all open deals and flag the stalest.&rdquo;</li>
              <li>&ldquo;Draft a first-touch email to contacts/acme/jane-doe.md.&rdquo;</li>
            </ul>
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
              <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-muted dark:text-[#8C837C]">
                {streamingTools.length > 0 ? streamingTools.slice(-1)[0] : 'thinking…'}
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Ask the agent…"
            className="flex-1 resize-none bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg px-3 py-2 text-sm text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
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
