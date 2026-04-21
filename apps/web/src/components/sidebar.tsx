'use client';

/**
 * Sidebar — Multica-inspired slim flat nav.
 *
 * 0.4.21: the 0.4.20 rewrite with six collapsible category buttons was
 * overkill — Multica uses a flat list with subtle section labels, not
 * chevron-nested trees. Each top-level item now routes directly; any
 * sub-nav lives inside the destination page (tabs on /vault,
 * /automations, etc), not in the sidebar.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sun,
  SquarePen,
  Sparkles,
  FolderKanban,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';

function newThreadId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname() || '/';

  // Theme ------------------------------------------------------------------
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('bm-theme');
    const initial = stored !== 'light';
    setDark(initial);
    document.documentElement.classList.toggle('dark', initial);
  }, []);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('bm-theme', next ? 'dark' : 'light');
  }

  // Project switcher -------------------------------------------------------
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const activeProject = projects.data?.projects.find((p) => p.id === projects.data?.active);
  function openProjectPicker() {
    window.dispatchEvent(new Event('bm:open-project-picker'));
  }

  // Live counts ------------------------------------------------------------
  const drafts = useQuery({
    queryKey: ['drafts'],
    queryFn: api.listDrafts,
    refetchInterval: 30_000,
  });
  const pendingDraftCount = useMemo(() => {
    const list = drafts.data?.drafts ?? [];
    return list.filter((d) => (d.status ?? 'pending') === 'pending').length;
  }, [drafts.data]);

  const health = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 });

  // Cmd+K command palette
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function startNewThread() {
    const id = newThreadId();
    localStorage.setItem('bm-last-thread', id);
    router.push('/');
  }

  return (
    <aside className="w-[220px] shrink-0 bg-cream-light dark:bg-[#17140F] border-r border-line dark:border-[#2A241D] flex flex-col min-h-0">
      {/* macOS traffic-light gutter */}
      <div
        className="pt-10 pb-2 pl-[84px] pr-3 flex items-center gap-2 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <img src="/logo.svg" alt="" className="w-5 h-5 shrink-0 dark:invert" />
        <span className="font-semibold tracking-tight text-[14px] text-ink dark:text-[#F5F1EA] truncate">
          BlackMagic AI
        </span>
      </div>

      {/* Project switcher */}
      <div className="px-2 pb-1.5 shrink-0">
        <button
          type="button"
          onClick={openProjectPicker}
          title={activeProject?.path || 'Switch project'}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white dark:hover:bg-[#1F1B15] text-left group"
        >
          <div className="w-4 h-4 rounded-sm bg-flame shrink-0" aria-hidden />
          <span className="flex-1 text-[13px] font-semibold text-ink dark:text-[#F5F1EA] truncate">
            {activeProject?.name ?? 'Select project'}
          </span>
          <ChevronDown className="w-3 h-3 text-muted/70 dark:text-[#6B625C] shrink-0" />
        </button>
      </div>

      {/* Flat nav — six rows. No collapse, no chevrons. Inner sub-navigation
          lives on each destination page (tabs on /vault, /automations). */}
      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 px-2 pb-3 pt-1">
        <ActionRow
          icon={SquarePen}
          label="New chat"
          kbd="⌘N"
          onClick={startNewThread}
        />
        <ActionRow
          icon={Search}
          label="Search"
          kbd="⌘K"
          onClick={() => setPaletteOpen(true)}
        />

        <div className="h-px bg-line dark:bg-[#2A241D] my-2 mx-2" />

        <NavRow icon={MessageSquare} label="Chat" href="/" pathname={pathname} exact />
        <NavRow icon={Inbox}          label="Inbox" href="/outreach" pathname={pathname} badge={pendingDraftCount} />
        <NavRow icon={LayoutDashboard}label="Dashboard" href="/dashboard" pathname={pathname} />
        <NavRow icon={FolderKanban}   label="Vault" href="/vault" pathname={pathname} />
        <NavRow icon={Zap}            label="Automations" href="/automations" pathname={pathname} />
        <NavRow icon={SettingsIcon}   label="Settings" href="/settings" pathname={pathname} />
      </nav>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-line dark:border-[#2A241D] flex items-center justify-between shrink-0">
        <span className="text-[10px] text-muted dark:text-[#6B625C] font-mono">
          v{health.data?.version ?? '…'}
        </span>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="p-1.5 rounded-md text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA] hover:bg-white dark:hover:bg-[#1F1B15]"
        >
          {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>

      {paletteOpen && (
        <CommandPalette
          query={paletteQuery}
          setQuery={setPaletteQuery}
          onClose={() => { setPaletteOpen(false); setPaletteQuery(''); }}
          onGo={(href) => { setPaletteOpen(false); setPaletteQuery(''); router.push(href); }}
        />
      )}
    </aside>
  );
}

function NavRow({
  icon: Icon,
  label,
  href,
  pathname,
  exact,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  href: string;
  pathname: string;
  exact?: boolean;
  badge?: number;
}) {
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
  return (
    <Link
      href={href}
      className={
        'flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-md transition-colors ' +
        (isActive
          ? 'bg-white dark:bg-[#1F1B15] text-ink dark:text-[#F5F1EA] font-medium'
          : 'text-ink/80 dark:text-[#E6E0D8]/80 hover:bg-white/60 dark:hover:bg-[#1F1B15]/60 hover:text-ink dark:hover:text-[#F5F1EA]')
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium bg-flame text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

function ActionRow({
  icon: Icon,
  label,
  kbd,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  kbd: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink/80 dark:text-[#E6E0D8]/80 hover:bg-white/60 dark:hover:bg-[#1F1B15]/60 hover:text-ink dark:hover:text-[#F5F1EA] rounded-md transition-colors"
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 text-left truncate">{label}</span>
      <kbd className="text-[10px] font-mono text-muted/60 dark:text-[#6B625C]">{kbd}</kbd>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ⌘K palette — jumps between routes.
// ---------------------------------------------------------------------------
function CommandPalette({
  query,
  setQuery,
  onClose,
  onGo,
}: {
  query: string;
  setQuery: (s: string) => void;
  onClose: () => void;
  onGo: (href: string) => void;
}) {
  const items = useMemo(
    () => [
      { label: 'Chat', href: '/', hint: 'start a new thread' },
      { label: 'Drafts', href: '/outreach', hint: 'review pending outbound' },
      { label: 'Dashboard', href: '/dashboard', hint: 'runs + cost + activity' },
      { label: 'Runs', href: '/runs', hint: 'agent run history' },
      { label: 'Companies', href: '/companies', hint: 'Vault — companies' },
      { label: 'Contacts', href: '/contacts', hint: 'Vault — contacts' },
      { label: 'Deals', href: '/deals', hint: 'Vault — deals' },
      { label: 'Files', href: '/vault', hint: 'Vault — raw files' },
      { label: 'Skills', href: '/playbooks', hint: 'automations — skills' },
      { label: 'Triggers', href: '/triggers', hint: 'automations — scheduled' },
      { label: 'GEO', href: '/geo', hint: 'automations — GEO dashboard' },
      { label: 'Integrations', href: '/integrations', hint: 'connect third-party tools' },
      { label: 'Settings', href: '/settings', hint: 'vault path, model, keys' },
    ],
    [],
  );
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((i) => i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q))
    : items;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[94vw] bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line dark:border-[#2A241D]">
          <Search className="w-4 h-4 text-muted dark:text-[#8C837C]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) onGo(filtered[0].href);
            }}
            placeholder="Jump to…"
            className="flex-1 bg-transparent text-[14px] text-ink dark:text-[#F5F1EA] focus:outline-none"
          />
          <kbd className="text-[10px] font-mono text-muted dark:text-[#6B625C]">ESC</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-muted dark:text-[#8C837C]">No matches.</div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.href}
                type="button"
                onClick={() => onGo(item.href)}
                className={
                  'w-full text-left px-4 py-2 text-[13px] flex items-center justify-between gap-3 ' +
                  (i === 0
                    ? 'bg-flame/10 text-ink dark:text-[#F5F1EA]'
                    : 'hover:bg-flame/5 text-ink dark:text-[#E6E0D8]')
                }
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 text-muted dark:text-[#8C837C]" />
                  <span className="font-medium truncate">{item.label}</span>
                </span>
                <span className="text-[11px] text-muted dark:text-[#8C837C] truncate">{item.hint}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
