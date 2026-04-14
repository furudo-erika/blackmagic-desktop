'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

type Draft = { path: string; frontmatter: Record<string, unknown>; body: string };

export default function OutreachPage() {
  const qc = useQueryClient();
  const drafts = useQuery({
    queryKey: ['drafts'],
    queryFn: async (): Promise<Draft[]> => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('drafts/') && f.path.endsWith('.md'),
      );
      return Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          return { path: f.path, frontmatter: r.frontmatter, body: r.body };
        }),
      );
    },
  });

  // NOTE: /api/drafts/:id/approve not wired in daemon yet
  const approve = useMutation({
    mutationFn: async (_p: string) => ({ ok: false, coming: true }),
  });

  const reject = useMutation({
    mutationFn: (path: string) => api.writeFile(path, ''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drafts'] }),
  });

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line">
        <h1 className="text-lg font-semibold">Outreach</h1>
        <p className="text-xs text-muted">Drafts awaiting human approval before send.</p>
      </header>
      <div className="h-full overflow-y-auto px-6 py-6">
        {drafts.isLoading && <div className="text-sm text-muted">loading…</div>}
        {drafts.error && <div className="text-sm text-flame">{(drafts.error as Error).message}</div>}
        <div className="space-y-3 max-w-2xl">
          {drafts.data?.map((d) => {
            const fm = d.frontmatter;
            return (
              <div key={d.path} className="bg-white rounded-xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted font-mono">
                      {String(fm.channel ?? '')} · {String(fm.status ?? 'pending')}
                    </div>
                    <div className="text-sm font-semibold text-ink mt-1">{String(fm.subject ?? '(no subject)')}</div>
                    <div className="text-xs text-muted">to: {String(fm.to ?? '')}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs whitespace-pre-wrap text-ink/80">
                  {d.body.slice(0, 200)}
                  {d.body.length > 200 && '…'}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => approve.mutate(d.path)}
                    className="h-8 px-3 rounded-md bg-flame text-white text-xs hover:opacity-90"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => reject.mutate(d.path)}
                    className="h-8 px-3 rounded-md border border-line text-xs hover:border-flame"
                  >
                    Reject
                  </button>
                  <span className="text-xs text-muted">approve/reject not yet wired</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
