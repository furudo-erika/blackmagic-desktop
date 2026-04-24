'use client';

/**
 * /team?slug=<agent> — Linear-style cockpit for one agent.
 *
 * Layout matches the rest of the entity-detail surface (company / contact /
 * deal): breadcrumbs → big title + one-line subtitle → activity feed +
 * threaded comments → run history → right-rail Properties with Assignee
 * picker. An agent here is just an entity whose context path is
 * `agents/<slug>.md` — the activity log / assignee / runs APIs accept any
 * context path, so we reuse EntityDetail wholesale instead of hand-rolling a
 * second layout. The agent-specific extras (live/idle dot, skills-this-
 * agent-can-run list, tools count) ride along as `children` in the main
 * column and `headerRight` in the Properties rail.
 */

import { useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bot,
  Briefcase,
  CalendarClock,
  Copy,
  Globe,
  History,
  Linkedin,
  MessageSquare,
  Play,
  RotateCcw,
  Search,
  Send,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import { api } from '../../lib/api';
import { EntityDetail } from '../../components/entity-detail';
import { type Playbook } from '../../components/playbook-card';
import { getAgent } from '../../config/agents';

const ICONS: Record<string, LucideIcon> = {
  Activity, Bot, Briefcase, CalendarClock, Copy, Globe, Linkedin,
  MessageSquare, RotateCcw, Search, Send,
};

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
function timeAgo(ms: number | null): string {
  if (!ms) return '—';
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

type ContextAgent = {
  slug: string;
  name: string;
  icon: string;
  description: string;
  tools: string[];
  starterPrompts: string[];
};

async function loadContextAgent(slug: string): Promise<ContextAgent | null> {
  try {
    const r = await api.readFile(`agents/${slug}.md`);
    const fm = r.frontmatter ?? {};
    const description = r.body.trim().split('\n').find((l) => l.trim().length > 0)?.replace(/^#+\s*/, '') ?? '';
    const starterPrompts = Array.isArray((fm as any).starter_prompts)
      ? (fm as any).starter_prompts.map(String).filter(Boolean)
      : [];
    return {
      slug,
      name: typeof fm.name === 'string' && fm.name ? fm.name : slug,
      icon: typeof fm.icon === 'string' ? fm.icon : 'Bot',
      description,
      tools: Array.isArray(fm.tools) ? fm.tools.map(String) : [],
      starterPrompts,
    };
  } catch {
    return null;
  }
}

export default function AgentCockpit() {
  const params = useSearchParams();
  const router = useRouter();
  const slug = params.get('slug') ?? '';

  const agentQ = useQuery({
    queryKey: ['cockpit-agent', slug],
    queryFn: async (): Promise<ContextAgent | null> => {
      if (!slug) return null;
      const context = await loadContextAgent(slug);
      if (context) return context;
      const a = getAgent(slug);
      if (!a) return null;
      return {
        slug: a.slug,
        name: a.name,
        icon: a.icon,
        description: a.description,
        tools: [],
        starterPrompts: a.starterPrompts ?? [],
      };
    },
    enabled: !!slug,
  });

  const playbooksQ = useQuery({
    queryKey: ['cockpit-playbooks', slug],
    queryFn: async (): Promise<Playbook[]> => {
      const tree = await api.contextTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('playbooks/') && f.path.endsWith('.md'),
      );
      const rows = await Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          return { path: f.path, frontmatter: r.frontmatter, body: r.body };
        }),
      );
      const legacy = getAgent(slug);
      return rows.filter((pb) => {
        if (String(pb.frontmatter.agent ?? '') === slug) return true;
        if (legacy) {
          if (legacy.playbookGroups.includes(String(pb.frontmatter.group ?? ''))) return true;
          const p = pb.path.toLowerCase();
          if (legacy.playbookPrefix.some((prefix) => p.includes(prefix))) return true;
        }
        return false;
      });
    },
    enabled: !!slug,
  });

  const runsQ = useQuery({
    queryKey: ['cockpit-runs', slug],
    queryFn: api.listRuns,
    refetchInterval: 15_000,
    enabled: !!slug,
  });
  const agentRuns = useMemo(
    () =>
      (runsQ.data?.runs ?? [])
        .filter((r) => (r.agent ?? '').toLowerCase() === slug.toLowerCase())
        .sort((a, b) => (runStartedMs(b.runId) ?? 0) - (runStartedMs(a.runId) ?? 0)),
    [runsQ.data, slug],
  );
  const lastRun = agentRuns[0];
  const lastRunMs = lastRun ? runStartedMs(lastRun.runId) : null;
  const isLive = !!lastRun && !lastRun.done && lastRunMs != null && Date.now() - lastRunMs < 2 * 60_000;

  if (!slug) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Bot className="w-8 h-8 mx-auto mb-3 text-muted dark:text-[#8C837C] opacity-50" />
          <h2 className="text-base font-semibold text-ink dark:text-[#F5F1EA] mb-1">No agent selected</h2>
          <p className="text-[13px] text-muted dark:text-[#8C837C]">Pick an agent from the Team section.</p>
        </div>
      </div>
    );
  }

  if (agentQ.isLoading) {
    return <div className="p-8 text-sm text-muted dark:text-[#8C837C]">loading…</div>;
  }
  if (!agentQ.data) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Bot className="w-8 h-8 mx-auto mb-3 text-muted dark:text-[#8C837C] opacity-50" />
          <h2 className="text-base font-semibold text-ink dark:text-[#F5F1EA] mb-1">Unknown agent “{slug}”</h2>
          <p className="text-[13px] text-muted dark:text-[#8C837C]">
            No file at <code>agents/{slug}.md</code>. Drop one in the context and refresh.
          </p>
        </div>
      </div>
    );
  }

  const agent = agentQ.data;
  const Icon = ICONS[agent.icon] ?? Bot;
  const playbooks = playbooksQ.data ?? [];

  const titleNode = (
    <span className="inline-flex items-center gap-2.5">
      <span className="w-7 h-7 rounded-md flex items-center justify-center bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D]">
        <Icon className="w-4 h-4 text-ink dark:text-[#F5F1EA]" />
      </span>
      <span>{agent.name}</span>
      <span className="text-[11px] font-mono text-muted dark:text-[#8C837C] font-normal">{slug}</span>
      {isLive && (
        <span className="inline-flex items-center gap-1 text-[11px] text-flame font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-flame" />
          </span>
          live
        </span>
      )}
    </span>
  );

  // Right-rail trailing: status / counts as read-only PropRows. Matches the
  // shape of the Linear "Status / Priority / Assignee" stack.
  const propsTrailing = (
    <>
      <div className="grid grid-cols-[70px_1fr] gap-2 items-center">
        <span className="text-[11px] text-muted dark:text-[#8C837C]">Status</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink dark:text-[#E6E0D8]">
          <span className={'w-1.5 h-1.5 rounded-full ' + (isLive ? 'bg-flame' : 'bg-muted/50 dark:bg-[#6B625C]')} />
          {isLive ? 'Running' : 'Idle'}
        </span>
      </div>
      <div className="grid grid-cols-[70px_1fr] gap-2 items-center">
        <span className="text-[11px] text-muted dark:text-[#8C837C]">Last run</span>
        <span className="text-[12px] text-ink dark:text-[#E6E0D8] inline-flex items-center gap-1">
          <History className="w-3 h-3 opacity-60" /> {timeAgo(lastRunMs)}
        </span>
      </div>
      <div className="grid grid-cols-[70px_1fr] gap-2 items-center">
        <span className="text-[11px] text-muted dark:text-[#8C837C]">Skills</span>
        <span className="text-[12px] text-ink dark:text-[#E6E0D8]">{playbooks.length}</span>
      </div>
      <div className="grid grid-cols-[70px_1fr] gap-2 items-center">
        <span className="text-[11px] text-muted dark:text-[#8C837C]">Tools</span>
        <span className="text-[12px] text-ink dark:text-[#E6E0D8]">{agent.tools.length}</span>
      </div>
    </>
  );

  return (
    <div className="h-full overflow-y-auto bg-cream dark:bg-[#0F0D0A]">
      <EntityDetail
        entityPath={`agents/${slug}.md`}
        title={titleNode}
        subtitle={agent.description || undefined}
        breadcrumbs={[
          { label: 'Team', href: '/' },
          { label: agent.name },
        ]}
        headerRight={propsTrailing}
      >
        {/* Starter prompts — one-click kick-off for common tasks. */}
        {agent.starterPrompts.length > 0 && (
          <section className="mt-4 mb-4">
            <div className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-2">
              Starter prompts
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {agent.starterPrompts.slice(0, 4).map((p, i) => (
                <StarterButton
                  key={i}
                  prompt={p}
                  onRun={async () => {
                    const r = await api.runAgent(slug, p);
                    router.push(`/runs?runId=${encodeURIComponent(r.runId)}`);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Skills section intentionally removed — they're invoked by the
            agent inside chat, listing them here was just visual noise.
            Use /skills if you want to browse the catalog. */}
      </EntityDetail>
    </div>
  );
}

function StarterButton({ prompt, onRun }: { prompt: string; onRun: () => void | Promise<void> }) {
  return (
    <button
      type="button"
      onClick={() => void onRun()}
      className="group flex items-start gap-2 rounded-lg border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] px-3 py-2 text-left hover:border-flame transition-colors"
    >
      <Play className="w-3.5 h-3.5 text-flame shrink-0 mt-0.5" />
      <span className="text-[12px] text-ink dark:text-[#E6E0D8] line-clamp-2 leading-snug">
        {prompt}
      </span>
    </button>
  );
}
