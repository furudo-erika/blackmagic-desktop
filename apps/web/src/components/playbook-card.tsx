'use client';

/**
 * Reusable PlaybookCard — used on /playbooks and /team/[slug].
 *
 * One row of the context tree at playbooks/<slug>.md. Expands to show
 * input fields, the full rendered prompt, and a Run button that calls
 * api.runAgent.
 */

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Play,
} from 'lucide-react';

import { api } from '../lib/api';
import { playbookTitle } from '../config/playbook-titles';
import { Panel, Button } from './ui/primitives';

export type PlaybookInput = { name: string; required?: boolean };

export type Playbook = {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => values[k] ?? '');
}

export function PlaybookCard({
  pb,
  color = '#E8523A',
}: {
  pb: Playbook;
  color?: string;
}) {
  const fm = pb.frontmatter;
  const inputs = (Array.isArray(fm.inputs) ? (fm.inputs as PlaybookInput[]) : []);
  const agent = String(fm.agent ?? 'researcher');
  const slug = String(
    fm.name ?? pb.path.replace(/^playbooks\//, '').replace(/\.md$/, ''),
  );
  const name = playbookTitle(slug);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<
    { ok: true; runId: string } | { ok: false; err: string } | null
  >(null);

  const summary = useMemo(() => {
    const trimmed = pb.body.trim();
    const para = trimmed.split(/\n\s*\n/)[0] ?? '';
    return para.replace(/[#`*_]/g, '').slice(0, 240);
  }, [pb.body]);

  const run = useMutation({
    mutationFn: () => {
      const missing = inputs
        .filter((i) => i.required && !values[i.name]?.trim())
        .map((i) => i.name);
      if (missing.length) throw new Error(`Need: ${missing.join(', ')}`);
      return api.runAgent(agent, render(pb.body, values));
    },
    onSuccess: (d) => setResult({ ok: true, runId: d.runId }),
    onError: (e: Error) => setResult({ ok: false, err: e.message }),
  });

  return (
    <Panel padded={false} className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-cream-light dark:hover:bg-[#17140F] transition-colors"
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
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted shrink-0 mt-1" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted shrink-0 mt-1" />
        )}
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
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [inp.name]: e.target.value }))
                    }
                    placeholder={inp.name === 'domain' ? 'acme.com' : ''}
                    className="mt-1 w-full bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-1.5 text-sm font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={() => run.mutate()}
              disabled={run.isPending}
            >
              <Play className="w-3 h-3" />
              {run.isPending ? 'Running…' : 'Run Playbook'}
            </Button>
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
    </Panel>
  );
}
