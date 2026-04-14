'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

type Company = {
  path: string;
  frontmatter: Record<string, unknown>;
};

export default function CompaniesPage() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [domain, setDomain] = useState('');
  const [message, setMessage] = useState('');

  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<Company[]> => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('companies/') && f.path.endsWith('.md'),
      );
      const results = await Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          return { path: f.path, frontmatter: r.frontmatter };
        }),
      );
      return results;
    },
  });

  const enrich = useMutation({
    mutationFn: (d: string) => api.runAgent('researcher', `Enrich ${d} and save to companies/.`),
    onMutate: (d) => setMessage(`enriching ${d}…`),
    onSuccess: () => {
      setMessage('done');
      setShowDialog(false);
      setDomain('');
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (e: Error) => setMessage(`error: ${e.message}`),
  });

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Companies</h1>
          <p className="text-xs text-muted">Everything under companies/ in your vault.</p>
        </div>
        <button
          onClick={() => setShowDialog((s) => !s)}
          className="h-9 px-4 rounded-lg bg-flame text-white text-sm font-medium hover:opacity-90"
        >
          Enrich new
        </button>
      </header>
      <div className="h-full overflow-y-auto px-6 py-6">
        {showDialog && (
          <div className="bg-white rounded-xl border border-line p-4 mb-4 max-w-md">
            <label className="text-xs text-muted uppercase tracking-wide">domain</label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="acme.com"
              className="mt-1 w-full bg-cream border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-flame"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => domain && enrich.mutate(domain)}
                disabled={!domain || enrich.isPending}
                className="h-8 px-3 rounded-md bg-flame text-white text-sm disabled:opacity-40"
              >
                Run
              </button>
              <button onClick={() => setShowDialog(false)} className="h-8 px-3 rounded-md text-sm text-muted">
                Cancel
              </button>
            </div>
          </div>
        )}
        {message && <div className="text-xs text-muted mb-4">{message}</div>}
        {companies.isLoading && <div className="text-sm text-muted">loading…</div>}
        {companies.error && <div className="text-sm text-flame">{(companies.error as Error).message}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.data?.map((c) => {
            const fm = c.frontmatter;
            const slug = c.path.replace('companies/', '').replace(/\.md$/, '');
            return (
              <Link
                key={c.path}
                href={`/vault?path=${encodeURIComponent(c.path)}`}
                className="bg-white rounded-xl border border-line p-4 hover:border-flame transition-colors"
              >
                <div className="text-sm font-semibold text-ink">{String(fm.name ?? slug)}</div>
                <div className="text-xs text-muted font-mono">{String(fm.domain ?? '')}</div>
                <div className="mt-3 space-y-1 text-xs">
                  {fm.industry ? <div><span className="text-muted">industry:</span> {String(fm.industry)}</div> : null}
                  {fm.size ? <div><span className="text-muted">size:</span> {String(fm.size)}</div> : null}
                  {fm.icp_score !== undefined && (
                    <div>
                      <span className="text-muted">icp:</span>{' '}
                      <span className="font-medium text-flame">{String(fm.icp_score)}</span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
