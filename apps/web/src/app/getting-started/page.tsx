'use client';

/**
 * Getting started — two-column "I'm new" vs "I've got a specific account"
 * onboarding guide. Rendered from the primitives in components/ui so it
 * matches every other workflow page.
 *
 * Auto-redirect logic lives in RedirectToGettingStarted.tsx (mounted from
 * the root layout); this page just renders the cards + a "don't show me
 * again" toggle that sets localStorage `bm-seen-getting-started`.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Building2,
  Plug,
  Zap,
  BookOpen,
  Play,
  Users,
  FileText,
  Repeat,
  CircleCheck,
  ArrowRight,
} from 'lucide-react';
import type { ComponentType } from 'react';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  Button,
} from '../../components/ui/primitives';

type Step = {
  n: number;
  title: string;
  hint: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  cta: string;
};

const SETUP_STEPS: Step[] = [
  {
    n: 1,
    title: 'Create a project',
    hint: "Already done — you're looking at it. Each project is a separate context with its own companies, contacts, deals, and playbooks.",
    href: '/',
    icon: CircleCheck,
    cta: 'Open chat',
  },
  {
    n: 2,
    title: 'Tell us about your company',
    hint: "Your domain is enough. Black Magic will crawl your site + docs and fill in us/company.md, product/, market/, brand/ so every draft + research task is grounded.",
    href: '/onboarding/bootstrap',
    icon: Building2,
    cta: 'Edit us/',
  },
  {
    n: 3,
    title: 'Connect at least one integration',
    hint: "Apify (company + contact scrapers), HubSpot/Attio/Salesforce, and Gmail/Slack wire up draft approvals. LinkedIn person enrichment now runs through the built-in proxy — no key needed.",
    href: '/integrations',
    icon: Plug,
    cta: 'Connect integrations',
  },
  {
    n: 4,
    title: 'Install the brand-monitor presets',
    hint: "Turns on the daily brand + news scans and the weekly competitor sweep. Also installs the three GTM triggers: visitor sweep, ICP tuning, and pipeline health.",
    href: '/triggers',
    icon: Zap,
    cta: 'Install presets',
  },
  {
    n: 5,
    title: 'Try a starter skill',
    hint: "Invoke sales-account-research on a real domain — its agent builds a one-pager with trigger events, buyer titles, and a cold opener in 30 seconds.",
    href: '/skills',
    icon: BookOpen,
    cta: 'Browse skills',
  },
];

const CAMPAIGN_STEPS: Step[] = [
  {
    n: 1,
    title: 'Open the company',
    hint: "If the account isn't in Companies yet, add it via the enrich-company playbook or just type the domain into chat.",
    href: '/companies',
    icon: Building2,
    cta: 'Open Companies',
  },
  {
    n: 2,
    title: 'Run sales-account-research',
    hint: "Produces companies/<slug>-research.md with news, tech-stack, buyer titles, and a cold opener. Seeds contacts/ with likely champions.",
    href: '/skills',
    icon: Play,
    cta: 'Open skill',
  },
  {
    n: 3,
    title: 'Approve the drafts',
    hint: "signal-based-outbound drafts land in drafts/ with status: pending. Nothing goes out until you hit Approve in the Inbox.",
    href: '/outreach',
    icon: FileText,
    cta: 'Open Inbox',
  },
  {
    n: 4,
    title: 'Enroll in post-signal-5-touch (optional)',
    hint: "Five-touch drip over 21 days that keeps referencing the triggering signal. Stops on reply.",
    href: '/sequences',
    icon: Repeat,
    cta: 'Open Sequences',
  },
];

function StepCard({ step }: { step: Step }) {
  const Icon = step.icon;
  return (
    <Link
      href={step.href}
      className="group block rounded-xl border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] p-4 hover:border-flame transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-7 h-7 rounded-full border border-line dark:border-[#2A241D] flex items-center justify-center text-[11px] font-mono text-muted dark:text-[#8C837C] group-hover:border-flame group-hover:text-flame transition-colors">
          {step.n}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-flame shrink-0" />
            <span className="text-sm font-semibold text-ink dark:text-[#F5F1EA] truncate">
              {step.title}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-muted dark:text-[#8C837C] leading-snug">
            {step.hint}
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-flame">
            {step.cta}
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function Column({
  eyebrow,
  title,
  blurb,
  steps,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  steps: Step[];
}) {
  return (
    <Panel padded={false} className="overflow-hidden">
      <div className="px-5 py-4 border-b border-line dark:border-[#2A241D]">
        <div className="text-[10px] uppercase tracking-widest font-mono text-flame">
          {eyebrow}
        </div>
        <h2 className="mt-1 text-base font-semibold text-ink dark:text-[#F5F1EA]">
          {title}
        </h2>
        <p className="mt-1 text-[12px] text-muted dark:text-[#8C837C] leading-snug">
          {blurb}
        </p>
      </div>
      <div className="p-4 flex flex-col gap-2">
        {steps.map((s) => (
          <StepCard key={s.n} step={s} />
        ))}
      </div>
    </Panel>
  );
}

export default function GettingStartedPage() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem('bm-seen-getting-started') === '1');
  }, []);

  function dismiss() {
    localStorage.setItem('bm-seen-getting-started', '1');
    setDismissed(true);
  }
  function undismiss() {
    localStorage.removeItem('bm-seen-getting-started');
    setDismissed(false);
  }

  return (
    <PageShell>
      <PageHeader
        title="Getting started"
        subtitle="Two paths: set up a brand-new context, or run a campaign on an account you already care about."
        icon={Sparkles}
        trailing={
          dismissed ? (
            <Button variant="ghost" onClick={undismiss}>
              Show again on next open
            </Button>
          ) : (
            <Button variant="secondary" onClick={dismiss}>
              Don&apos;t show again
            </Button>
          )
        }
      />
      <PageBody maxWidth="5xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Column
            eyebrow="Setup"
            title="I'm setting up Black Magic for a new company"
            blurb="Five steps, about 10 minutes. Once these are done, every playbook + signal scan + trigger is wired against your own ICP and voice."
            steps={SETUP_STEPS}
          />
          <Column
            eyebrow="Campaign"
            title="I want to run a campaign on an existing account"
            blurb="You already have an account in mind. Go research → draft → approve, then optionally enroll in a drip."
            steps={CAMPAIGN_STEPS}
          />
        </div>

        <Panel className="mt-6">
          <div className="flex items-start gap-3">
            <Users className="w-4 h-4 text-flame shrink-0 mt-0.5" />
            <div className="min-w-0 text-[12px] text-muted dark:text-[#8C837C] leading-relaxed">
              <strong className="text-ink dark:text-[#F5F1EA]">
                What&apos;s in the GTM starter pack.
              </strong>{' '}
              Out-of-the-box you get 8 GTM playbooks (visitor ID, signal-based
              outbound, lead qualification, deep contact enrichment, ICP
              tuning, demand-gen briefs, sales account research, RevOps
              pipeline health) plus a five-touch post-signal sequence. Drop a
              visitor log into{' '}
              <code className="text-[11px] bg-cream-light dark:bg-[#17140F] px-1 rounded">
                signals/visitors/&lt;date&gt;.json
              </code>{' '}
              and the daily sweep will de-anonymise and score it. Everything
              runs locally against your context.
            </div>
          </div>
        </Panel>
      </PageBody>
    </PageShell>
  );
}
