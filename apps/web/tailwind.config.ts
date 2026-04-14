import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
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
        sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
