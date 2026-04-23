'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Repeat, Users, Sparkles, Building2 } from 'lucide-react';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  Button,
} from '../../components/ui/primitives';
import { SkeletonList } from '../../components/ui/skeleton';

type Contact = { path: string; company: string; frontmatter: Record<string, unknown> };

export default function ContactsPage() {
  const qc = useQueryClient();
  const contacts = useQuery({
    queryKey: ['contacts'],
    queryFn: async (): Promise<Contact[]> => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('contacts/') && f.path.endsWith('.md'),
      );
      const results = await Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          const parts = f.path.split('/');
          // Prefer nested directory (contacts/<company>/<person>.md);
          // fall back to frontmatter.company, then "Uncategorized".
          // Without this we'd show the filename itself as the group
          // header when contacts are stored flat at contacts/<x>.md.
          const dirCompany = parts.length > 2 ? parts[1] : '';
          const fmCompany = typeof r.frontmatter?.company === 'string'
            ? String(r.frontmatter.company).trim()
            : '';
          const company = dirCompany || fmCompany || 'Uncategorized';
          return { path: f.path, company, frontmatter: r.frontmatter };
        }),
      );
      return results;
    },
  });

  const sequences = useQuery({ queryKey: ['sequences'], queryFn: api.listSequences });

  const [enrollFor, setEnrollFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<string>('');

  const enroll = useMutation({
    mutationFn: ({ contact, sequence }: { contact: string; sequence: string }) =>
      api.enrollInSequence(contact, sequence),
    onSuccess: () => {
      setEnrollFor(null);
      setPicked('');
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['sequences'] });
    },
  });

  const grouped = (contacts.data ?? []).reduce<Record<string, Contact[]>>((acc, c) => {
    (acc[c.company] ||= []).push(c);
    return acc;
  }, {});
  const totalCount = contacts.data?.length ?? 0;
  const hasSequences = (sequences.data?.sequences?.length ?? 0) > 0;

  return (
    <PageShell>
      <PageHeader
        title="Contacts"
        subtitle="People in your vault, grouped by company. Enrich a company to populate its buying committee."
        icon={Users}
      />
      <PageBody maxWidth="4xl">
        {contacts.isLoading && <SkeletonList count={3} />}
        {contacts.error && (
          <div className="text-sm text-flame">{(contacts.error as Error).message}</div>
        )}
        {!contacts.isLoading && totalCount === 0 && (
          <Panel className="max-w-xl mx-auto mt-10 text-center" padded>
            <Users className="w-8 h-8 mx-auto mb-3 text-muted/60 dark:text-[#6B625C]" />
            <h2 className="text-base font-semibold text-ink dark:text-[#F5F1EA] mb-1">
              No contacts yet
            </h2>
            <p className="text-sm text-muted dark:text-[#8C837C] mb-5">
              Contacts live as markdown under <code className="text-[11px]">contacts/&lt;company&gt;/</code>.
              Add one by enriching a company, or ask an agent on Home to pull a buying committee.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Link
                href="/companies"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-flame text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Building2 className="w-3.5 h-3.5" /> Enrich a company
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line dark:border-[#2A241D] text-sm text-ink dark:text-[#E6E0D8] hover:border-flame/60 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" /> Ask on Home
              </Link>
            </div>
          </Panel>
        )}

        {totalCount > 0 && (
          <div className="mb-3 text-[11px] font-mono text-muted dark:text-[#8C837C] tabular-nums">
            {totalCount} contact{totalCount === 1 ? '' : 's'} · {Object.keys(grouped).length} compan{Object.keys(grouped).length === 1 ? 'y' : 'ies'}
          </div>
        )}

        <div className="space-y-6">
          {Object.entries(grouped).map(([company, list]) => (
            <section key={company}>
              <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-2 px-1">
                {company}
              </div>
              <Panel padded={false} className="overflow-hidden divide-y divide-line dark:divide-[#2A241D]">
                {list.map((c) => {
                  const activeSeq = c.frontmatter.sequence ? String(c.frontmatter.sequence) : null;
                  const status = c.frontmatter.sequence_status ? String(c.frontmatter.sequence_status) : null;
                  return (
                    <div key={c.path} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          href={`/vault?path=${encodeURIComponent(c.path)}`}
                          className="flex-1 min-w-0 -mx-2 px-2 py-1 rounded hover:bg-cream-light dark:hover:bg-[#17140F] transition-colors"
                        >
                          <div className="text-sm text-ink dark:text-[#E6E0D8] truncate">
                            {String(c.frontmatter.name ?? c.path.split('/').pop()?.replace(/\.md$/, '') ?? '')}
                          </div>
                          {!!c.frontmatter.role && (
                            <div className="text-xs text-muted dark:text-[#8C837C] truncate">
                              {String(c.frontmatter.role)}
                            </div>
                          )}
                        </Link>
                        {!!c.frontmatter.email && (
                          <div className="text-xs text-muted dark:text-[#8C837C] font-mono shrink-0 truncate max-w-[220px]">
                            {String(c.frontmatter.email)}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setEnrollFor(enrollFor === c.path ? null : c.path)}
                          className="shrink-0 h-7 px-2 rounded-md border border-line dark:border-[#2A241D] text-[11px] text-ink dark:text-[#E6E0D8] hover:border-flame/60 hover:bg-cream-light dark:hover:bg-[#17140F] flex items-center gap-1 transition-colors"
                          title={activeSeq ? `Enrolled: ${activeSeq}` : 'Enroll in sequence'}
                        >
                          <Repeat className="w-3 h-3" />
                          {activeSeq
                            ? `${activeSeq.replace(/^sequences\//, '').replace(/\.md$/, '')}${status ? ` · ${status}` : ''}`
                            : 'Enroll'}
                        </button>
                      </div>
                      {enrollFor === c.path && (
                        <div className="mt-3 flex items-center gap-2">
                          {hasSequences ? (
                            <>
                              <select
                                value={picked}
                                onChange={(e) => setPicked(e.target.value)}
                                className="flex-1 h-8 px-2 rounded-md border border-line dark:border-[#2A241D] bg-cream dark:bg-[#0F0D0A] text-[12px] text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
                              >
                                <option value="">— pick a sequence —</option>
                                {sequences.data?.sequences.map((s) => (
                                  <option key={s.path} value={s.path}>
                                    {s.name} ({s.touches.length} touches)
                                  </option>
                                ))}
                              </select>
                              <Button
                                variant="primary"
                                onClick={() => enroll.mutate({ contact: c.path, sequence: picked })}
                                disabled={!picked || enroll.isPending}
                              >
                                {enroll.isPending ? '…' : 'Enroll'}
                              </Button>
                            </>
                          ) : (
                            <div className="flex-1 flex items-center gap-2 text-[11px] text-muted dark:text-[#8C837C]">
                              <span>No sequences created yet.</span>
                              <Link href="/sequences" className="text-flame hover:underline">
                                Create one →
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Panel>
            </section>
          ))}
        </div>
      </PageBody>
    </PageShell>
  );
}
