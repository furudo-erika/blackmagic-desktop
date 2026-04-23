'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, Building2, MessageCircle, ArrowRight, X } from 'lucide-react';
import { api } from '../../lib/api';
import { SkeletonList } from '../../components/ui/skeleton';
import {
  PageShell,
  PageHeader,
  PageBody,
  Button,
  SectionHeading,
  EmptyState,
} from '../../components/ui/primitives';

// Hand off to the home composer with a prefilled prompt. Matches the
// home→chat handoff pattern: stash in localStorage under
// bm-pending-prompt, then navigate. Home reads + clears on mount.
function askChat(router: ReturnType<typeof useRouter>, prompt: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('bm-pending-prompt', prompt);
  }
  router.push('/');
}

type Deal = { path: string; state: string; frontmatter: Record<string, unknown> };

const STATES = ['open', 'closed-won', 'closed-lost'] as const;
const LABELS: Record<string, string> = {
  open: 'Open',
  'closed-won': 'Closed Won',
  'closed-lost': 'Closed Lost',
};
const HEALTH_COLOR: Record<string, string> = {
  green: 'bg-[#3FA36B]',
  yellow: 'bg-[#D79B3C]',
  red: 'bg-[#E8634A]',
};

export default function DealsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const stageFilter = (search.get('stage') ?? '').trim().toLowerCase();
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
    <PageShell>
      <PageHeader
        title="Deals"
        subtitle="Pipeline from deals/ in your vault."
        icon={Briefcase}
        trailing={
          stageFilter ? (
            <Link
              href="/deals"
              className="inline-flex items-center gap-1 rounded-full border border-line dark:border-[#2A241D] px-2.5 py-1 text-[11px] font-mono text-muted dark:text-[#8C837C] hover:border-flame/40 hover:text-ink dark:hover:text-[#F5F1EA]"
            >
              stage: {stageFilter} <X className="h-3 w-3" />
            </Link>
          ) : undefined
        }
      />
      <PageBody maxWidth="5xl">
        {deals.isLoading && <SkeletonList count={3} />}
        {deals.error && (
          <div className="text-[13px] text-[#E8634A]">{(deals.error as Error).message}</div>
        )}
        {!deals.isLoading && (deals.data?.length ?? 0) === 0 && (
          <EmptyState
            icon={Briefcase}
            title="No deals yet."
            hint="Deals land in deals/open/, deals/closed-won/, and deals/closed-lost/. Start by enriching a company or asking the chat to draft a deal note."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/companies">
                  <Button variant="secondary">
                    <Building2 className="h-3.5 w-3.5" /> Enrich a company{' '}
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
                <Button
                  variant="secondary"
                  onClick={() => askChat(router, 'Draft a new deal for ')}
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Ask chat to draft one
                </Button>
              </div>
            }
          />
        )}
        {(deals.data?.length ?? 0) > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STATES.map((st) => {
              const list = (deals.data ?? [])
                .filter((d) => d.state === st)
                .filter((d) => {
                  if (!stageFilter) return true;
                  const s = String(d.frontmatter.stage ?? '').trim().toLowerCase();
                  return s === stageFilter;
                });
              return (
                <div key={st}>
                  <div className="flex items-baseline justify-between mb-3">
                    <SectionHeading>{LABELS[st]}</SectionHeading>
                    <span className="text-[11px] font-mono text-muted dark:text-[#8C837C]">
                      {list.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {list.length === 0 && (
                      <div className="rounded-lg border border-dashed border-line dark:border-[#2A241D] p-4 text-center text-[11px] text-muted dark:text-[#8C837C]">
                        <div>Nothing here yet.</div>
                        <button
                          type="button"
                          onClick={() => askChat(router, `Draft a new deal for ${(LABELS[st] ?? st).toLowerCase()}`)}
                          className="mt-1 inline-flex items-center gap-1 text-flame hover:underline"
                        >
                          <MessageCircle className="h-3 w-3" /> Ask chat to draft one
                        </button>
                      </div>
                    )}
                    {list.map((d) => {
                      const fm = d.frontmatter;
                      const h = String(fm.health ?? '');
                      return (
                        <Link
                          key={d.path}
                          href={`/vault?path=${encodeURIComponent(d.path)}`}
                          className="block bg-white dark:bg-[#1F1B15] rounded-lg border border-line dark:border-[#2A241D] p-4 hover:border-flame/40 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA] truncate">
                              {String(fm.company ?? '')}
                            </div>
                            {h && (
                              <span
                                className={`inline-block w-2 h-2 rounded-full shrink-0 ${HEALTH_COLOR[h] ?? 'bg-muted'}`}
                              />
                            )}
                          </div>
                          <div className="mt-1 text-[11px] font-mono text-muted dark:text-[#8C837C]">
                            {fm.amount_usd ? `$${String(fm.amount_usd)}` : ''}
                            {fm.stage ? ` · ${String(fm.stage)}` : ''}
                          </div>
                          {fm.next_step ? (
                            <div className="mt-2 text-[13px] leading-relaxed text-ink/90 dark:text-[#E6E0D8]">
                              {String(fm.next_step)}
                            </div>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageBody>
    </PageShell>
  );
}
