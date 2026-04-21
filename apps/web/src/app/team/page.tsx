import { Suspense } from 'react';
import AgentCockpit from './AgentCockpit';

// /team — single static page. The agent slug comes in as ?slug=X so
// the static export produces one HTML file that works for any vault
// agent. /team/[slug] still exists for the six hardcoded GTM slugs
// (legacy bookmarks), but the sidebar now always lands here.
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">loading…</div>}>
      <AgentCockpit />
    </Suspense>
  );
}
