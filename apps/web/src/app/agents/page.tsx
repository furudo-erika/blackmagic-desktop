'use client';

/**
 * /agents — clean directory of agents in this project.
 *
 * Just enough to pick which agent to talk to. The card is the entire
 * click target → opens chat with that agent. We deliberately don't
 * render tool lists, model names, temperature, raw "You are the X…"
 * system-prompt text, or .md edit links — that's all internal plumbing
 * the user doesn't need to see (and shouldn't see) when picking an
 * agent. Power users who want the raw .md can still open it from
 * /vault?path=agents/<slug>.md.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  Plus,
  Sparkles,
  Search,
  Briefcase,
  Globe,
  Linkedin,
  CalendarClock,
  Copy as CopyIcon,
  RotateCcw,
  Activity,
  Radar,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../lib/api';
import { PageShell, PageHeader, EmptyState, Button } from '../../components/ui/primitives';

// Same icon map the sidebar uses — agents declare `icon:` in frontmatter.
const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  Bot, Globe, Linkedin, CalendarClock, Copy: CopyIcon, RotateCcw,
  Activity, Radar, Search, Briefcase, Send, Sparkles,
};

type Agent = {
  path: string;
  name: string;
  slug: string;
  icon: string;
  tagline: string;
  pinned: boolean;
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

// Strip the boilerplate "You are the X agent." prefix and grab the first
// natural-feeling sentence to show as a tagline. We never want raw
// system-prompt phrasing on a user-facing card.
function deriveTagline(fm: Record<string, unknown>, body: string, fallbackName: string): string {
  const explicit =
    (typeof fm.tagline === 'string' && fm.tagline) ||
    (typeof fm.description === 'string' && fm.description) ||
    '';
  const candidate = explicit || body;
  let text = candidate.trim();
  // Drop any leading markdown header line.
  text = text.replace(/^#+\s.*$/m, '').trim();
  // Drop "You are the X agent." / "You are X." style leads.
  text = text.replace(/^You\s+(are|own)\s+(the\s+)?[^.]*\.\s*/i, '');
  // Drop "Your job is to …" style leads.
  text = text.replace(/^Your\s+(job|role|task)\s+is\s+to\s+/i, '');
  const firstSentence = text.split(/(?<=[.?!])\s+/)[0] ?? '';
  const trimmed = firstSentence.replace(/[`*_#]/g, '').trim();
  if (trimmed.length > 0 && trimmed.length < 180) return trimmed;
  // Fallback: just say what we know without leaking prompt internals.
  return `${fallbackName} agent`;
}

const STARTER_AGENT = `---
name: "new-agent"
description: "What this agent does in one line."
model: "claude-sonnet-4-5"
temperature: 0.3
tools:
  - read_file
  - write_file
  - deep_research
---

# New agent

Describe the role in more detail here. This markdown body is the system
prompt the model will see. Reference files with wikilinks: [[us/CLAUDE.md]].
`;

export default function AgentsPage() {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newErr, setNewErr] = useState<string | null>(null);

  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: async (): Promise<Agent[]> => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'),
      );
      const rows = await Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
          const slug = f.path.replace(/^agents\//, '').replace(/\.md$/, '');
          const name = String(fm.name ?? slug);
          return {
            path: f.path,
            name,
            slug,
            icon: typeof fm.icon === 'string' ? fm.icon : 'Bot',
            tagline: deriveTagline(fm, r.body, name),
            pinned: String(fm.pin ?? '') === 'first',
          };
        }),
      );
      // Pinned agents float to the top, then alpha by name.
      rows.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return rows;
    },
  });

  const runs = useQuery({ queryKey: ['runs'], queryFn: api.listRuns, refetchInterval: 30_000 });

  const liveSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const r of runs.data?.runs ?? []) {
      if (r.done) continue;
      const t = runStartedMs(r.runId);
      if (t == null || Date.now() - t > 5 * 60_000) continue;
      const slug = (r.agent ?? '').toLowerCase();
      if (slug) set.add(slug);
    }
    return set;
  }, [runs.data]);

  async function createAgent() {
    setNewErr(null);
    const slug = newSlug.trim().replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    if (!slug) {
      setNewErr('Pick a slug (letters, digits, dashes).');
      return;
    }
    const path = `agents/${slug}.md`;
    const seeded = STARTER_AGENT.replace('new-agent', slug);
    try {
      await api.writeFile(path, seeded);
      setShowNew(false);
      setNewSlug('');
      router.push(`/vault?path=${encodeURIComponent(path)}`);
    } catch (e) {
      setNewErr((e as Error).message || 'failed to create agent');
    }
  }

  const list = agents.data ?? [];

  return (
    <PageShell>
      <PageHeader
        title="Agents"
        subtitle="Pick an agent to chat with. Each one knows your project and can call the right tools on its own."
        icon={Bot}
        trailing={
          <Button variant="primary" onClick={() => setShowNew(true)}>
            <Plus className="w-3 h-3" /> New agent
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl mx-auto">
          {showNew && (
            <form
              onSubmit={(e) => { e.preventDefault(); createAgent(); }}
              className="mb-5 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-4 flex items-center gap-2"
            >
              <label className="text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C] shrink-0">
                slug
              </label>
              <input
                autoFocus
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="my-agent"
                className="flex-1 bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-1.5 text-sm font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
              />
              <Button variant="primary" onClick={createAgent}>Create</Button>
              <Button variant="ghost" onClick={() => { setShowNew(false); setNewErr(null); setNewSlug(''); }}>Cancel</Button>
              {newErr && <span className="text-[11px] text-flame">{newErr}</span>}
            </form>
          )}

          {agents.isLoading && <div className="text-sm text-muted dark:text-[#8C837C]">loading…</div>}
          {agents.error && <div className="text-sm text-flame">{(agents.error as Error).message}</div>}

          {!agents.isLoading && list.length === 0 && (
            <EmptyState
              icon={Bot}
              title="No agents yet."
              hint="Drop a *.md file in agents/ or click + New agent to scaffold one."
              action={
                <Button variant="primary" onClick={() => setShowNew(true)}>
                  <Plus className="w-3 h-3" /> New agent
                </Button>
              }
            />
          )}

          {list.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map((a) => (
                <AgentCard key={a.path} agent={a} live={liveSlugs.has(a.slug.toLowerCase())} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function AgentCard({ agent, live }: { agent: Agent; live: boolean }) {
  const Icon = AGENT_ICON_MAP[agent.icon] ?? Bot;
  return (
    <Link
      href={`/?agent=${encodeURIComponent(agent.slug)}`}
      className="group relative flex flex-col gap-3 rounded-xl border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] p-4 hover:border-flame/50 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-flame/10 group-hover:bg-flame/20 transition-colors">
          <Icon className="w-5 h-5 text-flame" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA] truncate group-hover:text-flame transition-colors">
              {agent.name}
            </h3>
            {live && (
              <span className="relative flex h-2 w-2 shrink-0" aria-label="live">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-flame" />
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-muted dark:text-[#8C837C] line-clamp-2 leading-snug">
            {agent.tagline}
          </p>
        </div>
      </div>
    </Link>
  );
}
