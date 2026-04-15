'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Send,
  Zap,
  History,
  Plug,
  Settings as SettingsIcon,
  Sun,
  Moon,
  ChevronDown,
  ChevronRight,
  Network,
  FolderTree,
  Building2,
  Users,
  Briefcase,
  Bot,
  BookOpen,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// Chat is the primary surface. Everything else is management:
//   - things the user needs to review (drafts / runs / integrations / settings)
//   - things they occasionally tune (triggers = remote crontab)
// Power-user views (Vault / Ontology / Companies / Contacts / Deals / Agents /
// Playbooks) sit behind a collapsed "Advanced" group.
const PRIMARY_MANAGE = [
  { href: '/outreach', label: 'Outreach', icon: Send, desc: 'Draft queue' },
  { href: '/triggers', label: 'Triggers', icon: Zap, desc: 'Schedules' },
  { href: '/runs', label: 'Runs', icon: History, desc: 'History' },
  { href: '/integrations', label: 'Integrations', icon: Plug, desc: 'Connect tools' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

const ADVANCED = [
  { href: '/vault', label: 'Vault', icon: FolderTree },
  { href: '/ontology', label: 'Ontology', icon: Network },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/playbooks', label: 'Playbooks', icon: BookOpen },
];

function newThreadId() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function Sidebar() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const qc = useQueryClient();

  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('bm-theme');
    const initial = stored === 'dark' || (stored == null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(initial);
    document.documentElement.classList.toggle('dark', initial);
  }, []);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('bm-theme', next ? 'dark' : 'light');
  }

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeThread, setActiveThread] = useState<string>('');

  useEffect(() => {
    // Poll localStorage for the chat page's active thread so the sidebar
    // can highlight it. Cheap enough; happens once per render cycle.
    const t = localStorage.getItem('bm-last-thread') ?? '';
    setActiveThread(t);
  }, [pathname]);

  const threads = useQuery({
    queryKey: ['sidebar-chats'],
    queryFn: api.listChats,
    refetchInterval: 4_000,
  });

  const onChatPage = pathname === '/';

  function startNewThread() {
    const id = newThreadId();
    localStorage.setItem('bm-last-thread', id);
    setActiveThread(id);
    router.push('/');
  }

  function openThread(id: string) {
    localStorage.setItem('bm-last-thread', id);
    setActiveThread(id);
    router.push('/');
  }

  async function deleteThread(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this chat?')) return;
    try {
      await api.deleteChat(id);
    } catch {}
    // If we deleted the active thread, clear the pointer so the Chat page
    // starts a new one.
    if (activeThread === id) {
      localStorage.removeItem('bm-last-thread');
      setActiveThread('');
    }
    qc.invalidateQueries({ queryKey: ['sidebar-chats'] });
    router.refresh();
  }

  return (
    <aside className="w-[240px] shrink-0 bg-cream-light dark:bg-[#17140F] border-r border-line dark:border-[#2A241D] flex flex-col">
      {/* macOS traffic-light gutter — pt-10 leaves room, the whole band is
          a window-drag region. */}
      <div
        className="pt-10 pb-3 pl-[84px] pr-4 flex items-center gap-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="inline-block w-5 h-5 rounded-full bg-flame shrink-0" />
        <span className="font-semibold tracking-tight text-[14px] text-ink dark:text-[#F5F1EA] truncate">
          Black Magic
        </span>
      </div>

      {/* New chat */}
      <div className="px-3 pb-2">
        <button
          onClick={startNewThread}
          className="w-full h-9 rounded-md bg-flame text-white text-sm font-medium hover:opacity-90 flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> New chat
        </button>
      </div>

      {/* Chat threads (the core surface) */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        <div className="px-2 py-1 text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#6B625C]">
          Chats
        </div>
        {threads.data?.threads?.length === 0 && (
          <div className="px-3 py-6 text-[11px] text-muted dark:text-[#8C837C] text-center">
            no chats yet — start one above
          </div>
        )}
        {threads.data?.threads?.slice(0, 30).map((t) => {
          const active = onChatPage && activeThread === t.threadId;
          return (
            <div
              key={t.threadId}
              onClick={() => openThread(t.threadId)}
              className={clsx(
                'group relative px-3 py-2 rounded-md transition-colors cursor-pointer',
                active
                  ? 'bg-white dark:bg-[#1F1B15] text-ink dark:text-[#F5F1EA]'
                  : 'hover:bg-white dark:hover:bg-[#1F1B15] text-muted dark:text-[#8C837C]',
              )}
            >
              <div className="text-[12px] truncate leading-tight pr-6">
                {t.preview || '(empty)'}
              </div>
              <div className="text-[10px] font-mono opacity-60 mt-0.5">
                {t.count} msgs
              </div>
              <button
                type="button"
                onClick={(e) => deleteThread(t.threadId, e)}
                aria-label="Delete chat"
                className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:text-flame hover:bg-[#E8523A]/10 transition-opacity"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Manage strip */}
      <div className="border-t border-line dark:border-[#2A241D] py-2 px-2">
        {PRIMARY_MANAGE.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors',
                active
                  ? 'bg-white dark:bg-[#1F1B15] text-ink dark:text-[#F5F1EA] font-medium'
                  : 'text-muted dark:text-[#8C837C] hover:bg-white dark:hover:bg-[#1F1B15] hover:text-ink dark:hover:text-[#F5F1EA]',
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-1 w-full flex items-center gap-2 px-3 py-1 text-[11px] uppercase tracking-widest font-mono text-muted dark:text-[#6B625C] hover:text-ink dark:hover:text-[#F5F1EA]"
        >
          {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Advanced
        </button>
        {showAdvanced &&
          ADVANCED.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-2.5 px-6 py-1.5 rounded-md text-[12px] transition-colors',
                  active
                    ? 'bg-white dark:bg-[#1F1B15] text-ink dark:text-[#F5F1EA]'
                    : 'text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]',
                )}
              >
                <Icon className="w-3 h-3 shrink-0 opacity-70" />
                <span>{item.label}</span>
              </Link>
            );
          })}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-line dark:border-[#2A241D] flex items-center justify-between">
        <span className="text-[10px] text-muted dark:text-[#6B625C] font-mono">v0.1.0</span>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="p-1.5 rounded-md text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA] hover:bg-white dark:hover:bg-[#1F1B15]"
        >
          {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>
    </aside>
  );
}
