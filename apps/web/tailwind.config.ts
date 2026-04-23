import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cream: '#FBFAF8',
        'cream-light': '#F5F1EA',
        ink: '#1A1614',
        muted: '#605A57',
        line: 'rgba(55,50,47,0.08)',
        flame: '#E8523A',
        'flame-soft': 'rgba(232,82,58,0.08)',
      },
      fontFamily: {
        // Matches blackmagic.engineering — Geist Sans / Geist Mono /
        // Instrument Serif. Variables are injected by `next/font` in
        // src/app/layout.tsx; system fonts remain as fallbacks so the
        // shell still renders before hydration.
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        serif: ['var(--font-instrument-serif)', 'ui-serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
