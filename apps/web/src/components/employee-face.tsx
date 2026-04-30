'use client';

/**
 * EmployeeFace — circular headshot avatar for AI employees.
 * Pulls a deterministic face from pravatar.cc using the agent's
 * `face_seed:` frontmatter (falls back to slug). Falls back to a
 * tinted initial-monogram if the network image fails to load.
 */

import { useState } from 'react';

const SIZE_PX: Record<EmployeeFaceSize, number> = {
  xs: 20,
  sm: 28,
  md: 40,
  lg: 56,
  xl: 88,
};

export type EmployeeFaceSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

function tintFor(seed: string): string {
  const palette = [
    '#E8523A', '#3F7EC7', '#3FA36B', '#8B6FD6',
    '#D79B3C', '#C9547C', '#3B9DA8', '#5B6BC7',
    '#E07A5F', '#81B29A', '#F2CC8F', '#7C8FB8',
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length]!;
}

function initialsFor(name: string): string {
  const parts = name.replace(/[^A-Za-z\s]/g, ' ').trim().split(/\s+/);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function EmployeeFace({
  seed,
  name,
  size = 'md',
  ring = false,
  className,
}: {
  seed: string;
  name: string;
  size?: EmployeeFaceSize;
  ring?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const px = SIZE_PX[size];
  const ringClass = ring ? 'ring-2 ring-white dark:ring-[#1F1B15]' : '';
  const cls =
    'relative shrink-0 rounded-full overflow-hidden border border-line dark:border-[#2A241D] ' +
    ringClass +
    (className ? ' ' + className : '');
  if (broken) {
    return (
      <div
        className={cls + ' flex items-center justify-center text-white font-semibold'}
        style={{
          width: px,
          height: px,
          background: tintFor(seed),
          fontSize: Math.max(10, Math.floor(px * 0.4)),
        }}
        title={name}
      >
        {initialsFor(name)}
      </div>
    );
  }
  return (
    <img
      src={`https://i.pravatar.cc/160?u=blackmagic-${encodeURIComponent(seed)}`}
      alt=""
      onError={() => setBroken(true)}
      className={cls + ' object-cover'}
      style={{ width: px, height: px }}
      title={name}
    />
  );
}
