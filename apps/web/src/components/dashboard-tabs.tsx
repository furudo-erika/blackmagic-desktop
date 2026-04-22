'use client';

// Tab strip shared by /dashboard and /geo so they read as one surface.
// We deliberately don't merge the two large pages into a single file —
// each is ~500 lines and the queries don't overlap. The tab nav lives in
// the PageHeader trailing slot of both routes.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Runtimes', href: '/dashboard' },
  { label: 'GEO', href: '/geo' },
] as const;

export function DashboardTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 rounded-lg border border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F] p-0.5">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/');
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
