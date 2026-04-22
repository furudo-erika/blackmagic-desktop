'use client';

/**
 * AgentIcon — Vercel-style monogram badge per agent.
 *
 * Neutral dark/light surface with a thin subtle border, an inset
 * highlight (Vercel's signature one-pixel top sheen), and a bold
 * 1–2 letter monogram in a single accent color. No gradients, no
 * skeuomorphic glyphs — just typography on a clean tile, the way
 * Vercel project tiles, Linear avatars, and Resend project icons
 * all read.
 *
 * Sizes: 'sm' 24px · 'md' 36px · 'lg' 48px · 'xl' 64px.
 */

import { useMemo } from 'react';

export type AgentIconSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_PX: Record<AgentIconSize, number> = { sm: 24, md: 36, lg: 48, xl: 64 };
const RADIUS_PX: Record<AgentIconSize, number> = { sm: 6, md: 8, lg: 10, xl: 12 };
const FONT_PX: Record<AgentIconSize, number> = { sm: 11, md: 14, lg: 18, xl: 24 };

// One accent per agent. Picked so a row of 11 tiles reads as 11
// distinct icons without any one screaming louder than the others —
// every accent is a saturated mid-tone that sits well on both the
// cream and the #1F1B15 surfaces.
const ACCENTS: Record<string, string> = {
  'company-profiler':    '#F59E0B', // amber
  'researcher':          '#3B82F6', // blue
  'sdr':                 '#8B5CF6', // violet
  'ae':                  '#D97706', // dark amber
  'website-visitor':     '#10B981', // emerald
  'linkedin-outreach':   '#0A66C2', // linkedin blue
  'meeting-prep':        '#0D9488', // teal
  'lookalike-discovery': '#A21CAF', // fuchsia
  'closed-lost-revival': '#E11D48', // rose
  'pipeline-ops':        '#EA580C', // orange
  'geo-analyst':         '#E8523A', // flame
};

const FALLBACK_ACCENT = '#64748B'; // slate-500

// Up to 2 letters from a name — uppercase, alphanumeric only. Mirrors
// how Vercel/Resend pick monograms: one letter for single-word, two
// letters for multi-word. "Company Profiler" → "CP". "GEO Analyst"
// → "GA". "Researcher" → "R".
function monogram(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9 ]+/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]![0]!.toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

export function AgentIcon({
  slug,
  name,
  size = 'md',
  className,
}: {
  slug: string;
  name?: string;
  size?: AgentIconSize;
  className?: string;
}) {
  const px = SIZE_PX[size];
  const radius = RADIUS_PX[size];
  const fontSize = FONT_PX[size];
  const accent = ACCENTS[slug] ?? FALLBACK_ACCENT;
  const label = useMemo(
    () => monogram(name ?? slug.replace(/-/g, ' ')),
    [name, slug],
  );
  return (
    <span
      className={
        'relative inline-flex items-center justify-center shrink-0 select-none ' +
        'bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] ' +
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ' +
        (className ?? '')
      }
      style={{
        width: px,
        height: px,
        borderRadius: radius,
        color: accent,
        fontSize,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        fontFeatureSettings: '"ss02"',
      }}
      aria-hidden
    >
      {label}
    </span>
  );
}

export function hasAgentTheme(slug: string): boolean {
  return slug in ACCENTS;
}
