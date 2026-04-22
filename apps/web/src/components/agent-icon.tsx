'use client';

/**
 * AgentIcon — custom SVG glyph + gradient tile per agent slug. Replaces
 * the generic lucide icons that were making every agent look like the
 * same colorless robot. Each agent gets a distinct gradient and a
 * purpose-built glyph (magnifying glass for researcher, paper plane for
 * outreach, radar for GEO, etc).
 *
 * Sizes: 'sm' 24px · 'md' 36px · 'lg' 48px · 'xl' 64px.
 */

import { useMemo } from 'react';

export type AgentIconSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_PX: Record<AgentIconSize, number> = { sm: 24, md: 36, lg: 48, xl: 64 };
const RADIUS_PX: Record<AgentIconSize, number> = { sm: 6, md: 8, lg: 10, xl: 14 };
const GLYPH_FRAC = 0.55; // glyph occupies 55% of the tile

type Theme = {
  from: string; // gradient top
  to:   string; // gradient bottom
  glyph: string; // hex on the gradient
};

// Per-agent palette + glyph kind. Picked to be visually distinct so a
// row of 11 cards reads as 11 different agents at a glance, not as
// "11 grey rectangles".
const THEMES: Record<string, Theme & { glyph: string; kind: GlyphKind }> = {
  'company-profiler':    { from: '#FFB347', to: '#FF7A18', glyph: '#fff', kind: 'building' },
  'researcher':          { from: '#7AB7FF', to: '#3B82F6', glyph: '#fff', kind: 'magnifier' },
  'sdr':                 { from: '#A78BFA', to: '#7C3AED', glyph: '#fff', kind: 'paper-plane' },
  'ae':                  { from: '#FCD34D', to: '#D97706', glyph: '#fff', kind: 'briefcase' },
  'website-visitor':     { from: '#6EE7B7', to: '#10B981', glyph: '#fff', kind: 'cursor' },
  'linkedin-outreach':   { from: '#5BB1FF', to: '#0A66C2', glyph: '#fff', kind: 'linkedin' },
  'meeting-prep':        { from: '#5EEAD4', to: '#0D9488', glyph: '#fff', kind: 'calendar' },
  'lookalike-discovery': { from: '#F0ABFC', to: '#A21CAF', glyph: '#fff', kind: 'nodes' },
  'closed-lost-revival': { from: '#FDA4AF', to: '#E11D48', glyph: '#fff', kind: 'refresh' },
  'pipeline-ops':        { from: '#FDBA74', to: '#EA580C', glyph: '#fff', kind: 'flow' },
  'geo-analyst':         { from: '#FF9966', to: '#E8523A', glyph: '#fff', kind: 'radar' },
};

const FALLBACK: Theme & { kind: GlyphKind } = {
  from: '#94A3B8', to: '#475569', glyph: '#fff', kind: 'spark',
};

type GlyphKind =
  | 'building' | 'magnifier' | 'paper-plane' | 'briefcase' | 'cursor'
  | 'linkedin' | 'calendar' | 'nodes' | 'refresh' | 'flow' | 'radar' | 'spark';

// All glyphs are drawn inside a 24×24 viewport, fill='currentColor', and
// scaled to GLYPH_FRAC of the tile. Keeping them path-only means we can
// tint them via fill without touching the gradient layer.
const GLYPHS: Record<GlyphKind, string> = {
  // Building / scanning — Company Profiler.
  'building': 'M4 21h16v-2H4v2zM6 5h4v4H6V5zm0 6h4v4H6v-4zm6-6h4v4h-4V5zm0 6h4v4h-4v-4zm-7-9h14v2H5V2z',
  // Magnifying glass — Researcher.
  'magnifier': 'M10 2a8 8 0 105.293 14.005l5.351 5.351a1 1 0 001.414-1.414l-5.351-5.351A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z',
  // Paper plane — SDR / Outreach.
  'paper-plane': 'M2.4 11.4 21.6 2 16 22l-4.5-7.5L4 12.5l-1.6-1.1zM7.6 12l4.4 1.4 7.4-9.4L7.6 12z',
  // Briefcase — Deal Manager.
  'briefcase': 'M9 4a2 2 0 00-2 2v1H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3V6a2 2 0 00-2-2H9zm0 2h6v1H9V6zM4 13h16v5H4v-5zm0-4h16v2H4V9z',
  // Cursor — Website Visitor.
  'cursor': 'M5 3l14 5.5-6 2.5-2.5 6L5 3z',
  // LinkedIn "in" — LinkedIn Outreach.
  'linkedin': 'M4 4h4v4H4V4zm0 6h4v10H4V10zm6 0h3.8v1.4h.05c.53-1 1.83-2.05 3.77-2.05 4.04 0 4.78 2.66 4.78 6.12V20h-4v-4.07c0-.97-.02-2.22-1.36-2.22-1.36 0-1.57 1.06-1.57 2.15V20h-4V10z',
  // Calendar — Meeting Prep.
  'calendar': 'M7 2v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2V2h-2v2H9V2H7zm-2 8h14v10H5V10zm2 2v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z',
  // Three connected nodes — Lookalike Discovery.
  'nodes': 'M12 2a3 3 0 100 6 3 3 0 000-6zM4 14a3 3 0 100 6 3 3 0 000-6zm16 0a3 3 0 100 6 3 3 0 000-6zM10.6 7.4l-5.2 6m13.2-6l-5.2 6',
  // Refresh circle — Closed-Lost Revival.
  'refresh': 'M12 4a8 8 0 100 16 8 8 0 003.74-15.07l1.06-1.06A1 1 0 0017 3h-3a1 1 0 00-1 1v3a1 1 0 001.71.71l.7-.71A6 6 0 1118 12h2a8 8 0 00-8-8z',
  // Flow / pipe — Pipeline Ops.
  'flow': 'M5 4h14a1 1 0 011 1v3a1 1 0 01-1 1h-2v6h2a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3a1 1 0 011-1h2V9H5a1 1 0 01-1-1V5a1 1 0 011-1zm4 5v6h6V9H9z',
  // Radar arc — GEO Analyst.
  'radar': 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm0 2a6 6 0 100 12V6zm-1 4l5-3v6l-5-3z',
  // Generic spark — fallback.
  'spark': 'M12 2L9 9 2 12l7 3 3 7 3-7 7-3-7-3-3-7z',
};

export function AgentIcon({
  slug,
  size = 'md',
  className,
}: {
  slug: string;
  size?: AgentIconSize;
  className?: string;
}) {
  const theme = THEMES[slug] ?? FALLBACK;
  const px = SIZE_PX[size];
  const radius = RADIUS_PX[size];
  const glyphPx = Math.round(px * GLYPH_FRAC);
  // Each gradient gets its own id so multiple icons on a page don't
  // collide. Slug is enough for stability across renders.
  const gradId = useMemo(() => `agent-grad-${slug}`, [slug]);
  return (
    <span
      className={'inline-flex items-center justify-center shrink-0 relative ' + (className ?? '')}
      style={{ width: px, height: px, borderRadius: radius, overflow: 'hidden' }}
      aria-hidden
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        style={{ position: 'absolute', inset: 0 }}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={theme.from} />
            <stop offset="100%" stopColor={theme.to} />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="24" height="24" fill={`url(#${gradId})`} />
      </svg>
      <svg
        width={glyphPx}
        height={glyphPx}
        viewBox="0 0 24 24"
        fill={theme.glyph}
        style={{ position: 'relative' }}
      >
        <path d={GLYPHS[theme.kind]} />
      </svg>
    </span>
  );
}

export function hasAgentTheme(slug: string): boolean {
  return slug in THEMES;
}
