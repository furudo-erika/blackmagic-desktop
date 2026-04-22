'use client';

/**
 * OnboardingBanner — slim app-wide announcement bar that nudges new
 * users to run Company Profiler. Shows when:
 *   1. an agent with `pin: first` exists in the vault, AND
 *   2. that agent has zero completed runs, AND
 *   3. the user hasn't dismissed the banner for the active vault.
 *
 * Dismissal is per-vault in localStorage so switching projects shows
 * the prompt fresh.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, X, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { AgentIcon } from './agent-icon';

const DISMISS_PREFIX = 'bm-onboarding-dismissed::';

export function OnboardingBanner() {
  const router = useRouter();
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const activeProjectId = projects.data?.active ?? '';

  const pinnedAgent = useQuery({
    queryKey: ['onboarding-pinned-agent', activeProjectId],
    queryFn: async () => {
      const tree = await api.vaultTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'),
      );
      for (const f of files) {
        const r = await api.readFile(f.path);
        const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
        if (String(fm.pin ?? '') === 'first') {
          const slug = f.path.replace(/^agents\//, '').replace(/\.md$/, '');
          return {
            slug,
            name: typeof fm.name === 'string' && fm.name ? fm.name : slug,
          };
        }
      }
      return null;
    },
    enabled: !!activeProjectId,
    staleTime: 60_000,
  });

  const runs = useQuery({
    queryKey: ['runs'],
    queryFn: api.listRuns,
    enabled: !!pinnedAgent.data,
    staleTime: 30_000,
  });

  const completed = useMemo(() => {
    if (!pinnedAgent.data) return 0;
    const slug = pinnedAgent.data.slug.toLowerCase();
    return (runs.data?.runs ?? []).filter(
      (r) => (r.agent ?? '').toLowerCase() === slug && r.done,
    ).length;
  }, [runs.data, pinnedAgent.data]);

  // Dismiss state — keyed by project so each vault gets its own.
  const dismissKey = activeProjectId ? `${DISMISS_PREFIX}${activeProjectId}` : '';
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!dismissKey || typeof window === 'undefined') {
      setDismissed(false);
      return;
    }
    setDismissed(window.localStorage.getItem(dismissKey) === '1');
  }, [dismissKey]);

  function dismiss() {
    if (dismissKey && typeof window !== 'undefined') {
      window.localStorage.setItem(dismissKey, '1');
    }
    setDismissed(true);
  }

  if (!pinnedAgent.data || completed > 0 || dismissed) return null;

  const agent = pinnedAgent.data;
  return (
    <div className="shrink-0 border-b border-flame/20 bg-gradient-to-r from-flame/5 via-flame/10 to-flame/5 px-4 py-2">
      <div className="max-w-6xl mx-auto flex items-center gap-3">
        <AgentIcon slug={agent.slug} size="sm" />
        <div className="flex-1 min-w-0 flex items-center gap-2 text-[12px]">
          <span className="font-semibold text-ink dark:text-[#F5F1EA]">Welcome —</span>
          <span className="text-ink/80 dark:text-[#E6E0D8] truncate">
            run <span className="font-semibold">{agent.name}</span> first so every other agent has the
            company context it needs.
          </span>
        </div>
        <Link
          href={`/agents?slug=${encodeURIComponent(agent.slug)}`}
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('bm-last-agent', agent.slug);
            }
          }}
          className="inline-flex items-center gap-1 bg-flame text-white text-[12px] font-medium px-3 py-1 rounded-md hover:opacity-90 transition-opacity shrink-0"
        >
          <Sparkles className="w-3 h-3" />
          Run now
          <ChevronRight className="w-3 h-3" />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss onboarding banner"
          className="text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA] shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Suppress unused-import noise when router isn't needed inline. */}
      <span className="hidden">{router ? '' : ''}</span>
    </div>
  );
}
