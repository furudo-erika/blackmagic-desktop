import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { Instrument_Serif } from 'next/font/google';
import './globals.css';
import { AppShell } from '../components/app-shell';

// Match the blackmagic.engineering marketing site's type system —
// Geist for body/UI, Geist Mono for code/keys, Instrument Serif as
// a display face. Same three families the homepage uses, so the
// desktop app and the landing page share a single voice.
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Black Magic',
  description: 'Your local AI GTM engineer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
    >
      <body suppressHydrationWarning className="font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
