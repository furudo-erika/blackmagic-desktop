'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AgentCockpit from './AgentCockpit';
import TeamStandup from './TeamStandup';

// /team — when ?slug=X is present, render the per-employee cockpit
// (matches the legacy /team/[slug] surface, used by the sidebar and by
// agents/<slug>.md backlinks). When no slug is set, render the
// company-wide standup overview: every team, who's on it, what's
// running right now, and what's been shipped recently.
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">loading…</div>}>
      <TeamRouter />
    </Suspense>
  );
}

function TeamRouter() {
  const params = useSearchParams();
  const slug = params.get('slug') ?? '';
  if (slug) return <AgentCockpit />;
  return <TeamStandup />;
}
