'use client';

/**
 * Skills browser — Claude-Skills-style 3-pane layout.
 *
 *   [ skills list (left) | file tree (middle) | skill content (right) ]
 *
 * Each skill is a single `playbooks/*.md` file with frontmatter (name,
 * agent, group, inputs). The middle column lists the skill's files — for
 * now every skill is a single `SKILL.md`, but if a skill ships with
 * sibling files under `playbooks/<slug>/` we'll show those too. The right
 * column renders the selected file: frontmatter in a key/value table,
 * then the body; when viewing SKILL.md we also expose the input form
 * and Run button.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';
import {
  BookOpen,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Play,
  Search,
  Sparkles,
} from 'lucide-react';

type PlaybookInput = { name: string; required?: boolean };
type Playbook = {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => values[k] ?? '');
}

const GROUPS: Array<{ id: string; label: string; color: string }> = [
  { id: 'gtm-starter', label: 'GTM starter pack', color: '#E8523A' },
  { id: 'building-blocks', label: 'Building blocks', color: '#605A57' },
  { id: 'setup', label: 'Setup', color: '#9A8C6E' },
  { id: 'research', label: 'Research', color: '#7E8C67' },
  { id: 'high-intent-visitor', label: 'High-intent visitor', color: '#E8523A' },
  { id: 'deal-won', label: 'Deal won', color: '#7E8C67' },
  { id: 'deal-lost', label: 'Deal lost', color: '#C97660' },
  { id: 'meeting-prep', label: 'Meeting prep', color: '#D4A65A' },
  { id: 'pipeline-health', label: 'Pipeline hygiene', color: '#6A8EC4' },
  { id: 'linkedin-intent', label: 'LinkedIn intent', color: '#B06AB3' },
];

function skillSlug(pb: Playbook): string {
  return pb.path.replace(/^playbooks\//, '').replace(/\.md$/, '');
}

function skillName(pb: Playbook): string {
  const fm = pb.frontmatter;
  const n = typeof fm.name === 'string' && fm.name.trim() ? fm.name : skillSlug(pb);
  return n;
}

function skillSummary(pb: Playbook): string {
  const trimmed = pb.body.trim();
  const para = trimmed.split(/\n\s*\n/)[0] ?? '';
  return para.replace(/[#`*_]/g, '').slice(0, 160);
}

export default function SkillsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedSlug = params.get('skill') ?? '';
  const [filter, setFilter] = useState('');

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
    const q = filter.trim().toLowerCase();
    const map = new Map<string, Playbook[]>();
    for (const pb of all) {
      const matches =
        !q ||
        pb.path.toLowerCase().includes(q) ||
        skillName(pb).toLowerCase().includes(q) ||
        pb.body.toLowerCase().includes(q);
      if (!matches) continue;
      const g = String(pb.frontmatter.group ?? 'other');
      const arr = map.get(g) ?? [];
      arr.push(pb);
      map.set(g, arr);
    }
    return map;
  }, [playbooks.data, filter]);

  const allMatching = useMemo(
    () => Array.from(grouped.values()).flat(),
    [grouped],
  );

  // Auto-select the first skill if nothing's selected yet.
  useEffect(() => {
    const first = allMatching[0];
    if (!selectedSlug && first) {
      router.replace(`/playbooks?skill=${encodeURIComponent(skillSlug(first))}`);
    }
  }, [selectedSlug, allMatching, router]);

  const selected = allMatching.find((pb) => skillSlug(pb) === selectedSlug) ?? allMatching[0];

  return (
    <div className="h-full flex flex-col bg-cream dark:bg-[#0F0D0A]">
      <header className="shrink-0 border-b border-line dark:border-[#2A241D] px-5 py-3 flex items-center gap-3">
        <BookOpen className="w-4 h-4 text-flame" />
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-semibold text-ink dark:text-[#F5F1EA]">Skills</h1>
          <p className="text-[11px] text-muted dark:text-[#8C837C] truncate">
            One-shot tasks your agents know how to run. Pick one, fill in the inputs, hit Run.
          </p>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted dark:text-[#8C837C]" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-56 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-md pl-7 pr-3 py-1.5 text-xs text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
          />
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[260px_220px_1fr]">
        {/* Left: skills list */}
        <aside className="min-h-0 overflow-y-auto border-r border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F]">
          {playbooks.isLoading && (
            <div className="px-4 py-4 text-[12px] text-muted dark:text-[#8C837C]">loading…</div>
          )}
          {playbooks.data && allMatching.length === 0 && (
            <div className="px-4 py-4 text-[12px] text-muted dark:text-[#8C837C]">
              {filter ? 'No skills match that filter.' : 'No skills in this vault yet.'}
            </div>
          )}
          {GROUPS.filter((g) => grouped.has(g.id)).map((g) => (
            <SkillGroup
              key={g.id}
              label={g.label}
              color={g.color}
              items={grouped.get(g.id)!}
              selectedSlug={selected ? skillSlug(selected) : ''}
            />
          ))}
          {[...grouped.entries()]
            .filter(([id]) => !GROUPS.find((g) => g.id === id))
            .map(([id, list]) => (
              <SkillGroup
                key={id}
                label={id === 'other' ? 'Other' : id}
                color="#605A57"
                items={list}
                selectedSlug={selected ? skillSlug(selected) : ''}
              />
            ))}
        </aside>

        {/* Middle: file tree */}
        <aside className="min-h-0 overflow-y-auto border-r border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15]">
          {selected && <FileTree pb={selected} />}
        </aside>

        {/* Right: skill content */}
        <main className="min-h-0 overflow-y-auto">
          {selected ? <SkillDetail pb={selected} /> : null}
        </main>
      </div>
    </div>
  );
}

function SkillGroup({
  label,
  color,
  items,
  selectedSlug,
}: {
  label: string;
  color: string;
  items: Playbook[];
  selectedSlug: string;
}) {
  return (
    <div className="py-2">
      <div className="px-4 pt-2 pb-1 flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <span className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C]">
          {label}
        </span>
        <span className="text-[10px] text-muted/60 dark:text-[#6B625C]">· {items.length}</span>
      </div>
      <ul>
        {items.map((pb) => {
          const slug = skillSlug(pb);
          const selected = slug === selectedSlug;
          return (
            <li key={pb.path}>
              <a
                href={`/playbooks?skill=${encodeURIComponent(slug)}`}
                className={
                  'flex items-start gap-2 px-4 py-2 transition-colors ' +
                  (selected
                    ? 'bg-white dark:bg-[#1F1B15] border-l-2 border-flame -ml-[2px] pl-[14px]'
                    : 'hover:bg-white/50 dark:hover:bg-[#1F1B15]/50 border-l-2 border-transparent -ml-[2px] pl-[14px]')
                }
              >
                <Sparkles className={'w-3.5 h-3.5 shrink-0 mt-0.5 ' + (selected ? 'text-flame' : 'text-muted dark:text-[#8C837C]')} />
                <div className="min-w-0 flex-1">
                  <div className={'text-[12px] truncate ' + (selected ? 'font-semibold text-ink dark:text-[#F5F1EA]' : 'text-ink dark:text-[#E6E0D8]')}>
                    {skillName(pb)}
                  </div>
                  <div className="text-[11px] text-muted dark:text-[#8C837C] truncate leading-tight">
                    {skillSummary(pb) || '—'}
                  </div>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FileTree({ pb }: { pb: Playbook }) {
  const name = skillName(pb);
  const slug = skillSlug(pb);
  return (
    <div className="py-2">
      <div className="px-4 pt-2 pb-2 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-flame" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-ink dark:text-[#F5F1EA] truncate">{name}</div>
          <div className="text-[11px] text-muted dark:text-[#8C837C] truncate">{slug}</div>
        </div>
      </div>
      <div className="px-2">
        <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] px-2 py-1">
          Files
        </div>
        <ul className="text-[12px]">
          <li className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-cream-light dark:bg-[#17140F] text-ink dark:text-[#E6E0D8]">
            <FileText className="w-3.5 h-3.5 text-muted dark:text-[#8C837C]" />
            <span className="font-mono">SKILL.md</span>
          </li>
          {/* Placeholder for sibling files (config/, templates/) — */}
          {/* will be populated when skills gain multi-file support.  */}
          <li className="flex items-center gap-2 px-2 py-1.5 text-muted/50 dark:text-[#6B625C]">
            <Folder className="w-3.5 h-3.5" />
            <span className="font-mono italic">config</span>
            <span className="ml-auto text-[10px]">(empty)</span>
          </li>
          <li className="flex items-center gap-2 px-2 py-1.5 text-muted/50 dark:text-[#6B625C]">
            <Folder className="w-3.5 h-3.5" />
            <span className="font-mono italic">templates</span>
            <span className="ml-auto text-[10px]">(empty)</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function SkillDetail({ pb }: { pb: Playbook }) {
  const fm = pb.frontmatter;
  const inputs = Array.isArray(fm.inputs) ? (fm.inputs as PlaybookInput[]) : [];
  const agent = String(fm.agent ?? 'researcher');
  const name = skillName(pb);
  const slug = skillSlug(pb);
  const description = String(fm.description ?? skillSummary(pb));
  const version = fm.version != null ? String(fm.version) : '—';
  const author = typeof fm.author === 'string' ? fm.author : undefined;

  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: true; runId: string } | { ok: false; err: string } | null>(null);

  // Reset input state and result when the user switches skills.
  useEffect(() => {
    setValues({});
    setResult(null);
  }, [pb.path]);

  const isDomainField = (n: string) => /domain|website|url/i.test(n);
  const isDomainValid = (v: string) =>
    /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(v.trim());
  const missingRequired = inputs.filter((i) => i.required && !values[i.name]?.trim()).map((i) => i.name);
  const invalidDomain = inputs.find(
    (i) => isDomainField(i.name) && values[i.name]?.trim() && !isDomainValid(values[i.name] ?? ''),
  );
  const canRun = missingRequired.length === 0 && !invalidDomain;

  const run = useMutation({
    mutationFn: () => {
      if (missingRequired.length) throw new Error(`Need: ${missingRequired.join(', ')}`);
      if (invalidDomain) throw new Error(`"${values[invalidDomain.name]}" is not a valid domain`);
      return api.runAgent(agent, render(pb.body, values));
    },
    onSuccess: (d) => setResult({ ok: true, runId: d.runId }),
    onError: (e: Error) => setResult({ ok: false, err: e.message }),
  });

  return (
    <div className="h-full flex flex-col">
      {/* Skill header — name + description */}
      <header className="shrink-0 border-b border-line dark:border-[#2A241D] px-6 py-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-md bg-flame/10 border border-flame/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-flame" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold text-ink dark:text-[#F5F1EA] leading-tight">{name}</h2>
          {description && (
            <p className="text-[13px] text-muted dark:text-[#8C837C] mt-0.5">{description}</p>
          )}
        </div>
        <nav className="hidden md:flex items-center gap-1.5 text-[11px] font-mono text-muted dark:text-[#8C837C] shrink-0 mt-1">
          <span>playbooks</span>
          <ChevronRight className="w-3 h-3 opacity-40" />
          <span>{slug}</span>
          <ChevronRight className="w-3 h-3 opacity-40" />
          <span className="text-ink dark:text-[#E6E0D8]">SKILL.md</span>
        </nav>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5 max-w-3xl">
        {/* Frontmatter table */}
        <div className="bg-cream-light dark:bg-[#17140F] border border-line dark:border-[#2A241D] rounded-lg px-4 py-3">
          <dl className="grid grid-cols-[90px_1fr] gap-y-1.5 text-[12px]">
            <dt className="text-muted dark:text-[#8C837C]">name</dt>
            <dd className="font-mono text-ink dark:text-[#E6E0D8]">{slug}</dd>
            <dt className="text-muted dark:text-[#8C837C]">version</dt>
            <dd className="font-mono text-ink dark:text-[#E6E0D8]">{version}</dd>
            <dt className="text-muted dark:text-[#8C837C]">agent</dt>
            <dd className="font-mono text-ink dark:text-[#E6E0D8]">{agent}</dd>
            {author && (
              <>
                <dt className="text-muted dark:text-[#8C837C]">author</dt>
                <dd className="text-ink dark:text-[#E6E0D8]">{author}</dd>
              </>
            )}
            {inputs.length > 0 && (
              <>
                <dt className="text-muted dark:text-[#8C837C]">inputs</dt>
                <dd className="flex flex-wrap gap-1">
                  {inputs.map((i) => (
                    <span
                      key={i.name}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] text-muted dark:text-[#8C837C]"
                    >
                      {i.name}{i.required ? '*' : ''}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </div>

        {/* Run form */}
        {inputs.length > 0 && (
          <section>
            <h3 className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA] mb-2">Inputs</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {inputs.map((inp) => (
                <div key={inp.name}>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C]">
                    {inp.name}{inp.required ? ' *' : ''}
                  </label>
                  <input
                    value={values[inp.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [inp.name]: e.target.value }))}
                    placeholder={inp.name === 'domain' ? 'acme.com' : ''}
                    className="mt-1 w-full bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-md px-3 py-1.5 text-sm font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => run.mutate()}
            disabled={run.isPending || !canRun}
            className="inline-flex items-center gap-1.5 bg-flame text-white text-[13px] font-medium px-3.5 py-1.5 rounded-md hover:bg-flame/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {run.isPending ? 'Running…' : 'Run skill'}
          </button>
          {!canRun && !run.isPending && (
            <span className="text-[11px] text-muted dark:text-[#8C837C]">
              {missingRequired.length
                ? `required: ${missingRequired.join(', ')}`
                : invalidDomain
                  ? `invalid ${invalidDomain.name}`
                  : ''}
            </span>
          )}
          {result?.ok && (
            <span className="text-[11px] text-muted dark:text-[#8C837C] font-mono">
              ✓ run {result.runId}
            </span>
          )}
          {result && !result.ok && (
            <span className="text-[11px] text-flame font-mono">{result.err}</span>
          )}
        </div>

        {/* SKILL.md body — rendered as the plain prompt text */}
        <section>
          <h3 className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA] mb-2 flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-muted dark:text-[#8C837C]" />
            SKILL.md
          </h3>
          <pre className="bg-cream-light dark:bg-[#17140F] border border-line dark:border-[#2A241D] rounded-lg p-4 text-[12px] text-ink dark:text-[#E6E0D8] whitespace-pre-wrap leading-relaxed font-mono overflow-auto">
            {pb.body}
          </pre>
        </section>
      </div>
    </div>
  );
}

// Quieting unused-import noise when FolderOpen isn't used.
void FolderOpen;
