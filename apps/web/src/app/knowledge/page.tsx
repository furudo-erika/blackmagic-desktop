'use client';

/**
 * /knowledge — tabbed view over the four "what does the agent know
 * about us" surfaces. Each tab opens or edits a canonical vault file
 * so this page is a navigational hub more than a heavy editor.
 *
 *   [ General | ICPs | Funnel | Tags ]
 *
 * Tabs are real routes (`/knowledge/<sub>`) so deep-links work and
 * each tab can grow its own editor over time.
 */

import Link from 'next/link';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { PageShell, PageHeader, PageBody } from '../../components/ui/primitives';

const TABS = [
  { label: 'General', href: '/knowledge' },
  { label: 'ICPs', href: '/knowledge/icps' },
  { label: 'Funnel', href: '/knowledge/funnel' },
  { label: 'Tags', href: '/knowledge/tags' },
] as const;

export function KnowledgeTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 rounded-lg border border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F] p-0.5">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              'px-3 py-1 text-[12px] rounded-md transition-colors ' +
              (active
                ? 'bg-white dark:bg-[#1F1B15] text-ink dark:text-[#F5F1EA] shadow-sm'
                : 'text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]')
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

function KnowledgeIndex() {
  return (
    <PageShell>
      <PageHeader
        title="Knowledge"
        subtitle="What the agents know about your business — the source of truth they pull from before every task."
        icon={BookOpen}
        trailing={<KnowledgeTabs />}
      />
      <PageBody maxWidth="3xl">
        <GeneralBody />
      </PageBody>
    </PageShell>
  );
}

function GeneralBody() {
  return (
    <div className="space-y-4">
      <KnowledgeCard
        title="Company profile"
        body="Who you are, what you sell, who you sell it to. The one file every agent reads first."
        href="/onboarding/bootstrap"
        cta="Edit profile"
      />
      <KnowledgeCard
        title="Brand voice"
        body="Tone, banned words, sentence-length preferences. Consumed by every drafting agent."
        href="/vault?path=us%2Fbrand%2Fvoice.md"
        cta="Open us/brand/voice.md"
      />
      <KnowledgeCard
        title="Product"
        body="Positioning, features, pricing. Referenced when an agent talks about what you do."
        href="/vault?path=us%2Fproduct"
        cta="Browse us/product/"
      />
    </div>
  );
}

export function KnowledgeCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-4 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA]">{title}</h3>
        <p className="text-[12px] text-muted dark:text-[#8C837C] mt-0.5 leading-snug">{body}</p>
      </div>
      <Link
        href={href}
        className="text-[11px] font-medium text-flame hover:underline shrink-0 mt-1"
      >
        {cta} →
      </Link>
    </div>
  );
}

export default function KnowledgePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">loading…</div>}>
      <KnowledgeIndex />
    </Suspense>
  );
}
