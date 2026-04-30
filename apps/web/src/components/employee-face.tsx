'use client';

/**
 * EmployeeFace — branded monogram avatar tile for AI employees.
 *
 * Renders entirely inline (no network image fetch) so it works in the
 * sandboxed Electron renderer even when the page can't reach the
 * public internet. Each employee gets a tinted rounded tile with
 * their initials; the color is picked deterministically from a calm
 * 12-color palette so a row of tiles reads as distinct faces.
 *
 * History: previously fetched from pravatar.cc as a fallback to a
 * tinted monogram. The remote-image path failed silently inside the
 * Electron renderer (image decode never settled, leaving empty
 * circles), so we dropped the network entirely. Local tiles look
 * cleaner against the cream + flame brand anyway.
 */

const SIZE_PX: Record<EmployeeFaceSize, number> = {
  xs: 20,
  sm: 28,
  md: 40,
  lg: 56,
  xl: 88,
};

const RADIUS_PX: Record<EmployeeFaceSize, number> = {
  xs: 5,
  sm: 7,
  md: 9,
  lg: 12,
  xl: 16,
};

export type EmployeeFaceSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// Cream-friendly palette: each entry is a (background, ink) pair so
// the initials sit at WCAG-AA contrast on the tinted tile. Mid-tones
// only — every tile reads on cream-light without screaming.
const PALETTE: { bg: string; ink: string }[] = [
  { bg: '#F4DAC1', ink: '#7A3E20' }, // peach
  { bg: '#E2C9F0', ink: '#5B2A7E' }, // lilac
  { bg: '#CCE0F0', ink: '#1F4F7E' }, // sky
  { bg: '#D6E5C9', ink: '#3F6B2A' }, // sage
  { bg: '#F0D7CE', ink: '#9C3F2A' }, // rose
  { bg: '#E8D9B6', ink: '#7B5A1F' }, // sand
  { bg: '#CFE5E2', ink: '#1F5B53' }, // mint
  { bg: '#E6CECA', ink: '#7C3A35' }, // clay
  { bg: '#D9DCE8', ink: '#3F4566' }, // slate
  { bg: '#F0E2C0', ink: '#7A6325' }, // wheat
  { bg: '#E5D2F0', ink: '#643484' }, // orchid
  { bg: '#C8DEE5', ink: '#214A57' }, // glacier
];

function paletteFor(seed: string): { bg: string; ink: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length]!;
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
  const px = SIZE_PX[size];
  const radius = RADIUS_PX[size];
  const fontPx = Math.max(9, Math.floor(px * 0.4));
  const { bg, ink } = paletteFor(seed);
  const ringClass = ring ? 'ring-[1.5px] ring-white dark:ring-[#1F1B15]' : '';
  return (
    <div
      title={name}
      className={
        'relative shrink-0 inline-flex items-center justify-center font-semibold tracking-tight ' +
        ringClass +
        (className ? ' ' + className : '')
      }
      style={{
        width: px,
        height: px,
        borderRadius: radius,
        background: bg,
        color: ink,
        fontSize: fontPx,
        // Subtle inner sheen — Vercel/Linear monogram tile aesthetic.
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(55,50,47,0.06)',
      }}
    >
      {initialsFor(name)}
    </div>
  );
}
