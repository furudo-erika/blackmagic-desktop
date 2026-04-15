'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { Markdown } from '../../components/markdown';
import { Search, Save, Pencil, Eye, FileText } from 'lucide-react';

type FileEntry = { path: string; type: 'file' | 'dir' };

const KIND_LABEL: Record<string, string> = {
  companies: 'Company',
  contacts: 'Contact',
  deals: 'Deal',
  drafts: 'Draft',
  agents: 'Agent',
  playbooks: 'Playbook',
  triggers: 'Trigger',
  memory: 'Memory',
  knowledge: 'Knowledge',
};
const KIND_COLOR: Record<string, string> = {
  companies: '#E8523A',
  contacts: '#D4A65A',
  deals: '#7E8C67',
  drafts: '#8899BB',
  agents: '#B06AB3',
  playbooks: '#66A8A8',
  triggers: '#C97660',
  memory: '#9A8C6E',
  knowledge: '#9A8C6E',
};

const topFolder = (p: string) => p.split('/')[0] ?? 'root';

function serialize(frontmatter: Record<string, unknown>, body: string): string {
  const keys = Object.keys(frontmatter);
  if (keys.length === 0) return body;
  const lines = ['---'];
  for (const k of keys) {
    const v = frontmatter[k];
    if (v == null) lines.push(`${k}:`);
    else if (typeof v === 'string') lines.push(`${k}: ${JSON.stringify(v)}`);
    else lines.push(`${k}: ${JSON.stringify(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n') + body;
}

function VaultContent() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const selected = params.get('path') ?? '';
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [draftBody, setDraftBody] = useState('');

  const tree = useQuery({ queryKey: ['vault-tree'], queryFn: api.vaultTree, staleTime: 5_000 });

  const file = useQuery({
    queryKey: ['vault-file', selected],
    queryFn: () => (selected ? api.readFile(selected) : Promise.resolve(null)),
    enabled: !!selected,
  });

  useEffect(() => {
    if (file.data) {
      setDraftBody(file.data.body);
      setEditing(false);
    }
  }, [file.data]);

  const byFolder = useMemo(() => {
    const map = new Map<string, FileEntry[]>();
    for (const entry of tree.data?.tree ?? []) {
      if (entry.type !== 'file') continue;
      if (!/\.md$/i.test(entry.path)) continue;
      const top = topFolder(entry.path);
      if (query && !entry.path.toLowerCase().includes(query.toLowerCase())) continue;
      const arr = map.get(top) ?? [];
      arr.push(entry);
      map.set(top, arr);
    }
    for (const a of map.values()) a.sort((x, y) => x.path.localeCompare(y.path));
    return map;
  }, [tree.data, query]);

  const orderedFolders = ['companies', 'contacts', 'deals', 'drafts', 'agents', 'playbooks', 'triggers', 'memory', 'knowledge'];
  const folders = [
    ...orderedFolders.filter((k) => byFolder.has(k)),
    ...[...byFolder.keys()].filter((k) => !orderedFolders.includes(k)),
  ];

  async function save() {
    if (!selected || !file.data) return;
    const full = serialize(file.data.frontmatter, draftBody);
    await api.writeFile(selected, full);
    setEditing(false);
    qc.invalidateQueries({ queryKey: ['vault-file', selected] });
    qc.invalidateQueries({ queryKey: ['vault-tree'] });
  }

  return (
    <div className="h-full flex flex-col bg-cream dark:bg-[#0F0D0A]">
      <header className="px-6 py-4 border-b border-line dark:border-[#2A241D] flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink dark:text-[#F5F1EA]">Vault</h1>
          <p className="text-xs text-muted dark:text-[#8C837C]">
            Everything on disk at <code className="text-[11px] bg-cream-light dark:bg-[#17140F] px-1.5 py-0.5 rounded">~/BlackMagic/</code>
          </p>
        </div>
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted dark:text-[#8C837C]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by path…"
            className="w-full bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-md pl-7 pr-3 py-1.5 text-xs font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
          />
        </div>
      </header>

      <div className="flex-1 overflow-hidden grid" style={{ gridTemplateColumns: 'minmax(280px, 340px) 1fr' }}>
        <aside className="border-r border-line dark:border-[#2A241D] overflow-y-auto">
          {folders.map((folder) => {
            const entries = byFolder.get(folder) ?? [];
            if (entries.length === 0) return null;
            const color = KIND_COLOR[folder] ?? '#605A57';
            return (
              <section key={folder} className="py-3">
                <div className="px-5 pb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C]">
                    {folder}
                  </span>
                  <span className="text-[10px] font-mono text-muted dark:text-[#6B625C]">{entries.length}</span>
                </div>
                <ul>
                  {entries.map((e) => {
                    const slug = e.path.split('/').slice(1).join('/').replace(/\.md$/, '');
                    const active = selected === e.path;
                    return (
                      <li key={e.path}>
                        <button
                          type="button"
                          onClick={() => router.push(`/vault?path=${encodeURIComponent(e.path)}`)}
                          className={
                            'w-full text-left px-5 py-1.5 text-sm font-mono truncate hover:bg-cream-light dark:hover:bg-[#17140F] ' +
                            (active
                              ? 'bg-white dark:bg-[#1F1B15] border-l-2 border-flame text-ink dark:text-[#F5F1EA]'
                              : 'text-muted dark:text-[#8C837C] border-l-2 border-transparent')
                          }
                        >
                          {slug || e.path}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {folders.length === 0 && (
            <div className="p-6 text-xs text-muted dark:text-[#8C837C]">
              Empty vault. Ask Chat to do something and files will appear here.
            </div>
          )}
        </aside>

        <section className="overflow-y-auto">
          {!selected && (
            <div className="h-full flex items-center justify-center text-sm text-muted dark:text-[#8C837C]">
              <div className="text-center max-w-md">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Select a file to view or edit.</p>
                <p className="mt-1 text-[11px] opacity-70">
                  The agent edits these same files — changes here round-trip back to the LLM.
                </p>
              </div>
            </div>
          )}
          {selected && file.isLoading && (
            <div className="p-6 text-sm text-muted dark:text-[#8C837C]">loading…</div>
          )}
          {selected && file.data && (
            <article className="max-w-3xl mx-auto px-8 py-6">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C]">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: KIND_COLOR[topFolder(selected)] ?? '#605A57' }}
                />
                {KIND_LABEL[topFolder(selected)] ?? topFolder(selected)}
              </div>
              <h2 className="mt-1 text-2xl font-semibold text-ink dark:text-[#F5F1EA] break-words">
                {(file.data.frontmatter as any)?.name ||
                  (file.data.frontmatter as any)?.subject ||
                  selected.split('/').pop()?.replace(/\.md$/, '')}
              </h2>
              <div className="mt-1 text-[11px] font-mono text-muted dark:text-[#8C837C]">{selected}</div>

              {Object.keys(file.data.frontmatter).length > 0 && (
                <div className="mt-5 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C] mb-2">
                    Frontmatter
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                    {Object.entries(file.data.frontmatter).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="font-mono text-muted dark:text-[#8C837C]">{k}</dt>
                        <dd className="font-mono text-ink dark:text-[#E6E0D8] break-words">
                          {typeof v === 'string' ? v : JSON.stringify(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div className="mt-6 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C]">
                  Body
                </div>
                <div className="flex items-center gap-1">
                  {!editing && (
                    <button
                      onClick={() => setEditing(true)}
                      className="text-[12px] px-2.5 py-1 rounded-md text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA] hover:bg-white dark:hover:bg-[#1F1B15] flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                  {editing && (
                    <>
                      <button
                        onClick={() => {
                          setDraftBody(file.data?.body ?? '');
                          setEditing(false);
                        }}
                        className="text-[12px] px-2.5 py-1 rounded-md text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA] flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Cancel
                      </button>
                      <button
                        onClick={save}
                        className="text-[12px] px-2.5 py-1 rounded-md bg-flame text-white flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" /> Save
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editing ? (
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  className="w-full mt-2 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl px-4 py-3 text-sm font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame min-h-[320px]"
                />
              ) : (
                <div className="mt-2 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl px-6 py-5">
                  <Markdown source={file.data.body} />
                </div>
              )}
            </article>
          )}
        </section>
      </div>
    </div>
  );
}

export default function VaultPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted dark:text-[#8C837C]">loading…</div>}>
      <VaultContent />
    </Suspense>
  );
}
