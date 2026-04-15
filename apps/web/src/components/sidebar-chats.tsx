'use client';

/**
 * SidebarChats — the "Chat" nav row + collapsible recent-thread list.
 * Modelled on paperclip's SidebarProjects / SidebarAgents pattern:
 * a single row with an inline chevron that toggles a gap-0.5 list below.
 *
 * Threads are capped at 8 most-recent. Click = load thread in /. Delete on
 * hover sends DELETE /api/chats/:id. Active thread is mirrored via
 * localStorage('bm-last-thread') — the Chat page writes it; we read + watch.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, MessageSquare, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';

export function newThreadId() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function SidebarChats() {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const qc = useQueryClient();

  const [open, setOpen] = useState(true);
  const [activeThread, setActiveThread] = useState('');
  useEffect(() => {
    const read = () => setActiveThread(localStorage.getItem('bm-last-thread') ?? '');
    read();
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, []);

  const threads = useQuery({
    queryKey: ['sidebar-chats'],
    queryFn: api.listChats,
    refetchInterval: 4_000,
  });
  const recent = (threads.data?.threads ?? []).slice(0, 8);
  const chatActive = pathname === '/';

  function openThread(id: string) {
    localStorage.setItem('bm-last-thread', id);
    setActiveThread(id);
    router.push('/');
  }
  async function deleteThread(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this chat?')) return;
    try {
      await api.deleteChat(id);
    } catch {}
    if (activeThread === id) {
      localStorage.removeItem('bm-last-thread');
      setActiveThread('');
    }
    qc.invalidateQueries({ queryKey: ['sidebar-chats'] });
  }

  return (
    <>
      <div
        className={clsx(
          'flex items-center pl-3 pr-1 text-[13px] font-medium rounded-md transition-colors',
          chatActive
            ? 'bg-white dark:bg-[#1F1B15] text-ink dark:text-[#F5F1EA]'
            : 'text-ink/80 dark:text-[#E6E0D8]/80 hover:bg-white/60 dark:hover:bg-[#1F1B15]/60 hover:text-ink dark:hover:text-[#F5F1EA]',
        )}
      >
        <Link href="/" className="flex items-center gap-2.5 flex-1 min-w-0 py-2">
          <MessageSquare className="w-4 h-4 shrink-0" />
          <span className="flex-1 truncate">Chat</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Hide recent chats' : 'Show recent chats'}
          className="p-1 rounded text-muted/60 dark:text-[#6B625C] hover:text-ink dark:hover:text-[#F5F1EA]"
        >
          {open ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>
      </div>

      {open && recent.length > 0 && (
        <div className="pl-6 pr-1 flex flex-col gap-0.5 mt-0.5">
          {recent.map((t) => {
            const active = activeThread === t.threadId;
            return (
              <div
                key={t.threadId}
                onClick={() => openThread(t.threadId)}
                className={clsx(
                  'group relative px-2 py-1.5 rounded-md cursor-pointer transition-colors',
                  active
                    ? 'bg-white dark:bg-[#1F1B15] text-ink dark:text-[#F5F1EA]'
                    : 'text-muted dark:text-[#8C837C] hover:bg-white/60 dark:hover:bg-[#1F1B15]/60',
                )}
              >
                <div className="text-[12px] truncate leading-tight pr-5">
                  {t.preview || '(empty)'}
                </div>
                <button
                  type="button"
                  onClick={(e) => deleteThread(t.threadId, e)}
                  aria-label="Delete chat"
                  className="absolute top-1.5 right-1.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-flame hover:bg-flame-soft transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {open && recent.length === 0 && (
        <div className="pl-6 pr-1 pt-1 pb-2 text-[11px] text-muted/70 dark:text-[#6B625C]">
          no chats yet
        </div>
      )}
    </>
  );
}
