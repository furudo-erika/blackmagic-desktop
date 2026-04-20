import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '../components/app-shell';

export const metadata: Metadata = {
  title: 'Black Magic',
  description: 'Your local AI GTM engineer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
