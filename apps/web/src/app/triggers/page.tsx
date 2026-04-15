'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getBridge } from '../../lib/bridge';

type Trigger = { path: string; frontmatter: Record<string, unknown> };

// fire result shape — shell triggers return a run log path we can link to.
type FireResult =
  | { ok: true; coming?: never; log?: string; exit?: number | null; durationMs?: number }
  | { ok: false; coming: true };

export default function TriggersPage() {
  const qc = useQueryClient();
  // Map of trigger name → last fire result, so we can show a "view log" link
  // per-trigger after shell runs finish.
  const [lastFire, setLastFire] = useState<Record<string, FireResult>>({});

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

  const installPresets = useMutation({
    mutationFn: () => api.installTriggerPresets(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triggers'] }),
  });

  const fire = useMutation({
    mutationFn: async (name: string): Promise<FireResult & { name: string }> => {
      const { daemonPort, daemonToken } = getBridge();
      const res = await fetch(`http://127.0.0.1:${daemonPort}/api/triggers/${encodeURIComponent(name)}/fire`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${daemonToken}` },
      });
      if (res.status === 404) return { ok: false, coming: true, name };
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json().catch(() => ({} as any));
      return {
        ok: true,
        name,
        log: typeof json?.log === 'string' ? json.log : undefined,
        exit: typeof json?.exit === 'number' ? json.exit : null,
        durationMs: typeof json?.durationMs === 'number' ? json.durationMs : undefined,
      };
    },
    onSuccess: (res) => {
      setLastFire((p) => ({ ...p, [res.name]: res }));
    },
  });

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line">
        <h1 className="text-lg font-semibold">Triggers</h1>
        <p className="text-xs text-muted">Cron + webhook triggers from your vault.</p>
      </header>
      <div className="h-full overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mb-6 bg-white rounded-xl border border-line p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-ink">Presets</div>
              <div className="text-xs text-muted mt-1">
                Install the brand-monitor bundle: daily brand-mention sweep,
                weekly competitor teardown, daily industry-news digest. All
                write to <span className="font-mono">signals/</span>.
              </div>
            </div>
            <button
              onClick={() => installPresets.mutate()}
              disabled={installPresets.isPending}
              className="h-8 px-3 rounded-md border border-line text-xs hover:border-flame disabled:opacity-50 whitespace-nowrap ml-4"
            >
              {installPresets.isPending ? 'Installing…' : 'Install brand-monitor presets'}
            </button>
          </div>
          {installPresets.data && (
            <div className="text-xs text-muted mt-3">
              {installPresets.data.created.length > 0
                ? `Installed: ${installPresets.data.created.join(', ')}`
                : 'All presets already installed.'}
              {installPresets.data.existing.length > 0 && installPresets.data.created.length > 0
                ? ` · Skipped: ${installPresets.data.existing.join(', ')}`
                : ''}
            </div>
          )}
          {installPresets.error && (
            <div className="text-xs text-flame mt-3">{(installPresets.error as Error).message}</div>
          )}
        </div>
        {triggers.isLoading && <div className="text-sm text-muted">loading…</div>}
        {triggers.error && <div className="text-sm text-flame">{(triggers.error as Error).message}</div>}
        <div className="space-y-3 max-w-2xl">
          {triggers.data?.map((t) => {
            const fm = t.frontmatter;
            const enabled = fm.enabled === true || fm.enabled === 'true';
            const name = String(fm.name ?? '');
            const isShell = typeof fm.shell === 'string' && (fm.shell as string).length > 0;
            // `schedule:` is the canonical field; `cron:` is accepted as an
            // alias by the daemon, so mirror both here.
            const schedule = (typeof fm.schedule === 'string' && fm.schedule)
              || (typeof fm.cron === 'string' && fm.cron)
              || '';
            const recent = lastFire[name];
            return (
              <div key={t.path} className="bg-white rounded-xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink flex items-center gap-2">
                      {name}
                      {isShell && (
                        <span
                          title={String(fm.shell)}
                          className="inline-flex items-center h-5 px-1.5 rounded border border-line text-[10px] font-mono uppercase tracking-wide text-muted"
                        >
                          shell
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted font-mono truncate">
                      {schedule ? `cron: ${schedule}` : fm.webhook ? 'webhook' : ''}
                      {' · '}
                      {isShell
                        ? `shell: ${String(fm.shell)}`
                        : `playbook: ${String(fm.playbook ?? '')}`}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs ml-3 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggle.mutate(t)}
                      className="accent-flame"
                    />
                    {enabled ? 'enabled' : 'disabled'}
                  </label>
                </div>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => fire.mutate(name)}
                    disabled={fire.isPending}
                    className="h-8 px-3 rounded-md border border-line text-xs hover:border-flame disabled:opacity-50"
                  >
                    {fire.isPending && fire.variables === name ? 'Firing…' : 'Fire now'}
                  </button>
                  {recent?.ok && recent.log && (
                    <a
                      href={`/vault?path=${encodeURIComponent(recent.log)}`}
                      className="text-xs text-muted hover:text-flame underline underline-offset-2"
                    >
                      view log
                      {typeof recent.exit === 'number' ? (
                        <span className={recent.exit === 0 ? 'text-[#7E8C67] ml-1' : 'text-flame ml-1'}>
                          (exit {recent.exit})
                        </span>
                      ) : null}
                    </a>
                  )}
                  {recent?.ok && !recent.log && <span className="text-xs text-[#7E8C67]">queued ✓</span>}
                  {fire.error && <span className="text-xs text-flame">{(fire.error as Error).message}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
