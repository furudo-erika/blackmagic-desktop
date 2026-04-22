'use client';

/**
 * Pre-flight modal — rendered before an agent or skill fires. Shows:
 *   - missing integrations → link to sidebar → Tools
 *   - missing us/* files → one-shot "fill now" textarea
 *   - missing CLI tools → copy-pasteable install command
 *   - required + optional inputs → form fields
 *
 * When everything checks green the modal auto-dismisses and returns the
 * collected inputs to the caller. If the user wants to override, the
 * "Run anyway" escape hatch sends `force: true` to the daemon.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { AlertCircle, Check, Copy, ExternalLink, Plug, FileText, Terminal, X } from 'lucide-react';
import Link from 'next/link';

export type PreflightKind = 'agent' | 'skill';

export function PreflightModal({
  kind,
  slug,
  onCancel,
  onRun,
}: {
  kind: PreflightKind;
  slug: string;
  onCancel: () => void;
  onRun: (opts: { inputs: Record<string, string>; force?: boolean }) => void;
}) {
  const qc = useQueryClient();
  const preflight = useQuery({
    queryKey: ['preflight', kind, slug],
    queryFn: () => api.preflight(kind, slug),
    refetchInterval: 4_000,
    refetchOnWindowFocus: true,
  });

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileBody, setFileBody] = useState('');
  const [fileSaving, setFileSaving] = useState(false);

  // Prefill inputs with defaults when preflight first resolves.
  useEffect(() => {
    if (!preflight.data) return;
    setInputs((prev) => {
      const next = { ...prev };
      for (const i of [...preflight.data.inputs, ...preflight.data.optional_inputs]) {
        if (next[i.name] === undefined && i.default !== undefined) {
          next[i.name] = String(i.default);
        }
      }
      return next;
    });
  }, [preflight.data?.inputs.length, preflight.data?.optional_inputs.length]);

  const p = preflight.data;
  const blockers = p
    ? p.missing.integrations.length + p.missing.us_files.length + p.missing.cli.length
    : 0;
  type InputDef = { name: string; required: boolean; description?: string; enum?: string[]; default?: unknown };
  const requiredInputsMissing: InputDef[] = useMemo(() => {
    if (!p) return [];
    return p.inputs.filter((i) => {
      const v = inputs[i.name];
      return !(v && v.trim());
    });
  }, [p, inputs]);

  const saveFile = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      await api.writeFile(path, content);
    },
    onSuccess: () => {
      setEditingFile(null);
      setFileBody('');
      qc.invalidateQueries({ queryKey: ['preflight', kind, slug] });
    },
  });

  async function openFileEditor(relPath: string) {
    setEditingFile(relPath);
    try {
      const r = await api.readFile(relPath);
      setFileBody(r.content ?? '');
    } catch {
      setFileBody('');
    }
  }

  const canRun = p && p.ready && requiredInputsMissing.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-cream dark:bg-[#17140F] border border-line dark:border-[#2A241D] rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-line dark:border-[#2A241D] bg-cream dark:bg-[#17140F]">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C]">
              pre-flight · {kind}
            </div>
            <h2 className="text-base font-semibold text-ink dark:text-[#F5F1EA]">{slug}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-md hover:bg-cream-light dark:hover:bg-[#1F1B15] text-muted dark:text-[#8C837C]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {preflight.isLoading && (
            <div className="text-sm text-muted dark:text-[#8C837C]">checking prerequisites…</div>
          )}
          {preflight.error && (
            <div className="text-sm text-flame">
              {(preflight.error as Error).message}
            </div>
          )}

          {p && p.ready && requiredInputsMissing.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-[#5D6E4D] dark:text-[#A3B38A]">
              <Check className="w-4 h-4" />
              All prerequisites satisfied. Ready to run.
            </div>
          )}

          {p && blockers > 0 && (
            <div className="flex items-start gap-2 text-sm text-flame">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {blockers} prerequisite{blockers > 1 ? 's' : ''} missing. Resolve the items below to unblock.
              </span>
            </div>
          )}

          {/* Missing integrations */}
          {p && p.missing.integrations.length > 0 && (
            <Section icon={Plug} title="Connect services">
              <ul className="space-y-2">
                {p.missing.integrations.map((m) => (
                  <li key={m.provider} className="flex items-start justify-between gap-3 p-3 rounded-md bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D]">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-ink dark:text-[#F5F1EA]">{m.label}</div>
                      <div className="text-[11px] text-muted dark:text-[#8C837C] mt-0.5">{m.hint}</div>
                    </div>
                    <Link
                      href={`/integrations#${m.provider}`}
                      className="shrink-0 text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border border-flame text-flame hover:bg-flame hover:text-white transition-colors"
                      onClick={onCancel}
                    >
                      Connect <ExternalLink className="w-3 h-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Missing us/* files */}
          {p && p.missing.us_files.length > 0 && (
            <Section icon={FileText} title="Fill knowledge files">
              <ul className="space-y-2">
                {p.missing.us_files.map((m) => (
                  <li key={m.path} className="p-3 rounded-md bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-mono text-ink dark:text-[#F5F1EA]">{m.path}</div>
                        <div className="text-[11px] text-muted dark:text-[#8C837C] mt-0.5">{m.hint}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => (editingFile === m.path ? setEditingFile(null) : openFileEditor(m.path))}
                        className="shrink-0 text-[11px] px-2 py-1 rounded-md border border-line dark:border-[#2A241D] text-ink dark:text-[#E6E0D8] hover:border-flame"
                      >
                        {editingFile === m.path ? 'Cancel' : 'Fill now'}
                      </button>
                    </div>
                    {editingFile === m.path && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={fileBody}
                          onChange={(e) => setFileBody(e.target.value)}
                          rows={8}
                          className="w-full resize-none bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-2 text-xs font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
                          placeholder={`# ${m.path.replace(/^us\//, '').replace(/\.md$/, '')}\n\n...`}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              setFileSaving(true);
                              try { await saveFile.mutateAsync({ path: m.path, content: fileBody }); }
                              finally { setFileSaving(false); }
                            }}
                            disabled={fileSaving}
                            className="text-[11px] px-3 py-1 rounded-md bg-flame text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {fileSaving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Missing CLI */}
          {p && p.missing.cli.length > 0 && (
            <Section icon={Terminal} title="Install CLI tools">
              <ul className="space-y-2">
                {p.missing.cli.map((m) => (
                  <li key={m.name} className="p-3 rounded-md bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-mono text-ink dark:text-[#F5F1EA]">{m.name}</div>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(m.install).catch(() => {})}
                        className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border border-line dark:border-[#2A241D] text-muted dark:text-[#8C837C] hover:border-flame hover:text-flame"
                      >
                        <Copy className="w-3 h-3" />
                        Copy command
                      </button>
                    </div>
                    <pre className="mt-2 px-2 py-1.5 rounded bg-cream dark:bg-[#0F0D0A] text-[11px] font-mono text-muted dark:text-[#8C837C] overflow-x-auto">
                      {m.install}
                    </pre>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Required + optional inputs */}
          {p && (p.inputs.length > 0 || p.optional_inputs.length > 0) && (
            <Section icon={FileText} title="Inputs">
              <div className="space-y-3">
                {[...p.inputs, ...p.optional_inputs].map((i) => (
                  <label key={i.name} className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C]">
                      {i.name}{i.required ? ' *' : ''}
                    </span>
                    {i.description && (
                      <span className="text-[11px] text-muted dark:text-[#8C837C]">{i.description}</span>
                    )}
                    {i.enum ? (
                      <select
                        value={inputs[i.name] ?? ''}
                        onChange={(e) => setInputs((prev) => ({ ...prev, [i.name]: e.target.value }))}
                        className="bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-2 text-sm text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
                      >
                        <option value="">Select…</option>
                        {i.enum.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={inputs[i.name] ?? ''}
                        onChange={(e) => setInputs((prev) => ({ ...prev, [i.name]: e.target.value }))}
                        className="bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-2 text-sm font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
                      />
                    )}
                  </label>
                ))}
              </div>
            </Section>
          )}

          {/* Optional integrations as nudges */}
          {p && p.optional_integrations.length > 0 && (
            <div className="text-[11px] text-muted dark:text-[#8C837C] border-t border-line dark:border-[#2A241D] pt-3">
              Optional to connect for better results:{' '}
              {p.optional_integrations.map((m, i) => (
                <span key={m.provider}>
                  {i > 0 && ' · '}
                  <Link
                    href={`/integrations#${m.provider}`}
                    onClick={onCancel}
                    className="text-flame hover:underline"
                  >
                    {m.label}
                  </Link>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-cream dark:bg-[#17140F] border-t border-line dark:border-[#2A241D] px-5 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onRun({ inputs, force: true })}
            className="text-[11px] text-muted dark:text-[#8C837C] hover:text-flame"
          >
            Run anyway →
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="text-[11px] px-3 py-1.5 rounded-md border border-line dark:border-[#2A241D] text-ink dark:text-[#E6E0D8] hover:border-flame"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onRun({ inputs })}
              disabled={!canRun}
              className="text-[11px] px-3 py-1.5 rounded-md bg-flame text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C]">
        <Icon className="w-3.5 h-3.5" />
        {title}
      </div>
      {children}
    </section>
  );
}
