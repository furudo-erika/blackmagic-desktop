// Starter-prompt generator. Each agent has a list of template strings
// with `{slot}` placeholders. At request time we read the active
// vault's us/ files, extract slot values, and fill the templates.
// Starters whose slots can't be filled are dropped rather than shown
// with unfilled placeholders.
//
// Why templates-in-code rather than per-agent frontmatter: starters
// are UX, not agent config. They change when we polish the onboarding
// experience, independent of an agent's prompt or tool list. Keeping
// them here means we can ship better starters without bumping the
// revision counter on every seeded agent.md.

import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { getVaultRoot } from './paths.js';

// ---- slot vocabulary -----------------------------------------------
// Stable across templates. Templates reference `{company}`, `{competitor_a}`,
// `{top_customer}`, etc. Unknown slots → starter dropped.

export type Slots = Record<string, string | undefined>;

async function readMatter(rel: string): Promise<{ fm: Record<string, unknown>; body: string } | null> {
  try {
    const raw = await fs.readFile(path.join(getVaultRoot(), rel), 'utf-8');
    const parsed = matter(raw);
    return { fm: (parsed.data ?? {}) as Record<string, unknown>, body: parsed.content ?? '' };
  } catch {
    return null;
  }
}

// Parse a markdown bullet list out of a body. Returns non-empty items
// in document order. Used for competitors + top customers.
function bullets(body: string): string[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .filter((l) => l && !l.startsWith('[') && l !== '-' && !l.startsWith('#'));
}

// Parse the first column of a markdown table (skipping header + divider).
function tableFirstColumn(body: string): string[] {
  const lines = body.split('\n').map((l) => l.trim());
  const rows: string[] = [];
  let sawHeader = false;
  for (const l of lines) {
    if (!l.startsWith('|')) continue;
    if (/^\|[\s\-:|]+\|$/.test(l)) { sawHeader = true; continue; }
    if (!sawHeader) continue;
    const cells = l.split('|').map((c) => c.trim()).filter(Boolean);
    const first = cells[0];
    if (first && !/^[-\s]*$/.test(first)) rows.push(first);
  }
  return rows;
}

// Domain-keyed hardcoded fallbacks for when the vault's us/ is still
// a skeleton (competitors.md empty, top.md empty, etc.). Not meant to
// be exhaustive — just enough that the demo Vercel project shows
// realistic starters on day one even if ensureVault clobbered the
// seeded market/customers content.
const DOMAIN_FALLBACKS: Record<string, Partial<Slots>> = {
  'vercel.com': {
    competitor_a: 'Netlify',
    competitor_b: 'Cloudflare Pages',
    competitor_c: 'AWS Amplify',
    top_customer: 'Ramp',
    top_customer_b: 'Notion',
    top_customer_c: 'Runway',
    product_a: 'Next.js',
    product_b: 'AI SDK',
    product_c: 'v0',
    category: 'Frontend Cloud',
    public_voice: 'Guillermo Rauch',
    icp_industry: 'B2B SaaS',
    icp_stack: 'Next.js',
    icp_pain: 'self-hosted Next.js on ECS that became a full-time ops job',
  },
  'apidog.com': {
    competitor_a: 'Postman',
    competitor_b: 'Bruno',
    competitor_c: 'Insomnia',
    top_customer: 'a Postman-migration team',
    top_customer_b: 'an OpenAPI-spec-first team',
    product_a: 'Apidog',
    product_b: 'Apidog CLI',
    category: 'API development platform',
    icp_industry: 'API-first SaaS',
    icp_stack: 'OpenAPI / REST',
    icp_pain: 'Postman licensing costs + sync-with-spec drift',
  },
};

export async function extractSlots(): Promise<Slots> {
  const slots: Slots = {};

  const company = await readMatter('us/company.md');
  const fm = company?.fm ?? {};
  const name = typeof fm.name === 'string' ? fm.name : undefined;
  const domain = typeof fm.domain === 'string' ? fm.domain.toLowerCase() : undefined;
  slots.company = name;
  slots.domain = domain;
  if (Array.isArray(fm.founders) && fm.founders.length > 0) {
    const first = fm.founders[0];
    if (typeof first === 'string') slots.founder = first;
  }
  if (typeof fm.one_liner === 'string') slots.one_liner = fm.one_liner;

  // Competitors — first two non-empty bullets of us/market/competitors.md.
  const comp = await readMatter('us/market/competitors.md');
  if (comp) {
    const bs = bullets(comp.body).map((s) => s.replace(/\s*\(.*$/, '').trim()).filter(Boolean);
    if (bs[0]) slots.competitor_a = bs[0];
    if (bs[1]) slots.competitor_b = bs[1];
    if (bs[2]) slots.competitor_c = bs[2];
  }

  // Top customers — first-column of the us/customers/top.md table.
  const topCust = await readMatter('us/customers/top.md');
  if (topCust) {
    const rows = tableFirstColumn(topCust.body);
    if (rows[0]) slots.top_customer = rows[0];
    if (rows[1]) slots.top_customer_b = rows[1];
    if (rows[2]) slots.top_customer_c = rows[2];
  }

  // ICP industries — first bullet under "## Industries" in us/market/icp.md.
  const icp = await readMatter('us/market/icp.md');
  if (icp) {
    const m = icp.body.match(/##\s+Industries[^\n]*\n([\s\S]*?)(?:\n##|$)/);
    if (m) {
      const first = bullets(m[1]!)[0];
      if (first) slots.icp_industry = first;
    }
    const stackM = icp.body.match(/##\s+Tech stack[^\n]*\n([\s\S]*?)(?:\n##|$)/);
    if (stackM) {
      const first = bullets(stackM[1]!)[0];
      if (first) slots.icp_stack = first;
    }
    const painM = icp.body.match(/##\s+Pain indicators[^\n]*\n([\s\S]*?)(?:\n##|$)/);
    if (painM) {
      const first = bullets(painM[1]!)[0];
      if (first) slots.icp_pain = first;
    }
  }

  // Domain-keyed fallbacks fill whatever's still undefined. Never
  // overrides a value actually present in the vault.
  if (domain && DOMAIN_FALLBACKS[domain]) {
    for (const [k, v] of Object.entries(DOMAIN_FALLBACKS[domain]!)) {
      if (slots[k] === undefined && v !== undefined) slots[k] = v;
    }
  }

  // Cross-project defaults that should always have a value.
  if (!slots.company) slots.company = 'our company';
  if (!slots.public_voice && slots.founder) slots.public_voice = slots.founder;

  return slots;
}

// ---- templates ------------------------------------------------------
// Every template is a single sentence the user could have typed. We
// write these as if the user IS the operator — "find X", "draft Y" —
// not "help me find X". Each agent gets 6–8 candidates so rotation /
// shuffle works even when some templates drop for missing slots.

export const AGENT_STARTERS: Record<string, string[]> = {
  'lookalike-discovery': [
    'Find 20 accounts that look like {top_customer} — same stack, same stage.',
    "Lookalikes for our top {icp_industry} wins we haven't touched this quarter.",
    'Series B+ {icp_industry} companies on {icp_stack} similar to {top_customer_b}.',
    'Who else looks like {top_customer} and {top_customer_b}? Give me 15.',
    'Accounts in the {icp_industry} space that match our top 3 closed-wons.',
    "10 lookalikes of {top_customer} that aren't already in our CRM.",
  ],
  'linkedin-outreach': [
    "Warm-DM everyone who engaged with {public_voice}'s last LinkedIn post.",
    'Draft DMs to every VP Engineering who liked our last launch post.',
    'Connection requests to Heads of Platform at {icp_industry} Series B+.',
    "Re-engage LinkedIn connections who opened but didn't reply last quarter.",
    "DM templates for anyone who commented 'interested' on our {product_a} thread.",
    "Pull prospects from {public_voice}'s 2nd-degree network working at {icp_industry} companies.",
  ],
  'website-visitor': [
    'Which {icp_industry} companies hit /pricing on {domain} in the last 7 days?',
    'De-anon last week\'s {domain} visitors and score them against our ICP.',
    'Who from Series B+ viewed /enterprise on {domain} this month?',
    'Anonymous {domain} traffic spikes from target accounts this quarter.',
    'Route top 10 de-anonymized visitors to the AE queue.',
    'Which target accounts read our last {product_a} blog post?',
  ],
  'outbound': [
    'Build a 5-touch sequence for the lookalikes of {top_customer}.',
    'Cold-email sequence targeting {icp_industry} teams stuck on {competitor_a}.',
    'Draft outbound for 20 Heads of Platform — hook them on {product_a}.',
    '3-touch email + LinkedIn combo for {icp_industry} companies at Series B.',
    'Replace our current sequence with one referencing the pain of {icp_pain}.',
    'Outreach to accounts that viewed /pricing but never booked a demo.',
  ],
  'meeting-prep': [
    'Brief for tomorrow\'s {top_customer} call — who\'s in the room, what matters.',
    'Pre-call research on the next meeting on my calendar.',
    'Summarize every touchpoint we\'ve had with {top_customer_b} in the last 90 days.',
    'Brief me on the {icp_industry} prospect I\'m meeting next — public signals, hooks.',
    'What did {top_customer} blog about last month? Any angle for tomorrow\'s call?',
    'Prep for the expansion QBR with {top_customer} — risks + upsell openings.',
  ],
  'pipeline-ops': [
    'Which deals in Negotiation haven\'t moved in 14+ days? Next moves for each.',
    'Stale pipeline audit — flag at-risk ARR and suggest the owner nudge per deal.',
    'Commit-forecast reality check — which deals are really going to close this quarter?',
    'Deals without a scheduled next-step in the calendar — list owners.',
    'Pipeline gaps by segment — where are we thin against quota?',
    'Show me every deal where the champion has gone quiet for 10+ days.',
  ],
  'closed-lost-revival': [
    'Revive 5 deals we lost to {competitor_a} in the last 12 months.',
    'Closed-lost in {icp_industry} — who\'s worth a warm re-open?',
    "Accounts that churned from {competitor_b} — are any ripe for us now?",
    'Find the 10 best closed-lost deals to revive this month.',
    'Why did we lose to {competitor_a} last quarter, and which of those are reopen-worthy?',
    'Every closed-lost where the champion has since changed jobs.',
  ],
  'researcher': [
    'Deep-dive on {competitor_a} — funding, tech, moat vs. us.',
    'Profile {top_customer} — why they picked us, what\'s expandable.',
    'Competitive teardown: {competitor_a} vs {competitor_b} vs {company}.',
    'Research the top 10 Series B {icp_industry} companies on {icp_stack}.',
    'What\'s {competitor_a} shipping this quarter that we need an answer to?',
    'Full landscape of the {category} market — who\'s growing, who\'s losing ground.',
  ],
  'content-studio': [
    'Write a 3-tweet thread announcing our latest {product_a} feature.',
    'Draft a LinkedIn post from {public_voice} for next week\'s launch.',
    'Blog outline: how {top_customer} ships on {product_a}.',
    'Landing-page copy for the {icp_industry} segment.',
    'Customer-story interview questions for {top_customer_b}.',
    'Short demo video script for {product_a} — 45 seconds, no filler.',
  ],
  'brand-monitor': [
    'What are devs saying about {company} on Hacker News this week?',
    'Scrape Reddit /r/{icp_stack} for {company} mentions in the last 30 days.',
    'Sentiment digest across Twitter / Reddit / HN for the past week.',
    '{competitor_a} vs {company} — who\'s winning the mindshare war right now?',
    'Surface every public complaint about {product_a} from the last 14 days.',
    'Top 5 posts where someone recommended a competitor over us this month.',
  ],
  'geo-analyst': [
    'GEO audit on {domain} — which queries are we missing from ChatGPT answers?',
    'Which competitors own the "{category} for {icp_industry}" query on Perplexity?',
    'Pages on {domain} that should be rewritten for LLM retrieval.',
    'What does ChatGPT say when you ask "best {category} in 2026"?',
    'Find gaps in our docs that LLMs cite {competitor_a} for instead of us.',
    'Weekly GEO delta — ranking changes since last scan.',
  ],
  'company-profiler': [
    'Profile {top_customer} — who they are, what they care about, ICP fit.',
    'Enrich every company in companies/ that\'s missing a profile.',
    'Deep profile on our next 5 inbound leads.',
    'Profile the top 10 Series B {icp_industry} companies on {icp_stack}.',
    'Update the {top_customer} profile with anything new from the last 30 days.',
    'Bootstrap a profile for {competitor_a} as if it were a prospect.',
  ],
  'ae': [
    'Walk through every open deal I own — status, next step, risk.',
    'Which of my deals need a push today to stay on track?',
    'Draft MEDDPICC updates for every active opp in my name.',
    'Send a check-in to every champion I haven\'t touched in 7+ days.',
    'Pre-call brief for today\'s next call on my calendar.',
    'Which of my deals are most at risk of slipping to next quarter?',
  ],
  'sdr': [
    'Draft personalized first-touch emails for the 10 newest leads in companies/.',
    'Enroll the top 10 lookalikes of {top_customer} into the default sequence.',
    '3-touch LinkedIn + email sequence targeting Heads of Platform in {icp_industry}.',
    'Every stalled sequence — figure out why and suggest a reset.',
    "Draft reply to every prospect who asked 'what do you cost' this week.",
    'Qualify and route every inbound from the last 48 hours.',
  ],
  'x-account': [
    'Draft 3 tweets promoting this week\'s {product_a} release.',
    'Ghostwrite a tweet from {public_voice} reacting to {competitor_a}\'s latest move.',
    'Reply-guy drafts for every post in our Twitter engagement list today.',
    'What should {company} post about on X this week? 5 topic ideas.',
    'Scan replies to our last launch tweet and draft responses.',
    'Quote-tweet options for the {top_customer} customer story.',
  ],
};

// Curated cross-agent "best of" — shown on Home when no specific
// agent is picked in the composer. These should be the single most
// compelling prompt for each of the 6 most-used GTM flows.
const GLOBAL_SLUGS: Array<{ slug: string; index: number }> = [
  { slug: 'lookalike-discovery', index: 0 },
  { slug: 'linkedin-outreach', index: 0 },
  { slug: 'website-visitor', index: 0 },
  { slug: 'pipeline-ops', index: 0 },
  { slug: 'closed-lost-revival', index: 0 },
  { slug: 'meeting-prep', index: 0 },
];

export interface Starter {
  agent: string;     // slug
  prompt: string;    // filled
  template: string;  // original template (for debug / shuffle)
}

function fillTemplate(tpl: string, slots: Slots): string | null {
  let out = tpl;
  const slotRe = /\{([a-z_]+)\}/g;
  const missing: string[] = [];
  out = out.replace(slotRe, (_m, key) => {
    const v = slots[key];
    if (!v) missing.push(key);
    return v ?? `{${key}}`;
  });
  if (missing.length > 0) return null;
  return out;
}

export async function starterPayload(agentSlug?: string): Promise<{
  slots: Slots;
  global: Starter[];
  byAgent: Record<string, Starter[]>;
}> {
  const slots = await extractSlots();

  function buildFor(slug: string): Starter[] {
    const tpls = AGENT_STARTERS[slug] ?? [];
    const out: Starter[] = [];
    for (const tpl of tpls) {
      const filled = fillTemplate(tpl, slots);
      if (filled) out.push({ agent: slug, prompt: filled, template: tpl });
    }
    return out;
  }

  if (agentSlug) {
    return { slots, global: [], byAgent: { [agentSlug]: buildFor(agentSlug) } };
  }

  // Global: pick the Nth starter from each GLOBAL_SLUGS entry. If that
  // one dropped (missing slot), take the next available from that agent
  // so the row always has 6 entries as long as each agent has ≥1
  // filled starter.
  const global: Starter[] = [];
  for (const { slug } of GLOBAL_SLUGS) {
    const built = buildFor(slug);
    if (built[0]) global.push(built[0]);
  }

  // byAgent covers every agent we have templates for — the UI uses
  // this when the user @-mentions an agent in the Home composer.
  const byAgent: Record<string, Starter[]> = {};
  for (const slug of Object.keys(AGENT_STARTERS)) {
    byAgent[slug] = buildFor(slug);
  }

  return { slots, global, byAgent };
}
