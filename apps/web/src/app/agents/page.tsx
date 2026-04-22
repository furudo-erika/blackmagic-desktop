'use client';

/**
 * /agents — full-screen chat with the agent picked via `?slug=`.
 *
 * No 2-pane picker page anymore — the sidebar Agents row is the
 * picker (expandable, lists every agent). Clicking an agent in the
 * sidebar lands here with `?slug=<agent>` and we render only the
 * ChatSurface, full width. Bare `/agents` (no slug) auto-routes to
 * the last-picked agent (localStorage `bm-last-agent`) or the first
 * one in the vault.
 *
 * We're on Next static export so we can't use `/agents/[slug]` —
 * dynamic segments require generateStaticParams which would have to
 * be empty. Query strings sidestep that and deep-link the same way.
 */

import { Suspense, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { ChatSurface } from '../../components/chat-surface';

function AgentsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const slug = params.get('slug') ?? '';

  const agents = useQuery({
    queryKey: ['agents-landing'],
    queryFn: async () => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'),
      );
      const rows = await Promise.all(
        files.map(async (f) => {
          const r = await api.readFile(f.path);
          const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
          const s = f.path.replace(/^agents\//, '').replace(/\.md$/, '');
          return {
            slug: s,
            name: String(fm.name ?? s),
            pinned: String(fm.pin ?? '') === 'first',
          };
        }),
      );
      rows.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return rows;
    },
  });

  const fallbackSlug = useMemo(() => {
    const last = typeof window !== 'undefined' ? window.localStorage.getItem('bm-last-agent') : null;
    if (last && (agents.data ?? []).some((a) => a.slug === last)) return last;
    return agents.data?.[0]?.slug ?? '';
  }, [agents.data]);

  useEffect(() => {
    if (!slug && fallbackSlug) {
      router.replace(`/agents?slug=${encodeURIComponent(fallbackSlug)}`);
    }
  }, [slug, fallbackSlug, router]);

  // Remember the active agent so a bare /agents visit lands here next time.
  useEffect(() => {
    if (slug && typeof window !== 'undefined') {
      window.localStorage.setItem('bm-last-agent', slug);
    }
  }, [slug]);

  const active = (agents.data ?? []).find((a) => a.slug === slug);

  if (!slug) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted dark:text-[#8C837C]">
        {agents.isLoading ? 'loading…' : 'no agents in this project'}
      </div>
    );
  }

  return (
    <ChatSurface
      key={slug}
      agent={slug}
      threadKey={`bm-team-thread-${slug}`}
      title={`Chat with ${active?.name ?? slug}`}
    />
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted dark:text-[#8C837C]">loading…</div>}>
      <AgentsInner />
    </Suspense>
  );
}
