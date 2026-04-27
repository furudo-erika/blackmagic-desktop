'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Markdown } from '../../components/markdown';
import { Bot, History, Wrench, Square } from 'lucide-react';
import {
  PageHeader,
  EntityList,
  EntityRow,
  EmptyState,
  DetailDrawer,
  Button,
  StatusBadge,
  type StatusTone,
} from '../../components/ui/primitives';
import { SkeletonList } from '../../components/ui/skeleton';
import { ExportPDFButton } from '../../components/export-pdf-button';

function timeAgo(iso: string | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const d = (Date.now() - t) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

const STATUS_TONES: Record<string, StatusTone> = {
  running: 'info',
  completed: 'ok',
  failed: 'bad',
  blocked: 'warn',
  canceled: 'muted',
};

function RunStatusBadge({ status, done }: { status?: string; done?: boolean }) {
  const s = status ?? (done ? 'completed' : 'running');
  return <StatusBadge tone={STATUS_TONES[s] ?? 'muted'}>{s}</StatusBadge>;
}

function runStarted(runId: string): string | undefined {
  if (runId.startsWith('codex-')) {
    const ms = Number(runId.slice('codex-'.length));
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
  }
  const m = runId.match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (m) return `${m[1]}:${m[2]}:${m[3]}.${m[4]}Z`;
  return undefined;
}

function RunDetailPanel({ runId, onClose }: { runId: string; onClose: () => void }) {
  const run = useQuery({ queryKey: ['run', runId], queryFn: () => api.getRun(runId) });
  // Filename prefers the agent slug when present so a folder of exports is
  // self-explanatory (run-researcher-2026-…pdf vs a wall of opaque ids).
  const today = new Date().toISOString().slice(0, 10);
  const rawAgent = String((run.data?.meta as any)?.agent ?? '');
  const agentSlug = rawAgent.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '');
  const filename = agentSlug
    ? `run-${agentSlug}-${runId}.pdf`
    : `run-${runId}-${today}.pdf`;
  return (
    <DetailDrawer eyebrow="Run" title={runId} onClose={onClose}>
      <div className="px-5 pt-3 pb-0 print:hidden">
        <ExportPDFButton filename={filename} sectionTitle={`Run ${runId}`} />
      </div>
      {run.isLoading && <div className="p-5 text-sm text-muted dark:text-[#8C837C]">loading…</div>}
      {run.data && (
        <div className="p-5 space-y-5">
          {run.data.messages?.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-3">Conversation</div>
              <div className="space-y-4">
                {run.data.messages.map((m, i) => (
                  <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div
                      className={
                        m.role === 'user'
                          ? 'bg-ink dark:bg-[#3A322A] text-white rounded-lg rounded-br-sm px-4 py-2.5 text-[13px] max-w-[88%] whitespace-pre-wrap'
                          : 'bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg rounded-bl-sm px-5 py-3 max-w-[92%]'
                      }
                    >
                      {m.role === 'user' ? m.content : <Markdown source={m.content} />}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {!run.data.messages?.length && run.data.final && (
            <section>
              <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-2">Final answer</div>
              <div className="bg-cream-light dark:bg-[#17140F] rounded-md p-4 max-h-72 overflow-y-auto">
                <Markdown source={run.data.final} />
              </div>
            </section>
          )}
          {run.data.toolCalls?.length > 0 && (
            <details>
              <summary className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] cursor-pointer">
                Tool calls ({run.data.toolCalls.length})
              </summary>
              <div className="mt-2 space-y-2">
                {run.data.toolCalls.map((tc, i) => (
                  <details key={i} className="bg-cream-light dark:bg-[#17140F] rounded-md">
                    <summary className="px-3 py-2 cursor-pointer text-[12px] font-mono text-ink dark:text-[#E6E0D8] flex items-center gap-2">
                      <Wrench className="w-3 h-3 text-muted" /> {tc.name}
                    </summary>
                    <div className="px-3 pb-3 space-y-2">
                      <pre className="text-[11px] text-muted dark:text-[#8C837C] whitespace-pre-wrap font-mono">{JSON.stringify(tc.arguments, null, 2)}</pre>
                      <pre className="text-[11px] text-muted dark:text-[#8C837C] whitespace-pre-wrap font-mono max-h-40 overflow-y-auto bg-cream dark:bg-[#0F0D0A] rounded p-2">{typeof tc.output === 'string' ? tc.output.slice(0, 4000) : JSON.stringify(tc.output, null, 2).slice(0, 4000)}</pre>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          )}
          {run.data.meta && (
            <details>
              <summary className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] cursor-pointer">
                Meta
              </summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] font-mono">
                {Object.entries(run.data.meta).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted dark:text-[#8C837C]">{k}</dt>
                    <dd className="text-ink dark:text-[#E6E0D8] break-words">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {run.data.prompt && (
            <details>
              <summary className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] cursor-pointer">
                Prompt sent to model
              </summary>
              <pre className="mt-2 bg-cream-light dark:bg-[#17140F] rounded-md p-3 text-[11px] font-mono whitespace-pre-wrap text-muted dark:text-[#8C837C] max-h-72 overflow-y-auto">{run.data.prompt}</pre>
            </details>
          )}
        </div>
      )}
    </DetailDrawer>
  );
}

export default function RunsPage() {
  const qc = useQueryClient();
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => api.listRuns(), refetchInterval: 5_000 });
  const [selected, setSelected] = useState<string | null>(null);
  const list = runs.data?.runs ?? [];
  const stopMut = useMutation({
    mutationFn: (runId: string) => api.stopRun(runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runs'] }),
  });

  return (
    <div className="h-full flex bg-cream dark:bg-[#0F0D0A]">
      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader
          title="Runs"
          subtitle="Every agent invocation, with prompt, tool calls, tokens and cost."
          icon={History}
        />
        <div className="flex-1 overflow-y-auto px-8 py-8">
          {runs.isLoading && <SkeletonList count={3} />}
          {!runs.isLoading && list.length === 0 && (
            <EmptyState
              icon={History}
              title="No runs yet."
              hint="Send a Chat message or click Run on a Playbook to get started."
            />
          )}
          {list.length > 0 && (
            <EntityList>
              {list.map((r) => {
                const active = selected === r.runId;
                const started = runStarted(r.runId);
                return (
                  <EntityRow
                    key={r.runId}
                    selected={active}
                    onClick={() => setSelected(r.runId)}
                    leading={<Bot className="w-4 h-4 text-muted dark:text-[#8C837C]" />}
                    title={
                      <span className="flex items-center gap-2 min-w-0">
                        <RunStatusBadge status={r.status} done={r.done} />
                        <span className="truncate">{r.preview || r.agent || '—'}</span>
                        {r.model && (
                          <span className="text-[10px] font-mono text-muted dark:text-[#8C837C] truncate">
                            {r.model}
                          </span>
                        )}
                      </span>
                    }
                    subtitle={
                      <span className="truncate">
                        <span className="font-mono">{r.runId}</span>
                        {r.agent && <span className="ml-2 text-muted dark:text-[#8C837C]">{r.agent}</span>}
                      </span>
                    }
                    trailing={
                      <div className="flex items-center gap-3 print:hidden">
                        {(r.status === 'running' || (!r.status && !r.done)) && (
                          <span
                            onClick={(e) => e.stopPropagation()}
                            title="Mark this run as canceled. Writes a sentinel final.md so it stops showing as running."
                          >
                            <Button
                              variant="ghost"
                              onClick={() => stopMut.mutate(r.runId)}
                              disabled={stopMut.isPending && stopMut.variables === r.runId}
                            >
                              <Square className="w-3 h-3" />
                              {stopMut.isPending && stopMut.variables === r.runId ? 'Stopping…' : 'Stop'}
                            </Button>
                          </span>
                        )}
                        <div className="hidden sm:flex items-center gap-4 font-mono">
                          {r.toolCalls != null && <span>{r.toolCalls} tools</span>}
                          {r.tokensIn != null && <span>{r.tokensIn}/{r.tokensOut}</span>}
                          {r.costCents != null && <span>{(r.costCents / 100).toFixed(2)} USD</span>}
                          <span>{timeAgo(started)}</span>
                        </div>
                      </div>
                    }
                  />
                );
              })}
            </EntityList>
          )}
        </div>
      </div>
      {selected && <RunDetailPanel runId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
