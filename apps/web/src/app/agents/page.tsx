'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

type Agent = { path: string; frontmatter: Record<string, unknown> };

export default function AgentsPage() {
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: async (): Promise<Agent[]> => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'),
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

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line">
        <h1 className="text-lg font-semibold">Agents</h1>
        <p className="text-xs text-muted">Roles defined under agents/ in your vault.</p>
      </header>
      <div className="h-full overflow-y-auto px-6 py-6">
        {agents.isLoading && <div className="text-sm text-muted">loading…</div>}
        {agents.error && <div className="text-sm text-flame">{(agents.error as Error).message}</div>}
        <div className="bg-white rounded-xl border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-light text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Model</th>
                <th className="text-left px-4 py-2 font-medium">Tools</th>
                <th className="text-left px-4 py-2 font-medium">Temp</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {agents.data?.map((a) => {
                const fm = a.frontmatter;
                const tools = Array.isArray(fm.tools) ? (fm.tools as unknown[]).length : 0;
                return (
                  <tr key={a.path} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">{String(fm.name ?? '')}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{String(fm.model ?? '')}</td>
                    <td className="px-4 py-3">{tools}</td>
                    <td className="px-4 py-3">{fm.temperature !== undefined ? String(fm.temperature) : ''}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/vault?path=${encodeURIComponent(a.path)}`}
                        className="text-xs text-flame hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
