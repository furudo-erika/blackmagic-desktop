'use client';

/**
 * /agents — one card per role .md under agents/.
 *
 * Shows role description (frontmatter description or first line of body),
 * the tools chip list, and last-run time pulled from /api/agent/runs.
 * The "+ New agent" button scaffolds a starter .md and routes to the
 * vault editor; no separate dialog to maintain.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bot, Plus, Wrench, ExternalLink } from 'lucide-react';
import { api } from '../../lib/api';
import {
  PageShell,
  PageHeader,
  Panel,
  EmptyState,
  Button,
} from '../../components/ui/primitives';

type Agent = {
  path: string;
  name: string;
  slug: string;
  description: string;
  tools: string[];
  temperature?: string;
  model?: string;
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
  // Inline "new agent" form. We used window.prompt() here but Electron
  // disables it in packaged builds, so the button looked broken with no
  // feedback (QA BUG-008).
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
      return Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          const fm = r.frontmatter;
          const slug = f.path.replace(/^agents\//, '').replace(/\.md$/, '');
          const toolsRaw = Array.isArray(fm.tools) ? (fm.tools as unknown[]) : [];
          const tools = toolsRaw.map((t) => String(t));
          const description =
            (typeof fm.description === 'string' && fm.description) ||
            (typeof fm.role === 'string' && (fm.role as string)) ||
            r.body.trim().split('\n').find((l) => l.trim().length > 0)?.replace(/^#+\s*/, '') ||
            '';
          return {
            path: f.path,
            name: String(fm.name ?? slug),
            slug,
            description,
            tools,
            temperature: fm.temperature !== undefined ? String(fm.temperature) : undefined,
            model: typeof fm.model === 'string' ? (fm.model as string) : undefined,
          };
        }),
      );
    },
  });

  const runs = useQuery({ queryKey: ['runs'], queryFn: api.listRuns, refetchInterval: 30_000 });

  const lastRunByAgent = useMemo(() => {
    const map = new Map<string, { runId: string; startedMs: number }>();
    for (const r of runs.data?.runs ?? []) {
      const t = runStartedMs(r.runId) ?? 0;
      const key = (r.agent ?? '').toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (!existing || existing.startedMs < t) {
        map.set(key, { runId: r.runId, startedMs: t });
      }
    }
    return map;
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
        subtitle="Role definitions under agents/. Each .md is a system prompt the LLM sees. The researcher, writer, and pipeline-analyst live here."
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
              className="mb-4 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-4 flex items-center gap-2"
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
            <>
              <div className="mb-4 text-[11px] font-mono text-muted dark:text-[#8C837C]">
                {list.length} agent{list.length === 1 ? '' : 's'}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {list.map((a) => {
                  const last = lastRunByAgent.get(a.slug.toLowerCase()) ?? lastRunByAgent.get(a.name.toLowerCase());
                  const isLive = !!last && Date.now() - last.startedMs < 5 * 60_000;
                  return (
                    <Panel key={a.path}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={
                                'inline-block w-1.5 h-1.5 rounded-full shrink-0 ' +
                                (isLive ? 'bg-flame animate-pulse' : 'bg-muted/40 dark:bg-[#8C837C]/40')
                              }
                            />
                            <span className="text-sm font-semibold text-ink dark:text-[#F5F1EA] truncate">
                              {a.name}
                            </span>
                            {a.model && (
                              <span className="text-[10px] font-mono text-muted dark:text-[#8C837C] truncate">
                                {a.model}
                              </span>
                            )}
                          </div>
                          {a.description && (
                            <p className="mt-1 text-[12px] text-muted dark:text-[#8C837C] line-clamp-2">
                              {a.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {a.tools.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {a.tools.slice(0, 10).map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-line dark:border-[#2A241D] text-muted dark:text-[#8C837C]"
                            >
                              <Wrench className="w-2.5 h-2.5" /> {t}
                            </span>
                          ))}
                          {a.tools.length > 10 && (
                            <span className="text-[10px] font-mono text-muted dark:text-[#8C837C]">
                              +{a.tools.length - 10}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-3 pt-3 border-t border-line dark:border-[#2A241D] flex items-center justify-between text-[11px] text-muted dark:text-[#8C837C]">
                        <span className="font-mono truncate">
                          {a.temperature != null && `temp ${a.temperature} · `}
                          last run {timeAgo(last?.startedMs ?? null)}
                        </span>
                        <Link
                          href={`/vault?path=${encodeURIComponent(a.path)}`}
                          className="inline-flex items-center gap-1 text-[11px] text-muted dark:text-[#8C837C] hover:text-flame"
                        >
                          <ExternalLink className="w-3 h-3" /> edit .md
                        </Link>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
