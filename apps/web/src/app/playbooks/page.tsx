'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Play, Search, ChevronDown, ChevronRight, FileText } from 'lucide-react';

type PlaybookInput = { name: string; required?: boolean };
type Playbook = {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => values[k] ?? '');
}

// Friendly group labels keyed off the `group:` frontmatter field that the
// seeded playbooks use. Order here is the order they appear in the UI.
const GROUPS: Array<{ id: string; label: string; description: string; color: string }> = [
  { id: 'building-blocks', label: 'Building blocks', description: 'Used by other Playbooks. Run them on their own only when you need to.', color: '#605A57' },
  { id: 'setup', label: 'Setup', description: 'One-time configuration — bootstrap your company info, import legacy data.', color: '#9A8C6E' },
  { id: 'research', label: 'Research', description: 'Build account briefs and competitor reports.', color: '#7E8C67' },
  { id: 'high-intent-visitor', label: 'When a high-intent visitor lands', description: 'Deanonymize → qualify → research → outreach.', color: '#E8523A' },
  { id: 'deal-won', label: 'When a deal closes Won', description: 'Analyze the win, find lookalikes, expand from the success.', color: '#7E8C67' },
  { id: 'deal-lost', label: 'When a deal closes Lost', description: 'Pull history, extract competitor intel, propose process fixes.', color: '#C97660' },
  { id: 'meeting-prep', label: 'Before a meeting', description: 'Pre-call brief: who, why, talking points, traps to avoid.', color: '#D4A65A' },
  { id: 'pipeline-health', label: 'Pipeline hygiene', description: 'Catch stale deals, missing next steps, at-risk opportunities.', color: '#6A8EC4' },
  { id: 'linkedin-intent', label: 'When someone engages on LinkedIn', description: 'Detect → enrich → personalize → DM.', color: '#B06AB3' },
];

function PlaybookCard({ pb, color }: { pb: Playbook; color: string }) {
  const fm = pb.frontmatter;
  const inputs = (Array.isArray(fm.inputs) ? (fm.inputs as PlaybookInput[]) : []);
  const agent = String(fm.agent ?? 'researcher');
  const name = String(fm.name ?? pb.path.replace(/^playbooks\//, '').replace(/\.md$/, ''));
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: true; runId: string } | { ok: false; err: string } | null>(null);

  // Pull the first prose paragraph from the body as the human-friendly
  // summary. Everything else (the prompt itself) is "advanced" and only
  // shown when expanded.
  const summary = useMemo(() => {
    const trimmed = pb.body.trim();
    const para = trimmed.split(/\n\s*\n/)[0] ?? '';
    return para.replace(/[#`*_]/g, '').slice(0, 240);
  }, [pb.body]);

  const run = useMutation({
    mutationFn: () => {
      const missing = inputs.filter((i) => i.required && !values[i.name]?.trim()).map((i) => i.name);
      if (missing.length) throw new Error(`Need: ${missing.join(', ')}`);
      return api.runAgent(agent, render(pb.body, values));
    },
    onSuccess: (d) => setResult({ ok: true, runId: d.runId }),
    onError: (e: Error) => setResult({ ok: false, err: e.message }),
  });

  return (
    <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-cream-light dark:hover:bg-[#17140F]"
      >
        <span
          className="mt-1 inline-block w-2 h-2 rounded-full shrink-0"
          style={{ background: color }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink dark:text-[#F5F1EA]">{name}</div>
          <p className="mt-1 text-[12px] text-muted dark:text-[#8C837C] line-clamp-2 leading-snug">
            {summary || '(no description)'}
          </p>
          {inputs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {inputs.map((i) => (
                <span
                  key={i.name}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cream-light dark:bg-[#17140F] text-muted dark:text-[#8C837C]"
                >
                  {i.name}{i.required ? '*' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted shrink-0 mt-1" /> : <ChevronRight className="w-4 h-4 text-muted shrink-0 mt-1" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-line dark:border-[#2A241D] pt-3 space-y-3">
          {inputs.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {inputs.map((inp) => (
                <div key={inp.name}>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C]">
                    {inp.name}{inp.required ? ' *' : ''}
                  </label>
                  <input
                    value={values[inp.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [inp.name]: e.target.value }))}
                    placeholder={inp.name === 'domain' ? 'acme.com' : ''}
                    className="mt-1 w-full bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-1.5 text-sm font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
                  />
                </div>
              ))}
            </div>
          )}

          <details className="text-[12px] text-muted dark:text-[#8C837C]">
            <summary className="cursor-pointer hover:text-ink dark:hover:text-[#F5F1EA] inline-flex items-center gap-1">
              <FileText className="w-3 h-3" /> Show full prompt
            </summary>
            <pre className="mt-2 bg-cream-light dark:bg-[#17140F] border border-line dark:border-[#2A241D] rounded-md p-3 text-[11px] text-muted dark:text-[#8C837C] whitespace-pre-wrap leading-relaxed font-mono max-h-60 overflow-auto">
              {pb.body}
            </pre>
          </details>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => run.mutate()}
              disabled={run.isPending}
              className="h-8 px-4 rounded-md bg-flame text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
            >
              <Play className="w-3 h-3" />
              {run.isPending ? 'Running…' : 'Run Playbook'}
            </button>
            {result?.ok && (
              <span className="text-[11px] text-muted dark:text-[#8C837C] font-mono">
                ✓ run {result.runId}
              </span>
            )}
            {result && !result.ok && (
              <span className="text-[11px] text-flame font-mono">{result.err}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlaybooksPage() {
  const [q, setQ] = useState('');

  const playbooks = useQuery({
    queryKey: ['playbooks'],
    queryFn: async (): Promise<Playbook[]> => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('playbooks/') && f.path.endsWith('.md'),
      );
      return Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          return { path: f.path, frontmatter: r.frontmatter, body: r.body };
        }),
      );
    },
  });

  const grouped = useMemo(() => {
    const all = playbooks.data ?? [];
    const filter = q.trim().toLowerCase();
    const matches = (pb: Playbook) =>
      !filter ||
      pb.path.toLowerCase().includes(filter) ||
      String(pb.frontmatter.name ?? '').toLowerCase().includes(filter) ||
      pb.body.toLowerCase().includes(filter);

    const map = new Map<string, Playbook[]>();
    for (const pb of all) {
      if (!matches(pb)) continue;
      const g = String(pb.frontmatter.group ?? 'other');
      const arr = map.get(g) ?? [];
      arr.push(pb);
      map.set(g, arr);
    }
    return map;
  }, [playbooks.data, q]);

  return (
    <div className="h-full flex flex-col bg-cream dark:bg-[#0F0D0A]">
      <header className="px-6 py-4 border-b border-line dark:border-[#2A241D] flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink dark:text-[#F5F1EA]">Playbooks</h1>
          <p className="text-xs text-muted dark:text-[#8C837C]">
            Click any Playbook to see what it does and run it. The agent will edit your vault according to the steps.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted dark:text-[#8C837C]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter…"
            className="w-full bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-md pl-7 pr-3 py-1.5 text-xs text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {playbooks.isLoading && <div className="text-sm text-muted dark:text-[#8C837C]">loading…</div>}
        {playbooks.error && <div className="text-sm text-flame">{(playbooks.error as Error).message}</div>}

        <div className="max-w-3xl mx-auto space-y-8">
          {GROUPS.filter((g) => grouped.has(g.id)).map((g) => {
            const list = grouped.get(g.id)!;
            return (
              <section key={g.id}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: g.color }} />
                  <h2 className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA]">{g.label}</h2>
                  <span className="text-[11px] text-muted dark:text-[#8C837C]">· {list.length}</span>
                </div>
                <p className="text-[12px] text-muted dark:text-[#8C837C] mb-3 -mt-2 ml-4">
                  {g.description}
                </p>
                <div className="space-y-2">
                  {list.map((pb) => <PlaybookCard key={pb.path} pb={pb} color={g.color} />)}
                </div>
              </section>
            );
          })}
          {/* Anything not matched into a known group gets bucketed at the bottom */}
          {[...grouped.entries()]
            .filter(([id]) => !GROUPS.find((g) => g.id === id))
            .map(([id, list]) => (
              <section key={id}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-muted" />
                  <h2 className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA]">
                    {id === 'other' ? 'Other' : id}
                  </h2>
                  <span className="text-[11px] text-muted dark:text-[#8C837C]">· {list.length}</span>
                </div>
                <div className="space-y-2">
                  {list.map((pb) => <PlaybookCard key={pb.path} pb={pb} color="#605A57" />)}
                </div>
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}
