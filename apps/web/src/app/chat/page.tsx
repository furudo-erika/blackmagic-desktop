'use client';

/**
 * /chat — the chat surface. Reads ?agent=<slug> from the URL so deep
 * links into a per-agent thread keep working.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatSurface } from '../../components/chat-surface';

function ChatInner() {
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

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">loading…</div>}>
      <ChatInner />
    </Suspense>
  );
}
