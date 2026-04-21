'use client';

/**
 * /companies — the accounts view.
 *
 * Layout lifted from paperclip's Companies + Company rail patterns:
 *   - header has the "+ Enrich" call-to-action and a filter input
 *   - list uses EntityRow — brand tile leading, tier pill trailing
 *   - clicking a row opens a right-side DetailDrawer with frontmatter,
 *     body markdown, linked contacts, linked deals, and recent runs that
 *     touched the company (matched by slug or domain).
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Search, Sparkles, ExternalLink, Users, Briefcase, History } from 'lucide-react';
import { api } from '../../lib/api';
import { isValidDomain } from '../../lib/validators';
import { Markdown } from '../../components/markdown';
import {
  PageShell,
  PageHeader,
  EntityList,
  EntityRow,
  EmptyState,
  Button,
  DetailDrawer,
  Panel,
} from '../../components/ui/primitives';

type Company = {
  path: string;
  slug: string;
  name: string;
  domain?: string;
  tier?: string;
  industry?: string;
  size?: string;
  icpScore?: string;
  lastActivity?: string;
  notesStatus?: string;
  missingFields: string[];
  frontmatter: Record<string, unknown>;
};

// Firmographic fields the researcher is expected to fill. Null/empty
// values across any of these surface as "partial" on the list row so
// users don't mistake a thin enrichment for a complete one (QA BUG-06).
const CRITICAL_FIELDS = ['size', 'revenue', 'hq', 'icp_score', 'funding', 'enriched_at'] as const;

const TIER_COLORS: Record<string, string> = {
  A: 'bg-flame text-white',
  B: 'bg-[#7E8C67] text-white',
  C: 'bg-muted/30 text-muted dark:bg-[#2A241D] dark:text-[#8C837C]',
};

function letterTile(name: string): string {
  const m = name.trim().match(/[A-Za-z0-9]/);
  return m ? m[0].toUpperCase() : '?';
}
function runStartedMs(runId: string): number | null {
  if (runId.startsWith('codex-')) {
    const ms = Number(runId.slice('codex-'.length));
    return Number.isFinite(ms) ? ms : null;
  }
  const m = runId.match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!m) return null;
  const t = Date.parse(`${m[1]}:${m[2]}:${m[3]}.${m[4]}Z`);
  return Number.isFinite(t) ? t : null;
}
function timeAgo(ms: number | undefined | null): string {
  if (!ms) return '—';
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

/* ---------- Detail drawer body ---------- */

function DrawerSection({ icon: Icon, label, count, allHref, empty, children }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; count: number; allHref: string; empty: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-2">
        <span className="flex items-center gap-1"><Icon className="w-3 h-3" />{label} · {count}</span>
        <Link href={allHref} className="hover:text-flame normal-case">all →</Link>
      </div>
      {count === 0 ? (
        <div className="text-[11px] text-muted dark:text-[#8C837C] italic">{empty}</div>
      ) : children}
    </section>
  );
}

function CompanyDetail({ company, onClose }: { company: Company; onClose: () => void }) {
  const file = useQuery({
    queryKey: ['vault-file', company.path],
    queryFn: () => api.readFile(company.path),
  });
  const tree = useQuery({ queryKey: ['vault-tree'], queryFn: api.vaultTree, staleTime: 30_000 });
  const runs = useQuery({ queryKey: ['runs'], queryFn: api.listRuns, staleTime: 30_000 });

  const slug = company.slug.toLowerCase();
  const domain = (company.domain ?? '').toLowerCase();

  const contactList = useMemo(() => (tree.data?.tree ?? []).filter(
    (f) => f.type === 'file' && f.path.startsWith(`contacts/${slug}/`),
  ), [tree.data, slug]);
  const dealList = useMemo(() => (tree.data?.tree ?? []).filter(
    (f) => f.type === 'file' && f.path.endsWith('.md') &&
      /^deals\/(open|closed-won|closed-lost)\//.test(f.path) &&
      f.path.toLowerCase().includes(slug),
  ), [tree.data, slug]);
  const mentioningRuns = useMemo(() => (runs.data?.runs ?? [])
    .filter((r) => {
      const hay = `${r.preview ?? ''} ${r.agent ?? ''} ${r.runId ?? ''}`.toLowerCase();
      return hay.includes(slug) || (domain && hay.includes(domain));
    })
    .slice(0, 5), [runs.data, slug, domain]);

  return (
    <DetailDrawer eyebrow="Company" title={company.name} onClose={onClose} width={440}>
      <div className="p-5 space-y-5">
        {Object.keys(company.frontmatter).length > 0 && (
          <section>
            <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-2">Frontmatter</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] font-mono">
              {Object.entries(company.frontmatter).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted dark:text-[#8C837C]">{k}</dt>
                  <dd className="text-ink dark:text-[#E6E0D8] break-words">
                    {typeof v === 'string' ? v : JSON.stringify(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {file.data?.body && (
          <section>
            <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-2">Notes</div>
            <div className="bg-cream-light dark:bg-[#17140F] rounded-md px-4 py-3 text-[13px] max-h-56 overflow-y-auto">
              <Markdown source={file.data.body} />
            </div>
          </section>
        )}
        <DrawerSection icon={Users} label="Contacts" count={contactList.length} allHref="/contacts" empty="none yet">
          <ul className="space-y-0.5">
            {contactList.slice(0, 8).map((c) => (
              <li key={c.path}>
                <Link href={`/vault?path=${encodeURIComponent(c.path)}`} className="block text-[12px] font-mono text-muted dark:text-[#8C837C] hover:text-flame truncate">
                  {c.path.replace('contacts/', '').replace(/\.md$/, '')}
                </Link>
              </li>
            ))}
          </ul>
        </DrawerSection>
        <DrawerSection icon={Briefcase} label="Linked deals" count={dealList.length} allHref="/deals" empty="none yet">
          <ul className="space-y-0.5">
            {dealList.map((d) => (
              <li key={d.path}>
                <Link href={`/vault?path=${encodeURIComponent(d.path)}`} className="block text-[12px] font-mono text-muted dark:text-[#8C837C] hover:text-flame truncate">
                  {d.path.replace(/^deals\//, '').replace(/\.md$/, '')}
                </Link>
              </li>
            ))}
          </ul>
        </DrawerSection>
        <DrawerSection icon={History} label="Recent runs" count={mentioningRuns.length} allHref="/runs" empty="no runs referenced this company">
          <ul className="space-y-0.5">
            {mentioningRuns.map((r) => (
              <li key={r.runId} className="text-[11px] text-muted dark:text-[#8C837C] truncate">
                <span className="text-ink dark:text-[#E6E0D8]">{r.preview || r.agent || r.runId}</span>
                <span className="ml-2 font-mono">{timeAgo(runStartedMs(r.runId))}</span>
              </li>
            ))}
          </ul>
        </DrawerSection>
        <section className="pt-2 border-t border-line dark:border-[#2A241D]">
          <Link href={`/vault?path=${encodeURIComponent(company.path)}`} className="inline-flex items-center gap-1 text-[12px] text-muted dark:text-[#8C837C] hover:text-flame">
            <ExternalLink className="w-3 h-3" /> Open in vault editor
          </Link>
        </section>
      </div>
    </DetailDrawer>
  );
}

/* ---------- Page ---------- */

export default function CompaniesPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [showEnrich, setShowEnrich] = useState(false);
  const [domain, setDomain] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Company | null>(null);

  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<Company[]> => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('companies/') && f.path.endsWith('.md'),
      );
      return Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          const fm = r.frontmatter;
          const slug = f.path.replace(/^companies\//, '').replace(/\.md$/, '');
          const missingFields = CRITICAL_FIELDS.filter((k) => {
            const v = fm[k];
            return v == null || v === '' || v === 'unknown' || v === 'null';
          });
          return {
            path: f.path,
            slug,
            name: String(fm.name ?? slug),
            domain: fm.domain != null ? String(fm.domain) : undefined,
            tier: fm.tier != null ? String(fm.tier).toUpperCase() : undefined,
            industry: fm.industry != null ? String(fm.industry) : undefined,
            size: fm.size != null ? String(fm.size) : undefined,
            icpScore: fm.icp_score != null ? String(fm.icp_score) : undefined,
            lastActivity: fm.last_activity != null ? String(fm.last_activity) : undefined,
            notesStatus: fm.notes_status != null ? String(fm.notes_status) : undefined,
            missingFields,
            frontmatter: fm,
          };
        }),
      ).then((rows) =>
        rows.filter((row) => row.frontmatter.kind !== 'company-research' && !row.path.endsWith('-research.md')),
      );
    },
  });

  // For contact counts, we read vault tree once
  const tree = useQuery({ queryKey: ['vault-tree'], queryFn: api.vaultTree, staleTime: 30_000 });
  const contactsByCompany = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of tree.data?.tree ?? []) {
      if (f.type !== 'file' || !f.path.startsWith('contacts/') || !f.path.endsWith('.md')) continue;
      const parts = f.path.split('/');
      const key = (parts[1] ?? '').toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [tree.data]);

  const domainValid = isValidDomain;

  const enrich = useMutation({
    mutationFn: (d: string) => {
      if (!domainValid(d)) throw new Error(`"${d}" is not a valid domain — use e.g. acme.com`);
      return api.runAgent('researcher', `Enrich ${d} and save to companies/.`);
    },
    onMutate: (d) => setMessage(`enriching ${d}…`),
    onSuccess: () => {
      setMessage('done');
      setShowEnrich(false);
      setDomain('');
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['vault-tree'] });
    },
    onError: (e: Error) => setMessage(`error: ${e.message}`),
  });

  const filtered = useMemo(() => {
    const list = companies.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const hay = [c.name, c.slug, c.domain ?? '', c.industry ?? '', c.tier ?? ''].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [companies.data, query]);

  return (
    <PageShell>
      <div className="h-full flex bg-cream dark:bg-[#0F0D0A]">
        <div className="flex-1 flex flex-col min-w-0">
          <PageHeader
            title="Companies"
            subtitle="Accounts under companies/. Enrich a domain and the researcher fills in firmographics, ICP score, and buying committee."
            icon={Building2}
            trailing={
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted dark:text-[#8C837C]" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter…"
                    className="w-48 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-md pl-7 pr-3 py-1.5 text-xs text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
                  />
                </div>
                <Button variant="primary" onClick={() => setShowEnrich((s) => !s)}>
                  <Sparkles className="w-3 h-3" /> Enrich
                </Button>
              </div>
            }
          />
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-4xl mx-auto">
              {showEnrich && (
                <Panel className="mb-4">
                  <label className="text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C]">
                    domain
                  </label>
                  <input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="acme.com"
                    className="mt-1 w-full bg-cream dark:bg-[#17140F] border border-line dark:border-[#2A241D] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-flame text-ink dark:text-[#E6E0D8]"
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="primary"
                      onClick={() => domainValid(domain) && enrich.mutate(domain)}
                      disabled={!domainValid(domain) || enrich.isPending}
                    >
                      {enrich.isPending ? 'Enriching…' : 'Run researcher'}
                    </Button>
                    {domain && !domainValid(domain) && (
                      <span className="text-[11px] text-flame">
                        not a valid domain
                      </span>
                    )}
                    <Button variant="ghost" onClick={() => setShowEnrich(false)}>Cancel</Button>
                    {message && (
                      <span className="text-[11px] text-muted dark:text-[#8C837C]">{message}</span>
                    )}
                  </div>
                </Panel>
              )}

              {companies.isLoading && (
                <div className="text-sm text-muted dark:text-[#8C837C]">loading…</div>
              )}
              {companies.error && (
                <div className="text-sm text-flame">{(companies.error as Error).message}</div>
              )}
              {!companies.isLoading && (companies.data?.length ?? 0) === 0 && (
                <EmptyState
                  icon={Building2}
                  title="No companies yet."
                  hint="Enrich a domain above, or ask Chat to research an account. Results save to companies/."
                />
              )}
              {filtered.length === 0 && (companies.data?.length ?? 0) > 0 && (
                <div className="text-center py-12 text-sm text-muted dark:text-[#8C837C]">
                  No companies match "{query}".
                </div>
              )}
              {filtered.length > 0 && (
                <>
                  <div className="mb-3 text-[11px] font-mono text-muted dark:text-[#8C837C]">
                    {filtered.length} of {companies.data?.length ?? 0}
                  </div>
                  <EntityList>
                    {filtered.map((c) => {
                      const contactCount = contactsByCompany.get(c.slug.toLowerCase()) ?? 0;
                      const isSelected = selected?.path === c.path;
                      return (
                        <EntityRow
                          key={c.path}
                          selected={isSelected}
                          onClick={() => setSelected(c)}
                          leading={
                            <span
                              className="w-8 h-8 rounded-md flex items-center justify-center text-[13px] font-semibold text-white bg-flame shrink-0"
                              aria-hidden
                            >
                              {letterTile(c.name)}
                            </span>
                          }
                          title={
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="truncate">{c.name}</span>
                              {c.tier && (
                                <span
                                  className={
                                    'text-[10px] px-1.5 py-0 rounded font-mono uppercase tracking-wide shrink-0 ' +
                                    (TIER_COLORS[c.tier] ?? 'bg-muted/30 text-muted')
                                  }
                                >
                                  {c.tier}
                                </span>
                              )}
                              {(c.notesStatus === 'partial' || c.missingFields.length >= 2) && (
                                <span
                                  title={c.missingFields.length ? `Missing: ${c.missingFields.join(', ')}` : 'Profile marked partial'}
                                  className="text-[10px] px-1.5 py-0 rounded font-mono uppercase tracking-wide shrink-0 bg-[#F5C24D]/20 text-[#8A6A1A] dark:text-[#E8C063]"
                                >
                                  partial{c.missingFields.length ? ` · ${c.missingFields.length} missing` : ''}
                                </span>
                              )}
                            </span>
                          }
                          subtitle={
                            <span className="font-mono">
                              {c.domain ?? c.slug}
                              {c.industry ? ` · ${c.industry}` : ''}
                              {c.size ? ` · ${c.size}` : ''}
                            </span>
                          }
                          trailing={
                            <div className="flex items-center gap-4 font-mono">
                              {c.icpScore != null && (
                                <span className="text-flame">icp {c.icpScore}</span>
                              )}
                              <span>
                                {contactCount} {contactCount === 1 ? 'contact' : 'contacts'}
                              </span>
                              <span>{c.lastActivity ? c.lastActivity : '—'}</span>
                            </div>
                          }
                        />
                      );
                    })}
                  </EntityList>
                </>
              )}
            </div>
          </div>
        </div>

        {selected && (
          <CompanyDetail company={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </PageShell>
  );
}
