'use client';

import Link from 'next/link';
import { ArrowRight, Filter } from 'lucide-react';
import { PageShell, PageHeader, PageBody, Panel } from '../../../components/ui/primitives';
import { KnowledgeTabs } from '../../../components/knowledge-tabs';

const STAGES = [
  { name: 'Target', color: '#605A57', desc: "Fits ICP but hasn't engaged yet" },
  { name: 'Aware', color: '#6A8EC4', desc: 'Key stakeholders know you exist' },
  { name: 'MQL', color: '#3B82F6', desc: 'Strong buying signal — demo, content engagement' },
  { name: 'SQL', color: '#8B5CF6', desc: 'Confirmed budget, decision maker engaged' },
  { name: 'Opportunity', color: '#E8523A', desc: 'Active deal — running evaluation, trial, or POC' },
  { name: 'Negotiation', color: '#D4A65A', desc: 'Finalizing pricing, terms, implementation' },
  { name: 'Customer', color: '#7E8C67', desc: 'Contract signed and onboarded' },
  { name: 'Closed Lost', color: '#C97660', desc: 'Lost during sales process or churned' },
];

export default function FunnelPage() {
  return (
    <PageShell>
      <PageHeader
        title="Knowledge"
        subtitle="Sales funnel stages — your agents stamp deals against these definitions."
        icon={Filter}
        trailing={<KnowledgeTabs />}
      />
      <PageBody maxWidth="3xl">
        <Panel>
          <ul className="space-y-1">
            {STAGES.map((s, i) => (
              <li key={s.name}>
                <Link
                  href={`/deals?stage=${encodeURIComponent(s.name.toLowerCase())}`}
                  className="group flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 hover:bg-cream-light dark:hover:bg-[#1F1B15]"
                  title={`Show deals in ${s.name}`}
                >
                  <span
                    className="w-6 h-6 rounded-full text-[11px] font-mono text-white flex items-center justify-center shrink-0"
                    style={{ background: s.color }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA] w-32 shrink-0">
                    {s.name}
                  </span>
                  <span className="text-[12px] text-muted dark:text-[#8C837C] flex-1">{s.desc}</span>
                  <ArrowRight className="h-3 w-3 text-muted/60 dark:text-[#6B625C] opacity-0 group-hover:opacity-100 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <p className="mt-3 text-[11px] text-muted dark:text-[#8C837C]">
          Custom stage editor lands in a future release — for now stages are read from the daemon's
          built-in defaults. Override per-deal via the <code className="font-mono">stage:</code> field
          on a deal&apos;s frontmatter.
        </p>
      </PageBody>
    </PageShell>
  );
}
