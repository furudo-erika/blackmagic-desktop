'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Markdown } from '../../components/markdown';
import { Bot, History, Wrench } from 'lucide-react';
import {
  PageHeader,
  EntityList,
  EntityRow,
  EmptyState,
  DetailDrawer,
} from '../../components/ui/primitives';

function timeAgo(iso: string | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const d = (Date.now() - t) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
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
  return (
    <DetailDrawer eyebrow="Run" title={runId} onClose={onClose}>
      {run.isLoading && <div className="p-5 text-sm text-muted dark:text-[#8C837C]">loading…</div>}
      {run.data && (
        <div className="p-5 space-y-5">
          {run.data.meta && (
            <section>
              <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-2">Meta</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] font-mono">
                {Object.entries(run.data.meta).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted dark:text-[#8C837C]">{k}</dt>
                    <dd className="text-ink dark:text-[#E6E0D8] break-words">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {run.data.final && (
            <section>
              <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-2">Final answer</div>
              <div className="bg-cream-light dark:bg-[#17140F] rounded-md p-4 max-h-72 overflow-y-auto">
                <Markdown source={run.data.final} />
              </div>
            </section>
          )}
          {run.data.toolCalls?.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-2">
                Tool calls ({run.data.toolCalls.length})
              </div>
              <div className="space-y-2">
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
            </section>
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
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => api.listRuns(), refetchInterval: 5_000 });
  const [selected, setSelected] = useState<string | null>(null);
  const list = runs.data?.runs ?? [];

  return (
    <div className="h-full flex bg-cream dark:bg-[#0F0D0A]">
      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader
          title="Runs"
          subtitle="Every agent invocation, with prompt, tool calls, tokens and cost."
          icon={History}
        />
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {runs.isLoading && (
            <div className="text-sm text-muted dark:text-[#8C837C]">loading…</div>
          )}
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
                        <span className="truncate">{r.agent || '—'}</span>
                        {r.model && (
                          <span className="text-[10px] font-mono text-muted dark:text-[#8C837C] truncate">
                            {r.model}
                          </span>
                        )}
                      </span>
                    }
                    subtitle={<span className="font-mono">{r.runId}</span>}
                    trailing={
                      <div className="hidden sm:flex items-center gap-4 font-mono">
                        {r.toolCalls != null && <span>{r.toolCalls} tools</span>}
                        {r.tokensIn != null && <span>{r.tokensIn}/{r.tokensOut}</span>}
                        {r.costCents != null && <span>{(r.costCents / 100).toFixed(2)} USD</span>}
                        <span>{timeAgo(started)}</span>
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
