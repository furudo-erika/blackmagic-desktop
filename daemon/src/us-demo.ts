// ACME demo — fictional company data for try-before-signing-in demos.
//
// Everything here is made up. "Acme Cloud" is a placeholder in the same
// spirit as example.com. The point is to give a new user a vault they
// can poke at (run a Playbook, ask the agent to draft outbound, etc.)
// without having to port their real company first.
//
// Files written below OVERWRITE the seeded templates when demo mode is
// selected — so the empty skeleton gets swapped for populated fiction.

import fs from 'node:fs/promises';
import path from 'node:path';

export const ACME_DEMO_FILES: Record<string, string> = {
  'us/company.md': `---
kind: us.company
name: Acme Cloud
domain: acmecloud.example
one_liner: Schema-first observability for serverless teams.
stage: B
founded: 2022
hq: San Francisco, CA
employee_count: "72"
founders: ["Rae Novak", "Yuri Ramos"]
website: https://acmecloud.example
blog: https://acmecloud.example/blog
docs: https://docs.acmecloud.example
linkedin: https://linkedin.com/company/acmecloud-example
twitter: "@acmecloud_example"
---

# Us — Acme Cloud

Acme Cloud gives small-to-mid-market engineering teams a schema-first
way to wire up production observability without a dedicated SRE. Our
SDK infers log shape at build time, so dashboards, alerts and
retention rules all derive from the same source of truth the engineer
already maintains. We replace the 2–4 person "tools team" a Series-B
company would otherwise need to hire.

All data on this page is **fictional demo content** meant for first-run
evaluation. Overwrite it with your real company or run the
\`bootstrap-self\` Playbook.
`,

  'us/product/overview.md': `---
kind: us.product.overview
---

# What Acme Cloud sells

## Offer
A TypeScript/Python SDK + cloud backend. You annotate your code with
\`@observe\` decorators, ship, and the dashboard populates itself.
No YAML, no Terraform, no "observability engineer" job posting.

## Core differentiators
- **Schema-as-code**: log shape lives next to the code that emits it
- **Zero-config dashboards**: 8 starter views generated from your SDK schema on first deploy
- **Per-trace cost attribution**: engineers see the \$ impact of every request at PR time
`,

  'us/product/pricing.md': `---
kind: us.product.pricing
---

# Pricing (public)

| Plan | Monthly | Included | Overage |
|---|---|---|---|
| Hobby | \$0 | 1 service · 7-day retention · 1 seat | n/a |
| Team | \$499 | 10 services · 30-day · 10 seats | \$0.08 / 1M events |
| Scale | \$1,990 | 50 services · 90-day · 25 seats · SSO | \$0.05 / 1M events |
| Enterprise | custom | SOC2, VPC peering, dedicated support | — |

## Notes
- Annual discount: 20% on Team / Scale
- Typical paid ACV: \$12k–\$180k
- Free Hobby tier converts at ~4% within 60 days
`,

  'us/product/features.md': `---
kind: us.product.features
---

# Feature map

## Instrumentation
- TypeScript, Python, Go SDKs
- Auto-instrumentation for Next.js, FastAPI, Rails
- OpenTelemetry bridge (read-only)

## Dashboards
- Starter pack generated from schema on first deploy
- Drill-down from service → endpoint → single trace
- Shareable read-only links

## Alerting
- Condition-builder UI, plus as-code via the SDK schema
- PagerDuty / Opsgenie / Slack delivery
- Synthetic alerts (wake engineer only if a paying customer is affected)

## Cost attribution
- Per-endpoint \$/1k request
- Regression diff posted to PRs via GitHub / GitLab bot
`,

  'us/product/integrations.md': `---
kind: us.product.integrations
---

# Integrations

| Category | Tool | Status | Depth |
|---|---|---|---|
| CI | GitHub Actions | GA | native, first-class |
| CI | GitLab CI | GA | native |
| Chat | Slack | GA | alerts + slash commands |
| Chat | MS Teams | beta | alerts only |
| Paging | PagerDuty | GA | routing rules |
| Paging | Opsgenie | GA | routing rules |
| SSO | Okta | GA | SAML |
| SSO | Google Workspace | GA | OIDC |
| Cloud | AWS | GA | VPC peering (Scale+) |
| Cloud | GCP | GA | private link (Scale+) |
| Cloud | Azure | beta | public endpoint |
`,

  'us/product/roadmap.md': `---
kind: us.product.roadmap
---

# Roadmap (public)

## Now — Q2
- Python 3.13 SDK GA
- On-call schedule import from PagerDuty (one-way)
- Cost budget alerts

## Next — Q3
- LLM-assisted alert tuning ("silence known-flaky at 3am")
- Azure VPC peering GA
- Per-customer cost attribution (for SaaS teams)

## Later
- Self-hosted control plane (enterprise)
- Rust SDK
`,

  'us/market/icp.md': `---
kind: us.market.icp
---

# ICP — who Acme Cloud sells to

## Size
- Employee range: 50–500
- Engineering org: 10–80
- ARR: \$3M–\$80M

## Industries
- B2B SaaS
- Fintech APIs
- Developer tools

## Tech stack signals
We fit best when the prospect already uses:
- TypeScript / Python / Go in production
- AWS or GCP (not bare metal, not on-prem)
- GitHub, not self-hosted GitLab
- No dedicated SRE / "DevOps Engineer" on the team yet

## Geos
- US, Canada
- UK, Netherlands, Germany, France
- Australia, Singapore

## Pain indicators that mean "now is a good time"
- Recent outage postmortem visible publicly
- Hiring for first SRE / "Platform Engineer"
- Migrating from on-prem to cloud
- Datadog renewal approaching (searchable from SEC filings or LinkedIn mentions)

## Anti-signals (don't chase)
- Staffing a 5+ person platform team (already invested in a different shape)
- Bare-metal / on-prem heavy
- Not paying for *any* tooling (bootstrap sub-10 headcount)
`,

  'us/market/segments.md': `---
kind: us.market.segments
---

# Market segments

| Segment | Typical buyer | Typical ACV | Motion |
|---|---|---|---|
| Seed / Series A | CTO or founding engineer | \$6k–\$18k | PLG + light sales |
| Series B / C | VP Engineering | \$20k–\$80k | Hybrid PLG + outbound |
| Mid-market (late-stage private) | Director of Platform | \$80k–\$180k | Sales-led, annual contracts |
| Enterprise | VP Platform or SRE Director | \$200k+ | Field sales, SOC2 / MSA required |
`,

  'us/market/positioning.md': `---
kind: us.market.positioning
---

# Positioning — Acme Cloud

## Category
**Serverless-native observability.** Adjacent to Datadog and Honeycomb,
but aimed at teams that don't have — and don't want to hire — a
full-time observability engineer.

## Positioning statement
For **engineering teams of 10–80 at Series-A-through-C startups** who
**can't afford a dedicated observability team and find Datadog a
black-box expense**, **Acme Cloud** is a **schema-first observability
platform** that **derives dashboards, alerts, and cost attribution
directly from the same SDK annotations engineers already write**.
Unlike **Datadog**, we **don't require a config repo and a dedicated
engineer to maintain it**. Unlike **in-house DIY**, we **ship a
production-quality default in a day**.
`,

  'us/market/objections.md': `---
kind: us.market.objections
---

# Common objections + our answers

- **"Why not Datadog?"** → DD is priced for the Fortune 500 ops team, not for a 30-person eng org. Our customers see 40–60% lower spend at the same coverage, because we generate the right retention/alert rules instead of the maximal ones.
- **"Why not Honeycomb?"** → Honeycomb is a query engine. We ship product-ready dashboards day one. Many of our customers start with Honeycomb + us, then drop Honeycomb.
- **"Why not OpenTelemetry + Grafana?"** → That's a valid path; it typically takes 1 engineer 2–3 quarters to make it production-ready. Our time-to-green-dashboard is a day.
- **"Security — where does the data live?"** → Your choice of us-west-2 / eu-central-1 / ap-southeast-1. SOC2 Type II, HIPAA on Scale+. VPC peering on Scale+. No training on your data.
- **"Lock-in."** → Schema is yours (just TypeScript/Python types). One-way OTel export so you can leave with a week's notice.
`,

  'us/brand/voice.md': `---
kind: us.brand.voice
---

# Brand voice — Acme Cloud

## Tone
Technically precise, a little dry, never breathless. Sound like a
senior engineer writing a postmortem — direct, specific, willing to
admit tradeoffs.

## Always
- Name the real constraint (cost, headcount, migration path)
- Include one concrete number in every claim
- Use the product's actual feature name, not a marketing synonym

## Never
- "leverage", "robust", "cutting-edge", "seamless", "frictionless",
  "game-changing", "revolutionary"
- "In today's fast-paced world…"
- Fake urgency ("limited time")
- Hashtag walls

## Length caps
- Email first-touch: 90 words
- LinkedIn DM: 60 words
- Tweet: 270 chars
`,

  'us/brand/messaging.md': `---
kind: us.brand.messaging
---

# Messaging by audience

## Champion (engineer who'd integrate the SDK)
"Your schema is already the source of truth for types. It should also
be the source of truth for dashboards and alerts. We make that real in
one decorator."

## Economic buyer (VP Eng / Director Platform)
"You'll cut your DD line item ~50% and avoid hiring an SRE for the
next 6 months. We're one line in the budget, not a platform migration."

## Executive sponsor (CTO)
"Your engineers are already writing the schema. We turn it into
production-grade observability without another hire or another tool
to administer."

## Security / procurement
"SOC2 Type II, HIPAA on Scale. EU / US / APAC data residency.
VPC peering on Scale and above. No training on customer data."
`,

  'us/brand/visual.md': `---
kind: us.brand.visual
---

# Visual identity

- Primary color: graphite \`#1B1D1F\`
- Accent color: signal orange \`#F36A3C\`
- Typeface (UI): Inter
- Typeface (code): JetBrains Mono
- Logo mark: two concentric rings with a signal dot
- Canonical tagline: *Observability your engineers actually finish setting up.*
`,

  'us/brand/press.md': `---
kind: us.brand.press
---

# Press & proof

## Published coverage (fictional demo)
- "Acme Cloud's schema-first bet" — Obs Weekly, 2026-02
- "The companies trying to unseat Datadog" — InfoTrade Daily, 2025-11

## Awards / rankings (fictional demo)
- SaaStr 2025 "Best Developer Tool, Rising Star"

## Quotable customer lines (approved, fictional demo)
- "We shut off our Datadog trial the week we shipped Acme." — VP Eng, Globex Corp
- "First week: six alerts that would've been 3am pages two months from now." — Platform Lead, Initech
`,

  'us/competitors/landscape.md': `---
kind: us.competitors.landscape
---

# Competitive landscape

| Competitor | Angle they lead with | What they do better | What we do better | Migration hook |
|---|---|---|---|---|
| Datadog | The enterprise standard | Breadth, mature integrations | Price, time-to-value, zero config | ~40-60% cost cut at same coverage |
| Honeycomb | High-cardinality query power | Power-user query UX | Starter dashboards, alerts, cost | Can stay on HC and add us |
| New Relic | "Full-stack" bundle | Sales reach into F500 | Leaner cost, cleaner data model | Our SDK auto-migrates NR agents |
| Grafana Cloud | OSS story, composable | Dashboards flexibility | No ops team needed | We export to Grafana read-only |
| DIY OpenTelemetry | "Own your stack" | Max control | Ready-to-ship out of box | Start with us, keep OTel export |
`,

  'us/competitors/datadog.md': `---
kind: us.competitor
name: Datadog
website: https://datadoghq.com
---

# Datadog — teardown

## One-line positioning
Swiss-army observability platform for big enterprise ops orgs.

## What they do well
- Breadth — if a system has a log, DD has an integration
- Enterprise sales reach
- Mature SOC2/FedRAMP/SOX story

## Where our ICP hurts
- Pricing opacity; bills regularly surprise engineering leaders 3-5x month-over-month during traffic spikes
- Config sprawl — many teams end up with a dedicated "DD admin"
- Custom metric retention gotchas

## How to counter-position
- Lead with **cost predictability** + **zero-config**.
- Quote: "You'll save us 40–60% and skip the SRE hire."
- Never dunk on DD directly; acknowledge it's the right choice for F500.
`,

  'us/customers/top.md': `---
kind: us.customers.top
---

# Top customers (fictional demo)

| Customer | Industry | Size | Why they won | Reference? |
|---|---|---|---|---|
| Globex Corp | B2B SaaS | 220 eng | Moving off DD, needed predictable cost | ✓ public |
| Initech | Fintech API | 110 eng | First observability tool, no SRE hire yet | ✓ quote only |
| Soylent Systems | Dev tools | 40 eng | Needed schema-first approach for their own SDK | ✓ logo only |
| Wayne Industries | Marketplace | 380 eng | Enterprise (VPC peering, HIPAA) | — |
| Umbrella Labs | Gaming | 60 eng | Alerts that understood backfill jobs | ✓ public |
`,

  'us/customers/globex.md': `---
kind: us.customer
name: Globex Corp
industry: B2B SaaS (HR)
size: 220 engineers
website: https://globex.example
reference_level: public
---

# Globex Corp — case study (fictional demo)

## Before
- Datadog, ~\$480k / year
- 1 full-time "Datadog admin" on the platform team
- PR reviews regularly blocked on alert-config refactors

## After (6 months)
- Acme Cloud Scale tier, ~\$210k / year (56% reduction)
- "Datadog admin" role redeployed to platform infra work
- Alert config lives in the same repo as the code it covers
- 31% drop in false-positive pages (measured on their on-call roster)

## The quote
> "We shut off our Datadog trial the week we shipped Acme."
> — VP Engineering, Globex Corp
`,

  'us/team/roster.md': `---
kind: us.team.roster
---

# Team (fictional demo)

| Name | Role | Joined | LinkedIn | Notes |
|---|---|---|---|---|
| Rae Novak | CEO, co-founder | 2022-02 | — | ex-Principal SRE at a large SaaS |
| Yuri Ramos | CTO, co-founder | 2022-02 | — | ex-Staff Eng, compiler team |
| Priya Desai | VP Eng | 2023-07 | — | ex-Engineering Director, observability vendor |
| Chen Li | Head of GTM | 2024-01 | — | ex-RevOps at two Series-D SaaS |
`,

  'us/team/hiring.md': `---
kind: us.team.hiring
---

# Hiring (fictional demo)

## Open roles
- Staff Engineer, Alerting
- Founding Enterprise AE (East Coast)
- Technical Marketing Manager
- Developer Advocate (remote EU)

## Signal we bias toward
- Has shipped something small and owned it end-to-end for 12+ months
- Can explain their last production incident without reaching for jargon
- Writes clearly in async tools (Slack, GitHub, notion)
`,

  'us/strategy/north-star.md': `---
kind: us.strategy.north-star
---

# North star

## One sentence
In three years, when a 40-engineer startup thinks "we need to set up
observability," the reflex answer is *Acme Cloud* — not "hire an SRE,"
and not "evaluate Datadog vs Honeycomb for a quarter."

## Strategic pillars
1. **Time-to-green-dashboard ≤ 1 day** on any stack we support
2. **Transparent price, no surprise bills** — every Acme invoice predictable to ±10%
3. **Schema as contract** — dashboards/alerts/cost all derive from the code engineers already write
`,

  'us/strategy/goals.md': `---
kind: us.strategy.goals
year: 2026
---

# Goals — 2026 (fictional demo)

## Revenue
- \$12M ARR by Q4
- 28% logo net-revenue retention
- ≥ 40% of new ARR from outbound

## Product
- Azure VPC peering GA (Q3)
- Self-hosted control plane closed alpha (Q4)
- Python 3.13 SDK GA (Q2)

## Team
- Hire VP Sales (Q2)
- First EU-based Enterprise AE (Q3)
- No more than +30 headcount end-to-end
`,

  'us/strategy/decisions.md': `---
kind: us.strategy.decisions
---

# Decisions log (fictional demo)

## 2026-01-15 — Skip self-hosted tier until Scale customers ask
Decision: only enterprise contracts can request self-hosted; otherwise,
cloud-only.
Reasoning: the support surface doubles with on-prem; our 72-person team
can't sustain both motions yet.
Alternatives considered:
- "Build self-hosted as a differentiator" — rejected, too early.
- "Never build self-hosted" — rejected; several Enterprise deals hinge on it.

## 2025-11-04 — Invest in cost-attribution before LLM-assisted alerting
Decision: prioritise per-endpoint \$/1k requests over LLM-based alert
tuning.
Reasoning: prospects consistently cite "my DD bill is unpredictable" as
their #1 pain; "my alert rules are a mess" is #3.
Alternatives considered:
- Both in parallel — rejected, too many open fronts.
- Neither, focus on enterprise deals — rejected, we'd lose the
  mid-market narrative.
`,

  // Prospect-side demo — so the user has something to run a Playbook against.
  'companies/globex-example.md': `---
kind: company
domain: globex.example
name: Globex Corp
industry: B2B SaaS (HR)
size: "200-500"
revenue: "$20M-$50M"
hq: San Francisco
icp_score: 91
icp_reasons:
  - "220 eng team, right band"
  - "Recent Datadog renewal visible via job posting for 'Platform Engineer, DD admin'"
  - "Posted 3 new SRE roles in Q1 → reactive, not proactive stance"
---

# Globex Corp (demo prospect)

Enterprise HR SaaS. Series D, ~1,100 employees, ~220 in engineering.
Known to be on Datadog; Q1 job postings suggest they're staffing
up an observability admin team (reactive signal).

**Buying committee hypothesis**
- Champion: a platform engineer on the DD-admin team
- Economic buyer: VP Engineering
- Blocker: InfoSec (SOC2 renewal due Q3 per annual report)
`,

  'contacts/globex-example/pat-chen.md': `---
kind: contact
company: globex.example
name: Pat Chen
role: Senior Platform Engineer
seniority: ic
linkedin: https://linkedin.com/in/pat-chen-demo
email: pat@globex.example
email_source: unknown
posture: champion
---

Pat owns the Datadog setup at Globex. LinkedIn bio: "Making Datadog
not terrible." Ideal champion — already has internal credibility on
this topic.
`,

  'deals/open/globex-q2.md': `---
kind: deal
state: open
company: globex.example
amount_usd: 210000
stage: proposal
open_date: 2026-02-12
close_date:
owner: me
next_step: "Security review with Globex InfoSec (Thu)"
health: yellow
competitors: ["Datadog"]
---

# Globex Corp — Q2 (demo deal)

Proposal submitted 2026-02-12. They're comparing us against incumbent
Datadog renewal. Champion (Pat Chen) bought in; economic buyer
aligned. Risk: SOC2 signature from InfoSec, scheduled Thu.
`,
};

export async function seedAcmeDemo(vaultRoot: string): Promise<{ written: number }> {
  let written = 0;
  for (const [rel, body] of Object.entries(ACME_DEMO_FILES)) {
    const abs = path.join(vaultRoot, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body, 'utf-8');
    written++;
  }
  // Stamp the company's own CLAUDE.md with the demo one-liner so the
  // agent understands the context on the very first turn.
  const claudePath = path.join(vaultRoot, 'CLAUDE.md');
  try {
    const cur = await fs.readFile(claudePath, 'utf-8');
    if (cur.includes('_One paragraph: what you sell, to whom._') || cur.includes('# Your AI GTM engineer') || cur.includes('# Identity — read this before every answer')) {
      const stamped = cur
        .replace(/## Our Company[\s\S]*?(?=\n## )/, `## Our Company\n\nAcme Cloud — schema-first observability for serverless teams. See \`us/\` for the full pack. This is **fictional demo data**; overwrite once the user is ready.\n\n`);
      if (stamped !== cur) {
        await fs.writeFile(claudePath, stamped, 'utf-8');
      }
    }
  } catch {}
  return { written };
}
