// Vercel demo — fictional but realistic company data for try-before-signing-in demos.
//
// Uses Vercel as the example organization because it's a well-known B2B company
// every evaluator recognises. Numbers below (ARR, headcount, specific customers)
// are illustrative — the shape and motion is right, the exact figures are not
// audited. Overwrite with the user's real vault via `bootstrap-self` once they sign in.

import fs from 'node:fs/promises';
import path from 'node:path';

export const VERCEL_DEMO_FILES: Record<string, string> = {
  'us/company.md': `---
kind: us.company
name: Vercel
domain: vercel.com
one_liner: The Frontend Cloud — develop, preview, and ship Next.js and any other frontend.
stage: Series E
founded: 2015
hq: San Francisco, CA
employee_count: "600"
founders: ["Guillermo Rauch"]
website: https://vercel.com
blog: https://vercel.com/blog
docs: https://vercel.com/docs
linkedin: https://linkedin.com/company/vercel
twitter: "@vercel"
---

# Us — Vercel

Vercel is the Frontend Cloud. We give developers frameworks, workflows, and
infrastructure to build a faster, more personalized web. Next.js (which we
maintain) powers millions of sites; the Vercel platform takes that runtime
and wraps it in global edge delivery, previews on every PR, and first-class
integrations with the tools engineers already use.

All data on this page is **fictional demo content** meant for first-run
evaluation. Overwrite it with your real company or run the
\`bootstrap-self\` Playbook.
`,

  'us/product/overview.md': `---
kind: us.product.overview
---

# What Vercel sells

## Offer
A managed Frontend Cloud: \`git push\` deploys a preview URL within seconds,
production on merge, with built-in observability, edge caching, image
optimization, and server functions across 100+ regions.

## Core differentiators
- **Native Next.js runtime**: built by the team that maintains the framework
- **Preview for every PR**: every branch gets a shareable URL with the same perf as prod
- **Edge-first**: Functions, Middleware, and ISR run at the network edge, not in one region
- **Managed infra, zero YAML**: no Terraform, no Helm, no \`kubectl\` for a frontend team
`,

  'us/product/pricing.md': `---
kind: us.product.pricing
---

# Pricing (public)

| Plan | Monthly | Included | Overage |
|---|---|---|---|
| Hobby | \$0 | Personal projects · 100GB bandwidth · 1 seat | n/a |
| Pro | \$20 / seat | Commercial use · 1TB bandwidth · preview comments · analytics | metered |
| Enterprise | custom | SSO/SAML, SOC2, dedicated support, SLA, isolated build infra | — |

## Notes
- Annual discount on Enterprise, negotiated per contract
- Typical paid ACV for mid-market: \$30k–\$250k
- Free Hobby tier is the top-of-funnel; conversion happens when a side project becomes a business
`,

  'us/product/features.md': `---
kind: us.product.features
---

# Feature map

## Build & Deploy
- Git-connected deploys (GitHub, GitLab, Bitbucket)
- Preview URL per PR, with comments and visual diffs
- Zero-config builds for Next.js, Nuxt, SvelteKit, Astro, Remix, Vite, etc.

## Runtime
- Edge Functions (V8 isolates, sub-50ms cold starts)
- Serverless Functions (Node.js / Python / Go)
- Edge Middleware for auth, A/B, i18n before the cache
- ISR / On-Demand Revalidation / Streaming

## Delivery
- Global edge network (100+ regions)
- Automatic image optimization (AVIF/WebP)
- Smart CDN with per-route cache control

## Observability & DX
- Web Analytics, Speed Insights, Logs, Runtime Logs
- Monitoring (custom alerts on performance regressions)
- Integrations marketplace (Sentry, Datadog, Neon, Upstash, etc.)
`,

  'us/product/integrations.md': `---
kind: us.product.integrations
---

# Integrations

| Category | Tool | Status | Depth |
|---|---|---|---|
| Git | GitHub | GA | native, first-class |
| Git | GitLab | GA | native |
| Git | Bitbucket | GA | native |
| Storage | Neon (Postgres) | GA | marketplace, auto-provisioned env vars |
| Storage | Upstash (Redis / Kafka) | GA | marketplace |
| Storage | Vercel Blob / KV / Postgres | GA | first-party |
| Observability | Sentry | GA | source maps + traces |
| Observability | Datadog | GA | logs + metrics forwarding |
| Auth | Clerk | GA | marketplace, native Next.js SDK |
| CMS | Sanity / Contentful / Payload | GA | marketplace |
| AI | OpenAI / Anthropic / AI Gateway | GA | first-party AI SDK |
| SSO | Okta / Azure AD / Google Workspace | GA | Enterprise |
`,

  'us/product/roadmap.md': `---
kind: us.product.roadmap
---

# Roadmap (public)

## Now — Q2
- Fluid Compute GA across all regions
- AI SDK v6 (tool use, structured output improvements)
- Next.js 16 Cache Components GA

## Next — Q3
- Vercel Sandbox (ephemeral microVMs for AI-generated code) GA
- Workflow DevKit 1.0 — durable workflows with step-based execution
- Runtime Cache API expansion

## Later
- Self-hosted Enterprise control plane
- Expanded global edge regions (Africa, South America)
- Deeper first-party AI observability
`,

  'us/market/icp.md': `---
kind: us.market.icp
---

# ICP — who Vercel sells to

## Size
- Employee range: 50–5,000
- Frontend / web team: 5–200 engineers
- ARR: \$10M–\$2B

## Industries
- B2B SaaS (marketing sites + product UI)
- E-commerce (headless, high-traffic storefronts)
- Media / publishers
- AI-native products shipping agents and copilots

## Tech stack signals
We fit best when the prospect already uses:
- Next.js, React, or is migrating off a legacy frontend (Rails views, WordPress, AEM)
- GitHub or GitLab for code hosting
- Headless CMS (Sanity, Contentful, Payload) or wants to move to one
- AWS or GCP as their backend cloud (we complement, not replace)

## Geos
- US, Canada
- UK, Germany, France, Netherlands, Nordics
- Japan, Australia, Singapore

## Pain indicators that mean "now is a good time"
- Migrating from Pages Router to App Router on Next.js
- Shipping an AI feature (chat, agent, copilot) — latency matters
- Replatforming e-commerce from Shopify Liquid / Magento
- Hiring a "Head of Platform" or "Director of Web Engineering"
- Self-hosted Next.js on ECS / Kubernetes that's become a full-time ops job

## Anti-signals (don't chase)
- Pure backend / API shops with no user-facing web
- WordPress-only marketing teams with no engineering org
- Teams happy on Netlify or Cloudflare Pages with no growth pain
`,

  'us/market/segments.md': `---
kind: us.market.segments
---

# Market segments

| Segment | Typical buyer | Typical ACV | Motion |
|---|---|---|---|
| Indie / Hobby | Individual developer | \$0 | PLG self-serve |
| Pro / Startup | Founding engineer or tech lead | \$1k–\$15k | PLG seat expansion |
| Growth (Series B–D) | VP Engineering / Head of Platform | \$30k–\$120k | Hybrid PLG + outbound |
| Mid-market | Director of Platform / CTO | \$120k–\$400k | Sales-led, annual contracts |
| Enterprise | VP Platform / SVP Eng | \$400k+ | Field sales, SOC2 / MSA, custom MSA |
`,

  'us/market/positioning.md': `---
kind: us.market.positioning
---

# Positioning — Vercel

## Category
**Frontend Cloud.** Adjacent to AWS Amplify, Netlify, and Cloudflare Pages,
but aimed at teams that want a platform purpose-built for modern web
frameworks — especially Next.js — with managed infra, previews, and edge
delivery out of the box.

## Positioning statement
For **product and platform engineering teams at Series-B-through-Enterprise
companies** who **need to ship fast user-facing web experiences without
staffing a full platform team**, **Vercel** is a **Frontend Cloud** that
**turns \`git push\` into a globally-delivered preview or production deploy
with zero infra overhead**. Unlike **AWS Amplify**, we **understand Next.js
natively**. Unlike **self-hosted Next.js**, we **ship edge, previews, and
observability as the default**.
`,

  'us/market/objections.md': `---
kind: us.market.objections
---

# Common objections + our answers

- **"Why not self-host Next.js on AWS / GCP?"** → You can. Many teams do and spend 1–2 engineers maintaining build pipelines, edge caching, and preview environments. Vercel is the managed version of that stack, built by the Next.js maintainers.
- **"Why not Netlify?"** → Netlify is a peer. Teams pick us when they're deep on Next.js (App Router, Server Components, ISR, Edge Middleware) because we ship those features first and most reliably.
- **"Why not Cloudflare Pages?"** → CF Pages is cheaper per-request, but doesn't run full Next.js natively (no ISR, limited Server Components). If your app is pure static or Workers-first, CF is fine. If it's Next.js, we're the canonical runtime.
- **"Pricing gets unpredictable."** → Spend Management lets you set hard caps. Enterprise contracts come with committed-spend pricing and predictable invoices.
- **"Lock-in."** → Everything runs on open-source Next.js. You can self-host any Vercel deployment on Node or Docker with \`next start\`. The build output is portable.
- **"Security — where does the data live?"** → US / EU regions, SOC2 Type II, HIPAA on Enterprise, ISO 27001. SSO/SAML and audit logs on Enterprise.
`,

  'us/brand/voice.md': `---
kind: us.brand.voice
---

# Brand voice — Vercel

## Tone
Precise, developer-first, quietly confident. Sound like a senior engineer
who respects the reader's time — specific, honest about tradeoffs, allergic
to marketing puff.

## Always
- Lead with the concrete developer experience (\`git push\`, \`vercel deploy\`, a screenshot)
- Include a number or benchmark when making a performance claim
- Name the actual framework / tool, not a category abstraction

## Never
- "synergy", "leverage", "seamless", "cutting-edge", "revolutionary"
- "In today's fast-paced world…"
- Fake urgency, fake scarcity
- Dunk on competitors by name

## Length caps
- Email first-touch: 90 words
- LinkedIn DM: 60 words
- Tweet: 270 chars
`,

  'us/brand/messaging.md': `---
kind: us.brand.messaging
---

# Messaging by audience

## Champion (Next.js developer / tech lead)
"Stop babysitting a custom build pipeline. \`git push\` gives you a preview
URL your PM can click on — with the same edge performance as prod."

## Economic buyer (VP Eng / Head of Platform)
"Your team ships features, not infra. Vercel replaces the 2–3 engineers
you'd need to maintain a homegrown Next.js platform, with predictable
commit-based pricing."

## Executive sponsor (CTO / SVP Eng)
"We're the Frontend Cloud. Your web experience — marketing, product UI,
AI features — ships on the platform built by the framework's maintainers,
with SOC2, SSO, and enterprise-grade SLAs."

## Security / procurement
"SOC2 Type II, ISO 27001, HIPAA on Enterprise. US / EU data residency.
SAML SSO, audit logs, custom MSA. No training on customer data."
`,

  'us/brand/visual.md': `---
kind: us.brand.visual
---

# Visual identity

- Primary color: black \`#000000\`
- Background: white \`#FFFFFF\`
- Logo mark: the triangle (two-color gradient on dark, solid on light)
- Typeface (UI): Geist Sans (open-source, built in-house)
- Typeface (code): Geist Mono
- Tone of imagery: high-contrast, minimal, architectural
- Canonical tagline: *Develop. Preview. Ship.*
`,

  'us/brand/press.md': `---
kind: us.brand.press
---

# Press & proof

## Published coverage (fictional demo, illustrative)
- "The frontend platform eating the Jamstack" — TechCrunch, 2025-11
- "Why AI startups are all on Vercel" — The Information, 2026-01

## Awards / rankings (fictional demo)
- Stack Overflow Developer Survey — "Most loved deployment platform," 2025
- ProductHunt Golden Kitty — "Developer Tool of the Year," 2024

## Quotable customer lines (approved, fictional demo)
- "Previews-per-PR changed how our PMs work." — VP Eng, Ramp
- "We ship Next.js features on the day they're released, not the quarter after." — Staff Eng, Notion
`,

  'us/competitors/landscape.md': `---
kind: us.competitors.landscape
---

# Competitive landscape

| Competitor | Angle they lead with | What they do better | What we do better | Migration hook |
|---|---|---|---|---|
| Netlify | "Original Jamstack platform" | Static site simplicity, plugins ecosystem | Next.js-native features, edge, previews | \`vercel link\` + import from git, zero downtime |
| Cloudflare Pages / Workers | "Cheapest per request" | Raw cost at scale for Workers-native apps | Full Next.js support (ISR, RSC, Middleware) | We coexist — run DB/CDN on CF, app on us |
| AWS Amplify | "Native to AWS" | Deep AWS service integration | DX, previews, Next.js feature velocity | Amplify-to-Vercel import in docs |
| Self-hosted Next.js | "Full control" | Maximum flexibility | Zero infra overhead, previews, observability out of the box | Portable — self-host anytime |
| Render / Railway | "Full-stack simplicity" | Backend + DB + frontend in one | Frontend-native DX, global edge | Keep backend on Render, frontend on us |
`,

  'us/competitors/netlify.md': `---
kind: us.competitor
name: Netlify
website: https://netlify.com
---

# Netlify — teardown

## One-line positioning
The original Jamstack platform; broad static site + plugin ecosystem.

## What they do well
- Long-standing static-site mindshare
- Plugin ecosystem for build-time transforms
- Strong brand with marketing/content teams

## Where our ICP hurts (relative)
- Next.js feature parity lags the upstream framework
- Edge runtime less mature for complex Server Component trees
- Preview performance diverges from prod on heavier apps

## How to counter-position
- Lead with **Next.js-native** DX and **App Router** feature velocity
- Quote: "We ship Next.js features on day one, not next quarter."
- Never dunk on Netlify by name; respect the category lineage.
`,

  'us/competitors/cloudflare.md': `---
kind: us.competitor
name: Cloudflare Pages
website: https://pages.cloudflare.com
---

# Cloudflare Pages — teardown

## One-line positioning
Cheapest edge deployment for Workers-native or mostly-static apps.

## What they do well
- Best-in-class raw edge pricing
- Deep integration with Workers, R2, D1, KV
- Excellent DNS + security story (owned stack)

## Where our ICP hurts (relative)
- Full Next.js support is incomplete (ISR, certain RSC patterns)
- Build/preview DX less polished for framework-native teams
- No first-class preview comments / team collaboration on builds

## How to counter-position
- Lead with **full Next.js runtime** and **preview collaboration**
- Position CF as a **complement** for DB/storage, not a replacement
- Many customers run DB on CF, app on us — don't frame it as either/or
`,

  'us/customers/top.md': `---
kind: us.customers.top
---

# Top customers (illustrative demo)

| Customer | Industry | Size | Why they won | Reference? |
|---|---|---|---|---|
| Ramp | Fintech / B2B SaaS | 1,000+ | Fast Next.js shipping velocity, previews for product | ✓ public |
| Notion | Productivity | 800+ | Marketing site + some product surfaces on Next.js | ✓ logo only |
| Runway | AI / creative tools | 300+ | High-traffic edge delivery, AI feature previews | ✓ public |
| Sonos | Consumer hardware | 1,800+ | Global e-commerce on edge | ✓ logo only |
| Under Armour | E-commerce | 15,000+ | Headless replatform off legacy CMS | ✓ public |
`,

  'us/customers/ramp.md': `---
kind: us.customer
name: Ramp
industry: Fintech / B2B SaaS
size: 1,000+
website: https://ramp.com
reference_level: public
---

# Ramp — case study (illustrative demo)

## Before
- Self-hosted Next.js on ECS
- 2 platform engineers maintaining build pipelines + preview infra
- Preview environments were manual, shared, and often stale

## After (12 months on Vercel)
- Every PR gets an isolated preview URL with prod-parity edge caching
- Platform team redeployed to backend + data infra
- Marketing site and in-product surfaces ship independently on the same platform
- Build times cut ~40% via remote caching

## The quote
> "Previews-per-PR changed how our PMs work."
> — VP Engineering, Ramp
`,

  'us/team/roster.md': `---
kind: us.team.roster
---

# Team (illustrative demo)

| Name | Role | Joined | LinkedIn | Notes |
|---|---|---|---|---|
| Guillermo Rauch | CEO, founder | 2015 | https://linkedin.com/in/rauchg | creator of Next.js, ex-Automattic |
| Tom Occhino | VP Engineering | 2022 | — | ex-Meta, led React team |
| Lee Robinson | VP Product | 2020 | — | ex-Hy-Vee, DX lead for Next.js |
| Malte Ubl | CTO | 2022 | — | ex-Google, tech lead for AMP |
`,

  'us/team/hiring.md': `---
kind: us.team.hiring
---

# Hiring (illustrative demo)

## Open roles
- Staff Engineer, Edge Runtime
- Enterprise AE (East Coast, UK)
- Developer Advocate — AI workloads
- Technical Product Marketing Manager

## Signal we bias toward
- Ships meaningful open-source or has a public body of technical work
- Explains tradeoffs clearly — recognises when "it depends" is the honest answer
- Writes well in async tools (GitHub, Slack, Notion)
`,

  'us/strategy/north-star.md': `---
kind: us.strategy.north-star
---

# North star

## One sentence
When a team builds anything on the modern web — a marketing site, a
product UI, an AI copilot — the default answer is *ship it on Vercel*,
because the framework and the platform were designed together.

## Strategic pillars
1. **Framework-defined infrastructure** — the platform evolves with Next.js, not behind it
2. **Zero to production in a commit** — \`git push\` remains the only deploy command that matters
3. **Edge-first, globally** — every byte served from the closest region, every function invoked where the user is
`,

  'us/strategy/goals.md': `---
kind: us.strategy.goals
year: 2026
---

# Goals — 2026 (illustrative demo)

## Revenue
- Grow Enterprise ACV mix past 50% of total ARR
- Land-and-expand NRR ≥ 130% on Pro + Enterprise combined
- AI-native accounts: 30% of new Enterprise logos

## Product
- Fluid Compute GA everywhere (Q2)
- Workflow DevKit 1.0 (Q3)
- Cache Components + App Router defaults for new projects (Q2)

## Team
- Scale Enterprise AE bench in EMEA and APAC
- DevRel coverage for AI / agents specifically
- Maintain hiring bar on Staff/Principal engineering
`,

  'us/strategy/decisions.md': `---
kind: us.strategy.decisions
---

# Decisions log (illustrative demo)

## 2026-01-20 — Ship Fluid Compute as the default runtime
Decision: new projects default to Fluid Compute; classic Serverless remains
opt-in.
Reasoning: Fluid gives better cold-start, concurrency, and price-per-
invocation for the typical Next.js workload. Defaults drive adoption.
Alternatives considered:
- Keep Serverless default and let power users opt in to Fluid — rejected,
  too slow a rollout.
- Force-migrate all projects — rejected, breaks contracts for apps tuned
  to Serverless behavior.

## 2025-10-08 — Invest in AI SDK as first-party product
Decision: AI SDK is a strategic product, not a devrel side project.
Reasoning: AI-native companies build on Next.js by default; owning the
SDK surface keeps us on the short path for streaming, tools, and agent
primitives.
Alternatives considered:
- Rely on LangChain / LlamaIndex — rejected, too opinionated and slow.
- Only provide primitives via platform APIs — rejected, DX gap too big.
`,

  // Prospect-side demo — so the user has something to run a Playbook against.
  'companies/ramp-demo.md': `---
kind: company
domain: ramp.com
name: Ramp
industry: Fintech / B2B SaaS
size: "1000-5000"
revenue: "$300M+ ARR"
hq: New York
icp_score: 94
icp_reasons:
  - "Already a reference customer — expansion territory, not net-new"
  - "Deep Next.js adoption across marketing + product surfaces"
  - "Hiring for 'Staff Platform Engineer, Web' — web platform is a priority"
---

# Ramp (demo prospect)

Spend management fintech. ~1,000+ employees, heavy Next.js + TypeScript
stack. Already on Vercel Enterprise; this record is scoped to a potential
expansion into their new AI-assisted expenses surface.

**Buying committee hypothesis**
- Champion: Staff Platform Engineer on Web Infra
- Economic buyer: VP Engineering (existing sponsor on current contract)
- Blocker: Security review for new AI workload edge functions
`,

  'contacts/ramp-demo/alex-rivera.md': `---
kind: contact
company: ramp.com
name: Alex Rivera
role: Staff Platform Engineer, Web
seniority: staff
linkedin: https://linkedin.com/in/alex-rivera-demo
email: alex@ramp.com
email_source: unknown
posture: champion
---

Alex owns Ramp's Next.js platform layer. Publicly talks about preview
environments and build caching — ideal champion for an AI-workload
expansion conversation.
`,

  'deals/open/ramp-ai-expansion.md': `---
kind: deal
state: open
company: ramp.com
amount_usd: 180000
stage: discovery
open_date: 2026-03-04
close_date:
owner: me
next_step: "Technical scoping call with Alex + platform lead (Wed)"
health: green
competitors: ["self-host"]
---

# Ramp — AI Expansion (demo deal)

Expansion conversation on top of an existing Enterprise contract.
Scope: edge functions + AI SDK usage for their new AI-assisted
expense workflows. Champion is bought in; economic buyer already
sponsors the existing contract. Main risk: security review for the
new AI workload shape, scheduled next week.
`,
};

export async function seedVercelDemo(vaultRoot: string): Promise<{ written: number }> {
  let written = 0;
  for (const [rel, body] of Object.entries(VERCEL_DEMO_FILES)) {
    const abs = path.join(vaultRoot, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body, 'utf-8');
    written++;
  }
  const claudePath = path.join(vaultRoot, 'CLAUDE.md');
  try {
    const cur = await fs.readFile(claudePath, 'utf-8');
    if (cur.includes('_One paragraph: what you sell, to whom._') || cur.includes('# Your AI GTM engineer') || cur.includes('# Identity — read this before every answer')) {
      const stamped = cur
        .replace(/## Our Company[\s\S]*?(?=\n## )/, `## Our Company\n\nVercel — the Frontend Cloud. See \`us/\` for the full pack. This is **illustrative demo data** modelled on the real company; overwrite once the user is ready.\n\n`);
      if (stamped !== cur) {
        await fs.writeFile(claudePath, stamped, 'utf-8');
      }
    }
  } catch {}
  return { written };
}
