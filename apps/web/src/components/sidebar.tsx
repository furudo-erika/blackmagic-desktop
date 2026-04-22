'use client';

/**
 * Sidebar — Multica-inspired slim flat nav.
 *
 * 0.4.23: Restored the section-headered structure from the original
 * pre-flattening design (WORK / VAULT / SYSTEM), while keeping the
 * Multica-style row styling introduced in 0.4.20. Section labels are
 * plain uppercase tracking-widest mono text — not clickable, no
 * chevrons, just visual anchors. Rationale: the 0.4.21 flat 6-row
 * list hid Companies/Contacts/Deals/Playbooks/Triggers/Runs behind
 * generic "Vault" + "Automations" rows, so finding "what's running"
 * or "the acme contact" took two clicks and a scan. Direct rows
 * scanned by section header is faster for recurring tasks.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Building2,
  ChevronDown,
  FileText,
  History,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Moon,
  Plug,
  Search,
  Settings as SettingsIcon,
  Sun,
  SquarePen,
  Sparkles,
  Users,
  Briefcase,
  Zap,
  Bot,
  Globe,
  Linkedin,
  CalendarClock,
  Copy,
  RotateCcw,
  Activity,
  Radar,
  Send,
  Brain,
  Wrench,
  ChevronRight,
  Search as SearchIcon,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { AgentIcon, hasAgentTheme } from './agent-icon';

// Icon string (from agent frontmatter `icon:`) → lucide component.
// Mirrors the names seeded in daemon/src/vault.ts DEFAULT_AGENTS. Falls
// back to Bot for any unmapped icon.
const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  Globe,
  Linkedin,
  CalendarClock,
  Copy,
  RotateCcw,
  Activity,
  Radar,
  Briefcase,
  Send,
  Search: SearchIcon,
  Sparkles,
};

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

  // Live-run count for the Runs row badge — so you can see at a glance
  // that something is currently working without opening the page.
  const runs = useQuery({
    queryKey: ['runs'],
    queryFn: api.listRuns,
    refetchInterval: 15_000,
  });
  const liveRunCount = useMemo(
    () => (runs.data?.runs ?? []).filter((r) => !r.done).length,
    [runs.data],
  );

  // Team section — read agents/*.md from the vault so the list matches
  // the actual agents seeded in the project (Company Profiler pinned
  // first, then alpha). Hidden while loading so we don't flash a stale
  // list during project switches.
  const teamAgents = useQuery({
    queryKey: ['sidebar-agents'],
    queryFn: async () => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'),
      );
      const rows = await Promise.all(files.map(async (f) => {
        const r = await api.readFile(f.path);
        const fm = r.frontmatter ?? {};
        const slug = f.path.replace(/^agents\//, '').replace(/\.md$/, '');
        const name = typeof fm.name === 'string' ? fm.name : slug;
        const icon = typeof fm.icon === 'string' ? fm.icon : '';
        const pin = typeof fm.pin === 'string' ? fm.pin : '';
        return { slug, name, icon, pin };
      }));
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
  // Slugs of agents that have at least one live run — drives the breathing
  // dot so users see which agent is actually working right now.
  const liveAgentSlugs = useMemo(() => {
    const s = new Set<string>();
    for (const r of runs.data?.runs ?? []) {
      if (!r.done && typeof r.agent === 'string') s.add(r.agent.toLowerCase());
    }
    return s;
  }, [runs.data]);

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

  // Recent chat threads — populates the collapsible Chat section under
  // the main nav. Default collapsed so the sidebar stays compact;
  // expanding lazy-fires the listChats query.
  const [chatExpanded, setChatExpanded] = useState(false);
  const recentChats = useQuery({
    queryKey: ['sidebar-chats'],
    queryFn: api.listChats,
    enabled: chatExpanded,
    refetchInterval: chatExpanded ? 30_000 : false,
  });
  const recentThreads = useMemo(() => {
    return (recentChats.data?.threads ?? [])
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 10);
  }, [recentChats.data]);
  function openThread(threadId: string) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('bm-last-thread', threadId);
    }
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

      {/* Section-headered nav. Labels (WORK/VAULT/SYSTEM) are plain text,
          not buttons — they group the rows underneath visually without
          introducing an extra click. */}
      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 px-2 pb-3 pt-1">
        <ActionRow icon={Search} label="Search" kbd="⌘K" onClick={() => setPaletteOpen(true)} />

        <div className="h-px bg-line dark:bg-[#2A241D] my-2 mx-2" />

        {/* Chat: collapsible row that reveals recent threads. Header
            click navigates to /, chevron toggles the thread list. */}
        <div>
          <div className={
            'flex items-center rounded-md ' +
            (pathname === '/' ? 'bg-white dark:bg-[#1F1B15]' : 'hover:bg-white/60 dark:hover:bg-[#1F1B15]/60')
          }>
            <Link
              href="/"
              className="flex-1 flex items-center gap-2 px-2 py-1.5 text-[13px] text-ink dark:text-[#E6E0D8] min-w-0"
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted dark:text-[#8C837C]" />
              <span className="truncate">Chat</span>
            </Link>
            <button
              type="button"
              onClick={() => setChatExpanded((v) => !v)}
              aria-label={chatExpanded ? 'Collapse chat history' : 'Expand chat history'}
              title={chatExpanded ? 'Hide history' : 'Show history'}
              className="px-1.5 py-1.5 text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]"
            >
              <ChevronDown
                className={'w-3 h-3 transition-transform ' + (chatExpanded ? '' : '-rotate-90')}
              />
            </button>
          </div>
          {chatExpanded && (
            <ul className="ml-5 pl-2 border-l border-line dark:border-[#2A241D] mt-0.5 mb-1 space-y-0.5">
              <li>
                <button
                  type="button"
                  onClick={startNewThread}
                  className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] text-muted dark:text-[#8C837C] hover:text-flame hover:bg-white/60 dark:hover:bg-[#1F1B15]/60"
                >
                  <SquarePen className="w-3 h-3" /> New chat
                </button>
              </li>
              {recentChats.isLoading && (
                <li className="px-2 py-1 text-[11px] text-muted dark:text-[#8C837C]">loading…</li>
              )}
              {!recentChats.isLoading && recentThreads.length === 0 && (
                <li className="px-2 py-1 text-[11px] text-muted dark:text-[#8C837C]">No history yet.</li>
              )}
              {recentThreads.map((t) => (
                <li key={t.threadId}>
                  <button
                    type="button"
                    onClick={() => openThread(t.threadId)}
                    title={t.preview || t.threadId}
                    className="w-full text-left px-2 py-1 rounded-md text-[11.5px] text-ink/80 dark:text-[#E6E0D8] hover:bg-white/60 dark:hover:bg-[#1F1B15]/60 truncate"
                  >
                    {t.preview || '(empty thread)'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <AgentsSidebarRow
          pathname={pathname}
          agents={teamAgents.data ?? []}
          liveSlugs={liveAgentSlugs}
        />
        <NavRow icon={Inbox}           label="Desk"      href="/outreach"  pathname={pathname} badge={pendingDraftCount} />
        <NavRow icon={LayoutDashboard} label="Dashboard" href="/dashboard" pathname={pathname} />
        <NavRow icon={Radar}           label="GEO"       href="/geo"       pathname={pathname} />
        <NavRow icon={Building2}       label="Companies" href="/companies" pathname={pathname} />
        <NavRow icon={Users}           label="Contacts"  href="/contacts"  pathname={pathname} />
        <NavRow icon={Briefcase}       label="Deals"     href="/deals"     pathname={pathname} />
        <NavRow icon={Activity}        label="Activity"  href="/runs"      pathname={pathname} live={liveRunCount} />
        <NavRow icon={Send}            label="Outreach"  href="/sequences" pathname={pathname} />

        <SectionLabel>Intelligence</SectionLabel>
        <KnowledgeSidebarRow pathname={pathname} />
        <NavRow icon={Brain}           label="Memory"    href="/memory"    pathname={pathname} />
        <NavRow icon={BookOpen}        label="Skills"    href="/skills"    pathname={pathname} />
        <NavRow icon={Zap}             label="Triggers"  href="/triggers"  pathname={pathname} />
        <NavRow icon={Wrench}          label="Tools"     href="/integrations" pathname={pathname} />
        <NavRow icon={Sparkles}        label="Ontology"  href="/ontology"  pathname={pathname} />
        <NavRow icon={FileText}        label="Files"     href="/vault"     pathname={pathname} />

        <SectionLabel>Other</SectionLabel>
        <NavRow icon={SettingsIcon} label="Account" href="/settings" pathname={pathname} />
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-widest font-mono text-muted/70 dark:text-[#6B625C]/80 select-none">
      {children}
    </div>
  );
}

// Expandable Agents row — header routes to /agents (which redirects
// to your last-picked agent), chevron reveals every agent in the
// vault. Click any sub-row to open a full-screen chat with that
// agent. Auto-expands when you're inside /agents/*.
function AgentsSidebarRow({
  pathname,
  agents,
  liveSlugs,
}: {
  pathname: string;
  agents: Array<{ slug: string; name: string; icon: string }>;
  liveSlugs: Set<string>;
}) {
  const inside = pathname.startsWith('/agents');
  const search = useSearchParams();
  const activeSlug = search.get('slug') ?? '';
  const [open, setOpen] = useState<boolean>(inside);
  useEffect(() => { if (inside) setOpen(true); }, [inside]);
  return (
    <div>
      <div
        className={
          'flex items-center rounded-md ' +
          (inside ? 'bg-white dark:bg-[#1F1B15]' : 'hover:bg-white/60 dark:hover:bg-[#1F1B15]/60')
        }
      >
        <Link
          href="/agents"
          className="flex-1 flex items-center gap-2 px-2 py-1.5 text-[13px] text-ink dark:text-[#E6E0D8] min-w-0"
        >
          <Bot className="w-3.5 h-3.5 shrink-0 text-muted dark:text-[#8C837C]" />
          <span className="truncate">Agents</span>
          {liveSlugs.size > 0 && (
            <span className="ml-auto text-[10px] font-mono text-flame">{liveSlugs.size}</span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Collapse Agents' : 'Expand Agents'}
          className="px-1.5 py-1.5 text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]"
        >
          <ChevronRight className={'w-3 h-3 transition-transform ' + (open ? 'rotate-90' : '')} />
        </button>
      </div>
      {open && (
        <ul className="ml-5 pl-2 border-l border-line dark:border-[#2A241D] mt-0.5 mb-1 space-y-0.5">
          {agents.length === 0 && (
            <li className="px-2 py-1 text-[11px] text-muted dark:text-[#8C837C]">no agents</li>
          )}
          {agents.map((a) => {
            const FallbackIcon = AGENT_ICON_MAP[a.icon] ?? Bot;
            const active = inside && activeSlug === a.slug;
            const isLive = liveSlugs.has(a.slug.toLowerCase());
            return (
              <li key={a.slug}>
                <Link
                  href={`/agents?slug=${encodeURIComponent(a.slug)}`}
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.localStorage.setItem('bm-last-agent', a.slug);
                    }
                  }}
                  className={
                    'flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] truncate ' +
                    (active
                      ? 'bg-white dark:bg-[#1F1B15] text-ink dark:text-[#F5F1EA] font-semibold'
                      : 'text-ink/80 dark:text-[#E6E0D8] hover:bg-white/60 dark:hover:bg-[#1F1B15]/60')
                  }
                >
                  {hasAgentTheme(a.slug) ? (
                    <AgentIcon slug={a.slug} name={a.name} size="sm" className="!w-4 !h-4" />
                  ) : (
                    <FallbackIcon className={'w-3 h-3 shrink-0 ' + (active ? 'text-flame' : 'text-muted dark:text-[#8C837C]')} />
                  )}
                  <span className="truncate flex-1">{a.name}</span>
                  {isLive && (
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-flame" />
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Expandable Knowledge row — header navigates to /knowledge, chevron
// reveals the four sub-tabs (General / ICPs / Funnel / Tags). Auto-
// expands when you're already inside any /knowledge route.
function KnowledgeSidebarRow({ pathname }: { pathname: string }) {
  const inside = pathname.startsWith('/knowledge');
  const [open, setOpen] = useState<boolean>(inside);
  useEffect(() => { if (inside) setOpen(true); }, [inside]);
  const subs = [
    { href: '/knowledge', label: 'General' },
    { href: '/knowledge/icps', label: 'ICPs' },
    { href: '/knowledge/funnel', label: 'Funnel' },
    { href: '/knowledge/tags', label: 'Tags' },
  ];
  return (
    <div>
      <div
        className={
          'flex items-center rounded-md ' +
          (inside ? 'bg-white dark:bg-[#1F1B15]' : 'hover:bg-white/60 dark:hover:bg-[#1F1B15]/60')
        }
      >
        <Link
          href="/knowledge"
          className="flex-1 flex items-center gap-2 px-2 py-1.5 text-[13px] text-ink dark:text-[#E6E0D8] min-w-0"
        >
          <BookOpen className="w-3.5 h-3.5 shrink-0 text-muted dark:text-[#8C837C]" />
          <span className="truncate">Knowledge</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Collapse Knowledge' : 'Expand Knowledge'}
          className="px-1.5 py-1.5 text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]"
        >
          <ChevronRight className={'w-3 h-3 transition-transform ' + (open ? 'rotate-90' : '')} />
        </button>
      </div>
      {open && (
        <ul className="ml-5 pl-2 border-l border-line dark:border-[#2A241D] mt-0.5 mb-1 space-y-0.5">
          {subs.map((s) => {
            const active = pathname === s.href;
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className={
                    'block px-2 py-1 rounded-md text-[11.5px] truncate ' +
                    (active
                      ? 'text-flame font-semibold'
                      : 'text-ink/80 dark:text-[#E6E0D8] hover:bg-white/60 dark:hover:bg-[#1F1B15]/60')
                  }
                >
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NavRow({
  icon: Icon,
  label,
  href,
  pathname,
  exact,
  badge,
  live,
  breathing,
}: {
  icon: LucideIcon;
  label: string;
  href: string;
  pathname: string;
  exact?: boolean;
  badge?: number;
  live?: number;
  breathing?: boolean;
}) {
  // Team rows use /team?slug=X so the bare pathname match won't hit.
  // Match the slug query segment for that case.
  const isActive = (() => {
    if (exact) return pathname === href;
    if (href.startsWith('/team?')) {
      const slug = new URL(href, 'http://x').searchParams.get('slug');
      if (typeof window !== 'undefined' && slug) {
        const cur = new URL(window.location.href).searchParams.get('slug');
        return pathname.startsWith('/team') && cur === slug;
      }
      return false;
    }
    return pathname === href || pathname.startsWith(href + '/');
  })();
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
      <span className="relative shrink-0">
        <Icon className="w-4 h-4" />
        {breathing && (
          <span className="absolute -right-0.5 -top-0.5 flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-flame" />
          </span>
        )}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {live != null && live > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-flame">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-flame" />
          </span>
          {live}
        </span>
      )}
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
      { label: 'Agents', href: '/agents', hint: 'all agents in this project' },
      { label: 'Triggers', href: '/triggers', hint: 'automations — scheduled' },
      { label: 'Ontology', href: '/ontology', hint: 'vault graph' },
      { label: 'GEO', href: '/geo', hint: 'dashboard — GEO tab' },
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
