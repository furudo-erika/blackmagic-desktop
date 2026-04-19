'use client';

/**
 * Home — the chat surface. No greeting band, no dashboard. The first
 * thing a user sees when they open the app is a chat input.
 *
 * Recent threads live in the sidebar. Drafts live in the sidebar.
 * Per-agent workspaces live under /team/[slug].
 */

import { ChatSurface } from '../components/chat-surface';

export default function HomePage() {
  return <ChatSurface title="Chat" />;
}
