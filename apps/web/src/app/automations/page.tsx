'use client';

/**
 * Automations hub — entry page for the Automations section in the sidebar.
 * Renders four tab cards (Skills, Triggers, GEO, Runs) linking to the
 * dedicated pages that already exist. Keeps the sidebar flat (one
 * "Automations" row) without forcing users to dig for the sub-tab.
 */

import Link from 'next/link';
import { BookOpen, Zap, Radar, History, ChevronRight, type LucideIcon } from 'lucide-react';
import { PageShell, PageHeader, PageBody } from '../../components/ui/primitives';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export default function AutomationsPage() {
  const runs = useQuery({ queryKey: ['runs'], queryFn: api.listRuns, refetchInterval: 20_000 });
  const liveRunCount = (runs.data?.runs ?? []).filter((r) => !r.done).length;

  const cards: Array<{
    icon: LucideIcon;
    title: string;
    subtitle: string;
    href: string;
    stat?: string;
  }> = [
    {
      icon: BookOpen,
      title: 'Skills',
      subtitle: 'Reusable recipes your agents can run — playbook markdown files stored in the vault.',
      href: '/playbooks',
    },
    {
      icon: Zap,
      title: 'Triggers',
      subtitle: 'Scheduled jobs (cron) that fire agents or shell commands on a timer.',
      href: '/triggers',
    },
    {
      icon: Radar,
      title: 'GEO',
      subtitle: 'Generative Engine Optimization dashboard — Share of Voice, gap sources, daily sweep.',
      href: '/geo',
    },
    {
      icon: History,
      title: 'Runs',
      subtitle: 'Every agent run with transcript, tool calls, token usage, and cost.',
      href: '/runs',
      stat: liveRunCount > 0 ? `${liveRunCount} live` : undefined,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Automations"
        subtitle="Skills, triggers, GEO, and run history — everything your agents do on their own."
        icon={Zap}
      />
      <PageBody maxWidth="5xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group flex items-start gap-3 p-4 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl hover:border-flame/60 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-cream dark:bg-[#0F0D0A] group-hover:bg-flame/10 flex items-center justify-center shrink-0 transition-colors">
                <c.icon className="w-4 h-4 text-muted dark:text-[#8C837C] group-hover:text-flame transition-colors" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA]">{c.title}</h3>
                  {c.stat && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-flame">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-flame" />
                      </span>
                      {c.stat}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-muted dark:text-[#8C837C] leading-snug mt-1">{c.subtitle}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted/40 dark:text-[#6B625C]/40 group-hover:text-flame transition-colors mt-1" />
            </Link>
          ))}
        </div>
      </PageBody>
    </PageShell>
  );
}
