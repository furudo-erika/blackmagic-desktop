'use client';

/**
 * /team/[slug] — one tab per built-in agent, fully self-contained.
 *
 * Layout (no redirects out):
 *   - Collapsible description
 *   - Inline ChatSurface scoped to this agent (own thread key)
 *   - Playbooks this agent owns — inline PlaybookCard (run in place)
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  Activity,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Copy,
  Globe,
  Linkedin,
  MessageSquare,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';

import { AGENTS, getAgent, type AgentDef } from '../../../config/agents';
import { api } from '../../../lib/api';
import { ChatSurface, type ChatScenario } from '../../../components/chat-surface';
import { PlaybookCard, type Playbook } from '../../../components/playbook-card';

const ICONS: Record<string, LucideIcon> = {
  Globe,
  Linkedin,
  CalendarClock,
  Copy,
  RotateCcw,
  Activity,
};

export default function AgentPageClient() {
  const params = useParams<{ slug: string }>();
  const agent = getAgent(params.slug);

  if (!agent) {
    return (
      <div className="h-full flex items-center justify-center p-10">
        <div className="text-center max-w-md">
          <MessageSquare className="w-8 h-8 mx-auto mb-3 text-muted dark:text-[#8C837C] opacity-50" />
          <h2 className="text-base font-semibold text-ink dark:text-[#F5F1EA] mb-1">
            Unknown agent
          </h2>
          <p className="text-[13px] text-muted dark:text-[#8C837C]">
            No built-in agent named “{params.slug}”. Known:{' '}
            {AGENTS.map((a) => a.slug).join(', ')}.
          </p>
        </div>
      </div>
    );
  }
  return <AgentPageBody agent={agent} />;
}

function AgentPageBody({ agent }: { agent: AgentDef }) {
  const Icon = ICONS[agent.icon] ?? MessageSquare;
  const [descOpen, setDescOpen] = useState(false);

  const playbooks = useQuery({
    queryKey: ['playbooks', agent.slug],
    queryFn: async (): Promise<Playbook[]> => {
      const tree = await api.contextTree();
      const files = tree.tree.filter(
        (f) =>
          f.type === 'file' &&
          f.path.startsWith('playbooks/') &&
          f.path.endsWith('.md'),
      );
      const rows = await Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          return { path: f.path, frontmatter: r.frontmatter, body: r.body };
        }),
      );
      return rows.filter((pb) => {
        const fmAgent = String(pb.frontmatter.agent ?? '');
        if (fmAgent === agent.slug) return true;
        const fmGroup = String(pb.frontmatter.group ?? '');
        if (agent.playbookGroups.includes(fmGroup)) return true;
        const p = pb.path.toLowerCase();
        return agent.playbookPrefix.some((prefix) => p.includes(prefix));
      });
    },
  });

  const scenarios: ChatScenario[] = useMemo(
    () =>
      agent.starterPrompts.map((p) => ({
        title: p.length > 48 ? p.slice(0, 48) + '…' : p,
        prompt: p,
      })),
    [agent.starterPrompts],
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header + description collapse */}
      <div className="shrink-0 border-b border-line dark:border-[#2A241D]">
        <button
          type="button"
          onClick={() => setDescOpen((o) => !o)}
          className="w-full text-left px-6 py-3 flex items-start gap-3 hover:bg-cream-light dark:hover:bg-[#17140F] transition-colors"
        >
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${agent.color}`}>
            <Icon className="w-4 h-4 text-ink dark:text-[#F5F1EA]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-ink dark:text-[#F5F1EA]">
              {agent.name}
            </div>
            <div className="text-[12px] text-muted dark:text-[#8C837C] truncate">
              {agent.tagline}
            </div>
          </div>
          {descOpen ? (
            <ChevronDown className="w-4 h-4 text-muted shrink-0 mt-1" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted shrink-0 mt-1" />
          )}
        </button>
        {descOpen && (
          <div className="px-6 pb-4 pt-0 text-[13px] leading-relaxed text-ink/90 dark:text-[#D6CEC5] border-t border-line dark:border-[#2A241D]">
            <p className="pt-3">{agent.description}</p>
          </div>
        )}
      </div>

      {/* Two-column body: chat left, playbooks right */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px]">
        {/* Chat */}
        <div className="min-h-0 border-r border-line dark:border-[#2A241D]">
          <ChatSurface
            agent={agent.slug}
            threadKey={`bm-team-thread-${agent.slug}`}
            title={`Chat with ${agent.name}`}
            scenarios={scenarios}
          />
        </div>

        {/* Playbooks this agent runs */}
        <aside className="min-h-0 overflow-y-auto px-4 py-4 bg-cream-light dark:bg-[#17140F]">
          <div className="mb-2 text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C]">
            Skills {agent.name} can run
          </div>

          {playbooks.isLoading && (
            <div className="text-[12px] text-muted dark:text-[#8C837C]">loading…</div>
          )}

          {playbooks.data && playbooks.data.length === 0 && (
            <div className="text-[12px] text-muted dark:text-[#8C837C] leading-relaxed">
              No skills yet for this agent. Add one under{' '}
              <span className="font-mono">playbooks/</span> in the context, or just chat
              with the agent on the left.
            </div>
          )}

          <div className="space-y-2">
            {(playbooks.data ?? []).map((pb) => (
              <PlaybookCard key={pb.path} pb={pb} />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
