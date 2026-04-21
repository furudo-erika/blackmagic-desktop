'use client';

/**
 * Sidebar — Multica-inspired slim nav.
 *
 * 0.4.20 rewrite: every section is now collapsible and starts collapsed,
 * so the sidebar opens at 6 rows instead of 14. The old per-agent Team
 * section is gone; entity detail pages (/dashboard, /vault, /automations)
 * are single-tab container pages with sub-nav inside. Collapse state
 * persists per-user in localStorage so the nav remembers what you opened
 * last.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
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

function readCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('bm-sidebar-collapsed');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCollapsed(state: Record<string, boolean>) {
  try { localStorage.setItem('bm-sidebar-collapsed', JSON.stringify(state)); } catch {}
}

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

  // Collapse state per section (all collapsed by default; persisted).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setCollapsed(readCollapsed());
    setHydrated(true);
  }, []);
  function toggleSection(key: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: prev[key] === false ? true : !prev[key] };
      writeCollapsed(next);
      return next;
    });
  }
  // Default-collapsed semantics: missing key = collapsed.
  const isOpen = (key: string) => collapsed[key] === false;

  // Cmd+K command palette (lightweight — jumps between routes).
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
    <aside className="w-[240px] shrink-0 bg-cream-light dark:bg-[#17140F] border-r border-line dark:border-[#2A241D] flex flex-col min-h-0">
      {/* macOS traffic-light gutter — whole band is window-drag. */}
      <div
        className="pt-10 pb-2 pl-[84px] pr-3 flex items-center gap-2 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <img src="/logo.svg" alt="" className="w-5 h-5 shrink-0 dark:invert" />
        <span className="font-semibold tracking-tight text-[14px] text-ink dark:text-[#F5F1EA] truncate">
          BlackMagic AI
        </span>
      </div>

      {/* Project switcher pill */}
      <div className="px-3 pb-2 shrink-0">
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

      {/* Top actions: New chat + Search (⌘K) */}
      <div className="px-2 pb-3 shrink-0 flex flex-col gap-0.5">
        <button
          onClick={startNewThread}
          className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-ink/80 dark:text-[#E6E0D8]/80 hover:bg-white/60 dark:hover:bg-[#1F1B15]/60 hover:text-ink dark:hover:text-[#F5F1EA] rounded-md transition-colors"
        >
          <SquarePen className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left truncate">New chat</span>
          <kbd className="text-[10px] font-mono text-muted/60 dark:text-[#6B625C]">⌘N</kbd>
        </button>
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-ink/80 dark:text-[#E6E0D8]/80 hover:bg-white/60 dark:hover:bg-[#1F1B15]/60 hover:text-ink dark:hover:text-[#F5F1EA] rounded-md transition-colors"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left truncate">Search</span>
          <kbd className="text-[10px] font-mono text-muted/60 dark:text-[#6B625C]">⌘K</kbd>
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 px-2 pb-3">
        <NavGroup
          label="Chat"
          icon={MessageSquare}
          href="/"
          pathname={pathname}
          open={isOpen('chat')}
          onToggle={() => toggleSection('chat')}
          hydrated={hydrated}
        >
          <NavChild label="All chats" href="/" pathname={pathname} exact />
          <NavChild label="Drafts" href="/outreach" pathname={pathname} badge={pendingDraftCount} />
        </NavGroup>

        <NavGroup
          label="Inbox"
          icon={Inbox}
          href="/outreach"
          pathname={pathname}
          open={isOpen('inbox')}
          onToggle={() => toggleSection('inbox')}
          hydrated={hydrated}
          badge={pendingDraftCount}
        >
          <NavChild label="Pending drafts" href="/outreach" pathname={pathname} />
        </NavGroup>

        <NavGroup
          label="Dashboard"
          icon={LayoutDashboard}
          href="/dashboard"
          pathname={pathname}
          open={isOpen('dashboard')}
          onToggle={() => toggleSection('dashboard')}
          hydrated={hydrated}
        >
          <NavChild label="Overview" href="/dashboard" pathname={pathname} />
          <NavChild label="Runs" href="/runs" pathname={pathname} />
        </NavGroup>

        <NavGroup
          label="Vault"
          icon={FolderKanban}
          href="/vault"
          pathname={pathname}
          open={isOpen('vault')}
          onToggle={() => toggleSection('vault')}
          hydrated={hydrated}
        >
          <NavChild label="Companies" href="/companies" pathname={pathname} />
          <NavChild label="Contacts" href="/contacts" pathname={pathname} />
          <NavChild label="Deals" href="/deals" pathname={pathname} />
          <NavChild label="Files" href="/vault" pathname={pathname} />
        </NavGroup>

        <NavGroup
          label="Automations"
          icon={Zap}
          href="/automations"
          pathname={pathname}
          open={isOpen('automations')}
          onToggle={() => toggleSection('automations')}
          hydrated={hydrated}
        >
          <NavChild label="Skills" href="/playbooks" pathname={pathname} />
          <NavChild label="Triggers" href="/triggers" pathname={pathname} />
          <NavChild label="GEO" href="/geo" pathname={pathname} />
          <NavChild label="Runs" href="/runs" pathname={pathname} />
        </NavGroup>

        <NavGroup
          label="Settings"
          icon={SettingsIcon}
          href="/settings"
          pathname={pathname}
          open={isOpen('settings')}
          onToggle={() => toggleSection('settings')}
          hydrated={hydrated}
        >
          <NavChild label="General" href="/settings" pathname={pathname} />
          <NavChild label="Integrations" href="/integrations" pathname={pathname} />
        </NavGroup>
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

// ---------------------------------------------------------------------------
// Group row — clickable to expand/collapse; whole row links to the "home" of
// the section. Row click toggles; chevron is decorative. Active styling when
// the current pathname is in the section tree.
// ---------------------------------------------------------------------------
function NavGroup({
  label,
  icon: Icon,
  href,
  pathname,
  open,
  onToggle,
  hydrated,
  badge,
  children,
}: {
  label: string;
  icon: LucideIcon;
  href: string;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  hydrated: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  const isInSection = pathname === href || pathname.startsWith(href + '/');
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={
          'w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium rounded-md transition-colors ' +
          (isInSection
            ? 'bg-white dark:bg-[#1F1B15] text-ink dark:text-[#F5F1EA]'
            : 'text-ink/80 dark:text-[#E6E0D8]/80 hover:bg-white/60 dark:hover:bg-[#1F1B15]/60 hover:text-ink dark:hover:text-[#F5F1EA]')
        }
      >
        <Chevron className="w-3 h-3 shrink-0 text-muted/70 dark:text-[#6B625C]" />
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">{label}</span>
        {badge != null && badge > 0 && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium bg-flame text-white">
            {badge}
          </span>
        )}
      </button>
      {hydrated && open && <div className="ml-5 mt-0.5 flex flex-col gap-0.5 pl-2 border-l border-line/60 dark:border-[#2A241D]/60">{children}</div>}
    </div>
  );
}

function NavChild({
  label,
  href,
  pathname,
  exact,
  badge,
}: {
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
        'flex items-center gap-2 pl-2 pr-3 py-1.5 text-[12.5px] rounded-md transition-colors ' +
        (isActive
          ? 'text-ink dark:text-[#F5F1EA] bg-white/80 dark:bg-[#1F1B15]/80'
          : 'text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]')
      }
    >
      <span className="flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium bg-flame text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Minimal ⌘K palette — jumps between routes. Not a full search index; the
// plan for batch 2 is to also index Companies / Contacts / Deals / Drafts
// results from the daemon so the palette becomes global search.
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
