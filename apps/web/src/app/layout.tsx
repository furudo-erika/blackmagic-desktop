import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Sidebar } from '../components/sidebar';
import { LoginGate } from '../components/login-gate';

export const metadata: Metadata = {
  title: 'Black Magic',
  description: 'Your local AI GTM engineer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* draggable title-bar overlay — see .bm-titlebar in globals.css */}
        <div className="bm-titlebar" aria-hidden />
        <Providers>
          <LoginGate>
            <div className="flex h-screen">
              <Sidebar />
              <main className="flex-1 overflow-hidden">{children}</main>
            </div>
          </LoginGate>
        </Providers>
      </body>
    </html>
  );
}
