'use client';

/**
 * Home — the chat surface. Reads ?agent=<slug> from the URL so Team
 * cockpit's "Chat with X" button can deep-link into a thread scoped
 * to that agent without a second chat page.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatSurface } from '../components/chat-surface';

function HomeInner() {
  const params = useSearchParams();
  const agent = params.get('agent') ?? undefined;
  return (
    <ChatSurface
      title="Chat"
      agent={agent}
      threadKey={agent ? `bm-team-thread-${agent}` : 'bm-last-thread'}
    />
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">loading…</div>}>
      <HomeInner />
    </Suspense>
  );
}
