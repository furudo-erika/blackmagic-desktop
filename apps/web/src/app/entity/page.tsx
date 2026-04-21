'use client';

/**
 * /entity?kind=<companies|contacts|deals>&slug=<name> — Multica-style
 * entity detail page. Query-param based so it's a single statically
 * exported route (the Electron build uses `output: "export"` which
 * can't resolve dynamic segments without generateStaticParams).
 */

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { EntityDetail } from '../../components/entity-detail';
import { PageShell, PageHeader, PageBody } from '../../components/ui/primitives';
import { Building2, Users as UsersIcon, Briefcase } from 'lucide-react';

const KIND_LABEL: Record<string, string> = {
  companies: 'Company',
  contacts: 'Contact',
  deals: 'Deal',
};

export default function EntityPage() {
  return (
    <Suspense fallback={null}>
      <EntityPageInner />
    </Suspense>
  );
}

function EntityPageInner() {
  const search = useSearchParams();
  const kind = (search?.get('kind') ?? '').trim();
  const slug = (search?.get('slug') ?? '').trim();
  const entityPath = kind && slug ? `${kind}/${slug}.md` : '';

  const Icon = kind === 'companies' ? Building2 : kind === 'contacts' ? UsersIcon : Briefcase;

  const file = useQuery({
    queryKey: ['entity-file', entityPath],
    queryFn: () => api.readFile(entityPath),
    enabled: !!entityPath,
  });

  const fm = file.data?.frontmatter ?? {};
  const title = useMemo(() => {
    if (typeof fm.name === 'string' && fm.name) return fm.name;
    if (typeof fm.title === 'string' && fm.title) return fm.title;
    return slug;
  }, [fm, slug]);
  const subtitle = useMemo(() => {
    if (kind === 'companies') return [fm.domain, fm.industry, fm.size].filter(Boolean).join(' · ') || undefined;
    if (kind === 'contacts') return [fm.title, fm.company].filter(Boolean).join(' @ ') || fm.email || undefined;
    if (kind === 'deals') return [fm.stage, fm.value ? `$${fm.value}` : null].filter(Boolean).join(' · ') || undefined;
    return undefined;
  }, [fm, kind]);

  if (!entityPath) {
    return (
      <PageShell>
        <PageHeader title="Pick an entity" icon={Icon} />
        <PageBody>
          <div className="px-6 py-8 text-[13px] text-muted dark:text-[#8C837C]">
            Pass <code className="font-mono">?kind=companies&amp;slug=…</code> in the URL, or open an
            entity from the <a className="text-flame underline" href="/companies">Companies</a>,{' '}
            <a className="text-flame underline" href="/contacts">Contacts</a>, or{' '}
            <a className="text-flame underline" href="/deals">Deals</a> list.
          </div>
        </PageBody>
      </PageShell>
    );
  }
  if (file.isLoading) {
    return (
      <PageShell>
        <PageHeader title="Loading…" icon={Icon} />
        <PageBody>{null}</PageBody>
      </PageShell>
    );
  }
  if (file.isError || !file.data) {
    return (
      <PageShell>
        <PageHeader title="Not found" icon={Icon} />
        <PageBody>
          <div className="px-6 py-8 text-[13px] text-muted dark:text-[#8C837C]">
            No file at <code className="font-mono">{entityPath}</code>.
          </div>
        </PageBody>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <EntityDetail
        entityPath={entityPath}
        title={String(title)}
        subtitle={subtitle ? String(subtitle) : undefined}
        breadcrumbs={[
          { label: KIND_LABEL[kind] ?? kind, href: `/${kind}` },
          { label: String(title) },
        ]}
      >
        {file.data.body && (
          <section className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-5 mb-5">
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink dark:text-[#E6E0D8]">
              {file.data.body}
            </div>
          </section>
        )}
      </EntityDetail>
    </PageShell>
  );
}
