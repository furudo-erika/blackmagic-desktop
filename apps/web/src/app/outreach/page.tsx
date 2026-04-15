'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Send, Mail } from 'lucide-react';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  EmptyState,
  Button,
} from '../../components/ui/primitives';

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

  const items = drafts.data ?? [];

  return (
    <PageShell>
      <PageHeader
        title="Outreach Drafts"
        subtitle="Drafts the agent wrote, waiting for your approve/reject. Approving sends; rejecting discards. Campaigns themselves live under Sequences."
        icon={Send}
      />
      <PageBody maxWidth="2xl">
        {drafts.isLoading && <div className="text-sm text-muted dark:text-[#8C837C]">loading…</div>}
        {drafts.error && <div className="text-sm text-flame">{(drafts.error as Error).message}</div>}

        {!drafts.isLoading && !drafts.error && items.length === 0 && (
          <EmptyState
            icon={Mail}
            title="No drafts pending."
            hint="When an agent composes an email or LinkedIn DM, it will land here for your approval before send."
          />
        )}

        {items.length > 0 && (
          <div className="space-y-3">
            {items.map((d) => {
              const fm = d.frontmatter;
              return (
                <Panel key={d.path}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase tracking-wider text-muted dark:text-[#8C837C] font-mono">
                        {String(fm.channel ?? '')} · {String(fm.status ?? 'pending')}
                      </div>
                      <div className="text-sm font-semibold text-ink dark:text-[#F5F1EA] mt-1 truncate">
                        {String(fm.subject ?? '(no subject)')}
                      </div>
                      <div className="text-[11px] text-muted dark:text-[#8C837C] font-mono truncate">
                        to: {String(fm.to ?? '')}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-[12px] whitespace-pre-wrap text-ink/80 dark:text-[#E6E0D8]/80 leading-relaxed">
                    {d.body.slice(0, 280)}
                    {d.body.length > 280 && '…'}
                  </div>
                  <div className="mt-3 pt-3 border-t border-line dark:border-[#2A241D] flex items-center gap-2">
                    <Button variant="primary" onClick={() => approve.mutate(d.path)}>
                      Approve
                    </Button>
                    <Button variant="secondary" onClick={() => reject.mutate(d.path)}>
                      Reject
                    </Button>
                    <span className="ml-auto text-[11px] text-muted dark:text-[#8C837C]">
                      approve/reject not yet wired
                    </span>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </PageBody>
    </PageShell>
  );
}
