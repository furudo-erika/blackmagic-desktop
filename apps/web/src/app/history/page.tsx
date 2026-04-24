'use client';

/**
 * /history — chat-thread management page.
 *
 * Replaces the "only view" sidebar collapse with a full list browser.
 * Each row: preview title, agent, updated time, star toggle, delete.
 * Top of page: search box (client-side filter over preview + agent).
 * Starred threads pin to the top regardless of recency.
 *
 * Click a row to open the thread in /chat with the right thread key
 * already restored, so continuation picks up where it left off.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Star, Trash2, MessageSquare } from 'lucide-react';
import { api } from '../../lib/api';
import { PageShell, PageHeader, PageBody } from '../../components/ui/primitives';

function relTime(iso: string): string {
  const d = Date.parse(iso);
  if (!Number.isFinite(d)) return '';
  const s = (Date.now() - d) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString();
}

export default function HistoryPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState('');

  const threads = useQuery({ queryKey: ['chats'], queryFn: api.listChats });

  const starMut = useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      api.setChatStarred(id, starred),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chats'] }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteChat(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chats'] }); },
  });

  const rows = useMemo(() => {
    const list = threads.data?.threads ?? [];
    const filter = q.trim().toLowerCase();
    const filtered = filter
      ? list.filter((t) =>
          (t.preview ?? '').toLowerCase().includes(filter) ||
          (t.agent ?? '').toLowerCase().includes(filter),
        )
      : list;
    // Starred first, then by updatedAt desc.
    return filtered.slice().sort((a, b) => {
      const aS = a.starred ? 1 : 0;
      const bS = b.starred ? 1 : 0;
      if (aS !== bS) return bS - aS;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }, [threads.data, q]);

  function openThread(threadId: string) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('bm-last-thread', threadId);
    }
    router.push('/chat');
  }

  return (
    <PageShell>
      <PageHeader
        title="Chat History"
        subtitle="Search, open, star, or delete any of your past chats."
      />
      <PageBody>
        <div className="max-w-4xl mx-auto w-full">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted dark:text-[#8C837C]" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by prompt or agent…"
              className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg text-[13px] text-ink dark:text-[#E6E0D8] placeholder:text-muted/70 dark:placeholder:text-[#6B625C] focus:outline-none focus:border-flame/60"
            />
          </div>

          <div className="mt-4 text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] flex items-center gap-2">
            <span>{rows.length} threads</span>
            {q && <span className="text-ink/60 dark:text-[#E6E0D8]/60">· filtered by “{q}”</span>}
          </div>

          <ul className="mt-2 divide-y divide-line dark:divide-[#2A241D] border border-line dark:border-[#2A241D] rounded-xl bg-white dark:bg-[#1F1B15] overflow-hidden">
            {rows.length === 0 && (
              <li className="px-5 py-8 text-center text-[13px] text-muted dark:text-[#8C837C]">
                {threads.isLoading ? 'loading…' : 'No threads match.'}
              </li>
            )}
            {rows.map((t) => (
              <li key={t.threadId} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-cream-light dark:hover:bg-[#17140F]">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    starMut.mutate({ id: t.threadId, starred: !t.starred });
                  }}
                  aria-label={t.starred ? 'Unstar' : 'Star'}
                  title={t.starred ? 'Remove star' : 'Star this thread'}
                  className={
                    'shrink-0 p-1 rounded-md hover:bg-white dark:hover:bg-[#1F1B15] ' +
                    (t.starred ? 'text-flame' : 'text-muted/60 dark:text-[#6B625C] hover:text-ink dark:hover:text-[#F5F1EA]')
                  }
                >
                  <Star className={'w-3.5 h-3.5 ' + (t.starred ? 'fill-flame' : '')} />
                </button>

                <button
                  type="button"
                  onClick={() => openThread(t.threadId)}
                  className="flex-1 min-w-0 text-left flex items-center gap-3"
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted dark:text-[#8C837C]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-ink dark:text-[#E6E0D8] truncate">
                      {t.preview || <span className="text-muted dark:text-[#8C837C] italic">(empty)</span>}
                    </div>
                    <div className="text-[10.5px] font-mono text-muted dark:text-[#8C837C] mt-0.5 truncate">
                      {t.agent || 'default'} · {t.count} msg · {relTime(t.updatedAt)}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this chat thread? This cannot be undone.')) {
                      deleteMut.mutate(t.threadId);
                    }
                  }}
                  aria-label="Delete thread"
                  title="Delete thread"
                  className="shrink-0 p-1 rounded-md text-muted/60 dark:text-[#6B625C] hover:text-flame hover:bg-flame/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[11px] text-muted dark:text-[#8C837C]">
            Threads live in <code className="font-mono">chats/</code> inside
            your context. Starred threads pin to the top; stars are stored as{' '}
            <code className="font-mono">starred: true</code> on the thread JSON.
          </p>

          <div className="mt-2">
            <Link
              href="/chat"
              className="text-[12px] text-muted dark:text-[#8C837C] hover:text-flame inline-flex items-center gap-1"
            >
              ← back to chat
            </Link>
          </div>
        </div>
      </PageBody>
    </PageShell>
  );
}
