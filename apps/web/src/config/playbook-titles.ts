/**
 * Hand-crafted display titles for each built-in playbook ("skill").
 *
 * The filesystem slug is kebab-case and terse (`li-draft-message`), which
 * reads as robot-speak to a new user. The UI surfaces the human label
 * instead, falling back to a humanizer when a playbook isn't in this
 * map (user-authored or future playbooks).
 */

const TITLES: Record<string, string> = {
  // High-intent visitor
  'visitor-deanonymize': 'Deanonymize a website visitor',
  'visitor-identify': 'Identify high-intent visitors',
  'visitor-qualify-icp': 'Qualify a visitor against ICP',
  'visitor-research-account': 'Research a visiting account',
  'visitor-launch-outreach': 'Launch outreach to a visitor',
  'visitor-route-rep': 'Route a visitor to the right rep',

  // LinkedIn
  'li-company-context': 'Gather LinkedIn company context',
  'li-detect-engagement': 'Score a LinkedIn engagement',
  'li-draft-message': 'Draft a LinkedIn DM',
  'li-enrich-profile': 'Enrich a LinkedIn profile',
  'li-send-request': 'Send a LinkedIn connection request',
  'signal-based-outbound': 'Draft signal-based outbound emails',

  // Meeting prep
  'meeting-engagement-history': 'Pull meeting engagement history',
  'meeting-pre-call-brief': 'Write a pre-call brief',
  'meeting-pull-records': 'Pull meeting records',
  'meeting-research-news': 'Research news before a meeting',
  'meeting-talking-points': 'Generate meeting talking points',

  // Deal won / lookalikes
  'won-analyze': 'Analyze a closed-won deal',
  'won-buying-committee': 'Map the buying committee that won',
  'won-craft-messaging': 'Craft messaging from the win',
  'won-lookalikes': 'Find lookalike accounts',
  'won-multichannel-campaign': 'Launch a multichannel campaign from a win',

  // Deal lost
  'lost-analyze-reasons': 'Analyze why a deal was lost',
  'lost-competitor-intel': 'Extract competitor intel from a loss',
  'lost-process-improvements': 'Propose process improvements from a loss',
  'lost-pull-history': "Pull a lost deal's full history",
  'lost-share-insights': 'Share closed-lost insights with the team',

  // Pipeline health
  'pipeline-at-risk': 'Flag at-risk deals',
  'pipeline-missing-next-steps': 'Find deals missing next steps',
  'pipeline-notify-owners': 'Notify deal owners of issues',
  'pipeline-recovery-actions': 'Draft pipeline recovery actions',
  'pipeline-scan-stale': 'Scan for stale deals',
  'revops-pipeline-health': 'Run the weekly pipeline health check',

  // Research / general
  'bootstrap-self': 'Bootstrap your company context',
  'brand-mention-scan': 'Scan for brand mentions',
  'competitor-scan': 'Scan for competitor activity',
  'deep-research-account': 'Deep-research an account',
  'demand-gen-content-brief': 'Write a demand-gen content brief',
  'draft-outbound': 'Draft a cold outbound email',
  'enrich-company': 'Enrich a company',
  'enrich-contact-deep': 'Deep-enrich a contact',
  'enrich-contact': 'Enrich a contact',
  'icp-tune': 'Tune your ICP',
  'import-legacy-org': 'Import a legacy /org tree',
  'lead-qualify': 'Qualify a lead',
  'news-scan': 'Scan for news about your accounts',
  'qualify-icp': 'Qualify a prospect against your ICP',
  'sales-account-research': 'Research a sales account',
};

const PREFIX_EXPANSIONS: Array<[RegExp, string]> = [
  [/^li-/, 'LinkedIn: '],
  [/^linkedin-/, 'LinkedIn: '],
  [/^lost-/, 'Closed-lost: '],
  [/^won-/, 'Closed-won: '],
  [/^visitor-/, 'Visitor: '],
  [/^pipeline-/, 'Pipeline: '],
  [/^meeting-/, 'Meeting: '],
  [/^lookalike-/, 'Lookalike: '],
  [/^signal-/, 'Signal: '],
  [/^deep-/, 'Deep-research: '],
  [/^enrich-/, 'Enrich: '],
  [/^competitor-/, 'Competitor: '],
  [/^brand-/, 'Brand: '],
  [/^news-/, 'News: '],
  [/^qualify-/, 'Qualify: '],
  [/^lead-/, 'Lead: '],
  [/^sales-/, 'Sales: '],
  [/^revops-/, 'RevOps: '],
  [/^icp-/, 'ICP: '],
  [/^bootstrap-/, 'Bootstrap: '],
  [/^import-/, 'Import: '],
  [/^draft-/, 'Draft: '],
  [/^demand-gen-/, 'Demand-gen: '],
];

export function playbookTitle(slug: string): string {
  const direct = TITLES[slug];
  if (direct) return direct;
  // Fallback: expand a known prefix, then humanize the rest.
  let rest = slug;
  let prefix = '';
  for (const [re, rep] of PREFIX_EXPANSIONS) {
    if (re.test(rest)) {
      prefix = rep;
      rest = rest.replace(re, '');
      break;
    }
  }
  const words = rest.replace(/-/g, ' ').trim();
  const humanized = words.charAt(0).toUpperCase() + words.slice(1);
  return (prefix + humanized).trim() || slug;
}
