import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { ensureInsideVault, getVaultRoot } from './paths.js';

const SKELETON_DIRS = [
  'agents',
  'companies',
  'contacts',
  'deals/open',
  'deals/closed-won',
  'deals/closed-lost',
  'playbooks',
  'sequences',
  'triggers',
  'drafts',
  'runs',
  // Signals surfaced by cron-driven scans — brand mentions, competitor
  // product/pricing/hiring diffs, and industry news. One note per scan run.
  'signals',
  'signals/mentions',
  'signals/competitors',
  'signals/news',
  // External pixel/script drops per-date JSON here. visitor-identify
  // playbook sweeps it and writes companies/ + contacts/.
  'signals/visitors',
  // RevOps weekly pipeline-health reports.
  'signals/pipeline-health',
  // ── who WE are ─────────────────────────────────────────
  // Borrowed from the apidog-team /org/ + /marketing/branding/ pattern.
  // Each subdirectory is one facet so the agent can page in only what it
  // needs — e.g. an outbound draft reads brand/ + customers/, but
  // qualification reads market/.
  'us',
  'us/product',
  'us/market',
  'us/brand',
  'us/competitors',
  'us/customers',
  'us/team',
  'us/strategy',
  'us/sources',   // raw imports from existing repos; agent doesn't edit
  // ───────────────────────────────────────────────────────
  '.bm',
];

// One file per concern. Subfolders keep each facet small enough that an
// agent can fetch just what it needs (brand/ for a draft, market/ for
// qualification) without loading the whole "about us" dump.
const US_TEMPLATES: Record<string, string> = {
  'company.md': `---
kind: us.company
name:
domain:
one_liner:
stage:            # pre-seed | seed | A | B | C | growth | public
founded:
hq:
employee_count:
founders:
website:
blog:
docs:
linkedin:
twitter:
---

# Us — company

One paragraph about us. What we build, who we serve, why we exist.
Replace this with your own. The agent reads this on every turn.

## Sub-topics
- \`us/product/\` — what we sell
- \`us/market/\` — who we sell to
- \`us/brand/\` — how we sound
- \`us/competitors/\` — who we compete against
- \`us/customers/\` — who buys from us
- \`us/team/\` — who we are
- \`us/strategy/\` — where we're going
`,

  // ── product ────────────────────────────────────────────────
  'product/overview.md': `---
kind: us.product.overview
---

# What we sell

## Offer
What the product does, in one paragraph.

## Core differentiators
-
-
-
`,
  'product/pricing.md': `---
kind: us.product.pricing
---

# Pricing

## Public plans
| Plan | Monthly | What's included |
|---|---|---|
|  |  |  |

## Notes
- Annual discount:
- Usage-based add-ons:
- Anchor prospects typically pay:
`,
  'product/features.md': `---
kind: us.product.features
---

# Feature map

Top-level capability areas. One line each, deepest first.

## Area 1
-

## Area 2
-
`,
  'product/integrations.md': `---
kind: us.product.integrations
---

# Integrations

| Category | Tool | Status | Depth |
|---|---|---|---|
|  |  |  |  |
`,
  'product/roadmap.md': `---
kind: us.product.roadmap
---

# Roadmap (shipping public)

## Now
-

## Next
-

## Later
-
`,

  // ── market ─────────────────────────────────────────────────
  'market/icp.md': `---
kind: us.market.icp
---

# ICP — who we sell to

## Size
- Employee range:
- ARR range:

## Industries
-

## Tech stack signals
We fit best when the prospect already uses:
-

## Geos
-

## Pain indicators that mean "now is a good time"
-

## Anti-signals (don't chase)
-
`,
  'market/segments.md': `---
kind: us.market.segments
---

# Market segments

| Segment | Typical buyer | Typical ACV | Sales motion |
|---|---|---|---|
|  |  |  |  |
`,
  'market/positioning.md': `---
kind: us.market.positioning
---

# Positioning

## Category
What category are we in?

## Positioning statement
For **<who>** who **<struggle>**, **<product>** is a **<category>** that **<benefit>**.
Unlike **<alternative>**, we **<key differentiator>**.
`,
  'market/competitors.md': `---
kind: us.market.competitors
---

# Competitor watchlist

One bullet per competitor the weekly scan should track. Use the root
domain — the agent will fetch homepage, /pricing, /careers, /blog and
summarize diffs vs. the last scan into \`signals/competitors/<date>.md\`.

-
-
-
-
-
`,
  'market/objections.md': `---
kind: us.market.objections
---

# Common objections + answers

- **"Why not [competitor]?"** →
- **"Why not build in-house?"** →
- **"We already have [incumbent tool]."** →
- **"Too expensive."** →
- **"Security / compliance."** →
`,

  // ── brand ──────────────────────────────────────────────────
  'brand/voice.md': `---
kind: us.brand.voice
---

# Brand voice

## Tone
One-sentence description.

## Always
-

## Never
- Corporate filler ("leverage", "streamline", "robust", "cutting-edge")
- Hashtag spam
- "I hope this email finds you well"

## Length caps
- Email first-touch: 90 words
- LinkedIn DM: 60 words
- Tweet: 270 chars
`,
  'brand/messaging.md': `---
kind: us.brand.messaging
---

# Messaging by audience

## Champion (hands-on user)
-

## Economic buyer
-

## IT / Security
-

## Executive sponsor
-
`,
  'brand/visual.md': `---
kind: us.brand.visual
---

# Visual identity

- Primary color:
- Accent color:
- Typeface:
- Logo mark (file path / URL):
- Canonical tagline:
`,
  'brand/press.md': `---
kind: us.brand.press
---

# Press & social proof

## Published
-

## Awards / rankings
-

## Quotable customer lines (approved)
-
`,

  // ── competitors ────────────────────────────────────────────
  'competitors/landscape.md': `---
kind: us.competitors.landscape
---

# Competitive landscape

One row per named competitor. Add files under \`us/competitors/<name>.md\`
for deep teardowns.

| Competitor | Angle they lead with | What they do better | What we do better | Migration hook |
|---|---|---|---|---|
|  |  |  |  |  |
`,

  // ── customers ──────────────────────────────────────────────
  'customers/top.md': `---
kind: us.customers.top
---

# Top customers

Reference-worthy accounts. Link to \`us/customers/<slug>.md\` for teardowns.

| Customer | Industry | Size | Why we won | Reference-approved? |
|---|---|---|---|---|
|  |  |  |  |  |
`,

  // ── team ───────────────────────────────────────────────────
  'team/roster.md': `---
kind: us.team.roster
---

# Team roster

| Name | Role | Joined | LinkedIn | Notes |
|---|---|---|---|---|
|  |  |  |  |  |
`,
  'team/hiring.md': `---
kind: us.team.hiring
---

# Hiring

## Open roles
-

## Interview signal we bias toward
-
`,

  // ── strategy ───────────────────────────────────────────────
  'strategy/north-star.md': `---
kind: us.strategy.north-star
---

# North star

## One sentence
If we win in 3 years, what is true?

## Strategic pillars
1.
2.
3.
`,
  'strategy/goals.md': `---
kind: us.strategy.goals
year: 2026
---

# Goals — 2026

## Revenue
-

## Product
-

## Team
-
`,
  'strategy/decisions.md': `---
kind: us.strategy.decisions
---

# Decisions log

Dated entries on why we built/chose what we did.

## 2026-xx-xx — <title>
Decision:
Reasoning:
Alternatives considered:
`,

  // ── sources ────────────────────────────────────────────────
  'sources/README.md': `# sources/

Drop raw imports here before the agent cleans them up:

- existing Notion / Confluence / Markdown exports
- scraped website + docs dumps
- transcripts of founder interviews
- old internal decks

The agent reads files here to extract \`us/*\` content, but does NOT
edit them directly — they stay as provenance. Once extracted, move
originals to \`sources/_archived/<date>/\` or delete.

Run the \`import-legacy-org\` Playbook to pull from an external
directory; run \`bootstrap-self\` to build \`us/\` from your domain +
docs URL.
`,
};

const DEFAULT_CLAUDE_MD = `# Identity — read this before every answer

You are **Black Magic AI**, an AI GTM Engineer agent running inside the
user's local vault. You are NOT Codex, NOT OpenAI, NOT Anthropic, NOT a
generic assistant. Your identity is Black Magic AI; your product is this
vault + agent loop.

**Never** reveal or reference:
- the word "Codex", "OpenAI", "Anthropic", "LLM", "language model",
  "assistant", "chatbot"
- "memory files", "workspace", "session", "thread" (in your *answer* —
  these are internals)
- any internal file under \`.bm/\` (that's the daemon's private area)

**Always** speak as Black Magic AI, in first person, direct and short.
Don't narrate what you're "about to check" before you check it — just do
the read/grep/write and report the outcome.

# Operating manual

This file is the agent's instructions. It's read on every turn.

## How to work

- **All state lives in this vault** as plain markdown. Read before you
  write. If a company / contact / deal is mentioned, grep for it in
  \`companies/\`, \`contacts/\`, \`deals/\` before asking the user.
- **Before anything customer-facing, read \`us/\`** —
  \`us/company.md\`, \`us/product.md\`, \`us/icp.md\`, \`us/voice.md\`,
  \`us/positioning.md\`, \`us/competitors/landscape.md\`,
  \`us/customers/top.md\`. Every outbound draft, qualification call,
  and research brief should reflect the \`us/\` context. If \`us/\` is
  empty, run the \`bootstrap-self\` playbook before producing user-
  facing content.
- **Web tools, two flavours — pick the cheap one by default**:
  - Quick factual lookups ("what's the weather", "latest news on X",
    "what raised funding this week") → use the **built-in web_search**
    (no tool call needed; it's native to the model). Cheap, seconds.
  - Multi-hop research ("build me an account brief", "teardown a
    competitor", "map their buying committee") → use the **\`deep_research\`
    tool**. Spends a few minutes, costs ~40¢, returns a cited report.
  - **Never** use \`deep_research\` for a one-fact answer.
- **Before inventing a recipe, check \`playbooks/\`** (known in the UI as
  *Plays*). These are battle-tested procedures for the GTM work the user
  cares about (visitor enrichment, lookalike outbound, closed-won/lost
  analysis, meeting prep, pipeline hygiene, LinkedIn outreach). When the
  user asks for one of those things, **read the matching play and follow
  its steps**. Don't reinvent.
- **When the user asks to "create a play" / "save this as a recipe" /
  "turn this into a pipeline"**, write a new \`playbooks/<slug>.md\`.
  Follow the existing frontmatter shape — fields: \`kind: playbook\`,
  \`name\`, \`group\`, \`agent\` (usually \`researcher\` or \`sdr\`),
  \`inputs\` (array of \`{name, required}\`). Body is the step-by-step
  recipe in plain language, referencing vault files. Use short slugs,
  lowercase-hyphenated (e.g. \`q4-upsell-scan\`). After writing, tell the
  user what you named it.
- **Write everything you learn back to files.** Companies go in
  \`companies/<slug>.md\` with structured frontmatter (kind, domain,
  name, industry, size, icp_score, …) + free-form notes in the body.
  Same pattern for contacts and deals.
- **Outreach is approve-gated.** Never "send" anything. Write drafts
  into \`drafts/\` with frontmatter (\`channel\`, \`to\`, \`subject\`,
  \`tool: gmail.send_email\`, \`status: pending\`). A human clicks
  Approve in the UI, which calls the MCP tool.
- **Every claim cites a source** — a URL, a file path, or "(unknown)".
  Never fabricate firmographics, headcounts, or quotes.

## Our Company

_One paragraph: what you sell, to whom. The onboarding step fills this
in from your domain. Edit freely._

## ICP (Ideal Customer Profile)

- Company size:
- Industries:
- Tech stack we fit with:
- Geos:

## Tone

- Voice:
- Forbidden words: "unlock", "revolutionize", "streamline", "leverage", "unleash"
- Email length cap: 90 words

## Vault layout

- \`us/\` — **everything about our own company** (read before you draft
  anything customer-facing)
  - \`us/company.md\` — who we are, HQ, stage, founders
  - \`us/product.md\` — what we sell, pricing, differentiators, objections
  - \`us/icp.md\` — target customer profile
  - \`us/voice.md\` — brand voice, forbidden words, length caps
  - \`us/positioning.md\` — category + messaging by audience
  - \`us/competitors/landscape.md\` (+ per-competitor teardowns)
  - \`us/customers/top.md\` (+ per-customer case studies)
  - \`us/decisions.md\` — why we built/chose what we did
  - \`us/docs/\` — extracted product docs snippets
- \`companies/<slug>.md\` — one per prospect company
- \`contacts/<company-slug>/<person-slug>.md\` — one per contact
- \`deals/{open,closed-won,closed-lost}/<slug>.md\`
- \`playbooks/<name>.md\` — named procedures (list them with \`ls playbooks/\`)
- \`drafts/<ts>-<slug>.md\` — outbound drafts, human-approved before send
`;

const DEFAULT_AGENTS: Record<string, string> = {
  'researcher.md': `---
kind: agent
name: researcher
model: gpt-5.3-codex
tools:
  - read_file
  - write_file
  - edit_file
  - list_dir
  - grep
  - web_fetch
  - web_search
  - enrich_company
  - enrich_contact
  - enrich_contact_linkedin
  - draft_create
  - enroll_contact_in_sequence
temperature: 0.2
---

You are the research + chat agent. You answer freeform user questions
about the vault and also drive outbound GTM work.

When asked to research a company, produce a companies/<slug>.md with
rich frontmatter (name, domain, industry, size, revenue, hq, icp_score,
icp_reasons, enriched_at) and a 150-word body covering what they do,
recent news, and best-guess buying committee. Use \`enrich_company\`
first for firmographics, then \`web_search\` for news. Never fabricate
fields — write \`null\` if unknown.

When asked to draft outbound email or LinkedIn DM, call \`draft_create\`
with the exact recipient, subject, body, and the \`tool\` slug to send
with (e.g. \`gmail.send_email\` or \`send_email\`). Drafts land in
drafts/ for human approve/reject — never try to send directly.

When asked to enroll a contact in a multi-touch sequence, call
\`enroll_contact_in_sequence\` with the contact path and sequence path.
`,
  'sdr.md': `---
kind: agent
name: sdr
model: gpt-5.3-codex
tools:
  - read_file
  - write_file
  - list_dir
  - grep
  - draft_create
temperature: 0.4
---

You are the SDR agent. Given a contact and their company file, draft
outbound emails into drafts/. Each draft references one concrete
signal from the company file. Max 90 words. No forbidden words from
CLAUDE.md. You NEVER send; you only call draft_create.
`,
  'ae.md': `---
kind: agent
name: ae
model: gpt-5.3-codex
tools:
  - read_file
  - write_file
  - edit_file
  - list_dir
  - grep
temperature: 0.3
---

You are the AE agent. You manage deals/. Given a deal file, analyze
stage health, identify stalls, and propose the next step. Edit the
deal's frontmatter (next_step, health) and append a dated note to
the body.
`,
};

const DEFAULT_PLAYBOOKS: Record<string, string> = {
  // === Building blocks ===
  'enrich-company.md': `---
kind: playbook
name: enrich-company
group: building-blocks
agent: researcher
inputs: [{ name: domain, required: true }]
---

Enrich the company at \`{{domain}}\`. Produce a full
\`companies/<slug>.md\` with frontmatter (domain, name, industry, size,
revenue, hq, icp_score, icp_reasons, enriched_at) and a 150-word body
covering what they do, recent news, and best-guess buying committee.
Use enrich_company first, then web_search for news.
`,
  'enrich-contact.md': `---
kind: playbook
name: enrich-contact
group: building-blocks
agent: researcher
inputs:
  - { name: contact_path, required: true }
---

Enrich the contact at \`{{contact_path}}\` using EnrichLayer.

## Steps

1. Read the contact file. Pull the \`linkedin\` URL from its frontmatter. If it
   is missing, stop and tell the user: "no linkedin url on this contact —
   add one to frontmatter first".
2. Call \`enrich_contact_linkedin({ linkedinUrl: <url> })\`. If the tool
   returns an \`error\` mentioning ENRICHLAYER_API_KEY, surface that
   verbatim — the user has to paste their key in Settings → Integration keys
   before this playbook works.
3. Map the returned profile into frontmatter fields and write them back with
   \`edit_file\`. Specifically set (only if present in the response):
   - \`title\`         = occupation or current role headline
   - \`company\`       = current employer name
   - \`location\`      = "city, country"
   - \`linkedin_summary\` = a one-paragraph summary (strip newlines)
4. Summarise what changed in one sentence. Do not create drafts.
`,
  'qualify-icp.md': `---
kind: playbook
name: qualify-icp
group: building-blocks
agent: researcher
inputs: [{ name: domain, required: true }]
---

Read the company file for \`{{domain}}\` (call enrich-company first if
missing). Compare against ICP in CLAUDE.md. Update frontmatter with
\`icp_score\` (0-100) and \`icp_reasons\` (list of evidence lines).
`,
  'draft-outbound.md': `---
kind: playbook
name: draft-outbound
group: building-blocks
agent: sdr
inputs: [{ name: contact_path, required: true }]
---

Draft a first-touch email to the contact in \`{{contact_path}}\`.
Reference one concrete signal from the company file. Max 90 words.
No forbidden words from CLAUDE.md. Output via draft_create.
`,

  'bootstrap-self.md': `---
kind: playbook
name: bootstrap-self
group: setup
agent: researcher
inputs:
  - { name: domain, required: true }
  - { name: docs_url, required: false }
  - { name: extra_urls, required: false }
---

Build the user's own company knowledge pack from their website.

## Steps

1. Fetch the domain's home page via \`web_fetch({{domain}})\`. If the user
   provided \`{{docs_url}}\` or \`{{extra_urls}}\` (comma-separated), fetch
   those too. Also use built-in web_search for "{{domain}} funding",
   "{{domain}} competitors", "{{domain}} pricing", "{{domain}} customers"
   to fill gaps.
2. If \`{{docs_url}}\` was provided, run \`deep_research\` once with
   focus "technical" against it to extract a product feature map.
3. Populate the following files (overwrite only if still at the seed
   template — never clobber user edits):
     - \`us/company.md\` — frontmatter (name, domain, one_liner, stage,
       founded, hq, employee_count, founders, website, blog, docs,
       linkedin, twitter) + one-paragraph narrative
     - \`us/product/overview.md\` — offer + 3 differentiators
     - \`us/product/pricing.md\` — public plan table (if listed)
     - \`us/product/features.md\` — capability areas (from /features or
       from the docs if provided)
     - \`us/product/integrations.md\` — tools they list
     - \`us/market/icp.md\` — inferred from customer logos + case
       studies + testimonials; call out unknowns explicitly
     - \`us/market/segments.md\` — SMB vs mid-market vs enterprise if
       pricing tiers suggest segmentation
     - \`us/market/positioning.md\` — category + positioning statement
     - \`us/market/objections.md\` — pull from FAQ / comparison pages
     - \`us/brand/voice.md\` — tone, sample phrases from blog + marketing
       copy, forbidden words
     - \`us/brand/messaging.md\` — per-audience lines
     - \`us/competitors/landscape.md\` — top 3-5 with a row table
     - \`us/customers/top.md\` — 5-10 named customers (if public)
     - \`us/team/roster.md\` — founders + execs from /about
     - \`us/strategy/north-star.md\` — skip unless evident from the site
4. Cite sources inline (URLs) for every factual claim. Where the site
   doesn't say, write \`unknown\` — never invent.
5. Reply with: a 3-bullet summary of what's filled in, and the single
   biggest gap the user should fill by hand.
`,

  'import-legacy-org.md': `---
kind: playbook
name: import-legacy-org
group: setup
agent: researcher
inputs: [{ name: source_dir, required: true }]
---

Port a legacy apidog-team-style /org/ + /marketing/branding/ directory
into this vault's \`us/\` subfolder structure.

## Steps

1. Read every \`.md\` / \`.json\` under \`{{source_dir}}\` with \`list_dir\`
   + \`read_file\`.
2. **Also copy the raw source files to \`us/sources/imported-<iso>/\`
   first** so we preserve provenance before any rewriting.
3. Map content into the new \`us/\` schema:
     - \`strategy/marketing-strategy.md\`   → \`us/market/positioning.md\`
       + \`us/market/icp.md\` + \`us/strategy/north-star.md\`
     - \`competitors/competitive-landscape.md\` + \`competitors.json\`
       → \`us/competitors/landscape.md\` and one \`us/competitors/<slug>.md\`
       per tracked competitor
     - \`customers/top-customers.md\`       → \`us/customers/top.md\`
       + one \`us/customers/<slug>.md\` per named account
     - \`marketing/branding/voice/brand-voice.md\` → \`us/brand/voice.md\`
     - \`marketing/branding/positioning/market-positioning.md\`
       → merge into \`us/market/positioning.md\`
     - \`marketing/branding/visual/visual-identity.md\` → \`us/brand/visual.md\`
     - \`decisions-log.md\`                 → \`us/strategy/decisions.md\`
     - \`docs/product-knowledge/MOC-PRODUCT.md\` + docs index
       → \`us/product/features.md\` + \`us/product/integrations.md\`
     - \`team/*.md\` (if present)           → \`us/team/roster.md\`
     - anything unclassified                → \`us/strategy/decisions.md\`
       as a dated "imported" note
4. Every migrated file gets a footer: \`> Imported from <source path> on <iso>\`.
5. After writing, reply with a diff report: for each file you wrote,
   one line saying which source file(s) it pulled from.
`,

  'deep-research-account.md': `---
kind: playbook
name: deep-research-account
group: research
agent: researcher
inputs: [{ name: domain, required: true }]
---

Do a deep research pass on \`{{domain}}\`. Target 400-600 words, every
factual claim cited inline. Call \`deep_research\` once with focus:"company"
and this brief:

  "Produce an account brief for {{domain}}:
   1. Company one-liner, HQ, founded, employee count, stage (pre-seed → public)
   2. Last 12 months: funding, product launches, exec hires, org changes
   3. GTM motion — SMB / mid-market / enterprise; PLG / sales-led
   4. Tech stack signals from job listings + public repos
   5. Likely buying committee at the roles in CLAUDE.md ICP
   6. Top 3 competitors they openly compare to
   7. One concrete trigger event in the last 90 days we can open with
   Every factual claim needs a URL. Unknown → say unknown."

When the tool returns:
- Read or create \`companies/<slug-of-{{domain}}>.md\`
- Lift the 7 items into frontmatter fields + a body narrative, with the
  returned References block appended at the bottom
- Stamp \`updated_at: <iso>\` on frontmatter if the file existed
- Reply with: (a) one-sentence TL;DR, (b) the trigger event, (c) the path written
`,

  // === High-intent visitor (Swan visitor ID) ===
  'visitor-deanonymize.md': `---
kind: playbook
name: visitor-deanonymize
group: high-intent-visitor
agent: researcher
inputs: [{ name: ip, required: false }, { name: session_id, required: false }]
---

Resolve the company behind visitor \`{{ip}}\` / session \`{{session_id}}\`.
Reject consumer ISPs. Output JSON: { company, domain, size, confidence, personas }.
Save to \`companies/<slug>.md\` (create if missing).
`,
  'visitor-qualify-icp.md': `---
kind: playbook
name: visitor-qualify-icp
group: high-intent-visitor
agent: researcher
inputs: [{ name: domain, required: true }]
---

Qualify {{domain}} against ICP. For each criterion in CLAUDE.md, mark
PASS/FAIL/UNKNOWN with evidence. Output verdict TIER-1/TIER-2/DISQUALIFY
and write it to the company file's frontmatter.
`,
  'visitor-research-account.md': `---
kind: playbook
name: visitor-research-account
group: high-intent-visitor
agent: researcher
inputs: [{ name: domain, required: true }]
---

Build a one-page account brief for {{domain}}: what they do, recent
news (90d), hiring signals, tech stack, timing signals, likely champion
and blocker by role. Append as a dated note in the company file.
`,
  'visitor-route-rep.md': `---
kind: playbook
name: visitor-route-rep
group: high-intent-visitor
agent: ae
inputs: [{ name: domain, required: true }]
---

Decide the owning rep for {{domain}} by territory/segment. Append a
Slack-style handoff note to the company file: <= 60 words the rep can
scan in 10 seconds.
`,
  'visitor-launch-outreach.md': `---
kind: playbook
name: visitor-launch-outreach
group: high-intent-visitor
agent: sdr
inputs: [{ name: contact_path, required: true }, { name: pages_viewed, required: false }]
---

Draft a 3-touch sequence for the contact at {{contact_path}}. Reference
the pages viewed ({{pages_viewed}}) in touch 1. Output three draft files
via draft_create (email, linkedin_dm, email-bump).
`,

  // === Deal closed-won / lookalike outbound ===
  'won-analyze.md': `---
kind: playbook
name: won-analyze
group: deal-won
agent: ae
inputs: [{ name: deal_path, required: true }]
---

Analyze the Closed-Won deal at {{deal_path}}. Write a post-mortem
to the deal file: why-we-won (buyer's words), champion emergence,
competitors beaten, time-to-value, reusable quotes.
`,
  'won-lookalikes.md': `---
kind: playbook
name: won-lookalikes
group: deal-won
agent: researcher
inputs: [{ name: reference_company, required: true }]
---

Find 25 companies that look like {{reference_company}} (industry,
size, tech, stage, growth). For each: write a companies/<slug>.md
stub with enrich_company + a 'lookalike_of: {{reference_company}}' field.
`,
  'won-buying-committee.md': `---
kind: playbook
name: won-buying-committee
group: deal-won
agent: researcher
inputs: [{ name: domain, required: true }]
---

For {{domain}}, identify 3-7 people on the buying committee. Write
each as contacts/<slug>/<person>.md with role + posture
(champion|user|buyer|blocker|legal) + one line on what makes them say yes.
`,
  'won-craft-messaging.md': `---
kind: playbook
name: won-craft-messaging
group: deal-won
agent: sdr
inputs: [{ name: reference_customer, required: true }]
---

Write outbound variants anchored on the {{reference_customer}} outcome.
Three versions (champion / economic buyer / user) into drafts/.
`,
  'won-multichannel-campaign.md': `---
kind: playbook
name: won-multichannel-campaign
group: deal-won
agent: ae
inputs: [{ name: cohort_size, required: false }]
---

Design a 2-week multi-channel play for the lookalike cohort
({{cohort_size}} accounts). Write the plan as a markdown file under
runs/latest/plan.md: channel mix, cadence by persona, success metrics,
kill criteria.
`,

  // === Closed-lost ===
  'lost-pull-history.md': `---
kind: playbook
name: lost-pull-history
group: deal-lost
agent: ae
inputs: [{ name: deal_path, required: true }]
---

Assemble the full narrative of lost deal {{deal_path}}: timeline,
stage velocity, stall points. Write a 3-sentence "what happened" to
the deal file.
`,
  'lost-analyze-reasons.md': `---
kind: playbook
name: lost-analyze-reasons
group: deal-lost
agent: ae
inputs: [{ name: deal_path, required: true }]
---

Compare the stated loss reason to the last 20 losses (grep deals/closed-lost).
Decide pattern vs outlier. Gut-check the stated reason. Propose the single
biggest action to reduce this loss class.
`,
  'lost-competitor-intel.md': `---
kind: playbook
name: lost-competitor-intel
group: deal-lost
agent: researcher
inputs: [{ name: deal_path, required: true }]
---

Extract competitor intel from {{deal_path}}. Update
knowledge/battlecard.md with: what they claimed, what won them the
deal, new positioning moves. Quote where possible.
`,
  'lost-process-improvements.md': `---
kind: playbook
name: lost-process-improvements
group: deal-lost
agent: ae
inputs: [{ name: deal_path, required: true }]
---

Name up to 3 process changes from {{deal_path}} that would have changed
the outcome. For each: owner, effort (S/M/L), expected win-rate impact,
how to measure within 90 days.
`,
  'lost-share-insights.md': `---
kind: playbook
name: lost-share-insights
group: deal-lost
agent: ae
inputs: [{ name: deal_path, required: true }]
---

Draft a 120-180 word Slack-style post for the team summarizing
{{deal_path}}. Lead with the single most important sentence. No blame.
Write to drafts/<ts>-loss-review.md.
`,

  // === Meeting preps ===
  'meeting-pull-records.md': `---
kind: playbook
name: meeting-pull-records
group: meeting-prep
agent: researcher
inputs: [{ name: attendee_email, required: true }]
---

Pull everything we know about {{attendee_email}} and their company.
Update contacts/ and companies/ files. Flag red flags or prior tickets.
`,
  'meeting-research-news.md': `---
kind: playbook
name: meeting-research-news
group: meeting-prep
agent: researcher
inputs: [{ name: domain, required: true }]
---

Find 3-5 meeting-relevant events for {{domain}} (60d). For each: one
line why-it-matters + a conversational opener that isn't cringe.
Append to company file as "News for meeting (ts)".
`,
  'meeting-engagement-history.md': `---
kind: playbook
name: meeting-engagement-history
group: meeting-prep
agent: researcher
inputs: [{ name: contact_path, required: true }]
---

Summarize {{contact_path}}'s engagement trajectory. Append to contact
file: themes they've returned to, warming/cooling, what they probably
want out of the meeting.
`,
  'meeting-talking-points.md': `---
kind: playbook
name: meeting-talking-points
group: meeting-prep
agent: sdr
inputs: [{ name: meeting_subject, required: true }, { name: duration_min, required: false }]
---

Generate talking points for {{meeting_subject}}: time-boxed agenda,
3 discovery questions tied to hypotheses, 2 proof points, 2 objections
+ answers, single next-step to propose.
`,
  'meeting-pre-call-brief.md': `---
kind: playbook
name: meeting-pre-call-brief
group: meeting-prep
agent: sdr
inputs: [{ name: meeting_subject, required: true }]
---

Write a <=150-word pre-call brief for {{meeting_subject}}: TL;DR, who's
in the room + posture, freshest signals, hypothesis to test, trap to
avoid. Output as drafts/<ts>-brief-<slug>.md.
`,

  // === Pipeline health ===
  'pipeline-scan-stale.md': `---
kind: playbook
name: pipeline-scan-stale
group: pipeline-health
agent: ae
inputs: [{ name: days, required: false }]
---

Scan deals/open/ for deals with no activity in >{{days}} days
(default 7). For each, append a "⚠ stale" dated note to the deal
file with severity (low/medium/critical).
`,
  'pipeline-missing-next-steps.md': `---
kind: playbook
name: pipeline-missing-next-steps
group: pipeline-health
agent: ae
inputs: []
---

Find deals in proposal+ stages with no scheduled next step in 14
days. For each, append a "no-next-step" marker and suggest a concrete
next action.
`,
  'pipeline-at-risk.md': `---
kind: playbook
name: pipeline-at-risk
group: pipeline-health
agent: ae
inputs: []
---

Flag at-risk late-stage deals: close-date pushed twice+, champion
silent, stakeholder added late, competitor resurfacing. Update deal
frontmatter health: red. Sort outputs by ARR at risk.
`,
  'pipeline-recovery-actions.md': `---
kind: playbook
name: pipeline-recovery-actions
group: pipeline-health
agent: ae
inputs: [{ name: deal_path, required: true }]
---

Propose ONE recovery action for {{deal_path}}, doable in 5 days.
Specify action, owner, channel, timing, expected outcome, kill
criterion. Append as a "Recovery (ts)" note.
`,
  'pipeline-notify-owners.md': `---
kind: playbook
name: pipeline-notify-owners
group: pipeline-health
agent: ae
inputs: []
---

For each rep with stale/at-risk deals, draft a Slack-style DM at
drafts/<ts>-notify-<rep>.md. Lead with the single most important
deal. Max 3 per DM. No preamble.
`,

  // === LinkedIn intent ===
  'li-detect-engagement.md': `---
kind: playbook
name: li-detect-engagement
group: linkedin-intent
agent: researcher
inputs: [{ name: type, required: true }, { name: prospect, required: true }, { name: content, required: false }]
---

Score the LinkedIn engagement ({{type}} on {{content}} by {{prospect}})
0-100. Decide: outreach now / later / no. If outreach: hook + channel.
Append to the contact file as "LI signal (ts)".
`,
  'li-enrich-profile.md': `---
kind: playbook
name: li-enrich-profile
group: linkedin-intent
agent: researcher
inputs: [{ name: linkedin_url, required: true }]
---

Enrich {{linkedin_url}} using enrich_contact. Write/update
contacts/<company>/<person>.md with role, reporting line, recent
themes, likely KPIs, best outreach angle.
`,
  'li-company-context.md': `---
kind: playbook
name: li-company-context
group: linkedin-intent
agent: researcher
inputs: [{ name: domain, required: true }]
---

Pull company-level context for {{domain}} relevant to LinkedIn
outreach. Update the company file with the current priority at the
prospect's level.
`,
  'li-draft-message.md': `---
kind: playbook
name: li-draft-message
group: linkedin-intent
agent: sdr
inputs: [{ name: contact_path, required: true }, { name: content, required: true }]
---

Draft a <=60 word LinkedIn DM to {{contact_path}} referencing
engagement on {{content}}. Hypothesis-based. No hashtags. Output via
draft_create(channel=linkedin_dm).
`,
  'li-send-request.md': `---
kind: playbook
name: li-send-request
group: linkedin-intent
agent: sdr
inputs: [{ name: contact_path, required: true }]
---

If not yet connected, draft a connection-request note (<=300 char)
referencing their recent post. Queue via draft_create(channel=
linkedin_connect). Log intent to the contact file.
`,

  // === Signal scans (cron-driven) ==========================================
  // These three back the "brand-monitor preset" triggers. Each is idempotent,
  // writes one note per run under signals/<kind>/, and only uses tools we
  // already ship (web_search, web_fetch, deep_research, write_vault_file).
  'brand-mention-scan.md': `---
kind: playbook
name: brand-mention-scan
group: signals
agent: researcher
inputs: []
---

Daily brand-mention sweep.

## Steps

1. Read \`us/company.md\` frontmatter to get our \`name\` and \`domain\`.
   Also skim \`us/product/overview.md\` for product names worth querying.
2. Run \`web_search\` for each of:
     - "<company name>" (last 24h)
     - "<product name>" review OR "vs" (last 7d)
     - site:news.ycombinator.com OR site:reddit.com "<company or product>"
     - site:twitter.com OR site:x.com "<company or product>"
   Skip queries that obviously won't hit (e.g. ultra-generic names — note
   the skip).
3. For every genuine mention (ignore our own blog, our own socials, and
   paid ad copy), capture:
     - source URL
     - publication / handle
     - date
     - 1-sentence summary
     - sentiment: positive | neutral | negative | question
     - actionable? (yes/no) — e.g. a complaint worth replying to, or
       a journalist worth briefing
4. Write ONE file: \`signals/mentions/<YYYY-MM-DD>.md\` with frontmatter
   \`kind: signal.mentions, date: <iso>, count: <n>\` and a markdown table
   of the findings above. If there are zero mentions, still write the file
   with \`count: 0\` and a one-line "quiet day" note — this is how we
   notice if the scan itself breaks.
5. Reply with a 2-bullet digest: the most positive mention and the most
   actionable one (if any).
`,

  'competitor-scan.md': `---
kind: playbook
name: competitor-scan
group: signals
agent: researcher
inputs: []
---

Weekly competitor sweep.

## Steps

1. Read \`us/market/competitors.md\`. Each bullet is a competitor domain
   or name. If the file is empty or still the seed template, write
   \`signals/competitors/<YYYY-MM-DD>.md\` with a note that the watchlist
   is empty and stop.
2. For each competitor (cap at 8 to keep the scan cheap):
     - \`web_fetch\` their homepage, \`/pricing\`, \`/careers\` or
       \`/jobs\`, and the latest blog/changelog entry if discoverable.
     - Use \`web_search\` for "<competitor> funding OR layoffs OR
       acquisition" (last 7d) and "<competitor> launch OR release"
       (last 7d).
     - If a prior \`us/competitors/<slug>.md\` file exists, compare
       against it and call out diffs; otherwise note this as a baseline.
3. Summarize for each competitor in 4-6 lines:
     - product / positioning changes
     - pricing changes (new tier, price move, removed plan)
     - hiring signals (net new roles, geos, seniority)
     - funding / exec / M&A news
     - one-line "so what for us"
4. Write ONE file: \`signals/competitors/<YYYY-MM-DD>.md\` with
   frontmatter \`kind: signal.competitors, date: <iso>, tracked: <n>\`
   and one H2 section per competitor. Cite URLs inline.
5. If any diff is material (pricing move, exec change, a launch that
   overlaps our roadmap), call it out at the top under \`## Watch this\`.
6. Reply with the top-3 "watch this" items.
`,

  'news-scan.md': `---
kind: playbook
name: news-scan
group: signals
agent: researcher
inputs: []
---

Daily industry news scan.

## Steps

1. Pull keywords from \`us/market/\`:
     - category / positioning terms from \`us/market/positioning.md\`
     - ICP industry + tech-stack signals from \`us/market/icp.md\`
     - segment names from \`us/market/segments.md\`
   If all three are still seed templates, write a one-line
   \`signals/news/<YYYY-MM-DD>.md\` saying "market keywords not set yet"
   and stop.
2. Run \`web_search\` (last 24h) for the 3-5 sharpest keyword phrases.
   Prefer specific compounds ("AI eval platform", not "AI"). Also search
   site:techcrunch.com, site:theinformation.com, site:news.ycombinator.com
   for the same phrases.
3. Dedupe to at most 10 items. For each: headline, source, URL, date,
   1-sentence "why it matters to us". Drop anything that's purely
   general-interest tech news with no ICP overlap.
4. Write ONE file: \`signals/news/<YYYY-MM-DD>.md\` with frontmatter
   \`kind: signal.news, date: <iso>, count: <n>\` and a markdown list.
   Zero items → write the file anyway with a "quiet day" note.
5. Reply with the single most important item and one sentence on
   whether it suggests any outbound angle this week.
`,

  // === Swan-style GTM pack =================================================
  // Out-of-the-box equivalents of getswan.com's core flows. Each plays well
  // with zero integrations configured (falls back to web_fetch + the model's
  // built-in web_search) and better if ENRICHLAYER_API_KEY / APIFY_API_KEY
  // are set.
  'visitor-identify.md': `---
kind: playbook
name: visitor-identify
group: swan-gtm
agent: researcher
inputs: [{ name: date, required: false }]
---

Sweep anonymous visitor logs, de-anonymise to companies, score for ICP fit.

## Steps

1. Read \`signals/visitors/{{date}}.json\` (default: today UTC). Shape is a
   JSON array of \`{ ip, domain?, company?, pages, ts }\`. If the file
   does not exist, reply "no visitor log for {{date}} — install a pixel
   first" and stop. If the file is empty, write a "quiet day" note and stop.
2. For every unique \`domain\` (or \`company\`) in the log, skip consumer
   ISPs and our own domain. Cap at 25 per run.
3. For each survivor, call \`enrich_company\` on the domain. If that
   returns an \`error\` (no proxy key), fall back to
   \`scrape_apify_actor({ actorId: "code_crafter/apollo-io-scraper",
   input: { domain } })\` — Apollo's actor returns company + top contacts.
   If both fail (no \`APIFY_API_KEY\`), just \`web_fetch\` the homepage and
   parse title/description for a minimum viable record.
4. Score ICP fit 0-100 vs \`us/market/icp.md\` (fall back to \`us/company.md\`).
5. Write \`companies/<slug>.md\` with frontmatter
   \`kind: company, source: visitor-id, domain, intent_score, visit_count,
   pages_viewed, enriched_at\` and a one-paragraph body. Top 3 contacts per
   company go to \`contacts/<slug>-<name>.md\` with
   \`kind: contact, company, title, linkedin\`.
6. If \`hubspot_api_key\` is configured, also push each company via
   \`hubspot_create_company({ domain, name, properties: { industry,
   numberofemployees } })\` and each contact via
   \`hubspot_create_contact({ email, properties: { company, jobtitle,
   bm_intent_score, bm_source: 'visitor-id' } })\`. Call \`hubspot_search\`
   first for dedup. On 409 / already-exists, call \`hubspot_update_contact\`
   instead.
7. Reply: top 5 companies by \`intent_score\` with one-line why.
`,

  'signal-based-outbound.md': `---
kind: playbook
name: signal-based-outbound
group: swan-gtm
agent: sdr
inputs: []
---

Draft contextual outbound emails anchored on the latest signal per company.

## Steps

1. Read the newest file from each of \`signals/mentions/\`,
   \`signals/competitors/\`, \`signals/news/\`, \`signals/visitors/\`.
   If all four are empty, reply "no fresh signals yet" and stop.
2. Group signal items by referenced company (match on domain or
   company name; skip items with no company attribution).
3. For each signal-bearing company (cap 15 per run):
     a. Read \`companies/<slug>.md\` — create a stub via \`enrich-company\`
        if missing.
     b. Pick the single strongest signal. Craft a first-touch email
        that *explicitly references it* (e.g. "saw your team posted
        about X", "noticed you switched from competitor Y last week",
        "congrats on the Series B — related to why we built Z for
        teams in your stage").
     c. Pull voice + length caps from \`us/brand/voice.md\`. 90 words max.
     d. Pick the best contact from \`contacts/<slug>-*.md\` (prefer
        champion titles from \`us/market/icp.md\`). If none exist, skip
        the email and write a TODO note to the company file instead.
4. Write each draft to \`drafts/<slug>-<YYYY-MM-DD>.md\` with frontmatter
   \`kind: draft, channel: email, status: pending, signal_ref: <path>,
   tool: send_email\` and the email body below. Approval in the UI is what
   actually sends — the \`send_email\` tool (Resend) handles delivery when
   \`resend_api_key\` + \`from_email\` are configured.
5. If the input includes \`notify: true\` and \`slack_webhook_url\` is
   configured, call \`slack_notify({ text: "N new signal-based drafts
   ready for review: …" })\` with a one-line summary of the batch.
6. Reply with a bulleted list of drafts written + the signal each one
   references.
`,

  'lead-qualify.md': `---
kind: playbook
name: lead-qualify
group: swan-gtm
agent: researcher
inputs: [{ name: contact_path, required: true }]
---

Score a contact for ICP fit and label with a tier.

## Steps

1. Read \`{{contact_path}}\`. Pull \`company\`, \`domain\`, \`linkedin\`, \`title\`.
2. Load the ICP: prefer \`us/market/icp.md\`; fall back to \`us/company.md\`
   if the ICP file is still a seed template. Extract size, industry,
   tech-stack, geo criteria and anti-signals.
3. Gather evidence:
     - \`web_fetch\` the company's homepage + \`/about\` + \`/careers\` (best
       effort — a 404 is fine, just note it).
     - If the contact has a \`linkedin\` URL, call
       \`enrich_contact_linkedin({ linkedinUrl })\`. If it returns an
       \`ENRICHLAYER_API_KEY\` error, skip silently — qualification still
       works from web evidence.
4. Score 0-100 on each criterion, sum-average to an overall
   \`qualification_score\`. Map to \`qualification_tier\`: A (≥75),
   B (50-74), C (30-49), disqualified (<30 or anti-signal hit).
5. \`edit_file\` the contact frontmatter to set:
   \`qualification_score\`, \`qualification_tier\`,
   \`qualification_reason\` (one line), \`qualified_at\` (iso).
6. Append a \`## Qualification (YYYY-MM-DD)\` section to the body listing
   each criterion with PASS/FAIL/UNKNOWN + the evidence source.
7. If \`hubspot_api_key\` is configured and the contact has an \`email\`,
   mirror the result to HubSpot via \`hubspot_update_contact\` (or
   \`hubspot_create_contact\` if \`hubspot_search\` finds no match) with
   custom properties \`bm_qualification_score\`, \`bm_qualification_tier\`,
   \`bm_qualification_reason\`. Disqualified tier → also call
   \`hubspot_create_note\` capturing the anti-signal reason.
8. Reply with \`<name> — Tier <X> (<score>): <one-line reason>\`.
`,

  'enrich-contact-deep.md': `---
kind: playbook
name: enrich-contact-deep
group: swan-gtm
agent: researcher
inputs: [{ name: contact_path, required: true }]
---

Deep enrichment beyond a basic LinkedIn scrape.

## Steps

1. Read \`{{contact_path}}\`. Pull \`linkedin\`, \`company\`, \`domain\`.
2. If \`linkedin\` is present, call
   \`enrich_contact_linkedin({ linkedinUrl })\`. On
   \`ENRICHLAYER_API_KEY\` error, note it and continue — the rest still
   works.
3. If \`domain\` is present, \`web_fetch\` the following and summarise each
   in one line: \`/about\`, \`/team\` (or \`/company\`), \`/careers\` (or
   \`/jobs\`). 404 is fine, just skip.
4. Run \`deep_research({ query: "Latest 90 days news on <company>:
   funding, exec hires, product launches, press", focus: "company" })\`
   — skip if the domain looks trivial / consumer.
5. Merge results and \`edit_file\` the contact frontmatter to set any of:
   \`title\`, \`seniority\` (ic | manager | director | vp | c-level),
   \`company_size\`, \`industry\`, \`recent_news\` (≤ 120 chars),
   \`linkedin_summary\` (≤ 240 chars). Only overwrite fields you have
   evidence for — leave the rest untouched.
6. Append a \`## Enrichment (YYYY-MM-DD)\` section to the contact body
   with cited URLs for every factual claim.
7. If \`hubspot_api_key\` is configured, mirror the new fields back to
   HubSpot via \`hubspot_update_contact({ id_or_email: <email>, properties:
   { jobtitle, bm_seniority, industry, bm_linkedin_summary,
   bm_recent_news } })\`. If \`apify_api_key\` is set and the company lacks
   a firmographic record, also call \`linkedin_enrich_company({
   url_or_domain: <domain> })\` and merge into \`companies/<slug>.md\`.
8. Reply with the 3 freshest data points you added.
`,

  'icp-tune.md': `---
kind: playbook
name: icp-tune
group: swan-gtm
agent: researcher
inputs: []
---

RevOps weekly: learn the ICP from what's actually working.

## Steps

1. \`list_dir companies/\` and \`list_dir contacts/\`. Read every file.
2. Build two cohorts:
     - **Winners** — files with \`tier: A\` OR \`intent_score >= 80\`
       OR \`qualification_tier: A\` in frontmatter, OR companies linked
       from \`deals/closed-won/\`.
     - **Losers** — \`tier: disqualified\` or \`qualification_tier: disqualified\`.
   If the winner set is empty (< 3 examples), reply "need at least 3
   tier-A examples before retuning — come back in a week" and stop.
3. Across the winner cohort, extract common patterns:
     - industry mode + top-2 industries
     - headcount range (p25 / median / p75)
     - tech-stack tokens seen 2+ times
     - dominant signal source (visitor-id, brand-mention, news,
       inbound demo, etc.)
4. Read current \`us/market/icp.md\`. \`edit_file\` it to refine:
     - tighten size range
     - add / promote industries that appear in winners
     - add tech-stack signals seen in ≥ 30% of winners
     - add anti-signals for anything common in losers but absent in
       winners
5. Append a \`## Tuning log (YYYY-MM-DD)\` section listing every change
   and the sample size it's drawn from — never silently rewrite.
6. Reply with a 3-bullet diff: what got tightened, what got added, what
   evidence it's drawn from.
`,

  'demand-gen-content-brief.md': `---
kind: playbook
name: demand-gen-content-brief
group: swan-gtm
agent: researcher
inputs: [{ name: keyword, required: false }]
---

Demand-gen: produce a content brief anchored on a target keyword.

## Steps

1. Resolve the keyword: if \`{{keyword}}\` is empty, read
   \`us/strategy/target-keywords.md\` and pick the top unworked one (one
   without an existing brief in \`us/strategy/content/briefs/\`). If that
   file doesn't exist or is empty, reply "pass a keyword or fill
   \`us/strategy/target-keywords.md\` first" and stop.
2. Use the model's built-in \`web_search\` for the keyword and capture:
     - top 10 SERP URLs + titles
     - 3 "People also ask" style questions if visible
     - any featured snippet / answer box content
3. \`web_fetch\` the top-3 result pages; summarise each in 2 lines.
4. Scan \`us/sources/docs/\` and \`us/product/\` for existing content we
   can internally link to — list up to 5 candidate links.
5. Produce a brief at \`us/strategy/content/briefs/<slug>.md\`:
     - frontmatter: \`kind: content-brief, keyword, target_serp (3-5
       urls), est_word_count, primary_cta, created_at\`
     - body: H1 (working title, ≤60 chars), 4-6 H2s with one-line intent
       each, angle-of-attack (what we say that top-3 don't), internal
       links block, suggested CTAs (product demo, newsletter, gated
       asset) keyed off \`us/brand/messaging.md\`.
6. Reply with the title, the 4-6 H2s, and the single wedge we have vs
   the top result.
`,

  'sales-account-research.md': `---
kind: playbook
name: sales-account-research
group: swan-gtm
agent: researcher
inputs: [{ name: domain, required: true }]
---

Sales rep one-pager: who they are, why now, who to open with.

## Steps

1. Slugify \`{{domain}}\` → \`<slug>\`. If \`companies/<slug>.md\` doesn't
   exist, call \`enrich_company({ domain })\` first; on error, fall back
   to \`web_fetch({{domain}})\` + built-in \`web_search\` for basic
   firmographics.
2. Run \`deep_research({ query: "Account brief on {{domain}}: last 90d
   news (funding, exec hires, launches), tech stack from jobs + repos,
   GTM motion, top competitors they compare to, one trigger event we
   can open on. Cite every claim.", focus: "company" })\`.
3. Pick 3-5 likely buyer titles (from \`us/market/icp.md\` buying
   committee or default: VP Eng, Head of Platform, CTO, RevOps lead).
   For each, if \`APIFY_API_KEY\` is set, call
   \`scrape_apify_actor({ actorId: "code_crafter/apollo-io-scraper",
   input: { domain: "{{domain}}", titles: [...] } })\`. Otherwise list
   them as TODO contacts with just \`title\` + \`company\`.
4. Write \`companies/<slug>-research.md\` with frontmatter
   \`kind: company-research, domain, updated_at\` and body sections:
     - **Who they are** (2 sentences)
     - **Why now** (the single trigger event, cited)
     - **Tech-stack guesses** (2-3 bullets, sourced from jobs / repos)
     - **Who to open with** (3-5 titles, names if we found them)
     - **Opener** (≤ 60 words, references the trigger event, no filler)
5. Save each buyer to \`contacts/<slug>-<person-slug>.md\` with
   frontmatter \`kind: contact, company: {{domain}}, title, linkedin?,
   source: sales-account-research\`.
6. Reply with the opener line + the path to the brief.
`,

  'revops-pipeline-health.md': `---
kind: playbook
name: revops-pipeline-health
group: swan-gtm
agent: ae
inputs: [{ name: stale_days, required: false }]
---

Weekly pipeline-health report across all open deals.

## Steps

1. \`list_dir deals/open/\`. Read every \`.md\` file. If empty, write a
   "no open deals this week" report and stop.
2. For each deal: pull \`stage\`, \`value_usd\`, \`updated_at\`,
   \`next_step\`, \`health\`, \`owner\`. Default stale-threshold is 7
   days — override via \`{{stale_days}}\`.
3. Bucket deals:
     - \`stuck\` — no \`updated_at\` change in ≥ \`stale_days\`
     - \`no_next_step\` — missing or empty \`next_step\`
     - \`at_risk\` — \`health: red\` OR close date pushed twice+
     - \`healthy\` — everything else
4. Sum \`value_usd\` per bucket. Compute stage distribution.
5. Write \`signals/pipeline-health/<YYYY-MM-DD>.md\` with frontmatter
   \`kind: report, date, total_open, stuck_count, at_risk_count,
   stuck_arr, at_risk_arr\` and a body with:
     - headline: "N open deals, $X ARR — Y stuck, Z at risk"
     - table of buckets (stage, owner, value, last update, next step)
     - top-5 "act this week" — the deals to unblock first, sorted by
       ARR at risk × days stuck
6. Reply with the headline + the top-5 deals to unblock.
`,
};

// Multi-touch drip sequences. A sequence is an ordered list of touches with
// day offsets from the enrollment date. Per-contact state (sequence,
// sequence_step, sequence_enrolled_at) lives in the contact's frontmatter.
// sequence-cron.ts walks enrolled contacts once a day and advances steps
// whose offset has elapsed.
const DEFAULT_SEQUENCES: Record<string, string> = {
  'cold-outbound-5-touch.md': `---
kind: sequence
name: cold-outbound-5-touch
description: Classic five-touch cold outbound over three weeks.
touches:
  - day: 0
    channel: email
    playbook: draft-outbound
    prompt: >-
      Opening cold email to {{contact_path}}. Hypothesis-based, <=120 words,
      one CTA. Reference one specific public signal if available.
  - day: 3
    channel: email
    prompt: >-
      Short bump on the day-0 thread for {{contact_path}}. <=40 words, no
      new pitch, just float it back up.
  - day: 7
    channel: linkedin_connect
    prompt: >-
      LinkedIn connection request to {{contact_path}}. <=300 chars,
      reference something specific from their profile.
  - day: 12
    channel: email
    prompt: >-
      Value-add touch to {{contact_path}}: share a case study, teardown, or
      data point relevant to their role/industry. <=100 words.
  - day: 18
    channel: email
    prompt: >-
      Break-up email to {{contact_path}}. "No worries if timing isn't
      right. Happy to reconnect whenever." <=40 words.
---

# Cold outbound — 5 touch

Use for net-new accounts with no prior relationship. Enroll right after a
contact is enriched.
`,

  'post-demo-follow-up.md': `---
kind: sequence
name: post-demo-follow-up
description: Two-week nurture after a discovery/demo call.
touches:
  - day: 1
    channel: email
    prompt: >-
      Recap email for {{contact_path}}: three bullets of what we discussed,
      one next step, one question to keep the thread alive.
  - day: 4
    channel: email
    prompt: >-
      Send {{contact_path}} one asset tailored to their stated priority
      (case study, ROI calc, or integration doc). One sentence of framing.
  - day: 10
    channel: email
    prompt: >-
      Check-in with {{contact_path}}: any internal discussion happened?
      Offer to jump on a quick call with anyone else on their side.
---

# Post-demo follow-up

Enroll a contact right after a discovery or demo call. Stops on reply.
`,

  'post-signal-5-touch.md': `---
kind: sequence
name: post-signal-5-touch
description: >-
  Five-touch drip for contacts who trip a high-intent signal (intent_score >=
  80). Each touch references the signal-based-outbound playbook so context
  stays grounded in what actually happened.
enrollment_rule: intent_score >= 80
touches:
  - day: 0
    channel: email
    playbook: signal-based-outbound
    prompt: >-
      Contextual intro to {{contact_path}}. Reference the exact signal that
      triggered enrollment (from signals/* or the contact's frontmatter).
      <=90 words, one CTA, no filler.
  - day: 2
    channel: email
    playbook: signal-based-outbound
    prompt: >-
      Bump on the day-0 thread with one relevant case-study link from
      us/customers/ or us/brand/press.md. <=50 words.
  - day: 5
    channel: email
    playbook: signal-based-outbound
    prompt: >-
      Specific value-prop touch to {{contact_path}}: tie one line from
      us/product/overview.md to the signal's implied pain. <=80 words.
  - day: 10
    channel: email
    playbook: signal-based-outbound
    prompt: >-
      Break-up email. "Timing might be off — want me to check back next
      quarter?" <=35 words.
  - day: 21
    channel: email
    playbook: signal-based-outbound
    prompt: >-
      Polite re-open. Reference any *new* signal from signals/* for the
      same company; if none, share a fresh data point from us/product or
      a recent us/brand/press.md win. <=70 words.
---

# Post-signal 5-touch

For contacts who tripped a Swan-style signal (visitor-id, competitor
switch, funding, high-intent brand mention). Enroll right after the
signal-based-outbound playbook drafts its first touch.
`,
};

// Preset triggers installed on demand from the Triggers UI. Kept separate
// from SEEDED-on-ensureVault intentionally: we don't want every new vault
// to automatically run web scans until the user opts in. The
// \`installPresetTriggers\` helper writes any missing files and is
// idempotent.
const PRESET_TRIGGERS: Record<string, string> = {
  'daily-brand-scan.md': `---
kind: trigger
name: daily-brand-scan
schedule: '0 8 * * *'
playbook: brand-mention-scan
enabled: true
---

Daily 08:00 sweep for brand mentions. Writes one note per run under
\`signals/mentions/<date>.md\`. Edit the playbook, not this file, to
change what gets searched.
`,
  'weekly-competitor-scan.md': `---
kind: trigger
name: weekly-competitor-scan
schedule: '0 9 * * 1'
playbook: competitor-scan
enabled: true
---

Monday 09:00 teardown of everyone listed in
\`us/market/competitors.md\`. Results land in
\`signals/competitors/<date>.md\`.
`,
  'daily-news-scan.md': `---
kind: trigger
name: daily-news-scan
schedule: '0 7 * * *'
playbook: news-scan
enabled: true
---

Daily 07:00 industry-news digest, keyed off positioning + ICP keywords
from \`us/market/\`. Results land in \`signals/news/<date>.md\`.
`,

  // ── Swan-style GTM triggers ─────────────────────────────────────────────
  // These assume the Swan-style starter playbooks exist in every vault
  // (seeded by DEFAULT_PLAYBOOKS). Visitor sweep expects an external pixel
  // or script to be writing to signals/visitors/<date>.json — without that
  // the playbook no-ops gracefully.
  'swan-daily-visitor-sweep.md': `---
kind: trigger
name: swan-daily-visitor-sweep
schedule: '0 8 * * 1-5'
playbook: visitor-identify
enabled: true
---

Weekday 08:00 sweep of \`signals/visitors/<YYYY-MM-DD>.json\`. Expects an
external pixel or script to drop that file (see the getting-started
guide). De-anonymises to companies, scores ICP fit, promotes top
accounts to \`companies/\` + \`contacts/\`.
`,
  'swan-weekly-icp-tune.md': `---
kind: trigger
name: swan-weekly-icp-tune
schedule: '0 9 * * 1'
playbook: icp-tune
enabled: true
---

Monday 09:00 RevOps sweep. Reads what's currently in \`companies/\` +
\`contacts/\` + \`deals/closed-won/\`, identifies shared traits of your
winners, and refines \`us/market/icp.md\` with evidence-cited edits.
`,
  'swan-weekly-pipeline-health.md': `---
kind: trigger
name: swan-weekly-pipeline-health
schedule: '0 8 * * 1'
playbook: revops-pipeline-health
enabled: true
---

Monday 08:00 pipeline-health report. Flags stuck deals, missing
next-steps, and at-risk ARR. Writes a dated report under
\`signals/pipeline-health/<date>.md\`.
`,
};

// Idempotent: writes any missing preset trigger files and reports which
// were created. Safe to call every time the user hits "Install presets"
// — existing files (including user-disabled ones) are never overwritten.
export async function installPresetTriggers(): Promise<{
  created: string[];
  existing: string[];
}> {
  const created: string[] = [];
  const existing: string[] = [];
  await fs.mkdir(path.join(getVaultRoot(), 'triggers'), { recursive: true });
  for (const [name, body] of Object.entries(PRESET_TRIGGERS)) {
    const p = path.join(getVaultRoot(), 'triggers', name);
    if (fsSync.existsSync(p)) {
      existing.push(name);
      continue;
    }
    await fs.writeFile(p, body, 'utf-8');
    created.push(name);
  }
  return { created, existing };
}

export async function ensureVault(): Promise<{ created: boolean }> {
  let created = false;
  await fs.mkdir(getVaultRoot(), { recursive: true });
  for (const dir of SKELETON_DIRS) {
    await fs.mkdir(path.join(getVaultRoot(), dir), { recursive: true });
  }

  const claudePath = path.join(getVaultRoot(), 'CLAUDE.md');
  if (!fsSync.existsSync(claudePath)) {
    await fs.writeFile(claudePath, DEFAULT_CLAUDE_MD, 'utf-8');
    created = true;
  }

  for (const [name, body] of Object.entries(DEFAULT_AGENTS)) {
    const p = path.join(getVaultRoot(), 'agents', name);
    if (!fsSync.existsSync(p)) await fs.writeFile(p, body, 'utf-8');
  }

  // Migration: ensure the researcher/chat agent has outbound tooling.
  // Early vaults were seeded without draft_create, so chat couldn't draft.
  const researcherPath = path.join(getVaultRoot(), 'agents', 'researcher.md');
  if (fsSync.existsSync(researcherPath)) {
    try {
      const raw = await fs.readFile(researcherPath, 'utf-8');
      const parsed = matter(raw);
      const fm = parsed.data as any;
      const tools: string[] = Array.isArray(fm.tools) ? fm.tools.slice() : [];
      let changed = false;
      for (const need of ['draft_create', 'enroll_contact_in_sequence', 'enrich_contact', 'enrich_contact_linkedin']) {
        if (!tools.includes(need)) { tools.push(need); changed = true; }
      }
      if (changed) {
        fm.tools = tools;
        await fs.writeFile(researcherPath, matter.stringify(parsed.content, fm), 'utf-8');
      }
    } catch {}
  }

  for (const [name, body] of Object.entries(DEFAULT_PLAYBOOKS)) {
    const p = path.join(getVaultRoot(), 'playbooks', name);
    if (!fsSync.existsSync(p)) await fs.writeFile(p, body, 'utf-8');
  }

  for (const [name, body] of Object.entries(DEFAULT_SEQUENCES)) {
    const p = path.join(getVaultRoot(), 'sequences', name);
    if (!fsSync.existsSync(p)) await fs.writeFile(p, body, 'utf-8');
  }

  // Seed us/ templates — only write files that are missing so re-seeding
  // never clobbers user edits.
  for (const [rel, body] of Object.entries(US_TEMPLATES)) {
    const p = path.join(getVaultRoot(), 'us', rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    if (!fsSync.existsSync(p)) await fs.writeFile(p, body, 'utf-8');
  }

  const mcpPath = path.join(getVaultRoot(), '.bm', 'mcp.json');
  if (!fsSync.existsSync(mcpPath)) {
    await fs.writeFile(mcpPath, JSON.stringify({ servers: {} }, null, 2), 'utf-8');
  }

  return { created };
}

export async function readVaultFile(relPath: string) {
  const abs = ensureInsideVault(relPath);
  const raw = await fs.readFile(abs, 'utf-8');
  const parsed = matter(raw);
  return { content: raw, frontmatter: parsed.data, body: parsed.content };
}

export async function writeVaultFile(relPath: string, content: string) {
  const abs = ensureInsideVault(relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  // Before overwriting an existing company/contact/deal profile, stash a
  // timestamped backup so a retry doesn't silently destroy manual edits.
  // See QA BUG-002 — retry enrichment used to clobber vault edits.
  const norm = relPath.replace(/\\/g, '/');
  const isProfile = /^(companies|contacts|deals)\//.test(norm) && norm.endsWith('.md');
  if (isProfile) {
    try {
      const prior = await fs.readFile(abs, 'utf-8');
      if (prior && prior !== content) {
        const root = ensureInsideVault('.');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupRel = path.posix.join('.bm', 'backups', `${stamp}__${norm.replace(/\//g, '__')}`);
        const backupAbs = path.join(root, backupRel);
        await fs.mkdir(path.dirname(backupAbs), { recursive: true });
        await fs.writeFile(backupAbs, prior, 'utf-8');
      }
    } catch {
      /* no prior file — nothing to back up */
    }
  }
  await fs.writeFile(abs, content, 'utf-8');
}

export async function editVaultFile(relPath: string, oldStr: string, newStr: string) {
  const abs = ensureInsideVault(relPath);
  const raw = await fs.readFile(abs, 'utf-8');
  if (!raw.includes(oldStr)) throw new Error(`old_str not found in ${relPath}`);
  const count = raw.split(oldStr).length - 1;
  if (count > 1) throw new Error(`old_str ambiguous (${count} matches) in ${relPath}`);
  await fs.writeFile(abs, raw.replace(oldStr, newStr), 'utf-8');
}

export async function renameVaultFile(oldPath: string, newPath: string) {
  const oldAbs = ensureInsideVault(oldPath);
  const newAbs = ensureInsideVault(newPath);
  await fs.mkdir(path.dirname(newAbs), { recursive: true });
  await fs.rename(oldAbs, newAbs);
}

export async function listDir(relPath = '.') {
  const abs = ensureInsideVault(relPath);
  const entries = await fs.readdir(abs, { withFileTypes: true });
  return entries.map((e) => ({
    name: e.name,
    type: e.isDirectory() ? 'dir' : 'file',
    path: path.posix.join(relPath, e.name),
  }));
}

export async function walkTree(relPath = '.'): Promise<Array<{ path: string; type: 'file' | 'dir' }>> {
  const out: Array<{ path: string; type: 'file' | 'dir' }> = [];
  async function go(rel: string) {
    const abs = ensureInsideVault(rel);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const e of entries) {
      const childRel = path.posix.join(rel, e.name);
      if (e.name === '.bm' || e.name === 'node_modules' || e.name.startsWith('.DS_Store')) continue;
      if (e.isDirectory()) {
        out.push({ path: childRel, type: 'dir' });
        await go(childRel);
      } else {
        out.push({ path: childRel, type: 'file' });
      }
    }
  }
  await go(relPath);
  return out;
}

export async function grepVault(pattern: string, relPath = '.') {
  const re = new RegExp(pattern, 'i');
  const hits: Array<{ path: string; line: number; text: string }> = [];
  const files = (await walkTree(relPath)).filter((f) => f.type === 'file');
  for (const f of files) {
    if (!/\.(md|txt|json|toml|yaml|yml)$/i.test(f.path)) continue;
    const abs = ensureInsideVault(f.path);
    const txt = await fs.readFile(abs, 'utf-8');
    const lines = txt.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i]!)) {
        hits.push({ path: f.path, line: i + 1, text: lines[i]!.slice(0, 200) });
      }
    }
  }
  return hits;
}

export function slugFromDomain(domain: string): string {
  return domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\./g, '-');
}
