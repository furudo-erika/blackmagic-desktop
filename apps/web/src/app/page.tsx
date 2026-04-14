'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Send } from 'lucide-react';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [agent, setAgent] = useState('researcher');
  const bottomRef = useRef<HTMLDivElement>(null);

  const sendMut = useMutation({
    mutationFn: (msgs: Msg[]) => api.chat(msgs, agent),
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: data.content || '(no response)' }]);
    },
    onError: (e: Error) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: `error: ${e.message}` }]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sendMut.isPending]);

  function send() {
    const text = input.trim();
    if (!text || sendMut.isPending) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    sendMut.mutate(next);
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Chat</h1>
          <p className="text-xs text-muted">The agent edits files in your vault. Nothing is saved to the cloud.</p>
        </div>
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          className="text-sm bg-white border border-line rounded-md px-3 py-1.5"
        >
          <option value="researcher">researcher</option>
          <option value="sdr">sdr</option>
          <option value="ae">ae</option>
        </select>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <div className="max-w-xl mx-auto text-center py-16 text-muted text-sm">
            <p className="mb-2">Ask the agent to do something in your vault.</p>
            <ul className="space-y-1 text-xs">
              <li>“Enrich acme.com and save to companies/.”</li>
              <li>“List all open deals and flag the stalest.”</li>
              <li>“Draft a first-touch email to <code>contacts/acme/jane-doe.md</code>.”</li>
            </ul>
          </div>
        )}
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  m.role === 'user'
                    ? 'bg-ink text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[80%]'
                    : 'bg-white border border-line rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm max-w-[80%] whitespace-pre-wrap'
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {sendMut.isPending && (
            <div className="flex justify-start">
              <div className="bg-white border border-line rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-muted">
                thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-line px-6 py-4 bg-cream-light">
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
            className="flex-1 resize-none bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-flame"
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
