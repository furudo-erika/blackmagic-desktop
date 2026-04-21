'use client';

/**
 * /team?slug=<agent> — cockpit for one agent.
 *
 * Layout:
 *   - slim header (identity · status strip)
 *   - body: ChatSurface (left, fills) · right rail with skills + runs
 *
 * Chat lives inside the cockpit so the user can interact with the
 * agent without a page-jump. Each agent gets its own thread via
 * threadKey=`bm-team-thread-<slug>`, so multiple agents run in
 * parallel, each keeping its own history.
 */

import Link from 'next/link';
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
  RotateCcw,
  Search,
  Send,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import { api } from '../../lib/api';
import { ChatSurface, type ChatScenario } from '../../components/chat-surface';
import { PlaybookCard, type Playbook } from '../../components/playbook-card';
import { AGENTS, getAgent } from '../../config/agents';

const ICONS: Record<string, LucideIcon> = {
  Activity,
  Bot,
  Briefcase,
  CalendarClock,
  Copy,
  Globe,
  Linkedin,
  MessageSquare,
  RotateCcw,
  Search,
  Send,
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

type VaultAgent = {
  slug: string;
  name: string;
  icon: string;
  description: string;
  tools: string[];
  starterPrompts: string[];
};

async function loadVaultAgent(slug: string): Promise<VaultAgent | null> {
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
    queryFn: async (): Promise<VaultAgent | null> => {
      if (!slug) return null;
      const vault = await loadVaultAgent(slug);
      if (vault) return vault;
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
      const tree = await api.vaultTree();
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
        .sort((a, b) => (runStartedMs(b.runId) ?? 0) - (runStartedMs(a.runId) ?? 0))
        .slice(0, 8),
    [runsQ.data, slug],
  );
  const lastRun = agentRuns[0];
  const lastRunMs = lastRun ? runStartedMs(lastRun.runId) : null;
  const isLive = !!lastRun && !lastRun.done && lastRunMs != null && Date.now() - lastRunMs < 2 * 60_000;

  // Derive scenarios BEFORE any conditional early return so hook order
  // stays stable across renders. Falls back to a single "Kick off…"
  // starter when the agent file has no starter_prompts frontmatter.
  const scenarios: ChatScenario[] = useMemo(() => {
    const a = agentQ.data;
    if (!a) return [];
    if (a.starterPrompts.length > 0) {
      return a.starterPrompts.map((p) => ({
        title: p.length > 48 ? p.slice(0, 45) + '…' : p,
        prompt: p,
      }));
    }
    return [
      {
        title: `Run ${a.name} end-to-end`,
        prompt: `You are the ${a.name}. Execute your full loop for my project now — don't describe what you would do, actually do it. Read what you need from the vault (us/, companies/, contacts/, signals/, playbooks/), call whatever tools you need, write your outputs to the vault, and only stop if you hit a blocker that genuinely requires a human decision (missing credential, ambiguous policy, destructive action). When you stop, say so in one line with the exact resolution I need to give you. Otherwise: run to completion and summarize what you wrote.`,
      },
    ];
  }, [agentQ.data]);

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
            No file at <code>agents/{slug}.md</code>. Drop one in the vault and refresh.
          </p>
        </div>
      </div>
    );
  }

  const agent = agentQ.data;
  const Icon = ICONS[agent.icon] ?? Bot;
  const playbooks = playbooksQ.data ?? [];

  return (
    <div className="h-full flex flex-col bg-cream dark:bg-[#0F0D0A] min-h-0">
      {/* Header */}
      <header className="shrink-0 border-b border-line dark:border-[#2A241D] px-6 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D]">
          <Icon className="w-4 h-4 text-ink dark:text-[#F5F1EA]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold text-ink dark:text-[#F5F1EA] truncate">
              {agent.name}
            </h1>
            <span className="text-[10px] font-mono text-muted dark:text-[#8C837C] truncate">{slug}</span>
            {isLive && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-flame font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-flame" />
                </span>
                live
              </span>
            )}
          </div>
          {agent.description && (
            <p className="text-[11px] text-muted dark:text-[#8C837C] truncate">{agent.description}</p>
          )}
        </div>
        <div className="hidden md:flex items-center gap-4 text-[11px] font-mono text-muted dark:text-[#8C837C] shrink-0">
          <span className="inline-flex items-center gap-1.5">
            <History className="w-3 h-3" /> last run {timeAgo(lastRunMs)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Wrench className="w-3 h-3" /> {agent.tools.length} tools
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Bot className="w-3 h-3" /> {playbooks.length} skills
          </span>
        </div>
      </header>

      {/* Body: chat left, skills+runs right */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_340px]">
        {/* Chat scoped to this agent */}
        <div className="min-h-0 border-r border-line dark:border-[#2A241D]">
          <ChatSurface
            agent={slug}
            threadKey={`bm-team-thread-${slug}`}
            title={`Chat with ${agent.name}`}
            scenarios={scenarios}
          />
        </div>

        {/* Right rail: skills + recent runs + tools */}
        <aside className="min-h-0 overflow-y-auto bg-cream-light dark:bg-[#17140F] px-4 py-4 space-y-5">
          <section>
            <div className="text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C] mb-2">
              Skills {agent.name} can run
            </div>
            {playbooksQ.isLoading && (
              <div className="text-[12px] text-muted dark:text-[#8C837C]">loading…</div>
            )}
            {!playbooksQ.isLoading && playbooks.length === 0 && (
              <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-4 text-[12px] text-muted dark:text-[#8C837C] leading-relaxed">
                No canned skills for this agent — just chat on the left. To
                wire up a one-click skill, add a{' '}
                <code className="font-mono text-[11px]">playbooks/*.md</code>{' '}
                with <code className="font-mono text-[11px]">agent: {slug}</code> in
                its frontmatter.
              </div>
            )}
            <div className="space-y-2">
              {playbooks.map((pb) => (
                <PlaybookCard key={pb.path} pb={pb} />
              ))}
            </div>
          </section>

          <section>
            <div className="text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C] mb-2">
              Recent runs
            </div>
            {runsQ.isLoading && (
              <div className="text-[12px] text-muted dark:text-[#8C837C]">loading…</div>
            )}
            {!runsQ.isLoading && agentRuns.length === 0 && (
              <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-3 text-[12px] text-muted dark:text-[#8C837C]">
                No runs yet. Send a message on the left or trigger a skill.
              </div>
            )}
            {agentRuns.length > 0 && (
              <ul className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl divide-y divide-line dark:divide-[#2A241D] overflow-hidden">
                {agentRuns.map((r) => (
                  <li key={r.runId}>
                    <button
                      type="button"
                      onClick={() => router.push(`/runs?runId=${encodeURIComponent(r.runId)}`)}
                      className="w-full text-left px-3 py-2 hover:bg-cream-light dark:hover:bg-[#17140F]"
                    >
                      <div className="text-[12px] text-ink dark:text-[#E6E0D8] truncate">
                        {r.preview || r.runId}
                      </div>
                      <div className="mt-0.5 text-[10px] font-mono text-muted dark:text-[#8C837C] flex items-center gap-2">
                        <span>{timeAgo(runStartedMs(r.runId))}</span>
                        <span>· {r.toolCalls ?? 0} tools</span>
                        <span>· {r.done ? 'done' : 'running'}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {agentRuns.length > 0 && (
              <Link
                href="/runs"
                className="mt-2 inline-block text-[11px] text-muted dark:text-[#8C837C] hover:text-flame"
              >
                all runs →
              </Link>
            )}
          </section>

          {agent.tools.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C] mb-2">
                Tools
              </div>
              <div className="flex flex-wrap gap-1.5">
                {agent.tools.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-line dark:border-[#2A241D] text-muted dark:text-[#8C837C] bg-white dark:bg-[#1F1B15]"
                  >
                    <Wrench className="w-2.5 h-2.5" /> {t}
                  </span>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
