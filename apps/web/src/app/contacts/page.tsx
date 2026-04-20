'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Repeat, Users, Sparkles, Building2 } from 'lucide-react';

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
          return { path: f.path, company: parts[1] ?? 'unknown', frontmatter: r.frontmatter };
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

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line">
        <h1 className="text-lg font-semibold">Contacts</h1>
        <p className="text-xs text-muted">People in your vault, grouped by company.</p>
      </header>
      <div className="h-full overflow-y-auto px-6 py-6">
        {contacts.isLoading && <div className="text-sm text-muted">loading…</div>}
        {contacts.error && <div className="text-sm text-flame">{(contacts.error as Error).message}</div>}
        {!contacts.isLoading && (contacts.data?.length ?? 0) === 0 && (
          <div className="max-w-xl mx-auto mt-10 bg-white rounded-2xl border border-line p-8 text-center">
            <Users className="w-8 h-8 mx-auto mb-3 text-muted opacity-60" />
            <h2 className="text-base font-semibold text-ink mb-1">No contacts yet</h2>
            <p className="text-sm text-muted mb-5">
              Contacts live as markdown under <code className="text-[11px]">contacts/&lt;company&gt;/</code>.
              Add one by enriching a company, or ask the agent in Chat to
              pull a buying committee.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Link
                href="/companies"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-flame text-white text-sm font-medium hover:opacity-90"
              >
                <Building2 className="w-3.5 h-3.5" /> Enrich a company
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line text-sm text-ink hover:bg-cream-light"
              >
                <Sparkles className="w-3.5 h-3.5" /> Ask in Chat
              </Link>
            </div>
          </div>
        )}
        <div className="space-y-6 max-w-3xl">
          {Object.entries(grouped).map(([company, list]) => (
            <div key={company}>
              <div className="text-xs uppercase tracking-wide text-muted mb-2 font-mono">{company}</div>
              <div className="bg-white rounded-xl border border-line divide-y divide-line">
                {list.map((c) => {
                  const activeSeq = c.frontmatter.sequence ? String(c.frontmatter.sequence) : null;
                  const status = c.frontmatter.sequence_status ? String(c.frontmatter.sequence_status) : null;
                  return (
                    <div key={c.path} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          href={`/vault?path=${encodeURIComponent(c.path)}`}
                          className="flex-1 min-w-0 hover:bg-cream-light -mx-2 px-2 py-1 rounded"
                        >
                          <div className="text-sm text-ink">{String(c.frontmatter.name ?? '')}</div>
                          <div className="text-xs text-muted">{String(c.frontmatter.role ?? '')}</div>
                        </Link>
                        <div className="text-xs text-muted font-mono shrink-0">
                          {String(c.frontmatter.email ?? '')}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEnrollFor(enrollFor === c.path ? null : c.path)}
                          className="shrink-0 h-7 px-2 rounded-md border border-line text-[11px] hover:bg-cream-light flex items-center gap-1"
                          title={activeSeq ? `Enrolled: ${activeSeq}` : 'Enroll in sequence'}
                        >
                          <Repeat className="w-3 h-3" />
                          {activeSeq
                            ? `${activeSeq.replace(/^sequences\//, '').replace(/\.md$/, '')}${status ? ` · ${status}` : ''}`
                            : 'Enroll'}
                        </button>
                      </div>
                      {enrollFor === c.path && (
                        <div className="mt-2 flex items-center gap-2">
                          <select
                            value={picked}
                            onChange={(e) => setPicked(e.target.value)}
                            className="flex-1 h-8 px-2 rounded-md border border-line bg-cream-light text-[12px]"
                          >
                            <option value="">— pick a sequence —</option>
                            {sequences.data?.sequences.map((s) => (
                              <option key={s.path} value={s.path}>
                                {s.name} ({s.touches.length} touches)
                              </option>
                            ))}
                          </select>
                          <button
                            disabled={!picked || enroll.isPending}
                            onClick={() => enroll.mutate({ contact: c.path, sequence: picked })}
                            className="h-8 px-3 rounded-md bg-flame text-white text-[12px] font-medium disabled:opacity-40 hover:opacity-90"
                          >
                            {enroll.isPending ? '…' : 'Enroll'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
