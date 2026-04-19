/**
 * Built-in GTM agents — the "team" that shows on the home screen and
 * in the sidebar's Team section.
 *
 * Names are deliberately descriptive, not mascot-style. Black Magic is
 * the agent platform; personas belong to adjacent products.
 *
 * Each agent maps 1:1 to a system-prompt file in the user's vault at
 * ~/BlackMagic/agents/<slug>.md. The daemon reads those at run time.
 * A playbook names an agent via frontmatter `agent: <slug>`.
 */

export type AgentSlug =
  | 'website-visitor'
  | 'linkedin-outreach'
  | 'meeting-prep'
  | 'lookalike-discovery'
  | 'closed-lost-revival'
  | 'pipeline-ops';

export interface AgentDef {
  slug: AgentSlug;
  name: string;           // sidebar + card heading
  tagline: string;        // one-liner on the team-gallery card
  description: string;    // one paragraph on the agent's page
  icon: string;           // lucide icon name
  color: string;          // tailwind bg for the card accent (beige palette)
  /** Path-substring matches — legacy pathway. */
  playbookPrefix: string[];
  /** Values of frontmatter `group:` that belong to this agent. Primary match. */
  playbookGroups: string[];
  /** Prompts surfaced on the agent page + used to prefill chat. */
  starterPrompts: string[];
}

export const AGENTS: readonly AgentDef[] = [
  {
    slug: 'website-visitor',
    name: 'Website Visitor Agent',
    tagline: 'Who showed up on your site and whether they\'re worth emailing.',
    description:
      'Ingests first-party deanonymized website traffic, matches companies against your ICP in us/icp.md, qualifies the hit, and writes a draft outbound email. Fires within minutes of a pricing-page view so intent doesn\'t decay.',
    icon: 'Globe',
    color: 'bg-amber-50 dark:bg-amber-950/30',
    playbookPrefix: ['visitor-', 'deanon'],
    playbookGroups: ['high-intent-visitor'],
    starterPrompts: [
      'Show me today\'s identified visitors and qualify the top 5 against our ICP.',
      'Draft a short outbound email to the last high-intent visitor on our pricing page.',
    ],
  },
  {
    slug: 'linkedin-outreach',
    name: 'LinkedIn Outreach Agent',
    tagline: 'LinkedIn signals into 3-touch sequences for top-tier accounts.',
    description:
      'Watches LinkedIn for hiring posts, title changes, content signals, and funding announcements on your top-10% TAM. Matches to us/triggers.md, drafts a 3-touch sequence using us/sequences/linkedin, and stages it for review.',
    icon: 'Linkedin',
    color: 'bg-sky-50 dark:bg-sky-950/30',
    playbookPrefix: ['linkedin', 'li-', 'signal-based-outbound'],
    playbookGroups: ['linkedin-intent'],
    starterPrompts: [
      'Find LinkedIn posts from VPs of Sales at our ICP in the last 24 hours.',
      'For accounts that hired 3+ AEs in the last 30 days, draft a 3-touch LinkedIn sequence.',
    ],
  },
  {
    slug: 'meeting-prep',
    name: 'Meeting Prep Agent',
    tagline: 'Pre-meeting account and people briefs in under a minute.',
    description:
      'Pulls a named meeting from your calendar, enriches every attendee, runs a shallow deep-research pass on the company, surfaces relevant past threads, and outputs a one-page brief. Designed to run 60 seconds before a call.',
    icon: 'CalendarClock',
    color: 'bg-emerald-50 dark:bg-emerald-950/30',
    playbookPrefix: ['meeting-', 'pre-call', 'account-brief'],
    playbookGroups: ['meeting-prep'],
    starterPrompts: [
      'Prepare a brief for my next meeting.',
      'Research acme.com and everyone on their sales team joining the call at 3pm.',
    ],
  },
  {
    slug: 'lookalike-discovery',
    name: 'Lookalike Discovery Agent',
    tagline: 'Find more companies that look like your best customers.',
    description:
      'Takes the closed-won accounts from us/customers/top.md, runs them through firmographic + behavioral lookalike search (Ocean.io by default), writes new prospects into companies/ and scores each against ICP.',
    icon: 'Copy',
    color: 'bg-violet-50 dark:bg-violet-950/30',
    playbookPrefix: ['lookalike', 'won-', 'expansion'],
    playbookGroups: ['deal-won'],
    starterPrompts: [
      'Find 50 lookalikes for our top 3 customers and score them against our ICP.',
      'Show me the 10 highest-fit lookalikes we haven\'t touched yet.',
    ],
  },
  {
    slug: 'closed-lost-revival',
    name: 'Closed-Lost Revival Agent',
    tagline: 'Replay old losses against this week\'s signals.',
    description:
      'Scans CRM closed-lost opportunities, cross-references the original loss reason against current triggers (new VP, new round, tool migration), and surfaces which losses should be re-opened this week with a tailored angle.',
    icon: 'RotateCcw',
    color: 'bg-rose-50 dark:bg-rose-950/30',
    playbookPrefix: ['lost-', 'closed-lost', 'revival'],
    playbookGroups: ['deal-lost'],
    starterPrompts: [
      'Which closed-lost deals match a trigger that fired this week?',
      'Draft a re-engagement email for deals we lost on "timing" 6+ months ago.',
    ],
  },
  {
    slug: 'pipeline-ops',
    name: 'Pipeline Ops Agent',
    tagline: 'Pipeline health, stuck deals, and sequence performance.',
    description:
      'Reads your CRM daily and flags: stuck deals (no activity > 14 days), sequences with reply rate collapsing below threshold, forecast vs. actuals drift, and SDR-per-quota throughput. Produces the Monday pipeline review.',
    icon: 'Activity',
    color: 'bg-stone-100 dark:bg-stone-900/40',
    playbookPrefix: ['pipeline-', 'forecast', 'sequence-audit', 'revops'],
    playbookGroups: ['pipeline-health'],
    starterPrompts: [
      'What changed in my pipeline since last Monday?',
      'Which active sequences dropped below 1.5% reply rate this week?',
    ],
  },
] as const;

export function getAgent(slug: string): AgentDef | undefined {
  return AGENTS.find((a) => a.slug === slug);
}
