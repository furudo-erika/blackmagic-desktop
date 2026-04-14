'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

type Contact = { path: string; company: string; frontmatter: Record<string, unknown> };

export default function ContactsPage() {
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
        <div className="space-y-6 max-w-3xl">
          {Object.entries(grouped).map(([company, list]) => (
            <div key={company}>
              <div className="text-xs uppercase tracking-wide text-muted mb-2 font-mono">{company}</div>
              <div className="bg-white rounded-xl border border-line divide-y divide-line">
                {list.map((c) => (
                  <Link
                    key={c.path}
                    href={`/vault?path=${encodeURIComponent(c.path)}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-cream-light"
                  >
                    <div>
                      <div className="text-sm text-ink">{String(c.frontmatter.name ?? '')}</div>
                      <div className="text-xs text-muted">{String(c.frontmatter.role ?? '')}</div>
                    </div>
                    <div className="text-xs text-muted font-mono">{String(c.frontmatter.email ?? '')}</div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
