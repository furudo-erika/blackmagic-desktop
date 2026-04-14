'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export default function RunsPage() {
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => api.listRuns() });

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line">
        <h1 className="text-lg font-semibold">Runs</h1>
        <p className="text-xs text-muted">History of agent runs.</p>
      </header>
      <div className="h-full overflow-y-auto px-6 py-6">
        {runs.isLoading && <div className="text-sm text-muted">loading…</div>}
        {runs.error && <div className="text-sm text-flame">{(runs.error as Error).message}</div>}
        <div className="bg-white rounded-xl border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-light text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Run</th>
                <th className="text-left px-4 py-2 font-medium">Agent</th>
                <th className="text-left px-4 py-2 font-medium">Model</th>
                <th className="text-right px-4 py-2 font-medium">In</th>
                <th className="text-right px-4 py-2 font-medium">Out</th>
                <th className="text-right px-4 py-2 font-medium">Cost¢</th>
                <th className="text-right px-4 py-2 font-medium">Tools</th>
                <th className="text-right px-4 py-2 font-medium">Turns</th>
              </tr>
            </thead>
            <tbody>
              {runs.data?.runs.map((r) => (
                <tr key={r.runId} className="border-t border-line hover:bg-cream-light">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/runs/${encodeURIComponent(r.runId)}`} className="text-flame hover:underline">
                      {r.runId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.agent}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{r.model}</td>
                  <td className="px-4 py-3 text-right">{r.tokensIn}</td>
                  <td className="px-4 py-3 text-right">{r.tokensOut}</td>
                  <td className="px-4 py-3 text-right">{r.costCents}</td>
                  <td className="px-4 py-3 text-right">{r.toolCalls}</td>
                  <td className="px-4 py-3 text-right">{r.turns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
