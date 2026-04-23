'use client';

/**
 * AppShell — client-only wrapper.
 *
 * Defers rendering the real UI until after the first client mount so the
 * SSG HTML (which Electron loads as a bootstrap shell) can never produce
 * a hydration mismatch. The shipped HTML intentionally contains only a
 * neutral placeholder; the full tree mounts on the client.
 */

import { useEffect, useState } from 'react';
import { Providers } from '../app/providers';
import { Sidebar } from './sidebar';
import { LoginGate } from './login-gate';
import { UpgradeBanner } from './upgrade-banner';
import { ToastHost } from './ui/toast';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <>
        <div className="bm-titlebar" aria-hidden />
        <div style={{ minHeight: '100vh' }} />
      </>
    );
  }

  return (
    <>
      <div className="bm-titlebar" aria-hidden />
      <Providers>
        <LoginGate>
          <div className="flex flex-col h-screen">
            <UpgradeBanner />
            <div className="flex flex-1 min-h-0">
              <Sidebar />
              <main className="flex-1 overflow-hidden">{children}</main>
            </div>
          </div>
          <ToastHost />
        </LoginGate>
      </Providers>
    </>
  );
}
