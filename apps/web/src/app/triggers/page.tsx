'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getBridge } from '../../lib/bridge';
import { Zap, Play, Search } from 'lucide-react';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  EntityList,
  EntityRow,
  EmptyState,
  Button,
} from '../../components/ui/primitives';

type Trigger = { path: string; frontmatter: Record<string, unknown> };

// fire result shape — shell triggers return a run log path we can link to.
type FireResult =
  | { ok: true; coming?: never; log?: string; exit?: number | null; durationMs?: number }
  | { ok: false; coming: true };

export default function TriggersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
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
      const res = await fetch(
        `http://127.0.0.1:${daemonPort}/api/triggers/${encodeURIComponent(name)}/fire`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${daemonToken}` },
        },
      );
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

  const filtered = useMemo(() => {
    const all = triggers.data ?? [];
    const filter = q.trim().toLowerCase();
    if (!filter) return all;
    return all.filter((t) => {
      const name = String(t.frontmatter.name ?? '').toLowerCase();
      const pb = String(t.frontmatter.playbook ?? '').toLowerCase();
      const shell = String(t.frontmatter.shell ?? '').toLowerCase();
      const sched = String(t.frontmatter.schedule ?? t.frontmatter.cron ?? '').toLowerCase();
      return name.includes(filter) || pb.includes(filter) || shell.includes(filter) || sched.includes(filter);
    });
  }, [triggers.data, q]);

  return (
    <PageShell>
      <PageHeader
        title="Triggers"
        subtitle="Things that fire on a cron schedule — run a Playbook or a shell command automatically."
        icon={Zap}
        trailing={
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted dark:text-[#8C837C]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter…"
              className="w-48 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-md pl-7 pr-3 py-1.5 text-xs text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
            />
          </div>
        }
      />
      <PageBody maxWidth="3xl">
        <Panel className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink dark:text-[#F5F1EA]">Presets</div>
              <p className="text-xs text-muted dark:text-[#8C837C] mt-1">
                Install the brand-monitor bundle: daily brand-mention sweep, weekly competitor
                teardown, daily industry-news digest. All write to{' '}
                <span className="font-mono">signals/</span>.
              </p>
              {installPresets.data && (
                <div className="text-xs text-muted dark:text-[#8C837C] mt-3">
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
            <Button
              variant="secondary"
              onClick={() => installPresets.mutate()}
              disabled={installPresets.isPending}
              className="whitespace-nowrap"
            >
              {installPresets.isPending ? 'Installing…' : 'Install brand-monitor presets'}
            </Button>
          </div>
        </Panel>

        {triggers.isLoading && (
          <div className="text-sm text-muted dark:text-[#8C837C]">loading…</div>
        )}
        {triggers.error && (
          <div className="text-sm text-flame">{(triggers.error as Error).message}</div>
        )}

        {triggers.data && filtered.length === 0 && (
          <EmptyState
            icon={Zap}
            title={q ? 'No triggers match that filter.' : 'No triggers yet.'}
            hint={
              q
                ? 'Try a different search term, or clear the filter to see everything.'
                : 'Install the brand-monitor preset above, or drop a .md file in triggers/ to define your own cron.'
            }
          />
        )}

        {filtered.length > 0 && (
          <EntityList>
            {filtered.map((t) => {
              const fm = t.frontmatter;
              const enabled = fm.enabled === true || fm.enabled === 'true';
              const name = String(fm.name ?? '');
              const isShell = typeof fm.shell === 'string' && (fm.shell as string).length > 0;
              const schedule =
                (typeof fm.schedule === 'string' && fm.schedule) ||
                (typeof fm.cron === 'string' && fm.cron) ||
                '';
              const recent = lastFire[name];
              const subtitleParts: string[] = [];
              if (schedule) subtitleParts.push(`cron: ${schedule}`);
              else if (fm.webhook) subtitleParts.push('webhook');
              // Triggers can target a shell cmd, a playbook, or an agent
              // directly (see daemon/triggers.ts). Label whichever binding
              // is present instead of always printing a blank `playbook:`
              // (QA BUG-07).
              const playbookName = typeof fm.playbook === 'string' ? fm.playbook : '';
              const agentName = typeof fm.agent === 'string' ? fm.agent : '';
              if (isShell) subtitleParts.push(`shell: ${String(fm.shell)}`);
              else if (playbookName) subtitleParts.push(`playbook: ${playbookName}`);
              else if (agentName) subtitleParts.push(`agent: ${agentName}`);
              else subtitleParts.push('⚠ no binding');
              const broken = !isShell && !playbookName && !agentName;
              return (
                <EntityRow
                  key={t.path}
                  asButton={false}
                  leading={
                    <span
                      className={
                        'relative flex h-2.5 w-2.5 rounded-full ' +
                        (enabled ? 'bg-flame' : 'bg-muted/40')
                      }
                    />
                  }
                  title={
                    <span className="flex items-center gap-2">
                      <span>{name || t.path}</span>
                      {isShell && (
                        <span
                          title={String(fm.shell)}
                          className="inline-flex items-center h-4 px-1.5 rounded border border-line dark:border-[#2A241D] text-[9px] font-mono uppercase tracking-wide text-muted dark:text-[#8C837C]"
                        >
                          shell
                        </span>
                      )}
                    </span>
                  }
                  subtitle={<span className="font-mono">{subtitleParts.join(' · ')}</span>}
                  trailing={
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                      {recent?.ok && recent.log && (
                        <a
                          href={`/vault?path=${encodeURIComponent(recent.log)}`}
                          className="text-[11px] text-muted dark:text-[#8C837C] hover:text-flame underline underline-offset-2"
                        >
                          view log
                          {typeof recent.exit === 'number' ? (
                            <span
                              className={
                                recent.exit === 0 ? 'text-[#7E8C67] ml-1' : 'text-flame ml-1'
                              }
                            >
                              (exit {recent.exit})
                            </span>
                          ) : null}
                        </a>
                      )}
                      {recent?.ok && !recent.log && (
                        <span className="text-[11px] text-[#7E8C67]">queued ✓</span>
                      )}
                      <label className="flex items-center gap-1.5 text-[11px]">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => toggle.mutate(t)}
                          className="accent-flame"
                        />
                        <span>{enabled ? 'enabled' : 'disabled'}</span>
                      </label>
                      <span title={broken ? 'Trigger has no playbook/agent/shell binding — edit the .md' : undefined}>
                        <Button
                          variant="secondary"
                          onClick={() => fire.mutate(name)}
                          disabled={fire.isPending || broken}
                        >
                          <Play className="w-3 h-3" />
                          {fire.isPending && fire.variables === name ? 'Firing…' : 'Fire now'}
                        </Button>
                      </span>
                    </div>
                  }
                />
              );
            })}
          </EntityList>
        )}
        {fire.error && (
          <div className="mt-3 text-xs text-flame">{(fire.error as Error).message}</div>
        )}
      </PageBody>
    </PageShell>
  );
}
