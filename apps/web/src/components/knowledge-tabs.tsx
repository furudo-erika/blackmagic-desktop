'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
