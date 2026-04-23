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
  Moon,
  Plug,
  Search,
  Settings as SettingsIcon,
  Sun,
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
  Workflow,
  Send,
  Wrench,
  ChevronRight,
  Search as SearchIcon,
  Target,
  MessageCircle,
  Eye,
  UserPlus,
  CreditCard,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { api, type Project } from '../lib/api';

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
  Target,
  MessageCircle,
  Eye,
  UserPlus,
};

// Per-slug override when the frontmatter `icon:` is missing or wrong.
// Ensures every seeded agent shows a distinct, thematic Lucide glyph
// in the sidebar rather than defaulting to a generic Bot.
const AGENT_SLUG_ICON: Record<string, LucideIcon> = {
  'company-profiler':    Sparkles,
  'researcher':          SearchIcon,
  'sdr':                 Send,
  'ae':                  Briefcase,
  'website-visitor':     Globe,
  'linkedin-outreach':   Linkedin,
  'meeting-prep':        CalendarClock,
  'lookalike-discovery': Copy,
  'closed-lost-revival': RotateCcw,
  'pipeline-ops':        Activity,
  'geo-analyst':         Radar,
  'outbound':            Target,
  'brand-monitor':       Eye,
  'content-studio':      Sparkles,
  'x-account':           MessageCircle,
};

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

  return (
    <aside className="w-[220px] shrink-0 bg-cream-light dark:bg-[#17140F] border-r border-line dark:border-[#2A241D] flex flex-col min-h-0">
      {/* macOS traffic-light gutter */}
      <div
        className="pt-10 pb-2 pl-[84px] pr-3 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />


      {/* Project switcher */}
      <div className="px-2 pb-1.5 shrink-0">
        <button
          type="button"
          onClick={openProjectPicker}
          title={activeProject?.path || 'Switch project'}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white dark:hover:bg-[#1F1B15] text-left group"
        >
          <ProjectTile project={activeProject ?? null} />
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
        <NavRow icon={LayoutDashboard} label="Home" href="/" pathname={pathname} exact />
        <ActionRow icon={Search} label="Search" kbd="⌘K" onClick={() => setPaletteOpen(true)} />

        <div className="h-px bg-line dark:bg-[#2A241D] my-2 mx-2" />

        {/* Chat row removed — Home page Composer is the default entry
            point, and the Agents section below owns per-agent threads.
            The /chat route still works by direct URL. */}

        <AgentsSidebarRow
          pathname={pathname}
          agents={teamAgents.data ?? []}
          liveSlugs={liveAgentSlugs}
        />
        <NavRow icon={Zap}             label="Triggers"  href="/triggers"  pathname={pathname} />
        <HistorySidebarRow pathname={pathname} router={router} />

        <SectionLabel>Data</SectionLabel>
        <NavRow icon={Building2}       label="Companies" href="/companies" pathname={pathname} />
        <NavRow icon={Users}           label="Contacts"  href="/contacts"  pathname={pathname} />
        <NavRow icon={Briefcase}       label="Deals"     href="/deals"     pathname={pathname} />
        <NavRow icon={Workflow}        label="Pipeline"  href="/pipeline"  pathname={pathname} />
        <NavRow icon={Radar}           label="GEO"       href="/geo"       pathname={pathname} />
        <KnowledgeSidebarRow pathname={pathname} />
        <NavRow icon={Send}            label="Sequences" href="/sequences" pathname={pathname} />

        <div className="h-px bg-line dark:bg-[#2A241D] my-2 mx-2" />

        <NavRow icon={Inbox}           label="Desk"         href="/outreach"     pathname={pathname} badge={pendingDraftCount} />
        <NavRow icon={Wrench}          label="Integrations" href="/integrations" pathname={pathname} />
        <SettingsSidebarRow pathname={pathname} />

        {/* Mechanism pages (Memory / Skills / Ontology / Files) removed
            from the top-level sidebar — agents use them internally and
            most users never need to open them. Still reachable by
            direct URL (/memory, /skills, /ontology, /vault) and via
            ⌘K command palette. */}
      </nav>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-line dark:border-[#2A241D] shrink-0">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="" className="w-5 h-5 shrink-0 dark:invert" />
          <span className="font-semibold tracking-tight text-[13px] text-ink dark:text-[#F5F1EA] shrink-0">
            BlackMagic AI
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="ml-auto p-1.5 rounded-md text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA] hover:bg-white dark:hover:bg-[#1F1B15]"
          >
            {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="text-[10px] text-muted dark:text-[#6B625C] font-mono pl-7 -mt-0.5">
          v{health.data?.version ?? '…'}
        </div>
        <CreditsPill />
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

// Credit balance pill — polls /api/plan every 60s. Red when out of
// credits (<=0), amber when low (<=10% of the plan quota), neutral
// otherwise. Clicking opens the web billing page so the user can top
// up without leaving their flow. Hidden while unsigned-in (the
// endpoint 401s and we don't want to nag on the login screen).
function CreditsPill() {
  const plan = useQuery({
    queryKey: ['bm-plan'],
    queryFn: api.plan,
    refetchInterval: 60_000,
    retry: false,
  });
  const data = plan.data;
  if (!data) return null;
  const remaining = data.creditsRemaining;
  const quota = data.creditsIncluded || 1;
  const pct = remaining / quota;
  const out = remaining <= 0;
  const low = !out && pct <= 0.1;
  const color = out
    ? 'text-flame bg-flame/10 border-flame/30'
    : low
      ? 'text-[#C77A1F] bg-[#C77A1F]/10 border-[#C77A1F]/30'
      : 'text-muted dark:text-[#8C837C] bg-white/40 dark:bg-[#1F1B15]/60 border-line dark:border-[#2A241D]';
  function openBilling() {
    const url = 'https://blackmagic.engineering/dashboard/billing';
    if (typeof window !== 'undefined' && window.bmBridge?.openExternal) {
      window.bmBridge.openExternal(url);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener');
    }
  }
  return (
    <button
      type="button"
      onClick={openBilling}
      title={out ? 'Out of credits — click to top up' : low ? 'Credits low — top up soon' : 'Open billing'}
      className={
        'mt-1.5 w-full flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10.5px] font-mono ' +
        color
      }
    >
      <CreditCard className="w-3 h-3 shrink-0" />
      <span className="truncate flex-1 text-left">
        {out ? 'Out of credits' : `${remaining.toLocaleString()} credits`}
      </span>
      {(out || low) && <span className="shrink-0 uppercase tracking-wider">top up</span>}
    </button>
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
  // Agents are the product's first-class citizens — default expanded
  // so a cold-start user sees the full roster at a glance.
  const [open, setOpen] = useState<boolean>(true);
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
            // Prefer an explicit per-slug Lucide glyph, then the frontmatter
            // icon: field, then a generic Bot. The previous mix of monogram
            // tiles + Lucide icons looked inconsistent in a single list —
            // every row now uses the same visual treatment.
            const Icon =
              AGENT_SLUG_ICON[a.slug] ?? AGENT_ICON_MAP[a.icon] ?? Bot;
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
                  <Icon className={'w-3.5 h-3.5 shrink-0 ' + (active ? 'text-flame' : 'text-muted dark:text-[#8C837C]')} />
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

// Expandable Settings row — header navigates to /settings (local
// vault/model/keys), sub-row "Billing" opens the web billing page in
// the user's default browser. Billing lives on blackmagic.engineering
// because Stripe secrets can't ship inside the desktop binary. Auto-
// expands while inside /settings.
function SettingsSidebarRow({ pathname }: { pathname: string }) {
  const inside = pathname.startsWith('/settings');
  const [open, setOpen] = useState<boolean>(inside);
  useEffect(() => { if (inside) setOpen(true); }, [inside]);
  function openBilling() {
    const url = 'https://blackmagic.engineering/dashboard/billing';
    if (typeof window !== 'undefined' && window.bmBridge?.openExternal) {
      window.bmBridge.openExternal(url);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener');
    }
  }
  return (
    <div>
      <div
        className={
          'flex items-center rounded-md ' +
          (inside ? 'bg-white dark:bg-[#1F1B15]' : 'hover:bg-white/60 dark:hover:bg-[#1F1B15]/60')
        }
      >
        <Link
          href="/settings"
          className="flex-1 flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink dark:text-[#E6E0D8] min-w-0"
        >
          <SettingsIcon className="w-4 h-4 shrink-0 text-muted dark:text-[#8C837C]" />
          <span className="truncate">Settings</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Collapse Settings' : 'Expand Settings'}
          className="px-1.5 py-1.5 text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]"
        >
          <ChevronRight className={'w-3 h-3 transition-transform ' + (open ? 'rotate-90' : '')} />
        </button>
      </div>
      {open && (
        <ul className="ml-5 pl-2 border-l border-line dark:border-[#2A241D] mt-0.5 mb-1 space-y-0.5">
          <li>
            <button
              type="button"
              onClick={openBilling}
              title="Opens blackmagic.engineering in your browser"
              className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] text-ink/80 dark:text-[#E6E0D8] hover:bg-white/60 dark:hover:bg-[#1F1B15]/60"
            >
              <CreditCard className="w-3.5 h-3.5 shrink-0 text-muted dark:text-[#8C837C]" />
              <span className="truncate flex-1 text-left">Billing</span>
              <ExternalLink className="w-3 h-3 shrink-0 text-muted/70 dark:text-[#6B625C]" />
            </button>
          </li>
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
      { label: 'Pipeline', href: '/pipeline', hint: 'enrich → score → route → CRM sync' },
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

// History — collapsible, Codex-style list of recent chat threads.
// Default collapsed so the sidebar stays compact; expanding triggers
// the listChats query lazily. Click a thread to load it in /chat.
function HistorySidebarRow({
  pathname,
  router,
}: {
  pathname: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [open, setOpen] = useState(false);
  const recent = useQuery({
    queryKey: ['sidebar-history'],
    queryFn: api.listChats,
    enabled: open,
    refetchInterval: open ? 30_000 : false,
  });
  const threads = useMemo(() => {
    return (recent.data?.threads ?? [])
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 12);
  }, [recent.data]);

  function openThread(threadId: string) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('bm-last-thread', threadId);
    }
    router.push('/chat');
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/60 dark:hover:bg-[#1F1B15]/60 text-[13px] text-ink dark:text-[#E6E0D8]"
        title={open ? 'Collapse chat history' : 'Show recent chat threads'}
      >
        <History className="w-3.5 h-3.5 shrink-0 text-muted dark:text-[#8C837C]" />
        <span className="flex-1 text-left truncate">Chat History</span>
        <ChevronDown
          className={'w-3 h-3 text-muted dark:text-[#8C837C] transition-transform ' + (open ? '' : '-rotate-90')}
        />
      </button>
      {open && (
        <ul className="ml-5 pl-2 border-l border-line dark:border-[#2A241D] mt-0.5 mb-1 space-y-0.5">
          {recent.isLoading && (
            <li className="px-2 py-1 text-[11px] text-muted dark:text-[#8C837C]">loading…</li>
          )}
          {!recent.isLoading && threads.length === 0 && (
            <li className="px-2 py-1 text-[11px] text-muted dark:text-[#8C837C]">No threads yet.</li>
          )}
          {threads.map((t) => (
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
  );
}

// ProjectTile — logo if `logo_url` loads, letter-initial otherwise.
// Remote logo services (Clearbit, favicon CDNs) 404 fairly often;
// without an onError fallback the user stares at a macOS
// broken-image placeholder. We track the load state locally and
// swap to a deterministic colored letter-tile on any failure or
// missing url.
const PROJECT_TILE_BG = [
  '#E8634A', '#3F7EC7', '#3FA36B', '#8B6FD6',
  '#D79B3C', '#C9547C', '#3B9DA8', '#5B6BC7',
];
function projectTileBg(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PROJECT_TILE_BG[Math.abs(h) % PROJECT_TILE_BG.length]!;
}

function ProjectTile({ project }: { project: Project | null }) {
  const [broken, setBroken] = useState(false);
  const url = project?.logo_url;
  const name = project?.name ?? '?';
  const initial = name.charAt(0).toUpperCase() || '?';
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        className="w-5 h-5 rounded-sm shrink-0 object-contain bg-white"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className="w-5 h-5 rounded-sm shrink-0 flex items-center justify-center text-[10px] font-semibold text-white"
      style={{ background: projectTileBg(name) }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
