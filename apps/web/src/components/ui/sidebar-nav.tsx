'use client';

/**
 * Shared sidebar nav primitives, modelled on paperclip-master/ui/src/components/
 * SidebarSection + SidebarNavItem. Palette adapted to the cream/flame theme:
 *   - active row:  bg-white / dark:bg-[#1F1B15] + ink text
 *   - hover row:   bg-white / dark:bg-[#1F1B15] + ink text
 *   - idle row:    text-ink/80 / dark:text-[#E6E0D8]/80
 *   - live dot:    flame, not blue (on-brand)
 *
 * Keeps the same visual rhythm as paperclip: flex items-center gap-2.5
 * px-3 py-2 text-[13px] font-medium. Section labels are uppercase mono
 * at text-[10px] tracking-widest text-muted/60.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import clsx from 'clsx';

export function SidebarSection({
  label,
  children,
  trailing,
}: {
  label: string;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div>
      <div className="px-3 py-1.5 flex items-center gap-1">
        <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted/60 dark:text-[#6B625C] flex-1">
          {label}
        </span>
        {trailing}
      </div>
      <div className="flex flex-col gap-0.5 mt-0.5">{children}</div>
    </div>
  );
}

type SidebarNavItemProps = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Exact-match only. Default behaviour also treats `/foo/bar` as active when on `/foo`. */
  exact?: boolean;
  /** Numeric badge, right-aligned. */
  badge?: number;
  badgeTone?: 'default' | 'danger';
  /** Live-count pill: flame dot + "N live". */
  liveCount?: number;
  /** Small red dot on the icon. */
  alert?: boolean;
  /** Breathing flame dot on the icon — used to signal "an agent is
   *  currently running and may touch this section". Rendered with the
   *  same animate-ping halo as the Runs `liveCount` pill so the whole
   *  sidebar reads as active together. */
  breathing?: boolean;
  /** Extra trailing element rendered after badges. */
  trailing?: ReactNode;
};

export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  exact,
  badge,
  badgeTone = 'default',
  liveCount,
  alert = false,
  breathing = false,
  trailing,
}: SidebarNavItemProps) {
  const pathname = usePathname() || '/';
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={clsx(
        'flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-md transition-colors',
        isActive
          ? 'bg-white dark:bg-[#1F1B15] text-ink dark:text-[#F5F1EA]'
          : 'text-ink/80 dark:text-[#E6E0D8]/80 hover:bg-white/60 dark:hover:bg-[#1F1B15]/60 hover:text-ink dark:hover:text-[#F5F1EA]',
      )}
    >
      <span className="relative shrink-0">
        <Icon className="w-4 h-4" />
        {alert && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-flame shadow-[0_0_0_2px_var(--sidebar-bg,#F5F1EA)]" />
        )}
        {breathing && !alert && (
          <span className="absolute -right-0.5 -top-0.5 flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-flame" />
          </span>
        )}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {liveCount != null && liveCount > 0 && (
        <span className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flame opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-flame" />
          </span>
          <span className="text-[11px] font-medium text-flame">{liveCount} live</span>
        </span>
      )}
      {badge != null && badge > 0 && (
        <span
          className={clsx(
            'ml-auto rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium',
            badgeTone === 'danger'
              ? 'bg-flame text-white'
              : 'bg-ink/80 dark:bg-[#F5F1EA]/15 text-white dark:text-[#F5F1EA]',
          )}
        >
          {badge}
        </span>
      )}
      {trailing}
    </Link>
  );
}
