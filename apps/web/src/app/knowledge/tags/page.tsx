'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tag } from 'lucide-react';
import { api } from '../../../lib/api';
import { PageShell, PageHeader, PageBody, Panel } from '../../../components/ui/primitives';
import { KnowledgeTabs } from '../page';

// Walks every companies/contacts/deals .md frontmatter and rolls up
// the `tags:` list. Read-only for now — to add a tag, edit the entity.
export default function TagsPage() {
  const tree = useQuery({ queryKey: ['vault-tree'], queryFn: api.vaultTree });

  const tags = useQuery({
    queryKey: ['knowledge-tags'],
    queryFn: async () => {
      const t = await api.vaultTree();
      const files = t.tree.filter((f) =>
        f.type === 'file' &&
        f.path.endsWith('.md') &&
        (f.path.startsWith('companies/') || f.path.startsWith('contacts/') || f.path.startsWith('deals/')),
      );
      const counts = new Map<string, number>();
      await Promise.all(
        files.map(async (f) => {
          try {
            const r = await api.readFile(f.path);
            const raw = (r.frontmatter as any)?.tags;
            const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
            for (const t of list) {
              const k = String(t).trim();
              if (!k) continue;
              counts.set(k, (counts.get(k) ?? 0) + 1);
            }
          } catch {}
        }),
      );
      return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    },
    enabled: !!tree.data,
  });

  const total = useMemo(() => (tags.data ?? []).reduce((n, [, c]) => n + c, 0), [tags.data]);

  return (
    <PageShell>
      <PageHeader
        title="Knowledge"
        subtitle="Tags found across companies, contacts, and deals — what your agents segment on."
        icon={Tag}
        trailing={<KnowledgeTabs />}
      />
      <PageBody maxWidth="3xl">
        <Panel>
          {tags.isLoading && <div className="text-[12px] text-muted dark:text-[#8C837C]">scanning…</div>}
          {!tags.isLoading && (tags.data?.length ?? 0) === 0 && (
            <div className="text-[12px] text-muted dark:text-[#8C837C]">
              No tags yet. Add <code className="font-mono">tags:</code> to any company/contact/deal frontmatter.
            </div>
          )}
          {(tags.data?.length ?? 0) > 0 && (
            <>
              <div className="text-[11px] font-mono text-muted dark:text-[#8C837C] mb-2">
                {tags.data!.length} unique · {total} usages
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.data!.map(([t, n]) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full border border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F]"
                  >
                    <span className="text-ink dark:text-[#E6E0D8]">{t}</span>
                    <span className="text-muted dark:text-[#8C837C]">· {n}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </Panel>
      </PageBody>
    </PageShell>
  );
}
