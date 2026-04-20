'use client';

/**
 * Sidebar — paperclip-style sections + nav items with live state.
 *
 * Layout:
 *   - Project switcher pill (dispatches bm:open-project-picker)
 *   - New chat · Chat (collapsible recent threads) · Inbox (drafts badge)
 *   - Work  : Playbooks · Sequences · Triggers · Runs (+ live count)
 *   - Vault : Companies · Contacts · Deals · Knowledge graph · Files
 *   - System: Integrations · Agent roles · Settings
 *   - Footer: version + theme toggle. macOS drag region retained.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Briefcase,
  Building2,
  BookOpen,
  Bot,
  CalendarClock,
  ChevronDown,
  Copy,
  FolderTree,
  GitBranch,
  Globe,
  History,
  Inbox,
  Linkedin,
  Moon,
  Network,
  Plug,
  Repeat,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  SquarePen,
  Sun,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { AGENTS } from '../config/agents';
import { SidebarNavItem, SidebarSection } from './ui/sidebar-nav';

const SIDEBAR_AGENT_ICONS: Record<string, LucideIcon> = {
  Globe,
  Linkedin,
  CalendarClock,
  Copy,
  RotateCcw,
  Activity,
};
import { SidebarChats, newThreadId } from './sidebar-chats';
import { useRouter } from 'next/navigation';

/** Parse run-started ms out of a runId. Mirrors runs/page.tsx. */
function runStartedMs(runId: string): number | null {
  if (runId.startsWith('codex-')) {
    const ms = Number(runId.slice('codex-'.length));
    return Number.isFinite(ms) ? ms : null;
  }
  const m = runId.match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!m) return null;
  const t = Date.parse(`${m[1]}:${m[2]}:${m[3]}.${m[4]}Z`);
  return Number.isFinite(t) ? t : null;
}

export function Sidebar() {
  const router = useRouter();

  // Theme -----------------------------------------------------------------
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('bm-theme');
    const initial =
      stored === 'dark' ||
      (stored == null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(initial);
    document.documentElement.classList.toggle('dark', initial);
  }, []);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('bm-theme', next ? 'dark' : 'light');
  }

  // Project switcher ------------------------------------------------------
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const activeProject = projects.data?.projects.find(
    (p) => p.id === projects.data?.active,
  );
  function openProjectPicker() {
    window.dispatchEvent(new Event('bm:open-project-picker'));
  }

  // Live counts -----------------------------------------------------------
  const drafts = useQuery({
    queryKey: ['drafts'],
    queryFn: api.listDrafts,
    refetchInterval: 30_000,
  });
  const pendingDraftCount = useMemo(() => {
    const list = drafts.data?.drafts ?? [];
    return list.filter((d) => (d.status ?? 'pending') === 'pending').length;
  }, [drafts.data]);

  const runs = useQuery({
    queryKey: ['runs'],
    queryFn: api.listRuns,
    refetchInterval: 10_000,
  });
  const liveRunCount = useMemo(() => {
    const list = runs.data?.runs ?? [];
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return list.filter((r) => {
      const started = runStartedMs(r.runId);
      return started != null && started >= fiveMinAgo;
    }).length;
  }, [runs.data]);

  // Chat actions ----------------------------------------------------------
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

      {/* Project switcher pill (paperclip CompanySwitcher equivalent) */}
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
          <Search className="w-3.5 h-3.5 text-muted/70 dark:text-[#6B625C] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          <ChevronDown className="w-3 h-3 text-muted/70 dark:text-[#6B625C] shrink-0" />
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 px-2 pb-3">
        <div className="flex flex-col gap-0.5">
          <button
            onClick={startNewThread}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-ink/80 dark:text-[#E6E0D8]/80 hover:bg-white/60 dark:hover:bg-[#1F1B15]/60 hover:text-ink dark:hover:text-[#F5F1EA] rounded-md transition-colors"
          >
            <SquarePen className="w-4 h-4 shrink-0" />
            <span className="truncate">New chat</span>
          </button>

          <SidebarChats />

          <SidebarNavItem
            href="/outreach"
            label="Drafts"
            icon={Inbox}
            badge={pendingDraftCount}
          />
        </div>

        <SidebarSection label="Team">
          {AGENTS.map((agent) => {
            const Icon = SIDEBAR_AGENT_ICONS[agent.icon] ?? Bot;
            return (
              <SidebarNavItem
                key={agent.slug}
                href={`/team/${agent.slug}`}
                label={agent.name}
                icon={Icon}
              />
            );
          })}
        </SidebarSection>

        <SidebarSection label="Work">
          <SidebarNavItem href="/playbooks" label="Skills" icon={BookOpen} />
          <SidebarNavItem href="/sequences" label="Sequences" icon={Repeat} />
          <SidebarNavItem href="/triggers" label="Triggers" icon={Zap} />
          <SidebarNavItem
            href="/runs"
            label="Runs"
            icon={History}
            liveCount={liveRunCount}
          />
        </SidebarSection>

        <SidebarSection label="Vault">
          <SidebarNavItem href="/companies" label="Companies" icon={Building2} />
          <SidebarNavItem href="/contacts" label="Contacts" icon={Users} />
          <SidebarNavItem href="/deals" label="Deals" icon={Briefcase} />
          <SidebarNavItem href="/org" label="Org tree" icon={GitBranch} />
          <SidebarNavItem href="/ontology" label="Knowledge graph" icon={Network} />
          <SidebarNavItem href="/vault" label="Files" icon={FolderTree} />
        </SidebarSection>

        <SidebarSection label="System">
          <SidebarNavItem
            href="/onboarding/bootstrap"
            label="Profile company"
            icon={Sparkles}
          />
          <SidebarNavItem href="/integrations" label="Integrations" icon={Plug} />
          <SidebarNavItem href="/agents" label="Agent roles" icon={Bot} />
          <SidebarNavItem href="/settings" label="Settings" icon={SettingsIcon} />
        </SidebarSection>
      </nav>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-line dark:border-[#2A241D] flex items-center justify-between shrink-0">
        <span className="text-[10px] text-muted dark:text-[#6B625C] font-mono">
          v0.2.6
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
    </aside>
  );
}
