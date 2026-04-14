'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

type PlaybookInput = { name: string; required?: boolean };
type Playbook = { path: string; frontmatter: Record<string, unknown>; body: string };

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => values[k] ?? '');
}

function PlaybookRow({ pb }: { pb: Playbook }) {
  const fm = pb.frontmatter;
  const inputs = (Array.isArray(fm.inputs) ? (fm.inputs as PlaybookInput[]) : []);
  const agent = String(fm.agent ?? 'researcher');
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string>('');

  const run = useMutation({
    mutationFn: () => api.runAgent(agent, render(pb.body, values)),
    onSuccess: (d) => setResult(`done · runId=${d.runId}`),
    onError: (e: Error) => setResult(`error: ${e.message}`),
  });

  return (
    <div className="bg-white rounded-xl border border-line p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">{String(fm.name ?? pb.path)}</div>
          <div className="text-xs text-muted font-mono">agent: {agent}</div>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="h-8 px-3 rounded-md bg-flame text-white text-sm hover:opacity-90"
        >
          Run
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          {inputs.map((inp) => (
            <div key={inp.name}>
              <label className="text-xs text-muted uppercase tracking-wide">{inp.name}{inp.required ? ' *' : ''}</label>
              <input
                value={values[inp.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [inp.name]: e.target.value }))}
                className="mt-1 w-full bg-cream border border-line rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-flame"
              />
            </div>
          ))}
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="h-8 px-3 rounded-md bg-ink text-white text-sm disabled:opacity-40"
          >
            {run.isPending ? 'running…' : 'Execute'}
          </button>
          {result && <div className="text-xs text-muted">{result}</div>}
        </div>
      )}
    </div>
  );
}

export default function PlaybooksPage() {
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

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line">
        <h1 className="text-lg font-semibold">Playbooks</h1>
        <p className="text-xs text-muted">Reusable agent prompts with input slots.</p>
      </header>
      <div className="h-full overflow-y-auto px-6 py-6">
        {playbooks.isLoading && <div className="text-sm text-muted">loading…</div>}
        {playbooks.error && <div className="text-sm text-flame">{(playbooks.error as Error).message}</div>}
        <div className="space-y-3 max-w-2xl">
          {playbooks.data?.map((pb) => <PlaybookRow key={pb.path} pb={pb} />)}
        </div>
      </div>
    </div>
  );
}
