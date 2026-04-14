'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getBridge } from '../../lib/bridge';

type Trigger = { path: string; frontmatter: Record<string, unknown> };

export default function TriggersPage() {
  const qc = useQueryClient();
  const triggers = useQuery({
    queryKey: ['triggers'],
    queryFn: async (): Promise<Trigger[]> => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('triggers/') && f.path.endsWith('.md'),
      );
      return Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          return { path: f.path, frontmatter: r.frontmatter };
        }),
      );
    },
  });

  const toggle = useMutation({
    mutationFn: async (t: Trigger) => {
      const current = await api.readFile(t.path);
      const enabled = !(t.frontmatter.enabled === true || t.frontmatter.enabled === 'true');
      const flipped = current.content.replace(
        /^(enabled:\s*)(true|false)\s*$/m,
        `$1${enabled}`,
      );
      const finalContent = flipped === current.content
        ? current.content.replace(/^---\s*$/m, `---\nenabled: ${enabled}`)
        : flipped;
      await api.writeFile(t.path, finalContent);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triggers'] }),
  });

  const fire = useMutation({
    mutationFn: async (name: string) => {
      // NOTE: /api/triggers/:name/fire not wired in daemon yet
      const { daemonPort, daemonToken } = getBridge();
      const res = await fetch(`http://127.0.0.1:${daemonPort}/api/triggers/${encodeURIComponent(name)}/fire`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${daemonToken}` },
      });
      if (res.status === 404) return { ok: false, coming: true };
      if (!res.ok) throw new Error(`${res.status}`);
      return { ok: true };
    },
  });

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line">
        <h1 className="text-lg font-semibold">Triggers</h1>
        <p className="text-xs text-muted">Cron + webhook triggers from your vault.</p>
      </header>
      <div className="h-full overflow-y-auto px-6 py-6">
        {triggers.isLoading && <div className="text-sm text-muted">loading…</div>}
        {triggers.error && <div className="text-sm text-flame">{(triggers.error as Error).message}</div>}
        <div className="space-y-3 max-w-2xl">
          {triggers.data?.map((t) => {
            const fm = t.frontmatter;
            const enabled = fm.enabled === true || fm.enabled === 'true';
            const name = String(fm.name ?? '');
            return (
              <div key={t.path} className="bg-white rounded-xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-ink">{name}</div>
                    <div className="text-xs text-muted font-mono">
                      {fm.schedule ? `cron: ${String(fm.schedule)}` : fm.webhook ? 'webhook' : ''} · playbook: {String(fm.playbook ?? '')}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggle.mutate(t)}
                      className="accent-flame"
                    />
                    {enabled ? 'enabled' : 'disabled'}
                  </label>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => fire.mutate(name)}
                    className="h-8 px-3 rounded-md border border-line text-xs hover:border-flame"
                  >
                    Fire now
                  </button>
                  <span className="text-xs text-muted">coming soon</span>
                  {fire.data?.coming && <span className="text-xs text-muted">(endpoint not live)</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
