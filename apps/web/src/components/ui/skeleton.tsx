'use client';

/**
 * Tiny skeleton primitives — shimmer rows for list/table loading states.
 * Replaces the "loading…" inline text on /companies, /contacts, /deals, /runs.
 */

export function SkeletonRow({ className = '' }: { className?: string }) {
  return (
    <div
      className={
        'animate-pulse bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg px-4 py-3 flex items-center gap-3 ' +
        className
      }
    >
      <div className="w-8 h-8 rounded-md bg-cream-light dark:bg-[#17140F] shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/3 rounded bg-cream-light dark:bg-[#17140F]" />
        <div className="h-2.5 w-2/3 rounded bg-cream-light dark:bg-[#17140F]" />
      </div>
      <div className="h-3 w-16 rounded bg-cream-light dark:bg-[#17140F] shrink-0" />
    </div>
  );
}

export function SkeletonList({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={'space-y-2 ' + className}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
