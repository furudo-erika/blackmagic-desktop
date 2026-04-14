'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export default function ToolsPage() {
  const tools = useQuery({ queryKey: ['tools'], queryFn: () => api.tools() });

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line">
        <h1 className="text-lg font-semibold">Tools</h1>
        <p className="text-xs text-muted">Builtin tools plus anything hosted via MCP.</p>
      </header>
      <div className="h-full overflow-y-auto px-6 py-6">
        <div className="bg-flame-soft border border-flame/20 rounded-xl p-4 mb-4 text-xs text-ink max-w-2xl">
          MCP servers are configured in <code className="font-mono">~/BlackMagic/.bm/mcp.json</code>.
        </div>
        {tools.isLoading && <div className="text-sm text-muted">loading…</div>}
        {tools.error && <div className="text-sm text-flame">{(tools.error as Error).message}</div>}
        <div className="bg-white rounded-xl border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-light text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Description</th>
                <th className="text-left px-4 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {tools.data?.tools.map((t) => (
                <tr key={t.name} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-xs">{t.name}</td>
                  <td className="px-4 py-3 text-muted">{t.description}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        t.source === 'mcp' ? 'bg-flame-soft text-flame' : 'bg-cream-light text-muted'
                      }`}
                    >
                      {t.source}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
