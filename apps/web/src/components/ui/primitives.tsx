'use client';

/**
 * Shared UI primitives for workflow pages.
 *
 * Design goals (inspired by paperclip-master/ui):
 *   - Every page has the same fixed header chrome.
 *   - Lists are built from a single EntityRow primitive so every row has the
 *     same height, the same border rhythm, and predictable action placement
 *     (leading = icon/status, trailing = meta + actions).
 *   - Empty states are icon + message + optional CTA, always centered.
 *   - Right-side detail drawers (Runs style) are a shared component so every
 *     list+detail page looks the same.
 *
 * No new deps — Tailwind + lucide + clsx only.
 */

import type { ComponentType, ReactNode } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* PageHeader                                                         */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  trailing,
}: {
  title: string;
  subtitle?: string;
  icon?: ComponentType<{ className?: string }>;
  trailing?: ReactNode;
}) {
  return (
    <header className="px-8 pt-8 pb-5 border-b border-line dark:border-[#2A241D] flex items-end justify-between gap-6 shrink-0">
      <div className="min-w-0 flex-1">
        {Icon && (
          <div className="mb-2 w-8 h-8 rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] flex items-center justify-center">
            <Icon className="w-[15px] h-[15px] text-muted dark:text-[#8C837C]" />
          </div>
        )}
        <h1 className="text-[28px] leading-[1.1] font-semibold tracking-tight text-ink dark:text-[#F5F1EA] truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-[13px] text-muted dark:text-[#8C837C] leading-snug max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {trailing && <div className="flex items-center gap-2 shrink-0">{trailing}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* PageBody — the scrollable area under PageHeader                    */
/* ------------------------------------------------------------------ */

export function PageBody({
  children,
  className,
  maxWidth = '3xl',
}: {
  children: ReactNode;
  className?: string;
  maxWidth?: 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full';
}) {
  const maxClass =
    maxWidth === 'full'
      ? ''
      : {
          xl: 'max-w-xl',
          '2xl': 'max-w-2xl',
          '3xl': 'max-w-3xl',
          '4xl': 'max-w-4xl',
          '5xl': 'max-w-5xl',
        }[maxWidth];
  return (
    <div className={clsx('flex-1 overflow-y-auto px-8 py-8', className)}>
      <div className={clsx(maxClass, maxClass && 'mx-auto')}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PageShell — common wrapper: flex-col + cream bg + full height      */
/* ------------------------------------------------------------------ */

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex flex-col bg-cream dark:bg-[#0F0D0A]">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel — neutral card container                                     */
/* ------------------------------------------------------------------ */

export function Panel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={clsx(
        'bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EntityRow — the single list primitive                              */
/* ------------------------------------------------------------------ */

type EntityRowProps = {
  leading?: ReactNode;
  identifier?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  /**
   * When true, wrap content in a <button> (for keyboard + a11y). When false
   * (caller is supplying its own interactive children like form inputs),
   * render as a plain <div>.
   */
  asButton?: boolean;
};

export function EntityRow({
  leading,
  identifier,
  title,
  subtitle,
  trailing,
  selected,
  onClick,
  className,
  asButton = true,
}: EntityRowProps) {
  const isClickable = !!onClick;
  const base = clsx(
    'w-full text-left flex items-center gap-3 px-4 py-3 text-sm border-b border-line dark:border-[#2A241D] last:border-b-0 transition-colors',
    isClickable && 'cursor-pointer hover:bg-cream-light dark:hover:bg-[#17140F]',
    selected && 'bg-cream-light dark:bg-[#17140F]',
    className,
  );

  const content = (
    <>
      {leading && <div className="flex items-center gap-2 shrink-0">{leading}</div>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {identifier && (
            <span className="text-[11px] text-muted dark:text-[#8C837C] font-mono shrink-0">
              {identifier}
            </span>
          )}
          <span className="text-sm font-medium text-ink dark:text-[#F5F1EA] truncate">
            {title}
          </span>
        </div>
        {subtitle && (
          <div className="text-[11px] text-muted dark:text-[#8C837C] mt-0.5 truncate">
            {subtitle}
          </div>
        )}
      </div>
      {trailing && (
        <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted dark:text-[#8C837C]">
          {trailing}
        </div>
      )}
    </>
  );

  if (isClickable && asButton) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {content}
      </button>
    );
  }

  return (
    <div className={base} onClick={onClick}>
      {content}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EntityList — border frame around a list of EntityRows              */
/* ------------------------------------------------------------------ */

export function EntityList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EmptyState — icon + message + optional CTA, centered               */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-cream-light dark:bg-[#17140F] rounded-full p-4 mb-4">
        <Icon className="h-8 w-8 text-muted dark:text-[#8C837C] opacity-60" />
      </div>
      <p className="text-sm font-medium text-ink dark:text-[#F5F1EA] mb-1">{title}</p>
      {hint && (
        <p className="text-xs text-muted dark:text-[#8C837C] max-w-sm mb-4">{hint}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DetailDrawer — right-side fixed-width aside for list+detail pages  */
/* ------------------------------------------------------------------ */

export function DetailDrawer({
  title,
  eyebrow,
  onClose,
  children,
  width = 460,
}: {
  title: ReactNode;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <aside
      style={{ width }}
      className="shrink-0 border-l border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] overflow-y-auto"
    >
      <div className="px-5 py-3 border-b border-line dark:border-[#2A241D] flex items-start justify-between gap-3 sticky top-0 bg-white dark:bg-[#1F1B15] z-10">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C]">
              {eyebrow}
            </div>
          )}
          <div className="text-sm font-mono text-ink dark:text-[#F5F1EA] truncate">
            {title}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer rounded-md p-2 -m-1 text-muted hover:text-ink dark:hover:text-[#F5F1EA] hover:bg-cream-light dark:hover:bg-[#17140F]"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Button — small consistent button used in headers / rows            */
/* ------------------------------------------------------------------ */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md';

export function Button({
  variant = 'secondary',
  size = 'sm',
  disabled,
  onClick,
  children,
  className,
  type = 'button',
}: {
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const variantCls = {
    primary: 'bg-flame text-white hover:opacity-90',
    secondary:
      'border border-line dark:border-[#2A241D] text-ink dark:text-[#E6E0D8] hover:border-flame/40 bg-transparent',
    ghost:
      'text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA] hover:bg-cream-light dark:hover:bg-[#17140F]',
    danger:
      'border border-line dark:border-[#2A241D] text-flame hover:bg-flame-soft',
  }[variant];
  const sizeCls = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-9 px-4 text-sm',
  }[size];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'rounded-md font-medium inline-flex items-center gap-1.5 transition-all duration-100 active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        sizeCls,
        variantCls,
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* SectionHeading — H2 inside a page                                   */
/* ------------------------------------------------------------------ */

export function SectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={clsx(
        'text-[13px] uppercase tracking-[0.16em] font-mono text-muted dark:text-[#8C837C]',
        className,
      )}
    >
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/* StatusBadge — small color-coded pill for statuses                   */
/* ------------------------------------------------------------------ */

export type StatusTone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';

const TONE_STYLES: Record<StatusTone, string> = {
  ok: 'text-[#3FA36B] bg-[#3FA36B]/10',
  warn: 'text-[#D79B3C] bg-[#D79B3C]/10',
  bad: 'text-[#E8634A] bg-[#E8634A]/10',
  info: 'text-[#3F7EC7] bg-[#3F7EC7]/10',
  muted: 'text-muted bg-muted/10 dark:text-[#8C837C]',
};

export function StatusBadge({
  tone = 'muted',
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center h-[18px] px-2 rounded-full text-[10px] font-mono uppercase tracking-wide',
        TONE_STYLES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
