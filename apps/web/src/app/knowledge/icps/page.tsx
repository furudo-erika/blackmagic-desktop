'use client';

import { Target } from 'lucide-react';
import { PageShell, PageHeader, PageBody } from '../../../components/ui/primitives';
import { KnowledgeTabs, KnowledgeCard } from '../../../components/knowledge-tabs';

export default function IcpsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Knowledge"
        subtitle="Ideal Customer Profiles — the segments your agents qualify against."
        icon={Target}
        trailing={<KnowledgeTabs />}
      />
      <PageBody maxWidth="3xl">
        <KnowledgeCard
          title="us/market/icp.md"
          body="The canonical ICP definition. Who fits, who doesn't, what signals to weight. Edited by humans + refined by the icp-tune skill."
          href="/context?path=us%2Fmarket%2Ficp.md"
          cta="Edit ICP"
        />
        <div className="mt-4">
          <KnowledgeCard
            title="us/market/personas/"
            body="Per-buyer-persona briefs — VP Eng, RevOps Lead, etc. Drafting agents pull these when the recipient role is known."
            href="/context?path=us%2Fmarket%2Fpersonas"
            cta="Browse personas"
          />
        </div>
      </PageBody>
    </PageShell>
  );
}
