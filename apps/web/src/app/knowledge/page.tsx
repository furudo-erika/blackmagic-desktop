'use client';

import { Suspense } from 'react';
import { BookOpen } from 'lucide-react';
import { PageShell, PageHeader, PageBody } from '../../components/ui/primitives';
import { KnowledgeTabs, KnowledgeCard } from '../../components/knowledge-tabs';

function KnowledgeIndex() {
  return (
    <PageShell>
      <PageHeader
        title="Knowledge"
        subtitle="What the agents know about your business — the source of truth they pull from before every task."
        icon={BookOpen}
        trailing={<KnowledgeTabs />}
      />
      <PageBody maxWidth="3xl">
        <div className="space-y-4">
          <KnowledgeCard
            title="Company profile"
            body="Who you are, what you sell, who you sell it to. The one file every agent reads first."
            href="/vault?path=us%2Fcompany.md"
            cta="Edit →"
          />
          <KnowledgeCard
            title="Brand voice"
            body="Tone, banned words, sentence-length preferences. Consumed by every drafting agent."
            href="/vault?path=us%2Fbrand%2Fvoice.md"
            cta="Edit →"
          />
          <KnowledgeCard
            title="Product"
            body="Positioning, features, pricing. Referenced when an agent talks about what you do."
            href="/vault?path=us%2Fproduct"
            cta="Browse files →"
          />
        </div>
      </PageBody>
    </PageShell>
  );
}

export default function KnowledgePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">loading…</div>}>
      <KnowledgeIndex />
    </Suspense>
  );
}
