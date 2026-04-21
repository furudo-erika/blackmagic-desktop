'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, Building2, MessageCircle, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';

type Deal = { path: string; state: string; frontmatter: Record<string, unknown> };

const STATES = ['open', 'closed-won', 'closed-lost'] as const;
const LABELS: Record<string, string> = {
  open: 'Open',
  'closed-won': 'Closed Won',
  'closed-lost': 'Closed Lost',
};
const HEALTH_COLOR: Record<string, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-flame',
};

export default function DealsPage() {
  const deals = useQuery({
    queryKey: ['deals'],
    queryFn: async (): Promise<Deal[]> => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('deals/') && f.path.endsWith('.md'),
      );
      const results = await Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          const parts = f.path.split('/');
          return { path: f.path, state: parts[1] ?? 'open', frontmatter: r.frontmatter };
        }),
      );
      return results;
    },
  });

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line">
        <h1 className="text-lg font-semibold">Deals</h1>
        <p className="text-xs text-muted">Pipeline from deals/ in your vault.</p>
      </header>
      <div className="h-full overflow-y-auto px-6 py-6">
        {deals.isLoading && <div className="text-sm text-muted">loading…</div>}
        {deals.error && <div className="text-sm text-flame">{(deals.error as Error).message}</div>}
        {!deals.isLoading && (deals.data?.length ?? 0) === 0 && (
          <div className="mx-auto max-w-lg mt-8 rounded-xl border border-dashed border-line bg-white p-6 text-center">
            <Briefcase className="mx-auto mb-3 h-6 w-6 text-muted" />
            <div className="text-sm font-semibold text-ink">No deals yet.</div>
            <p className="mt-1 text-xs text-muted">
              Deals land in <code className="font-mono">deals/open/</code>,{' '}
              <code className="font-mono">deals/closed-won/</code>, and{' '}
              <code className="font-mono">deals/closed-lost/</code>. Start by enriching a
              company or asking the chat to draft a deal note.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
              <Link
                href="/companies"
                className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-ink hover:border-flame"
              >
                <Building2 className="h-3 w-3" /> Enrich a company <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/chat"
                className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-ink hover:border-flame"
              >
                <MessageCircle className="h-3 w-3" /> Ask chat to draft one
              </Link>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STATES.map((st) => {
            const list = (deals.data ?? []).filter((d) => d.state === st);
            return (
              <div key={st}>
                <div className="text-xs uppercase tracking-wide text-muted mb-2 font-mono">
                  {LABELS[st]} · {list.length}
                </div>
                <div className="space-y-2">
                  {list.map((d) => {
                    const fm = d.frontmatter;
                    const h = String(fm.health ?? '');
                    return (
                      <Link
                        key={d.path}
                        href={`/vault?path=${encodeURIComponent(d.path)}`}
                        className="block bg-white rounded-xl border border-line p-4 hover:border-flame"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-ink">{String(fm.company ?? '')}</div>
                          {h && <span className={`inline-block w-2 h-2 rounded-full ${HEALTH_COLOR[h] ?? 'bg-muted'}`} />}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {fm.amount_usd ? `$${String(fm.amount_usd)}` : ''}
                          {fm.stage ? ` · ${String(fm.stage)}` : ''}
                        </div>
                        {fm.next_step ? (
                          <div className="mt-2 text-xs text-ink">{String(fm.next_step)}</div>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
