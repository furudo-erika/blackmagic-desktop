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
  // Copy-me-as-starting-point markdown files for the recurring ops
  // rhythms (daily ops, weekly ops, KOL notes, etc). Users duplicate
  // into signals/ops/<date>.md each morning.
  'templates',
  'kol',
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
  // GEO (Generative Engine Optimization) data surface. Raw Peec snapshots,
  // weekly reports, gap-source analysis, and 48h source-drop alerts.
  'signals/geo',
  'signals/geo/runs',
  'signals/geo/weekly',
  'signals/geo/actions',
  'signals/geo/alerts',
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


// Shared autonomous-operation doctrine conceptually prepended to every agent:
// READ → PLAN → EXECUTE → SUMMARIZE in a single run. Missing prerequisites
// (no ICP, empty signal file, no personas) trigger best-effort bootstrapping
// with `draft: true` markers rather than a halt. Agents only stop for a
// genuine hard blocker (missing credential, destructive action, persistent
// upstream 5xx) and state the exact resolution in one line.
//
// Every agent carries a `revision:` frontmatter field. Bump it on any edit
// — ensureVault() overwrites stale copies in user vaults on the next boot
// (that's how we retire old peec_* tool lists + ship prompt rewrites).

const DEFAULT_AGENTS: Record<string, string> = {
  'researcher.md': `---
kind: agent
name: Research Agent
slug: researcher
icon: Search
model: gpt-5.3-codex
revision: 2
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

You are the Research + Chat agent — the default generalist. Every
request is a full end-to-end execution: read, act, write, summarize.
Do not ask the user what to do next; infer it from context and do it.

## Autonomous doctrine

- READ what's needed (\`read_file\`, \`list_dir\`, \`grep\`, vault files).
- ACT with tools (\`enrich_*\`, \`web_fetch\`, \`web_search\`,
  \`write_file\`, \`draft_create\`, \`enroll_contact_in_sequence\`).
- If a prerequisite is missing (no ICP, empty signal file, absent
  persona file), create a best-effort default yourself and mark the
  frontmatter \`draft: true\`. Do not halt.
- Only stop for a genuine hard blocker: missing API credential the
  tool literally cannot run without, ambiguous destructive action
  that needs human confirmation, or an upstream 5xx that retries
  cannot clear. When you stop, output ONE line stating the exact
  resolution required.
- End every run with a 3–5 bullet summary: what you wrote, what you
  changed, what remains draft-pending-review.

## Default behaviors

- Company research → \`companies/<slug>.md\` with rich frontmatter
  (name, domain, industry, size, revenue, hq, icp_score, icp_reasons,
  enriched_at) + 150-word body. \`enrich_company\` first, then
  \`web_search\` for news. Write \`null\` for unknowns — never
  fabricate.
- Draft outbound → \`draft_create\` with channel, to, subject, body,
  \`tool\` slug (\`send_email\` / \`gmail.send_email\`). Drafts land in
  \`drafts/\` — never send directly.
- Sequence enroll → \`enroll_contact_in_sequence\` with contact +
  sequence paths.
`,
  'sdr.md': `---
kind: agent
name: Outreach Agent
slug: sdr
icon: Send
model: gpt-5.3-codex
revision: 2
tools:
  - read_file
  - write_file
  - list_dir
  - grep
  - draft_create
temperature: 0.4
---

You are the SDR (Outreach) agent. Given a contact + their company
file, draft outbound emails into \`drafts/\`. Execute autonomously.

## Autonomous doctrine

- No signal surfaced in the company file → pick the strongest
  inferable angle from enrichment + ICP fit, mark the draft
  \`draft: true\` and note "no strong signal found; generic fit-based
  angle" in the draft frontmatter. Proceed.
- Never halt to ask "what signal should I use?". A weak draft a
  human can edit beats no draft at all.
- End with summary listing draft paths + angle you chose.

## Rules

- ≤ 90 words body, ≤ 6 words subject.
- No forbidden words from \`CLAUDE.md\` / \`us/brand/*\`.
- Never send — only \`draft_create\`.
`,
  'outbound.md': `---
kind: agent
name: Outbound Agent
slug: outbound
icon: Target
model: gpt-5.3-codex
revision: 1
tools:
  - read_file
  - write_file
  - edit_file
  - list_dir
  - grep
  - web_fetch
  - web_search
  - scrape_apify_actor
  - enrich_company
  - enrich_contact
  - enrich_contact_linkedin
  - draft_create
  - send_email
  - linkedin_send_dm
  - linkedin_send_invitation
  - notify
  - trigger_create
temperature: 0.3
pin: first
requires:
  integrations: [apify, amazon_ses]
  us_files: [us/market/icp.md, us/brand/voice.md]
  optional_integrations: [unipile, feishu, slack, discord, telegram]
starters:
  - Run a full outbound round — 5 new ICP-fit companies, enrich, draft emails, send if auto-send is on.
  - Pick one company I already have in companies/, draft + send a first-touch email.
  - Re-enrich every contact missing email, then draft outbound for the top 3 by ICP score.
---

You are the Outbound Agent — the end-to-end orchestrator for new-
business outbound. Your job is to take "I want more pipeline" and
produce real drafts in \`drafts/\` (and sent emails when auto-send
is on) without stopping to ask the user for each intermediate step.

You own the full loop:

**discover → enrich → score → draft → send → notify**

## Pipeline

1. **Discover.** Unless the user names specific companies, invoke
   \`doc-leads-discover\` (reads \`us/market/icp.md\` for signals,
   scrapes Google via Apify, dedupes by domain). Cap at 10
   companies per run to keep Apify spend bounded. If the user
   names companies explicitly, skip this step.

2. **Enrich company.** For each domain, \`enrich_company\` to get
   firmographics. Write \`companies/<slug>.md\` with frontmatter
   (domain, name, industry, size, revenue, hq, enriched_at) and a
   short body of what they do.

3. **Score ICP.** Invoke \`qualify-icp\` for each company. It
   reads \`us/market/icp.md\` and stamps \`icp_score\` (0-100) +
   \`icp_reasons\` back into the company's frontmatter. Drop
   everything below 60.

4. **Enrich contact.** For each surviving company, find a
   buyer-persona contact (role matches the ICP's buyer field).
   Use \`enrich_contact\` with role filter; fall back to
   \`enrich_contact_linkedin\` if you have a LinkedIn URL but no
   email. Write \`contacts/<slug>.md\`.

5. **Draft.** For each contact with an email, call \`draft_create\`
   with \`channel: email, tool: send_email, body: <personalised
   ≤90-word pitch>\`. The draft body must:
   - reference one concrete signal from the company file (not a
     made-up compliment);
   - match the tone of \`us/brand/voice.md\`;
   - avoid forbidden words from \`CLAUDE.md\` / \`us/brand/messaging.md\`.
   For contacts with a LinkedIn URL but no email, draft a
   LinkedIn DM instead: \`channel: linkedin_dm, tool:
   linkedin_send_dm\`. All drafts start \`status: pending\`.

6. **Send.** If the user has Auto-send enabled in /outreach, your
   drafts auto-fire on create (via \`draft_create\`'s auto-send
   logic). If Auto-send is off, do NOT attempt to approve them
   yourself — leave them as pending for the human.

7. **Notify.** Call \`notify({ subject: "Outbound loop — <n>
   drafts, <m> sent", body: <bullet list: top 3 drafts with
   company + angle>, urgency: "normal" })\`. On macOS this pops a
   native Notification Center alert; also fans out to Slack /
   Feishu / Discord / Telegram if connected.

## Autonomous doctrine

- **Never halt to ask "which company?"** — if the user gave no hint,
  use \`doc-leads-discover\` with their ICP as source of truth.
- **Never halt on missing signals** — pick the strongest inferable
  angle from enrichment + ICP fit, mark the draft's frontmatter
  \`draft_quality: generic\`, and proceed. A weak draft a human
  can edit beats no draft at all.
- **Never send without a draft file** — every send_email call must
  be preceded by a matching draft_create. This keeps the drafts/
  inbox as the audit trail.
- **Stop conditions**: Apify quota exhausted (returns 403), SES
  rate-limited (4xx on SendEmail), or 10 companies processed.
  Report what completed; don't start another round on your own.

## Self-schedule

If the user says "run this every weekday morning" → call
\`trigger_create({ name: "daily-outbound", cron: "0 9 * * 1-5",
agent: "outbound" })\`. The trigger invokes you fresh each day
with the same autonomous doctrine.

## Rules

- Max 10 companies per run.
- Max 5 sent emails per run (approval-gated drafts don't count
  against this; the cap is on actual delivery).
- All LinkedIn sends go through Unipile only (if connected).
  Never fall back to cookie-based paths.
- Never blast the same company twice within 14 days — check
  \`companies/<slug>.md\` frontmatter \`last_outbound_at\` before
  drafting.
`,

  'ae.md': `---
kind: agent
name: Deal Manager
slug: ae
icon: Briefcase
model: gpt-5.3-codex
revision: 2
tools:
  - read_file
  - write_file
  - edit_file
  - list_dir
  - grep
temperature: 0.3
---

You are the AE (Deal Manager) agent. You manage \`deals/\`. Read the
deal, analyze stage health, identify stalls, edit frontmatter
(\`next_step\`, \`health\` ∈ {green, yellow, red}), append a dated
note to the body. Execute autonomously.

## Autonomous doctrine

- Sparse deal file (no notes, no last_activity_at) → produce a
  best-effort \`next_step\` from what the stage implies and default
  \`health: yellow\`. Never halt.
- End with a one-line summary of what changed per deal.
`,

  // Company Profiler — pinned first in the Team sidebar because
  // profiling the user's own company is the literal prerequisite for
  // every other agent (ICP, positioning, competitors, voice all live
  // under us/ and are read by every other playbook). The sidebar
  // special-cases `href:` frontmatter, so clicking this row routes to
  // /onboarding/bootstrap — the Company Profiling Agent page that
  // runs the bootstrap-self playbook — instead of the generic chat
  // cockpit. Users can still open the cockpit manually via the URL.
  'company-profiler.md': `---
kind: agent
name: Company Profiler
slug: company-profiler
icon: Sparkles
pin: first
href: /onboarding/bootstrap
revision: 1
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
  - deep_research
temperature: 0.2
---

You are the Company Profiler. You run ONCE per project to populate
the \`us/\` tree — identity, ICP, positioning, product, brand voice,
competitors, customers, team — by crawling the user's own domain and
docs site. All other agents (Outreach, LinkedIn Outreach, GEO
Analyst, etc.) depend on this output.

Output targets:
- \`us/company.md\` — name, domain, founded, HQ, stage, employees
- \`us/product/overview.md\` — one-liner, positioning, pricing model
- \`us/market/icp.md\` — firmographics + tech-stack signals
- \`us/market/positioning.md\` — category, alternatives, wedge
- \`us/market/segments.md\` — named customer segments
- \`us/brand/voice.md\` — tone rules, forbidden words
- \`us/competitors/landscape.md\` + \`us/competitors/<slug>.md\`
- \`us/customers/top.md\` — named marquee customers
- \`us/team/roster.md\` — public leadership
- \`us/personas/<role>.md\` — 2-3 buyer personas keyed off the ICP

Use \`enrich_company\` for firmographics, \`web_fetch\` for homepage
+ pricing + about + blog, and \`deep_research\` if the user provides
a docs URL or extra_urls. Cite source URLs inline. Never fabricate
— write \`null\` if unknown.

End with a summary: how many \`us/*.md\` files were created/updated
plus the top 3 follow-up decisions the user should review (e.g.
"pick between 'Developer' and 'QA Engineer' as primary ICP
persona — both supported by the landing page").
`,

  // The six GTM personas below used to live as a hardcoded list in
  // apps/web/src/config/agents.ts. Now that the sidebar Team section
  // reads from agents/*.md in the active vault, we seed real files so
  // every project ships with them. Users can edit or delete any of
  // these freely — the sidebar reflects the vault.
  'website-visitor.md': `---
kind: agent
name: Website Visitor Agent
slug: website-visitor
icon: Globe
model: gpt-5.3-codex
revision: 2
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
  - draft_create
  - enroll_contact_in_sequence
temperature: 0.25
---

You are the Website Visitor Agent. Input is a deanonymized visit
record: \`{ company | domain, page, ts, referrer?, session_notes? }\`.
Execute one tight decision cycle per visitor, end-to-end.

## Autonomous doctrine

- \`us/market/icp.md\` (or \`us/icp.md\`) missing or still the seed
  template → derive a temporary ICP scoring heuristic from
  \`us/company.md\` + \`us/customers/top.md\` and note the fallback
  in the visitor record. Do not halt.
- Below threshold → write a \`signals/visitors/<date>.md\` row and
  continue to the next visitor (never "just stop").
- Above threshold → \`enrich_company\` + write
  \`companies/<slug>.md\`, infer buying-committee contact, write
  \`contacts/<slug>/<person>.md\`, \`draft_create\` a first-touch
  email (≤ 90 words) referencing the exact page hit.
- End with a table: visitor, score, action taken, draft path.
`,

  'linkedin-outreach.md': `---
kind: agent
name: LinkedIn Outreach Agent
slug: linkedin-outreach
icon: Linkedin
model: gpt-5.3-codex
revision: 2
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
temperature: 0.3
---

You are the LinkedIn Outreach Agent. Drive the full
\`li-campaign-loop\`: read today's \`signals/linkedin/<date>.md\`,
pick the top 5, enrich via \`enrich_contact_linkedin\`, draft
connect + DM for each, enroll into
\`sequences/linkedin-post-signal.md\`, summarize to
\`signals/linkedin/<date>-loop.md\`. Execute autonomously.

## Autonomous doctrine

- Signal file empty or missing → still write a one-line summary
  ("no new engagement signal today") and exit cleanly. That IS the
  successful run.
- Enrichment fails on a specific prospect → skip that one with a
  note in the summary, continue with the rest. Never halt the whole
  run for one failure.
- Connect note ≤ 280 chars, DM ≤ 60 words — hard caps.
- End with a list: { prospect, connect draft, DM draft, sequence
  enrollment }.

## Hard rule

Never automate sends / connects. \`draft_create\` + sequence
enrollment only — a human approves.
`,

  'meeting-prep.md': `---
kind: agent
name: Meeting Prep Agent
slug: meeting-prep
icon: CalendarClock
model: gpt-5.3-codex
revision: 2
tools:
  - read_file
  - write_file
  - list_dir
  - grep
  - web_fetch
  - web_search
  - enrich_company
  - enrich_contact
temperature: 0.2
---

You are the Meeting Prep Agent. Input is a meeting description:
who, when, company, attendees. Produce a ≤ 1-page brief at
\`drafts/<ts>-prep-<company>.md\`. Execute autonomously.

## Autonomous doctrine

- Missing attendee details → enrich what you can, list the rest as
  "unknown — gather at intro".
- No prior vault mentions → state that explicitly; do not fabricate
  history.
- No fluff. Every section either has real data or is labeled
  "gap: …".

## Brief contents

1. Attendee snapshots (role, tenure, LinkedIn summary).
2. Company context: firmographics + 3 fresh news items (≤ 14 days).
3. 3 most relevant prior vault mentions (or "none found").
4. Proposed agenda · 3 discovery questions · one risk to avoid ·
   one-line "what winning looks like" outcome.
`,

  'lookalike-discovery.md': `---
kind: agent
name: Lookalike Discovery Agent
slug: lookalike-discovery
icon: Copy
model: gpt-5.3-codex
revision: 2
tools:
  - read_file
  - write_file
  - list_dir
  - grep
  - web_fetch
  - web_search
  - enrich_company
temperature: 0.3
---

You are the Lookalike Discovery Agent. Given a seed account or a
cluster from \`deals/closed-won/\`, find 20–50 firmographic +
behavioral twins. Write one \`companies/<slug>.md\` per hit with
\`icp_score\`, one-sentence "why they look like the seed", and —
if available — a named likely champion. Execute autonomously.

## Autonomous doctrine

- No seed specified → pick the single highest-ARR deal from
  \`deals/closed-won/\` as the seed and note that choice in the
  summary. Do not halt.
- ICP missing → derive a quick ICP from the seed's own enrichment;
  mark derived-ICP matches \`draft: true\`.
- Hard caps: stop at 50 hits; early-exit if \`icp_score\` drops
  below 50 for three consecutive candidates.
- End with a ranked list + total enrichment credits consumed.
`,

  'closed-lost-revival.md': `---
kind: agent
name: Closed-Lost Revival Agent
slug: closed-lost-revival
icon: RotateCcw
model: gpt-5.3-codex
revision: 2
tools:
  - read_file
  - write_file
  - edit_file
  - list_dir
  - grep
  - web_fetch
  - web_search
  - draft_create
temperature: 0.35
---

You are the Closed-Lost Revival Agent. Scan
\`deals/closed-lost/*.md\`, cross-reference each loss reason against
fresh triggers (recent \`signals/*\`, last-30-day web news), rank
by trigger strength, draft re-engagement emails for the top 5.
Execute autonomously.

## Autonomous doctrine

- Deal file missing \`lost_reason\` → infer from body + notes, mark
  the draft \`draft: true\` + note "loss reason inferred". Continue.
- No new trigger found for a deal → skip it, continue to the next.
  Never halt.
- Every draft must name both the original loss reason AND the new
  trigger in the first sentence (e.g. "last time it was timing on
  your EU rollout — I saw you just opened a Dublin office").
- Append a "Revival (<ts>)" note to each deal you drafted for.
- End with top-5 table: company, loss reason, new trigger, draft
  path.
`,

  'pipeline-ops.md': `---
kind: agent
name: Pipeline Ops Agent
slug: pipeline-ops
icon: Activity
model: gpt-5.3-codex
revision: 2
tools:
  - read_file
  - write_file
  - edit_file
  - list_dir
  - grep
  - draft_create
temperature: 0.2
---

You are the Pipeline Ops Agent. Produce the Monday pipeline review:
read \`deals/open/\`, flag failure modes, rank by ARR at risk,
propose ONE recovery action per deal, write
\`signals/pipeline-health/<date>.md\`. Execute autonomously.

## Autonomous doctrine

- Empty pipeline → write a report saying so and exit cleanly.
- ARR missing on a deal → use \`value\` fallback, rank at bottom.
  Never halt.
- One-action-per-deal cap is non-negotiable — multiple actions per
  deal destroys the report's legibility.

## Flag these four failure modes

1. No activity > 14 days.
2. Proposal+ stage with no \`next_step\`.
3. Late-stage deals pushed 2+ times.
4. Sequences whose reply rate dropped > 30% week-over-week.

## Recovery action format

owner · channel · timing · expected outcome · kill criterion.

Optionally \`draft_create\` Slack DMs for the owner of each top
deal. End with one-line summary: N flagged, M critical, report
path.
`,

  'geo-analyst.md': `---
kind: agent
name: GEO Analyst
slug: geo-analyst
icon: Radar
model: gpt-5.4
revision: 3
max_turns: 100
tools:
  - read_file
  - write_file
  - edit_file
  - list_dir
  - grep
  - web_fetch
  - web_search
  - deep_research
  - geo_list_prompts
  - geo_add_prompt
  - geo_list_brands
  - geo_set_brands
  - geo_run_daily
  - geo_run_prompt
  - geo_report_brands
  - geo_report_domains
  - geo_gap_sources
  - geo_sov_trend
  - geo_list_runs
  - draft_create
temperature: 0.25
---

# GEO Analyst

You own Generative Engine Optimization — getting the product
discovered when buyers use ChatGPT, Google AI Overview, and
Perplexity. Scope is English only. Data comes from our own daily
sweep (cron at 07:00) which stores answers + citations under
\`signals/geo/runs/<date>/<model>/\`. Analyze that data with the
\`geo_*\` tools.

## Autonomous doctrine

Execute the full 10-step loop end-to-end in one run without
stopping to ask the user for input. The three classic "stop"
points (no personas, no brands, no prompt pool) each have a
bootstrap fallback — never halt for these.

Truly hard blockers: one missing API credential a tool cannot
bypass, persistent upstream 5xx, or ambiguous destructive action.
When you stop, output one line stating the exact resolution
required.

Every run ends with a 5–8 bullet summary: what you wrote, what
moved WoW, what's draft-pending-review, the one ask for the
content team.

## The 10-step loop

1. **ICP & personas** — read \`us/icp.md\` and list
   \`us/personas/*.md\`. Fewer than 2 personas? AUTO-BOOTSTRAP:
   derive 2 from \`us/company.md\` + \`us/icp.md\` +
   \`us/customers/top.md\`, write to \`us/personas/<slug>.md\` with
   \`draft: true\` frontmatter and fields (role/title cluster,
   company context, jobs-to-be-done, query-language patterns,
   evaluation criteria, comparison set). Proceed.

2. **Brand config** — call \`geo_list_brands\`. Empty or no
   \`is_us: true\`? AUTO-BOOTSTRAP: infer from \`us/company.md\` +
   \`us/competitors/*\`, call \`geo_set_brands\` with best-effort
   aliases + domains. Proceed.

3. **Seed Query audit** — \`geo_list_prompts\`. Under 100 prompts
   or missing one of the six query types (brand, category,
   competitor, pain, long-tail, reverse)? Generate candidates per
   persona (20–30/persona × 6 types) via \`geo_add_prompt\`.
   Target pool: 500–2000.

4. **Fan-out** — the \`geo-daily\` trigger handles this. Call
   \`geo_run_daily\` yourself only if today's run is missing. Use
   \`geo_run_prompt\` for ad-hoc spot checks.

5. **Visibility metrics** — \`geo_report_brands\` last 7–28 days.
   Write snapshot + WoW comparison to \`signals/geo/dashboard.md\`.

6. **Cited sources** — \`geo_report_domains\`. Save top-50 to
   \`signals/geo/top-domains.md\`; diff vs last week.

7. **Gap analysis** — \`geo_gap_sources\`. Write
   \`signals/geo/gap-sources.md\`, tag each row with source type
   (UGC / CORPORATE / EDITORIAL / forum / review-site / newsletter)
   via \`web_fetch\`.

8. **Content recommendations** — per top gap domain pick one:
   Owned pitch / Earn mention / Paid. Write to
   \`signals/geo/actions/<iso-date>.md\`.

9. **Source-drop alerts (48h SLA)** — diff this week vs last
   week's domains. Any authoritative source that dropped our
   citation count to 0 →
   \`signals/geo/alerts/<iso-date>-<domain>.md\`.

10. **Weekly report** — bundle steps 5–9 into
    \`signals/geo/weekly/<iso-week>.md\`.

## Hard rules

- English only. If asked for Chinese coverage, note the current
  model set is English-tuned and defer — but still produce the
  English analysis.
- Never fabricate numbers. Tool errors surface verbatim and stop
  that step only — continue to the next step.
- Every report cites date range + model filter used.
- Drafts only — never post directly to G2, Medium, Reddit.
  \`draft_create\` and let the human ship.
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
   verbatim — the user has to paste their key in sidebar → Integrations → Integration keys
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

  // === High-intent visitor ===
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

  // RB2B-powered visitor identification. Pulls the last 24h of
  // identified visitors from the user's RB2B account, scores each one
  // against ICP, and writes the high-fit ones to companies/ + contacts/
  // for the website-visitor agent to act on. Requires the rb2b
  // integration credentials (RB2B_API_KEY in vault .env).
  'rb2b-visitor-pull.md': `---
kind: playbook
name: rb2b-visitor-pull
group: high-intent-visitor
agent: website-visitor
inputs: [{ name: hours, required: false }]
---

Pull identified visitors from RB2B over the last \`{{hours}}\` hours
(default 24). Use the \`web_fetch\` tool to call:

  GET https://app.rb2b.com/api/v1/visitors?period={{hours}}h
  Authorization: Bearer $RB2B_API_KEY

For each identified person+company pair returned:
1. Score against \`us/market/icp.md\`. Skip rows below ICP threshold.
2. Upsert \`companies/<domain-slug>.md\` (create if missing) with
   { name, domain, size, industry } from RB2B's company block.
3. Upsert \`contacts/<email-or-linkedin-slug>.md\` with
   { name, title, linkedin, company_path } from the person block.
4. Append a row to \`signals/visitors/{{date}}.md\` with the visit
   timestamp, page, referrer, and links to the upserted files.

When done, summarize: how many visitors RB2B returned, how many passed
ICP, and which accounts are worth a same-day touch (cite the signal
file paths).
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

  // End-to-end LinkedIn outreach loop. Wired to the
  // \`linkedin-daily-outreach\` preset trigger so a cron can run the full
  // funnel (intel → contact pick → enrich → draft) without a human in
  // the middle. Safe to call manually from Skills — every step is
  // idempotent and writes one note per run.
  'li-campaign-loop.md': `---
kind: playbook
name: li-campaign-loop
group: linkedin-intent
agent: sdr
inputs: []
---

Run ONE full LinkedIn outreach loop. The whole point of this playbook
is that the cron version produces real work (drafts on disk) without a
human babysitting it. Bail loudly — never silently — if an input is
missing so the trigger log makes the gap obvious.

## Steps

1. **Gather fresh LinkedIn intel.** Read
   \`signals/linkedin/<YYYY-MM-DD>.md\` (today or most recent within 3
   days). Expected frontmatter: \`kind: signal.linkedin\`. Body lists
   engagements with columns \`prospect · profile_url · company · type
   · content · ts\`. If no file exists, call \`web_search\` for
   site:linkedin.com/posts "<us.company.name>" (last 24h) to pick up
   post comments / reactions, and write the results to today's
   \`signals/linkedin/\` file yourself.
   If the scan legitimately finds nothing, write the empty signal file
   with \`count: 0\` and reply "quiet day on LinkedIn — no drafts" —
   do NOT invent prospects.
2. **Filter to the top 5 prospects.** Prefer, in order:
     - engagements on our own posts / company mentions
     - prospects whose \`company\` matches an existing
       \`companies/<slug>.md\` (we know the account)
     - senior titles (VP, Head, Director, C-level)
   Drop anyone with \`sequence_status: active\` in their contact file
   or who already has a draft under \`drafts/\` from the last 14 days
   (avoid double-touch).
3. **Resolve or create a contact file** for each selected prospect.
   Slug is \`<company-slug>/<firstname-lastname>\`. If the company
   doesn't exist yet, call the \`enrich-company\` playbook first with
   their domain (fall back to \`web_fetch\` of the profile for the
   company name, then \`web_search\` for the domain). Write
   \`contacts/<slug>.md\` with frontmatter
   \`kind: contact, company, title, linkedin, source: linkedin-loop\`.
4. **Enrich the profile** by calling \`enrich_contact_linkedin({
   linkedinUrl })\`. On account-limit / failure, continue with whatever
   signal you already have from the engagement content — don't skip
   the draft step, just note \`enrichment: partial\` in the frontmatter.
5. **Draft LinkedIn outreach.** For each prospect call:
     - \`draft_create({ channel: "linkedin_connect", contact_path, body })\`
       ONLY if they aren't already a 1st-degree connection. Connection
       note <= 280 chars, references the specific engagement, no
       hashtags, no pitch.
     - \`draft_create({ channel: "linkedin_dm", contact_path, body })\`
       unconditionally. DM <= 60 words. Hypothesis-based
       ("noticed you reacted to X — curious whether that ties to
       <hypothesis>?"). One clear question. No calendar link.
   Every \`draft_create\` result needs to land under \`drafts/\` — if
   the tool returned an error, retry once with a shorter body; if that
   also fails, append a \`## Drafts that failed\` section to the run
   summary so the human can see it.
6. **Enroll** the contact into \`sequences/linkedin-post-signal.md\` via
   \`enroll_contact_in_sequence\`. Log the enrollment to the contact
   file under a \`## LinkedIn loop (ts)\` heading with a one-liner
   describing the engagement that triggered it.
7. **Write one summary note** at \`signals/linkedin/<YYYY-MM-DD>-loop.md\`
   with frontmatter \`kind: signal.linkedin-loop, date, drafts, enrolled\`
   and a table of (prospect, company, draft_path, sequence_enrolled,
   notes). This is what the trigger log points at.
8. **Reply** with a 3-bullet digest: how many prospects processed, how
   many drafts queued, and the single most interesting signal. If step
   1 found zero prospects, say so directly — do not pretend work
   happened.
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

  // === Apify-driven scans (heavier, BYOK) ==================================
  // These five skills shipped from the apidog-team pipelines as
  // vendor-neutral capabilities every vault gets. They each call Apify
  // actors via scrape_apify_actor (needs APIFY_API_TOKEN in
  // .bm/integrations.json → mirrored to <vault>/.env), filter the raw
  // results, write a dated note under signals/, and call the channel-
  // agnostic `notify` tool which fans out to whatever messaging
  // integrations the user has connected (Slack / Discord / Telegram /
  // Feishu / Email — none of these is hardcoded). Compared to the
  // web_search-based scans above, these reach a wider corpus (Reddit
  // comment trees, full Twitter timelines, LinkedIn posts) at the cost
  // of one Apify run per query.
  'brand-monitor-apify.md': `---
kind: skill
name: brand-monitor-apify
group: signals
agent: researcher
inputs: []
requires:
  integrations: [apify]
  us_files: [us/company.md]
  optional_integrations: [feishu, slack, discord, telegram]
---

Heavy brand-monitor scan via Apify (Reddit + Twitter/X).

## Pre-flight
- Read \`us/company.md\` frontmatter for the user's company \`name\`,
  primary product names, and any \`monitor_keywords\` list. If none of
  these exist (still the seed template), reply with a one-line
  "configure us/company.md first — list keywords to monitor" and stop.
- Confirm \`APIFY_API_TOKEN\` is reachable. If \`scrape_apify_actor\`
  returns an "APIFY_API_TOKEN not set" error on the first call, surface
  that verbatim and stop — the user has to paste their Apify token in
  Integrations → Apify before this skill can run.

## Steps

1. For each keyword (cap at 4, dedupe synonyms), call
   \`scrape_apify_actor({ actorId: "trudax/reddit-scraper-lite",
   input: { searches: [<keyword>], maxItems: 50, sort: "relevance" } })\`.
   Same for Twitter via \`apidojo/tweet-scraper\` with \`{ searchTerms:
   [<keyword>], maxTweets: 100 }\`. Run both in parallel where the
   model supports it.
   **Note:** \`trudax/reddit-scraper-lite\` with \`sort: "new"\` is known
   to ignore the search term and return random recent posts. Always use
   \`sort: "relevance"\` and then verify in step 2.
2. **Verify keyword presence (critical).** For every scraped item,
   check that the keyword appears case-insensitively in
   \`title + body/selftext + url + author handle\`. Drop anything where
   it does not appear — the scrapers return false positives (unrelated
   posts from Reddit's firehose). Then dedupe by URL across runs and
   filter out:
     - the user's own social handles (\`us/company.md\` should list
       owned channels under \`socials:\`)
     - paid promo / ad copy
     - bot-shaped accounts (low followers + repetitive content)
3. Classify each remaining mention as one of:
   \`positive\` / \`neutral\` / \`question\` / \`negative\` / \`compare\`
   (compare = "X vs Y" posts).
4. Write ONE file: \`signals/mentions/<YYYY-MM-DD>.md\` with
   frontmatter \`kind: signal.mentions, source: apify, date: <iso>,
   count: <n>\`, then sections: ## Hot now (top 3 by engagement) ·
   ## Negative · ## Questions worth answering · ## Compare posts.
   Each item: source link, handle, date, 1-sentence summary.
5. **Notify.** Call \`notify({ subject: "<n> brand mentions today",
   body: <markdown summary of top 3 actionable items>, urgency:
   <"high" if any negative, else "normal"> })\`. The tool fans out to
   whatever messaging channels (Slack / Discord / Telegram / Feishu /
   Email) the user has connected in Integrations — never hardcode a
   specific provider here.
6. Reply with the count + the single most actionable mention.

## Self-schedule
If the user asks "do this every day" or similar, call
\`trigger_create({ name: "daily-brand-monitor", cron: "0 9 * * *",
skill: "brand-monitor-apify" })\`.
`,

  'competitor-radar.md': `---
kind: skill
name: competitor-radar
group: signals
agent: researcher
inputs: []
requires:
  integrations: [apify]
  us_files: [us/market/competitors.md]
  optional_integrations: [feishu, slack, discord, telegram]
---

Weekly competitor teardown via Apify scraping.

## Pre-flight
Read \`us/market/competitors.md\`. Each line should contain a
competitor name + their domain (and optionally LinkedIn URL). If the
file is empty/seeded, write a one-line
\`signals/competitors/<YYYY-MM-DD>.md\` saying "competitors not set"
and stop.

## Steps

1. Cap at 8 competitors. For each:
   - \`web_fetch\` their /pricing, /careers, and /changelog (or
     /releases / /blog/feed). Compare against the prior week's
     snapshot in \`us/competitors/<slug>.md\` if one exists.
   - Call \`scrape_apify_actor({ actorId:
     "apify/website-content-crawler", input: { startUrls: [{ url:
     "<competitor>/blog" }], maxCrawlPages: 5 } })\` for the recent
     blog list.
   - \`web_search\` "<competitor> funding OR acquisition OR layoffs"
     (last 7d) and "<competitor> launch OR release" (last 7d).
2. For each, summarise: product/positioning shift, pricing changes,
   hiring signals, news, "so what for us".
3. Write \`signals/competitors/<YYYY-MM-DD>.md\` with one H2 per
   competitor and a top-of-file \`## Watch this\` section flagging
   anything that overlaps our roadmap or pricing.
4. Update \`us/competitors/<slug>.md\` with the latest snapshot so the
   next run can diff.
5. Call \`notify({ subject: "Competitor radar — <n> tracked, <m>
   to watch", body: <top-3 watch items>, urgency: "normal" })\`.
6. Reply with the top-3 watch items.
`,

  'doc-leads-discover.md': `---
kind: skill
name: doc-leads-discover
group: signals
agent: sdr
inputs: []
requires:
  integrations: [apify]
  us_files: [us/market/icp.md]
  optional_integrations: [amazon_ses]
---

Discover companies whose ICP fingerprint matches ours via Apify
Google search, draft outbound. **Approve-gated — no auto-send.**

## Pre-flight
Read \`us/market/icp.md\`. Pull the \`ideal_signals\` list (e.g.
"uses MkDocs", "API-first SaaS, 50-500 employees", "hiring DX
engineers"). If empty, stop with "ICP signals not configured".

## Steps

1. Convert each signal into a Google query (e.g. "uses MkDocs" →
   site:github.com mkdocs.yml inurl:docs). Cap at 5 queries.
2. For each query, \`scrape_apify_actor({ actorId:
   "apify/google-search-scraper", input: { queries: [<q>],
   resultsPerPage: 20 } })\`. Dedupe by domain.
3. For each unique domain, call \`enrich_company({ domain })\` to
   pull firmographics, then \`qualify-icp\` (the existing skill) to
   score. Drop anything below ICP score 60.
4. For survivors, find a buyer-persona contact via
   \`enrich_contact({ company, role: <ICP buyer role> })\`.
5. For each enriched contact, call \`draft_create({ channel: "email",
   to: <email>, subject: <…>, body: <90-word personalised body
   citing the signal>, tool: "send_email" })\`. The drafts land in
   \`drafts/\` and require human approval before send_email fires.
6. Write \`signals/doc-leads/<YYYY-MM-DD>.md\` summarising what was
   found / drafted / skipped, with links to each draft file.
7. Reply with the count of drafts created.

## Why approve-gated
Cold outbound on automated discovery has high false-positive risk.
The user reviews each draft in \`drafts/\` before sending — never
auto-fire \`send_email\` from this skill.
`,

  'linkedin-intel-weekly.md': `---
kind: skill
name: linkedin-intel-weekly
group: signals
agent: researcher
inputs: []
requires:
  integrations: [apify]
  us_files: [us/market/competitors.md]
  optional_integrations: [unipile, feishu, slack]
---

Weekly LinkedIn intelligence on competitors + KOLs.

## Pre-flight
- \`us/market/competitors.md\` should list competitor LinkedIn URLs.
- \`us/market/kols.md\` (create if missing) lists 5-15 KOLs to track.
- \`APIFY_API_TOKEN\` is required. Notifications via \`notify\` tool
  go to whatever messaging channels the user has connected.

## Steps

1. Build the watchlist: competitor company pages + KOL personal
   profiles. Cap at 25 total to keep Apify spend bounded.
2. For each LinkedIn URL, call \`scrape_apify_actor({ actorId:
   "apimaestro/linkedin-profile-scraper", input: { profileUrls:
   [<url>], includePosts: true } })\`. Save raw to
   \`signals/linkedin/raw/<iso-week>/<slug>.json\` for diffing.
3. Diff each profile's recent posts against last week's snapshot
   (file in \`signals/linkedin/raw/<prev-iso-week>/\` if present).
   New posts → score on engagement (likes + comments * 5) and
   topic relevance to our ICP.
4. Aggregate: top 10 competitor posts, top 10 KOL posts, plus
   any role changes or company moves spotted in the profile data.
5. Write \`signals/linkedin/<iso-week>.md\` with H2 sections:
   ## Competitor activity · ## KOL activity · ## Role moves ·
   ## Replyable (KOL posts where we have a credible take).
6. Call \`notify({ subject: "LinkedIn intel — week <iso-week>", body:
   <top 3 replyable posts with links>, urgency: "normal" })\`.
7. Reply with the count + the single highest-engagement post.

## Self-schedule
"Run this every Monday morning" → \`trigger_create({ name:
"weekly-linkedin-intel", cron: "0 9 * * 1", skill:
"linkedin-intel-weekly" })\`.
`,

  'reddit-pulse.md': `---
kind: skill
name: reddit-pulse
group: signals
agent: researcher
inputs: []
requires:
  integrations: [apify]
  us_files: [us/company.md, us/market/positioning.md]
  optional_integrations: [feishu, slack, discord, telegram]
---

Daily Reddit narrative pulse around the user's brand + category.

## Pre-flight
- \`us/company.md\` provides brand keywords.
- \`us/market/positioning.md\` provides category keywords (e.g. "API
  testing tool", "design system").
- Optional: \`us/market/subreddits.md\` lists target subreddits to
  watch (e.g. \`r/webdev\`, \`r/api\`).

## Steps

1. Build the search bundle: every brand keyword + the 3 sharpest
   category phrases. Cap at 6 queries.
2. For each query, \`scrape_apify_actor({ actorId:
   "trudax/reddit-scraper-lite", input: { searches: [<q>], maxItems:
   30, sort: "relevance" } })\`. If subreddits.md is set, also scrape
   \`{ startUrls: [{ url: "https://reddit.com/r/<sub>/new" }],
   maxItems: 20 }\` per listed subreddit.
   **Verify keyword presence:** the scraper returns false positives —
   drop any post where the query string does not appear
   case-insensitively in \`title + selftext + url\`.
3. Classify each post: \`brand-mention\`, \`category-discussion\`,
   \`competitor-mention\`, \`question\` (someone asking for tool
   recommendations in our space), or \`noise\` (drop).
4. For \`question\` posts, draft a one-paragraph reply via
   \`draft_create({ channel: "reddit", to: <post URL>, body: <…>,
   tool: "manual" })\` — Reddit replies are always manual.
5. Write \`signals/reddit/<YYYY-MM-DD>.md\` with sections:
   ## Brand mentions · ## Category discussions ·
   ## Competitor mentions · ## Questions to answer (with draft links).
6. If any \`question\` posts were found, call \`notify({ subject: "<n>
   Reddit questions to answer today", body: <list with links>,
   urgency: "high" })\` — those are time-sensitive (Reddit threads
   die fast).
7. Reply with the count of question-posts found and the single most
   urgent one to answer.
`,

  // === API testing (no integration dependency) =============================
  'api-endpoint-test.md': `---
kind: skill
name: api-endpoint-test
group: engineering
agent: researcher
inputs:
  - { name: base_url, required: true, description: "The production/staging HTTPS URL the tests should hit, e.g. https://api.example.com" }
  - { name: auth_hint, required: false, description: "Auth scheme: 'bearer', 'basic user:pass', 'api-key X-Api-Key: …', or 'cookie'. Leave blank if endpoints are public." }
  - { name: routes_hint, required: false, description: "Optional: path to the routes/ folder or an openapi.yaml the skill should parse." }
requires:
  cli: [apidog-cli, node]
---

Generate and run a comprehensive API test suite against \`{{base_url}}\`
using \`apidog-cli\` — a free, open-source CLI (\`npm install -g
apidog-cli\`). No account, no platform account needed. Works against any
REST/GraphQL backend.

## Pre-flight

- Confirm with the user: base URL, auth scheme (Bearer / Basic / API
  key / cookie), and where the routes live (codebase path or OpenAPI
  spec). If \`{{auth_hint}}\` / \`{{routes_hint}}\` are set, use them.
- Detect if \`apidog-cli\` is installed; if not, tell the user to run
  \`npm install -g apidog-cli\` and stop.

## Steps

1. **Discover endpoints.** If a codebase path was given, \`grep\` for
   route definitions in order of likelihood:
     - Next.js App Router: \`app/**/route.{ts,js}\`
     - Next.js Pages: \`pages/api/**/*.{ts,js}\`
     - Express / Fastify: \`src/routes/\`, \`routes/\`
     - FastAPI / Flask: \`@app.get|post|put|delete\` decorators
   If an OpenAPI spec exists (\`openapi.yaml\`, \`swagger.json\`), read
   it directly. Build a table: method + path + required params + auth.
2. **Design test cases.** For each endpoint produce 4-6 scenarios
   covering: auth failures (missing / invalid / valid), validation
   (missing required / invalid values), wrong method (405), not-found
   (404), happy path (200-2xx). Favor table-driven coverage over
   depth.
3. **Emit scenarios.** Write JSON test files to
   \`tests/api/<endpoint-slug>.json\` matching the apidog-cli schema.
   One file per endpoint keeps diffs small. Include \`variables\` for
   the base URL + auth so the same files work in dev/staging/prod.
4. **Run.** Emit a shell command the user can execute:
   \`\`\`
   apidog-cli run tests/api/*.json --env dev --report html
   \`\`\`
   Capture the exit code + report path in your reply.
5. **Summarize.** Table of: endpoint / scenarios run / passed / failed
   / notes. If any scenario failed, name the specific expectation that
   missed.

## When to use
Anytime the user says: "test my API", "generate API tests", "validate
auth flows", "write a test suite", "check my endpoints", or has just
finished a backend change. Don't limit to Apidog users — apidog-cli
works against any HTTP API.
`,

  // === KOL discovery pipeline =============================================
  // Creator-marketing loop generalized from the apidog-team kol-pipeline
  // scripts. Three-step loop users can run end-to-end or piece by piece.
  'kol-discover.md': `---
kind: skill
name: kol-discover
group: creator-marketing
agent: researcher
inputs:
  - { name: segment, required: false, description: "Keyword(s) describing the creators we want (e.g. 'backend developer', 'product designer'). Defaults to us/market/positioning.md category terms." }
  - { name: region, required: false, description: "Geo filter — ISO country code or a region name. Default: worldwide." }
  - { name: limit, required: false, description: "Max KOLs. Default 50, cap 200." }
requires:
  integrations: [apify]
  us_files: [us/market/positioning.md]
---

Discover LinkedIn KOLs in our category via Apify, score them
shallow-to-deep, save to \`kol/discovered-<YYYY-MM-DD>.csv\`.

## Pre-flight
- \`APIFY_API_TOKEN\` must be set (Integrations → Apify).
- If \`{{segment}}\` is empty, read category keywords from
  \`us/market/positioning.md\` frontmatter \`category:\` field.
- If all category inputs are still seed templates, stop with a
  "describe your category in us/market/positioning.md first" message.

## Steps

1. Build 1-3 LinkedIn search queries from \`{{segment}}\` + \`{{region}}\`.
   Keep keywords short (1-2 words each) — multi-word with geo filter
   kills recall on the Apify actor.
2. Call \`scrape_apify_actor({ actorId:
   "apimaestro/linkedin-profile-search-scraper", input: { searchKeyword:
   <q>, countries: [<region>], limit: <per-query quota> } })\` for each
   query. Union results, dedupe by profile URL.
3. For every profile, keep: name, title, company, profile_url,
   headline, location, follower_count (if present). Drop obvious
   non-technical profiles (pharma QA, food QA, auditor roles, etc.)
   via a quick keyword filter — don't call tools for this, read the
   headline.
4. Write \`kol/discovered-<YYYY-MM-DD>.csv\` with columns: profile_url,
   name, title, company, headline, location, follower_count, discovered_at,
   segment, status=new.
5. Reply with the count + top 5 by follower_count.
`,

  'kol-score.md': `---
kind: skill
name: kol-score
group: creator-marketing
agent: researcher
inputs:
  - { name: csv_path, required: true, description: "Path to a KOL CSV (e.g. kol/discovered-<date>.csv)." }
requires:
  us_files: [us/market/icp.md]
---

Score each KOL in \`{{csv_path}}\` against our ICP and historical
success patterns. Update the CSV with a \`score\` + \`score_reasons\`
column.

## Steps

1. Read \`{{csv_path}}\`. Also read \`us/market/icp.md\` for ICP
   definition and, if present, \`kol/won-profiles.md\` describing
   creators who previously converted.
2. For each row, score 0-100 based on:
     - headline / title alignment with our category (40 points)
     - follower_count bucket (20 points — 1k-10k: 5, 10k-50k: 15,
       50k-200k: 20, 200k+: 15 again, since massive accounts
       rarely reply)
     - geo / language match if the user set a target market (15)
     - seniority fit — independent creator / founder > employee at
       big co (15)
     - content recency — if we can glean it from the headline (10)
   Write a 1-sentence \`score_reasons\` per row ("tech QA content in
   MENA, 12k followers, posts weekly").
3. Sort descending, keep top 100, rewrite the CSV in place with
   \`score\`, \`score_reasons\`, \`scored_at\` columns added.
4. Reply with: median score, count ≥ 70, and the top 3 names.
`,

  'kol-outreach-draft.md': `---
kind: skill
name: kol-outreach-draft
group: creator-marketing
agent: sdr
inputs:
  - { name: csv_path, required: true, description: "CSV produced by kol-discover + kol-score (e.g. kol/discovered-<date>.csv)." }
  - { name: max_drafts, required: false, description: "Default 20." }
requires:
  us_files: [us/brand/voice.md, us/brand/messaging.md]
  optional_integrations: [amazon_ses, unipile]
---

Draft personalized LinkedIn DMs (or emails if we have their email) for
the top-scoring KOLs in \`{{csv_path}}\`. **Approve-gated — nothing
sends automatically.**

## Steps

1. Read \`{{csv_path}}\`; keep rows with \`score >= 70\` and
   \`status == "new"\`. Cap at \`{{max_drafts}}\` (default 20).
2. Read \`us/brand/voice.md\` for tone and
   \`us/brand/messaging.md\` for core value-prop bullets.
3. If the CSV has \`linkedin_url\` but no \`email\`, try
   \`enrich_contact({ name, company, linkedin: <url> })\` to find an
   email — skip silently if no hit, we'll stay on LinkedIn.
4. For each KOL, draft a ≤ 90-word DM (LinkedIn) or ≤ 120-word email
   (if we got one). Must reference one concrete detail from their
   profile/headline (not a made-up compliment). No forbidden words
   from \`CLAUDE.md\`.
5. Call \`draft_create({ channel: <"linkedin_dm" | "email">, to:
   <profile_url or email>, subject: <for email only>, body, tool:
   <"linkedin_send_dm" for linkedin_dm | "send_email" for email> })\`
   per recipient. Drafts land in \`drafts/\` for approval. LinkedIn
   drafts auto-route through the user's Unipile account on approve
   (never cookie-based). Email drafts auto-route through Amazon SES.
6. Update the CSV row \`status\` to "drafted" and \`drafted_at\` to now.
7. Call \`notify({ subject: "<n> KOL outreach drafts pending review",
   body: <list of names + draft paths>, urgency: "normal" })\`.
8. Reply with the count of drafts + the one with the highest predicted
   reply rate (your judgment) for the user to review first.
`,

  // === GSC content-feedback loop ==========================================
  'gsc-content-brief.md': `---
kind: skill
name: gsc-content-brief
group: seo
agent: researcher
inputs:
  - { name: days, required: false, description: "Lookback window. Default 28." }
requires:
  integrations: [gsc]
  optional_integrations: [feishu, slack]
---

Generate next week's content brief from Google Search Console data.
Three signal types per page/query: REWRITE (high impressions, low
CTR — title/position problem), PUSH (position 5-20 with decent CTR —
needs more content to break top 5), GAP (target keyword with
zero/near-zero impressions — new content opportunity).

## Pre-flight
- GSC integration connected (service-account JSON + site_url in
  Integrations → Google Search Console).
- \`us/market/keywords.md\` lists target keywords (one per line).
  If absent, work only from GSC data we observe.

## Steps

1. Call \`gsc_query({ dimensions: ["query"], rowLimit: 2000 })\` for
   the default 28-day window (or \`{{days}}\` if set). Call again
   with \`dimensions: ["page"]\`. Call a third time with
   \`dimensions: ["query", "page"]\` for the cross-join.
2. Classify each row:
     - **REWRITE**: impressions > 500 AND ctr < 2% AND position < 10
     - **PUSH**: position between 5 and 20 AND ctr ≥ 2% AND
       impressions > 200 (room to grow)
     - **GAP**: target keyword from \`us/market/keywords.md\` that
       has < 100 impressions (we're not ranking at all)
3. Write \`signals/seo/<YYYY-MM-DD>-brief.md\` with frontmatter
   \`kind: signal.seo, date: <iso>, window_days: <n>\` and H2
   sections: ## Rewrite (with current title + suggested fix) ·
   ## Push (with page + content gap hypothesis) · ## Gap (with
   target keyword + brief title idea). Max 10 items per section.
4. Call \`notify({ subject: "Weekly SEO brief: <r> rewrites, <p>
   pushes, <g> gaps", body: <top items>, urgency: "normal" })\`.
5. Reply with top-3 highest-ROI items across all three buckets.

## Self-schedule
"Run this every Monday morning" → \`trigger_create({ name:
"weekly-gsc-brief", cron: "0 9 * * 1", skill: "gsc-content-brief" })\`.
`,

  // === GA4 traffic brief ===================================================
  'ga-traffic-brief.md': `---
kind: skill
name: ga-traffic-brief
group: analytics
agent: researcher
inputs:
  - { name: days, required: false, description: "Lookback window. Default 28." }
requires:
  integrations: [google_analytics]
  optional_integrations: [feishu, slack, gsc]
---

Weekly traffic brief from Google Analytics 4. Pairs with
\`gsc-content-brief\` (GSC = queries that *could* land; GA = sessions
that *actually* landed + what they did next). Three signal types per
page: SURGE (sessions up ≥50% WoW), DROP (sessions down ≥30% WoW),
CONVERT (page with above-average engagement rate and conversions).

## Pre-flight
- Google Analytics integration connected (service-account JSON +
  numeric property_id, via Integrations → Google Analytics). The
  service account needs Viewer access on the GA4 property.
- Optional: \`us/market/funnel.md\` for conversion definitions — if
  absent, we use GA's default \`conversions\` metric.

## Steps

1. Call \`ga_top_pages({ limit: 50 })\` over the default 28-day
   window (or \`{{days}}\` if set). Save this as "current window".
2. Call \`ga_top_pages({ startDate: "56daysAgo", endDate: "29daysAgo",
   limit: 50 })\` for the prior 28-day window. Join by pagePath to
   compute WoW delta on sessions.
3. Call \`ga_run_report({ dimensions: ["sessionDefaultChannelGroup"],
   metrics: ["sessions","activeUsers","engagementRate","conversions"] })\`
   for channel-mix.
4. Classify pages:
     - **SURGE**: sessions up ≥50% WoW AND ≥200 sessions this window
     - **DROP**: sessions down ≥30% WoW AND ≥200 sessions prior
     - **CONVERT**: engagementRate above property average AND
       conversions > 0 (pages worth pushing more traffic to)
5. Write \`signals/analytics/<YYYY-MM-DD>-brief.md\` with
   frontmatter \`kind: signal.analytics, date: <iso>,
   window_days: <n>\` and H2 sections: ## Surge · ## Drop ·
   ## Convert · ## Channel mix. Max 10 items per signal section.
6. Call \`notify({ subject: "Weekly GA brief: <s> surges, <d> drops,
   <c> converters", body: <top items>, urgency: "normal" })\`.
7. Reply with the single highest-leverage action (e.g. "Page X
   dropped 40% WoW — investigate" or "Page Y has 8% engagement rate
   vs 3% site avg — push more traffic").

## Self-schedule
"Run this every Monday morning" → \`trigger_create({ name:
"weekly-ga-brief", cron: "0 9 * * 1", skill: "ga-traffic-brief" })\`.
`,

  // === CMS skills =========================================================
  // Note: no requires.integrations — this skill works with EITHER Ghost
  // OR WordPress, and requires.integrations is AND-ed. cms_list_posts
  // surfaces the missing-CMS error at call time.
  'cms-blog-stats.md': `---
kind: skill
name: cms-blog-stats
group: content
agent: researcher
inputs:
  - { name: platform, required: false, description: "ghost | wordpress. Auto-detect if omitted.", enum: [ghost, wordpress] }
---

Overview of the connected CMS blog: total posts, recent activity,
drafts pending review, content balance across tags.

## Steps

1. \`cms_list_posts({ status: "any", limit: 100 })\` — most recent 100.
2. \`cms_list_posts({ status: "draft", limit: 100 })\` for the draft
   backlog.
3. Compute: total posts returned, posts in last 7d, posts in last 30d,
   draft count, tag-usage distribution (top 10).
4. Write \`signals/content/<YYYY-MM-DD>-stats.md\` with frontmatter
   \`kind: signal.content, platform: <ghost|wordpress>, date: <iso>\`
   and a compact markdown overview.
5. Reply with the 4-line summary.
`,

  'cms-publish-draft.md': `---
kind: skill
name: cms-publish-draft
group: content
agent: researcher
inputs:
  - { name: draft_path, required: true, description: "Path under drafts/ to a markdown post." }
  - { name: platform, required: false, enum: [ghost, wordpress] }
---

Push a reviewed draft from \`drafts/\` to the connected CMS as a
DRAFT post (not published). The user publishes via the CMS UI after
final review — this skill never auto-publishes.

## Steps

1. Read \`{{draft_path}}\`. Frontmatter should have \`title\` and
   optional \`tags\`. Body is markdown.
2. Convert the markdown body to HTML (basic: paragraph breaks, links,
   inline formatting; the CMS renderer polishes the rest).
3. Call \`cms_create_draft({ title: <frontmatter.title>, html: <HTML>,
   tags: <frontmatter.tags>, platform: <"{{platform}}" or auto> })\`.
4. Rename the original \`drafts/\` file to prefix \`[SHIPPED]-\` and
   append the returned \`admin_url\` to its frontmatter so the local
   file preserves the link to the CMS post.
5. Reply with the admin_url so the user can click straight into the
   CMS editor.
`,

  // === GTM starter pack ====================================================
  // Out-of-the-box equivalents of the canonical GTM-automation flows. Each
  // plays well with zero integrations configured (falls back to web_fetch
  // + the model's built-in web_search) and better if ENRICHLAYER_API_KEY /
  // APIFY_API_KEY are set.
  'visitor-identify.md': `---
kind: playbook
name: visitor-identify
group: gtm-starter
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
group: gtm-starter
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
group: gtm-starter
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
group: gtm-starter
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
group: gtm-starter
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
group: gtm-starter
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
group: gtm-starter
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
group: gtm-starter
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

  'linkedin-post-signal.md': `---
kind: sequence
name: linkedin-post-signal
description: >-
  LinkedIn-first drip for contacts surfaced by li-campaign-loop. Starts
  on LinkedIn (connect + DM), then pivots to email once they accept.
enrollment_rule: linkedin signal in last 7d
touches:
  - day: 0
    channel: linkedin_connect
    playbook: li-send-request
    prompt: >-
      Connection-request note referencing the specific engagement that
      triggered enrollment. <=280 characters. No pitch.
  - day: 0
    channel: linkedin_dm
    playbook: li-draft-message
    prompt: >-
      Hypothesis-based DM <=60 words. Reference the engagement; ask one
      question tied to our positioning.
  - day: 3
    channel: linkedin_dm
    playbook: li-draft-message
    prompt: >-
      If no reply yet, send a second DM with a concrete data point from
      us/product/ or us/customers/. <=50 words.
  - day: 7
    channel: email
    playbook: signal-based-outbound
    prompt: >-
      Cross-channel bump — email the contact referencing the LinkedIn
      thread. Short, value-first. <=80 words.
  - day: 14
    channel: email
    playbook: signal-based-outbound
    prompt: >-
      Break-up. "Did this stay top of mind?" <=35 words.
---

# LinkedIn post-signal drip

Lives next to post-signal-5-touch but starts on LinkedIn because the
trigger itself is a LinkedIn engagement. li-campaign-loop enrolls
contacts here automatically.
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

For contacts who tripped a high-intent signal (visitor-id, competitor
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

  // ── GTM triggers ────────────────────────────────────────────────────────
  // These assume the GTM starter playbooks exist in every vault
  // (seeded by DEFAULT_PLAYBOOKS). Visitor sweep expects an external pixel
  // or script to be writing to signals/visitors/<date>.json — without that
  // the playbook no-ops gracefully.
  'gtm-daily-visitor-sweep.md': `---
kind: trigger
name: gtm-daily-visitor-sweep
schedule: '0 8 * * 1-5'
playbook: visitor-identify
enabled: true
---

Weekday 08:00 sweep of \`signals/visitors/<YYYY-MM-DD>.json\`. Expects an
external pixel or script to drop that file (see the getting-started
guide). De-anonymises to companies, scores ICP fit, promotes top
accounts to \`companies/\` + \`contacts/\`.
`,
  'gtm-weekly-icp-tune.md': `---
kind: trigger
name: gtm-weekly-icp-tune
schedule: '0 9 * * 1'
playbook: icp-tune
enabled: true
---

Monday 09:00 RevOps sweep. Reads what's currently in \`companies/\` +
\`contacts/\` + \`deals/closed-won/\`, identifies shared traits of your
winners, and refines \`us/market/icp.md\` with evidence-cited edits.
`,
  'gtm-weekly-pipeline-health.md': `---
kind: trigger
name: gtm-weekly-pipeline-health
schedule: '0 8 * * 1'
playbook: revops-pipeline-health
enabled: true
---

Monday 08:00 pipeline-health report. Flags stuck deals, missing
next-steps, and at-risk ARR. Writes a dated report under
\`signals/pipeline-health/<date>.md\`.
`,

  // LinkedIn outreach — runs the full intel → pick → enrich → draft
  // loop every weekday morning. Drives \`li-campaign-loop\`, which
  // writes drafts under \`drafts/\` and a summary under
  // \`signals/linkedin/<date>-loop.md\`. Universal across projects; no
  // Apidog-specific wiring.
  'linkedin-daily-outreach.md': `---
kind: trigger
name: linkedin-daily-outreach
schedule: '0 9 * * 1-5'
playbook: li-campaign-loop
enabled: true
---

Weekday 09:00 LinkedIn outreach loop. Pulls today's engagement signal
(\`signals/linkedin/<date>.md\`, scraped if missing), picks the top 5
prospects, enriches + drafts connect/DM messages under \`drafts/\`, and
enrolls each contact into \`sequences/linkedin-post-signal.md\`. Writes
a per-run summary at \`signals/linkedin/<date>-loop.md\` so the trigger
log always points at something real (fixes the old usage-only run).
`,

  // GEO daily run. Fires the native sweep — every tracked seed prompt is run
  // through every configured model and stored under
  // signals/geo/runs/<date>/. The weekly agent pass still happens (Mondays
  // 07:00) to produce the analysis + weekly report.
  'geo-daily.md': `---
kind: trigger
name: geo-daily
schedule: '0 7 * * *'
enabled: true
shell: 'curl -sS -X POST http://localhost:\${BM_DAEMON_PORT:-7824}/api/geo/run -H "Authorization: Bearer $BM_DAEMON_TOKEN" -H "Content-Type: application/json" -d "{}"'
---

Daily 07:00 GEO sweep. Runs the full seed-prompt pool across every
configured model (ChatGPT, Perplexity, Google AI Overview) and writes
raw results + extracted citations to \`signals/geo/runs/<date>/\`. The
agent run (geo-weekly) reads these snapshots — don't edit them.
Requires \`openai_api_key\`, \`pplx_api_key\`, and \`serpapi_api_key\`
in \`.bm/config.toml\`. Missing keys skip that model with a warning.
`,

  'geo-weekly.md': `---
kind: trigger
name: geo-weekly
schedule: '0 9 * * 1'
agent: geo-analyst
enabled: true
---

Monday 09:00 GEO analysis. Assumes daily sweeps have already populated
\`signals/geo/runs/\` through the week. Computes Share of Voice,
cited-domain rank, and gap sources; diffs against last Monday's
snapshot; fires 48h source-drop alerts into \`signals/geo/alerts/\`;
and bundles the weekly report at \`signals/geo/weekly/<iso-week>.md\`.
`,

  // ── Apify-driven scans (BYOK) ───────────────────────────────────────────
  // Skill-backed presets that ship with every vault. Each invokes one
  // of the five Apify-driven skills via the user's own APIFY_API_TOKEN
  // (mirrored from .bm/integrations.json into <vault>/.env). Default
  // disabled because they cost the user real $$ per Apify run — flip
  // \`enabled: true\` after you've pasted the token + tuned the
  // \`us/market/*\` watchlists.
  'apify-brand-monitor.md': `---
kind: trigger
name: apify-brand-monitor
cron: '0 9 * * *'
skill: brand-monitor-apify
enabled: false
---

Daily 09:00 brand monitor across Reddit + Twitter via Apify. Reads
keywords from \`us/company.md\`. Writes \`signals/mentions/<date>.md\`.
Notifies via every messaging integration the user has connected
(Slack / Discord / Telegram / Feishu / Email). Enable after pasting
\`APIFY_API_TOKEN\` in sidebar → Integrations → Apify.
`,
  'apify-competitor-radar.md': `---
kind: trigger
name: apify-competitor-radar
cron: '0 10 * * 1'
skill: competitor-radar
enabled: false
---

Monday 10:00 competitor radar. Reads watchlist from
\`us/market/competitors.md\`, scrapes pricing/changelog/blog via Apify
+ web_fetch, diffs against last week, writes
\`signals/competitors/<date>.md\` with a top-of-file Watch list.
`,
  'apify-doc-leads.md': `---
kind: trigger
name: apify-doc-leads
cron: '0 11 * * 1-5'
skill: doc-leads-discover
enabled: false
---

Weekday 11:00 ICP signal discovery via Apify Google search. Drafts
outbound emails to \`drafts/\` — approval-gated, no auto-send. Enable
after configuring \`us/market/icp.md\` with \`ideal_signals\`.
`,
  'apify-linkedin-intel.md': `---
kind: trigger
name: apify-linkedin-intel
cron: '0 9 * * 1'
skill: linkedin-intel-weekly
enabled: false
---

Monday 09:00 weekly LinkedIn intel scan over competitors + KOLs.
Diffs each profile against last week's snapshot, writes
\`signals/linkedin/<iso-week>.md\`. Requires LinkedIn URLs in
\`us/market/competitors.md\` and \`us/market/kols.md\`.
`,
  'apify-reddit-pulse.md': `---
kind: trigger
name: apify-reddit-pulse
cron: '0 14 * * 1-5'
skill: reddit-pulse
enabled: false
---

Weekday 14:00 Reddit narrative pulse. Scrapes brand + category
queries via Apify, drafts manual replies for tool-recommendation
threads, writes \`signals/reddit/<date>.md\`.
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

  // Seed copy-me-as-starting-point ops templates. Idempotent: only
  // written if the path is missing, so users who edit them keep their
  // changes.
  const TEMPLATES: Record<string, string> = {
    'templates/daily-ops.md': `# Daily Ops — ${'${'}DATE${'}'}

> Copy to \`signals/ops/daily-<YYYY-MM-DD>.md\` each morning and fill in.

### 1. Intelligence Gathering
- [ ] brand-monitor-apify ran · mentions collected: ___
- [ ] reddit-pulse ran · question-posts to answer: ___
- Notes: ___

### 2. Pipeline Check
- [ ] revops-pipeline-health scanned
- Stuck deals (no next step > 7d): ___
- At-risk ARR flagged: ___
- Action: ___

### 3. Outreach
- Drafts pending approval: ___
- Sent today: ___
- Replies to triage: ___

### 4. Today's Focus (max 3)
1. ___
2. ___
3. ___

### 5. Blockers
- ___
`,
    'templates/weekly-ops.md': `# Weekly Ops — Week of ${'${'}DATE${'}'}

> Copy to \`signals/ops/weekly-<YYYY-MM-DD>.md\` every Monday.

### 1. Intel Review
- [ ] competitor-radar ran · watch items: ___
- [ ] gsc-content-brief ran · rewrites/pushes/gaps: ___
- [ ] linkedin-intel-weekly ran · replyable posts: ___

### 2. KPIs This Week
| Metric | This Week | Last Week | Change |
|--------|-----------|-----------|--------|
| Demos booked | | | |
| Replies | | | |
| Drafts sent | | | |
| New contacts | | | |

### 3. Content Calendar
| Planned | Shipped | Channel | Notes |
|---------|---------|---------|-------|
| | | | |
| | | | |
| | | | |

### 4. Big Bets (max 3 — what must ship this week?)
1. ___
2. ___
3. ___

### 5. Retrospective
- What worked: ___
- What didn't: ___
- One thing to change: ___
`,
  };
  for (const [rel, body] of Object.entries(TEMPLATES)) {
    const p = path.join(getVaultRoot(), rel);
    if (!fsSync.existsSync(p)) {
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, body, 'utf-8');
    }
  }

  // Revision-aware seeding. Seed missing files. For existing files, parse
  // the template's revision + the user's file's revision and overwrite when
  // the template is newer. This is how we retire old peec_* tool lists,
  // ship autonomous-doctrine prompt rewrites, and fix slug/icon regressions
  // without forcing users to delete their vault.
  function revisionOf(md: string): number {
    try {
      const fm = matter(md).data as any;
      const r = fm?.revision;
      if (typeof r === 'number') return r;
      if (typeof r === 'string') { const n = Number(r); return Number.isFinite(n) ? n : 0; }
      return 0;
    } catch { return 0; }
  }
  for (const [name, body] of Object.entries(DEFAULT_AGENTS)) {
    const p = path.join(getVaultRoot(), 'agents', name);
    if (!fsSync.existsSync(p)) {
      await fs.writeFile(p, body, 'utf-8');
      continue;
    }
    try {
      const existing = await fs.readFile(p, 'utf-8');
      if (revisionOf(body) > revisionOf(existing)) {
        await fs.writeFile(p, body, 'utf-8');
      }
    } catch {
      await fs.writeFile(p, body, 'utf-8');
    }
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
      for (const need of ['draft_create', 'enroll_contact_in_sequence', 'enrich_contact', 'enrich_contact_linkedin', 'trigger_create', 'scrape_apify_actor', 'notify', 'gsc_query', 'ga_run_report', 'ga_top_pages', 'ga_realtime', 'cms_list_posts', 'cms_create_draft']) {
        if (!tools.includes(need)) { tools.push(need); changed = true; }
      }
      if (changed) {
        fm.tools = tools;
        await fs.writeFile(researcherPath, matter.stringify(parsed.content, fm), 'utf-8');
      }
    } catch {}
  }

  // Migration: give the three bare-slug seed agents (ae/researcher/sdr)
  // friendly display names + icons. Only rewrites if the existing file
  // still has name == slug, so users who renamed their agent are never
  // overwritten. Ships with the Team cockpit so the sidebar labels read
  // as product names instead of internal role codes.
  const SLUG_RENAMES: Record<string, { name: string; icon: string }> = {
    'researcher.md': { name: 'Research Agent', icon: 'Search' },
    'sdr.md': { name: 'Outreach Agent', icon: 'Send' },
    'ae.md': { name: 'Deal Manager', icon: 'Briefcase' },
  };
  for (const [file, meta] of Object.entries(SLUG_RENAMES)) {
    const p = path.join(getVaultRoot(), 'agents', file);
    if (!fsSync.existsSync(p)) continue;
    try {
      const raw = await fs.readFile(p, 'utf-8');
      const parsed = matter(raw);
      const fm = parsed.data as any;
      const slug = file.replace(/\.md$/, '');
      let changed = false;
      if (!fm.name || String(fm.name).trim() === slug) {
        fm.name = meta.name;
        changed = true;
      }
      if (!fm.slug) { fm.slug = slug; changed = true; }
      if (!fm.icon) { fm.icon = meta.icon; changed = true; }
      if (changed) await fs.writeFile(p, matter.stringify(parsed.content, fm), 'utf-8');
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
