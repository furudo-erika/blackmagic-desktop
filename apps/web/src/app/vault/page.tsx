'use client';

import { useMemo, useState, useEffect, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '../../lib/api';

function serialize(frontmatter: Record<string, unknown>, body: string): string {
  const keys = Object.keys(frontmatter);
  if (keys.length === 0) return body;
  const yaml = keys
    .map((k) => {
      const v = frontmatter[k];
      if (v === null || v === undefined) return `${k}: null`;
      if (Array.isArray(v)) return `${k}:\n${v.map((x) => `  - ${JSON.stringify(x)}`).join('\n')}`;
      if (typeof v === 'object') return `${k}: ${JSON.stringify(v)}`;
      if (typeof v === 'string' && /[:#\n]/.test(v)) return `${k}: ${JSON.stringify(v)}`;
      return `${k}: ${v}`;
    })
    .join('\n');
  return `---\n${yaml}\n---\n\n${body}`;
}

function VaultInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const initialPath = searchParams.get('path') || '';
  const [selected, setSelected] = useState<string>(initialPath);
  const [body, setBody] = useState('');

  const tree = useQuery({ queryKey: ['vaultTree'], queryFn: () => api.vaultTree() });
  const file = useQuery({
    queryKey: ['vaultFile', selected],
    queryFn: () => api.readFile(selected),
    enabled: !!selected,
  });

  useEffect(() => {
    if (file.data) setBody(file.data.body);
  }, [file.data]);

  useEffect(() => {
    const p = searchParams.get('path') || '';
    if (p && p !== selected) setSelected(p);
  }, [searchParams, selected]);

  const save = useMutation({
    mutationFn: () => {
      const content = serialize(file.data?.frontmatter ?? {}, body);
      return api.writeFile(selected, content);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vaultFile', selected] }),
  });

  const files = useMemo(() => {
    const items = tree.data?.tree ?? [];
    return [...items].sort((a, b) => a.path.localeCompare(b.path));
  }, [tree.data]);

  function pick(p: string) {
    setSelected(p);
    router.replace(`/vault?path=${encodeURIComponent(p)}`);
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line">
        <h1 className="text-lg font-semibold">Vault</h1>
        <p className="text-xs text-muted">Browse and edit files in ~/BlackMagic/.</p>
      </header>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-[300px] shrink-0 border-r border-line overflow-y-auto px-3 py-4 bg-cream-light">
          {tree.isLoading && <div className="text-xs text-muted px-2">loading…</div>}
          {tree.error && <div className="text-xs text-flame px-2">{(tree.error as Error).message}</div>}
          <ul className="text-sm">
            {files.map((f) => {
              const depth = f.path.split('/').length - 1;
              const name = f.path.split('/').pop() || f.path;
              const active = f.path === selected;
              return (
                <li key={f.path}>
                  {f.type === 'file' ? (
                    <button
                      onClick={() => pick(f.path)}
                      className={`w-full text-left px-2 py-1 rounded hover:bg-white truncate ${
                        active ? 'bg-white text-ink font-medium' : 'text-muted'
                      }`}
                      style={{ paddingLeft: 8 + depth * 12 }}
                    >
                      {name}
                    </button>
                  ) : (
                    <div
                      className="px-2 py-1 text-xs uppercase tracking-wide text-muted"
                      style={{ paddingLeft: 8 + depth * 12 }}
                    >
                      {name}/
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {!selected && <div className="text-sm text-muted">Select a file from the tree.</div>}
          {selected && file.isLoading && <div className="text-sm text-muted">loading…</div>}
          {selected && file.data && (
            <div className="max-w-3xl space-y-4">
              <div className="text-xs font-mono text-muted">{selected}</div>
              {Object.keys(file.data.frontmatter).length > 0 && (
                <div className="bg-white rounded-xl border border-line p-4">
                  <div className="text-xs uppercase tracking-wide text-muted mb-2">frontmatter</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(file.data.frontmatter).map(([k, v]) => (
                        <tr key={k} className="border-t border-line first:border-t-0">
                          <td className="py-1.5 pr-4 font-mono text-xs text-muted align-top w-40">{k}</td>
                          <td className="py-1.5 text-sm break-all">
                            {typeof v === 'string' ? v : JSON.stringify(v)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={20}
                className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-flame"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="h-9 px-4 rounded-lg bg-flame text-white text-sm font-medium hover:opacity-90 disabled:opacity-40"
                >
                  {save.isPending ? 'saving…' : 'Save'}
                </button>
                {save.isSuccess && <span className="text-xs text-muted">saved</span>}
                {save.error && <span className="text-xs text-flame">{(save.error as Error).message}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VaultPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">loading…</div>}>
      <VaultInner />
    </Suspense>
  );
}
