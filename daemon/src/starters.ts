// Starter-prompt generator. Each agent has a list of template strings
// with `{slot}` placeholders. At request time we read the active
// context's us/ files, extract slot values, and fill the templates.
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
import { getContextRoot } from './paths.js';

// ---- slot vocabulary -----------------------------------------------
// Stable across templates. Templates reference `{company}`, `{competitor_a}`,
// `{top_customer}`, etc. Unknown slots → starter dropped.

export type Slots = Record<string, string | undefined>;

async function readMatter(rel: string): Promise<{ fm: Record<string, unknown>; body: string } | null> {
  try {
    const raw = await fs.readFile(path.join(getContextRoot(), rel), 'utf-8');
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

// Domain-keyed hardcoded fallbacks for when the context's us/ is still
// a skeleton (competitors.md empty, top.md empty, etc.). Not meant to
// be exhaustive — just enough that the demo Vercel project shows
// realistic starters on day one even if ensureContext clobbered the
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
  // overrides a value actually present in the context.
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
  // Generalist chat agent — reads/writes context, enriches, drafts, enrolls.
  // Starters lean toward context housekeeping + cross-cutting research no
  // other specialist agent owns end-to-end.
  'researcher': [
    'Enrich every company in companies/ that is missing a firmographic profile — write icp_score and a one-paragraph why-they-fit.',
    'Deep-research {top_customer}: write companies/{top_customer}.md with firmographics, likely champion, and the last 30 days of news.',
    'Scan signals/ from the last 7 days, score each by intent, and propose ONE concrete action per top-5 signal.',
    'Cross-check companies/ against us/market/icp.md — flag every account with icp_score below 40 as "archive candidate" and list them.',
    'Read the last 20 entries in runs/, summarize what shipped, what stalled, and what needs a human decision.',
    'Competitive teardown on {competitor_a} — funding, tech stack, pricing, comparative moat vs {company}. Write to companies/{competitor_a}.md.',
  ],
  // SDR — drafts outbound emails into drafts/ given contact+company. No
  // sending. Every starter points at drafts/ output, not the send step.
  'sdr': [
    'Draft personalized first-touch emails for the 10 newest companies in companies/ — one .md per draft, in drafts/.',
    'Draft outbound to every contact in contacts/ whose last_touched_at is 60+ days ago. Angle: {icp_pain}.',
    'Re-draft everything in drafts/pending/ with a sharper hook on the pain of {icp_pain}.',
    '5 cold-email drafts to {icp_industry} teams currently on {competitor_a} — each with a specific switching hook.',
    'Draft replies to every unhandled inbound from the last 48h — qualify, schedule, or defer.',
    'Draft a two-email re-engagement sequence to every contact pitched 90+ days ago with no reply.',
  ],
  // Outbound — full loop: scrape → enrich → draft → send via SES + LinkedIn
  // DMs → trigger sequences. These are end-to-end kickoffs, not drafts.
  'outbound': [
    'Run the full outbound loop against the 20 top lookalikes of {top_customer} — scrape, enrich, draft email + LinkedIn DM, enroll in sequence.',
    'Cold outbound campaign: 30 Series B+ {icp_industry} companies on {icp_stack}. Email + LinkedIn, one touch each, staged.',
    'Rebuild the outbound sequence for the {icp_industry} segment using us/brand/voice.md as the style reference.',
    'Re-engage every contact whose last sequence ended no-reply: pick top 10 by icp_score and launch a tailored 2-touch.',
    'Launch outbound to every account that visited /pricing on {domain} in the last 14 days but never booked a demo.',
    'Run the full outbound loop on the 15 best closed-lost revival candidates, anchored to each deal\'s original loss reason.',
  ],
  // AE / Deal Manager — reads deals/, flags stalls, edits frontmatter
  // (next_step, health), appends notes. Starters mutate deals/ in place.
  'ae': [
    'Monday deal review: walk every file in deals/open/ and update next_step + health (green/yellow/red) with a one-line rationale.',
    'Flag every deal in deals/open/ where last_activity_at is 10+ days ago — propose a recovery step per deal and write it to next_step.',
    'Stale-deal triage: top 5 at-risk deals by ARR — append a "Triage <date>" note with the concrete nudge.',
    'Every open deal missing a next_step: fill it in based on stage + prior notes. Edit frontmatter in place.',
    'Re-score deals/open/ end-to-end — update health, write a 5-bullet summary of what moved red→yellow or yellow→green.',
    'Draft champion-check-in notes for every deal whose champion has gone quiet 7+ days.',
  ],
  // Company Profiler — runs ONCE per project to populate the us/ tree.
  // Bootstrap / refresh / fill-missing framing.
  'company-profiler': [
    'Bootstrap the us/ tree from {domain} — identity, ICP, positioning, competitors, product, brand voice, customers.',
    'Re-run bootstrap-self: refresh us/market/competitors.md + us/customers/top.md with the last 60 days of signals.',
    'Rebuild us/brand/voice.md from our last 10 blog posts and 20 LinkedIn posts from {public_voice}.',
    'Audit every file in us/ — list the ones still holding the seed template or last-edited >90 days ago.',
    'Update us/market/icp.md with the last 30 days of deal-outcome evidence from deals/closed-won/ and deals/closed-lost/.',
    'Profile {competitor_a} as if it were a prospect — write companies/{competitor_a}.md with firmographics + positioning + gaps.',
  ],
  // Website Visitor — one deanonymized visit → enrich → qualify → draft.
  // All starters anchor on signals/visits/ artifacts.
  'website-visitor': [
    'Process every visit in signals/visits/ from the last 7 days: enrich, score against us/market/icp.md, draft where score>70.',
    'Top 10 /pricing visitors on {domain} last 14 days — enrich, qualify, route to outbound with a tailored draft each.',
    'De-anon visits from Series B+ {icp_industry} companies only — draft outreach for anyone above 60 icp_score.',
    'Run the full visit-loop end-to-end on the newest batch in signals/visits/ — enrich → score → draft → enroll.',
    'Which target accounts read our {product_a} blog posts in the last 14 days? Draft warm outreach for each.',
    'Quality check: drop visitors we already have in contacts/ whose last_touched_at is <14 days — no double-tap.',
  ],
  // LinkedIn Outreach — li-campaign-loop: signals/linkedin/<date>.md →
  // top 5 → enrich → connect+DM drafts → enroll in sequence.
  'linkedin-outreach': [
    'Run the LinkedIn campaign loop on today\'s signals/linkedin/<today>.md — pick top 5, enrich, draft connect+DM, enroll.',
    "Engage with {public_voice}'s last post: pull everyone who liked or commented, filter to ICP, draft a warm DM per person.",
    'LinkedIn campaign against Heads of Platform at {icp_industry} Series B+ — 10 contacts, full loop, enroll in sequences/linkedin-post-signal.md.',
    'Scan signals/linkedin/ from the last 7 days — rank the top 10 prospects by engagement intent and draft follow-up DMs.',
    'Draft re-engagement DMs to LinkedIn connections who went quiet 30+ days ago — 5 contacts, tailored to each\'s last post.',
    'Enroll every new connection from this week into sequences/linkedin-post-signal.md with a personalized opener.',
  ],
  // Meeting Prep — writes drafts/<ts>-prep-<company>.md, ≤1 page, no
  // fabrication. Starters should say "brief for X call" concretely.
  'meeting-prep': [
    'Brief for my next meeting on the calendar — attendees, their recent public signals, 3 open questions.',
    'Prep the next 3 calendar events: one brief each in drafts/, ranked by priority.',
    'QBR prep for {top_customer} — stakeholder map, champion status, risks, 2 upsell openings.',
    'Pre-call brief for tomorrow\'s call with {top_customer_b} — what changed at them in the last 30 days.',
    'Prep pack for the {icp_industry} prospect on the next demo slot — ICP signals, competitive framing, likely objections.',
    "Brief on everyone I'm meeting this week. Drop the ones where we've already met in the last 30 days.",
  ],
  // Lookalike Discovery — seed account → 20-50 twins with icp_score +
  // a one-liner "why". Always writes companies/<slug>.md.
  'lookalike-discovery': [
    'Seed: the highest-ARR deal in deals/closed-won/. Find 20 twins, write companies/<slug>.md with icp_score + champion guess per hit.',
    'Find 30 lookalikes of {top_customer} — same size, same stack, same stage. Rank by icp_score, stop at 50.',
    'Twins of our 3 top {icp_industry} wins ({top_customer}, {top_customer_b}, {top_customer_c}) — 15 per seed, deduped.',
    'Lookalikes on {icp_stack} that match {top_customer} firmographically — cap at 25, include a likely champion name per account.',
    'Re-run lookalike discovery on every closed-won from the last quarter — cap 50 total across seeds.',
    'Find Series B {icp_industry} companies similar to {top_customer_b} that we have NOT already touched — cross-check contacts/.',
  ],
  // Closed-Lost Revival — scan deals/closed-lost/, match to fresh
  // triggers, draft re-engagement emails. Named trigger in sentence 1.
  'closed-lost-revival': [
    'Scan deals/closed-lost/ — rank by fresh-trigger strength (last 30d), draft revival emails for top 5.',
    'Revive every deal we lost to {competitor_a} in the last 12 months where a new trigger fired. Draft one reopen per deal.',
    'Closed-lost-to-timing in the last year — find 5 deals with new signals and draft a "timing has changed" reopen.',
    'Every closed-lost deal where the champion has since changed jobs — draft a "saw you moved to X" reopen.',
    'Fresh-trigger scan across deals/closed-lost/ — look for funding rounds, exec hires, or product launches in the last 60 days.',
    'Revive the 10 freshest closed-lost deals in {icp_industry} — each draft names the original loss reason AND the new trigger.',
  ],
  // Pipeline Ops — Monday review writing signals/pipeline-health/<date>.md.
  // Four failure modes: stale, no next_step, pushed, sparse.
  'pipeline-ops': [
    'Run the Monday pipeline review — write signals/pipeline-health/<today>.md, flag the four failure modes, one action per deal.',
    'Flag every deal in deals/open/ with no activity 14+ days. Propose ONE recovery per deal — no multiples.',
    'Commit-forecast reality check: which deals in deals/open/ will actually close this quarter? Rank and cite why.',
    'At-risk ARR report — rank deals/open/ by ARR-at-risk and propose one save action each.',
    'Proposal-stage deals without a next_step — surface them and propose next_step for each.',
    'Deals pushed 2+ times — list them and diagnose the root cause per deal (champion-change, budget, technical, competitive).',
  ],
  // GEO Analyst — GEO (Generative Engine Optimization): prompts, brands,
  // SOV reports, gap sources. Invoke the geo_* tools.
  'geo-analyst': [
    'Run the daily GEO scan (geo_run_daily) and write the SOV report for {company} vs {competitor_a} + {competitor_b}.',
    'GEO gaps: which prompts does ChatGPT answer with {competitor_a} instead of us? Propose docs pages to rewrite.',
    '30-day SOV trend for {company} — which tracked prompts are we gaining on, which are we losing? One-line recommendation each.',
    'Add 10 new prompts to track for {category} in {icp_industry} — via geo_add_prompt.',
    'Run geo_gap_sources across all tracked prompts — surface the top 5 sources LLMs cite that we don\'t control.',
    'Weekly GEO report — brand share-of-voice delta, top 5 wins, top 5 losses, one concrete action each.',
  ],
  // Content Studio — creative output: images/videos/copy. Ships, doesn't
  // describe. Starters pick a concrete format + length + channel.
  'content-studio': [
    'Write a 3-tweet thread announcing this week\'s {product_a} release. Hook from us/brand/voice.md; include a 16:9 header image.',
    '30-second Reel promoting {product_a} — vertical 9:16, subtitles baked in, Seedance 2.0. Save to drafts/.',
    'Blog post: how {top_customer} ships on {product_a}. 800 words, brand-voice from us/brand/voice.md, plus a 16:9 hero image.',
    '3 landing-page copy variants for the {icp_industry} segment — different lead-ins, same CTA.',
    '15-second TikTok promo hooked on {icp_pain}. Vertical 9:16, one clear benefit, CTA to {domain}.',
    '3 Instagram hero shots of {product_a}, 4:5, different lighting (golden-hour / studio / overhead), gpt-image-2.',
  ],
  // Brand Monitor — daily scan Reddit + X for brand-name mentions,
  // classify, write signals/brand-monitor/<date>.md, escalate urgents.
  'brand-monitor': [
    'Run today\'s brand-monitor scan — Reddit + X mentions of {company} last 24h, classify, write signals/brand-monitor/<today>.md.',
    'Weekly digest of {company} mentions across Reddit / HN / X — bucketed by sentiment, top 10 quotes.',
    'Classify the most recent 30 mentions of {company}; escalate any urgent bug reports or comparison-to-{competitor_a} threads.',
    'Sentiment delta: {company} vs {competitor_a} over the last 7 days. Which threads moved the needle?',
    'Surface every public complaint about {product_a} from the last 14 days. Tag by severity.',
    'Switching signals: mentions where someone asks "should I leave {competitor_a} for {company}?" Pull and escalate.',
  ],
  // Reply Guy — Reddit + X reply bot. Never posts without a skill-
  // level constraint pass; first reply on Reddit never mentions us.
  'reply-guy': [
    'Scan Reddit + X for mentions of {company} in the last 24h, classify, draft on-brand replies for the top 3.',
    'Find Reddit threads where someone asks "best alternative to {competitor_a}" in the last 7 days — draft replies for the top 3.',
    'X mentions of {company} today — draft a peer-voice reply per mention, queue to drafts/.',
    "Reply-guy loop on r/{icp_stack} and r/SaaS — hunt for {icp_pain}-shaped questions, draft 3 replies that lead with a useful answer.",
    "Scan X for 'migrating from {competitor_a}' in the last 48h, draft warm peer replies.",
    'Competitor-switching scan: Reddit + X where someone says "leaving {competitor_b}" — draft one helpful reply per thread, no pitch.',
  ],
  // X Account — runs the company's X presence. Drafts tweets, flags
  // replies, watches competitors, escalates urgent incoming mentions.
  'x-account': [
    'Draft 3 product-builder-voice tweets about this week\'s {product_a} release. Target: 1–2 original tweets/day.',
    'Scan today\'s X mentions of {company} — draft replies to the interesting ones, flag anything urgent.',
    'Write one thread this week pulled from us/product/features.md — 5–7 tweets, no fluff, one screenshot slot.',
    'Reply-guy drafts for every post in our X engagement list today — 3–5 engagements, product-builder voice.',
    'Competitor watch on X: what are {competitor_a} and {competitor_b} tweeting this week worth a quote-tweet or counter?',
    'Weekly X recap: engagement on our last 7 days of posts, top-3 winners, bottom-3, one-line lesson each.',
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
