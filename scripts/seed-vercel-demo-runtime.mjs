#!/usr/bin/env node
// Seed the Vercel demo vault (~/BlackMagic-vercel) with realistic
// runtime data: past runs, pending drafts, chat threads. Without this
// the Home page shows a wall of zeros on a fresh install, which looks
// broken even though the product is fine. Idempotent — re-running
// overwrites the same seed files in place.
//
// Usage: node scripts/seed-vercel-demo-runtime.mjs [vaultPath]
//        defaults to ~/BlackMagic-vercel

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const VAULT = process.argv[2] || path.join(os.homedir(), 'BlackMagic-vercel');

function iso(d) { return d.toISOString(); }
function runIdFor(d, slug) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const stamp =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}-${pad(d.getUTCMilliseconds(), 3)}Z`;
  return `${stamp}-${slug}`;
}

const RUN_TEMPLATES = [
  {
    agent: 'lookalike-discovery',
    prompt: 'Find 20 lookalike accounts for Linear based on our closed-won deals from Q3.',
    final: '# Lookalike discovery — Linear cohort\n\nIdentified 23 accounts matching the Linear profile (dev-tools, Series B+, 50–500 employees, GitHub-heavy stack).\n\n## Top matches\n- **Raycast** (89% similarity) — shared tech stack, overlapping design-tool buyers\n- **Arc Browser** (84%) — dev-first distribution, Slack presence\n- **Warp** (82%) — terminal tooling, Y Combinator alum\n- **Zed** (80%) — editor space, recent Series A\n\n23 accounts written to `companies/` with enriched firmographics. Next: run outbound-sequencer against this cohort.',
    preview: 'Found 23 lookalike accounts matching Linear profile',
  },
  {
    agent: 'linkedin-outreach',
    prompt: 'Warm-DM anyone who liked Guillermo\'s last post about Vercel AI SDK.',
    final: '# LinkedIn outreach — AI SDK engagement\n\nScraped 147 likers on Guillermo\'s post. Filtered down to 34 ICP matches (CTOs / Heads of Eng at Series A-C SaaS).\n\nDrafted 34 personalized DMs, queued for your approval in **Desk → Outreach**. Each DM references a specific technical detail from their public GitHub or company blog.',
    preview: 'Drafted 34 DMs for AI SDK post engagement',
  },
  {
    agent: 'website-visitor',
    prompt: 'Who visited /pricing in the last 7 days from Series B+ companies?',
    final: '# Website visitor de-anon\n\nRB2B identified **18 companies** with /pricing visits in the last 7 days. Of those, 11 are Series B+.\n\n## Priority accounts\n- **Ramp** — 4 sessions, viewed /enterprise twice\n- **Brex** — 2 sessions, CTO pageview\n- **Deel** — 3 sessions, /security/soc2\n- **Notion** — 1 deep session (14min)\n\nAdded to `companies/` with visit metadata. Recommend routing to AE for outbound.',
    preview: '18 companies visited /pricing, 11 are Series B+',
  },
  {
    agent: 'outbound',
    prompt: 'Build a 5-touch sequence for the lookalike cohort from last week.',
    final: '# Outbound sequence — Linear lookalikes\n\n5-touch sequence drafted:\n\n1. **Day 0** — Cold email (technical hook, ref shared stack)\n2. **Day 2** — LinkedIn connection (no pitch)\n3. **Day 5** — Email follow-up (case study)\n4. **Day 9** — LinkedIn DM (if connected)\n5. **Day 14** — Breakup email\n\nPersonalization tokens: `{{company.funding_stage}}`, `{{company.github_org}}`, `{{contact.recent_post}}`.\n\n23 accounts × 5 touches = 115 scheduled sends. Awaiting approval in Desk.',
    preview: '5-touch sequence for 23 Linear-lookalike accounts',
  },
  {
    agent: 'meeting-prep',
    prompt: 'Brief for tomorrow\'s call with Ramp — who\'s attending, what do they care about?',
    final: '# Meeting prep — Ramp (Fri 10am)\n\n## Attendees\n- **Eric Glyman** (CEO, cofounder) — technical background, ex-Lithic\n- **Karim Atiyeh** (CTO) — Princeton CS, shipped corporate cards infra\n- **Sarah Chen** (VP Eng) — joined Q2 from Stripe\n\n## What they care about\n- AI-assisted bookkeeping (recent blog post, 2 weeks ago)\n- Vendor consolidation (cut 40 tools → 12 last year)\n- SOC 2 Type II, fine-grained SSO\n\n## Open tabs they\'ll have\n- Pricing page (Eric visited 3× this week)\n- AI SDK docs\n\n## Suggested opening\nLead with the AI bookkeeping angle — tie to our AI Gateway, ask about their inference cost per receipt.',
    preview: 'Meeting brief: Ramp (Eric, Karim, Sarah) — AI bookkeeping angle',
  },
  {
    agent: 'pipeline-ops',
    prompt: 'Which deals in stage "Negotiation" haven\'t moved in 14+ days?',
    final: '# Stale deals audit\n\n**8 deals** stuck in Negotiation for 14+ days:\n\n| Deal | Days stale | Last activity | Owner |\n|---|---|---|---|\n| Datadog expansion | 31d | Email, no reply | Alex |\n| Cloudflare Enterprise | 22d | Call, no follow-up | Sarah |\n| Retool Pro | 19d | Proposal sent | Alex |\n| PostHog self-host | 17d | Pricing Q, unanswered | Jordan |\n\nRecommended actions written to each deal\'s notes. Suggest a pipeline review on Friday.',
    preview: '8 deals stale 14+ days in Negotiation — review Friday',
  },
  {
    agent: 'researcher',
    prompt: 'Deep-dive on Railway — funding, tech, competitive moat vs us.',
    final: '# Railway — competitive deep-dive\n\n## Funding\n- **$24M Series B** (April 2025, lead: Redpoint)\n- Post-money: ~$200M\n- Burn: estimated $1.2M/mo\n\n## Tech\n- Firecracker microVMs (like us)\n- Nixpacks for buildpacks (open source)\n- No edge network — relies on single-region deploys\n\n## Positioning vs Vercel\n- **Their angle**: "Heroku successor", backend-heavy\n- **Our angle**: frontend + edge, AI Gateway, framework-defined infra\n- **Gap**: no equivalent to v0, no SDK, no AI primitives\n\n## Takeaway\nRailway competes for backend workloads, not our frontend/edge core. No need to react defensively.',
    preview: 'Railway deep-dive: Series B $24M, backend-heavy, low overlap',
  },
  {
    agent: 'content-studio',
    prompt: 'Write a 3-tweet thread announcing the new AI Gateway caching feature.',
    final: '# AI Gateway caching — tweet thread\n\n**1/3**\nShipping today on Vercel AI Gateway: semantic response caching. ⚡\n\nYour prod LLM calls now hit cache when the embedding of the new prompt is within a threshold of a prior one. Tunable per route.\n\n**2/3**\nWe\'ve seen teams cut inference spend 40–70% on support / FAQ workloads without touching app code. Flip it on with one flag:\n\n```\ngateway.cache = { strategy: "semantic", threshold: 0.92 }\n```\n\n**3/3**\nDocs: vercel.com/docs/ai-gateway/caching\nBuilt on Runtime Cache, tag-invalidation works the way you\'d expect.\n\nReply with your workload and we\'ll DM benchmarks.',
    preview: '3-tweet thread: AI Gateway semantic caching launch',
  },
  {
    agent: 'brand-monitor',
    prompt: 'What are devs saying about Vercel on Hacker News this week?',
    final: '# Vercel HN digest — week of Apr 16\n\n**12 threads** mentioned Vercel. Net sentiment: +0.4 (positive, slightly below average).\n\n## Positive themes\n- AI Gateway latency (3 mentions) — "feels faster than OpenAI direct"\n- v0 UI generation (5 mentions) — "finally usable for real work"\n\n## Negative themes\n- Pricing at scale (4 mentions) — bandwidth overage after 1TB/mo\n- Cold starts on Fluid Compute (2 mentions, both from comments)\n\n## Action\nWorth a public response on the bandwidth overage thread (link in notes). Other concerns are already on the public roadmap.',
    preview: 'HN digest: 12 Vercel threads, +0.4 sentiment, bandwidth gripe',
  },
  {
    agent: 'company-profiler',
    prompt: 'Profile Ramp — who they are, what they do, what they care about.',
    final: '# Ramp — company profile\n\n## What they do\nCorporate cards + spend management. $13B valuation (2024). ~800 employees.\n\n## ICP fit (for us)\n**Strong** — stack-heavy, AI-curious, frontend team of ~50 eng.\n\n## Current stack (public signals)\n- Next.js (seen on ramp.com)\n- Datadog\n- Stripe (payments)\n- OpenAI API (per CTO tweet)\n\n## Hooks\n- They just launched "Ramp Intelligence" — AI copilot. Perfect fit for AI Gateway.\n- Karim\'s 2024 Strange Loop talk mentioned "we\'d love better inference caching"\n\nWritten to `companies/ramp.md`.',
    preview: 'Profiled Ramp — $13B, 800 eng, strong AI Gateway fit',
  },
];

const NOW = Date.now();
// 30 completed runs spread across past 60 days, 2 currently running, 1 failed.
function pickTemplate(i) { return RUN_TEMPLATES[i % RUN_TEMPLATES.length]; }

async function seedRuns() {
  const runsDir = path.join(VAULT, 'runs');
  await fs.mkdir(runsDir, { recursive: true });

  const plans = [];
  for (let i = 0; i < 30; i++) {
    const daysAgo = Math.floor((i * 61) / 30) + Math.floor(Math.random() * 2);
    const hour = 9 + Math.floor(Math.random() * 8);
    const min = Math.floor(Math.random() * 60);
    const d = new Date(NOW - daysAgo * 86400e3);
    d.setUTCHours(hour, min, Math.floor(Math.random() * 60), Math.floor(Math.random() * 999));
    const t = pickTemplate(i);
    plans.push({ d, template: t, kind: 'completed' });
  }
  // 2 running (no final.md)
  for (let i = 0; i < 2; i++) {
    const d = new Date(NOW - (i * 15 + 3) * 60_000);
    plans.push({ d, template: pickTemplate(7 + i), kind: 'running' });
  }
  // 1 failed
  {
    const d = new Date(NOW - 4 * 86400e3);
    d.setUTCHours(14, 22, 7, 421);
    plans.push({ d, template: pickTemplate(2), kind: 'failed' });
  }

  for (const { d, template, kind } of plans) {
    const runId = runIdFor(d, template.agent);
    const dir = path.join(runsDir, runId);
    await fs.mkdir(dir, { recursive: true });
    const meta = {
      runId,
      agent: template.agent,
      engine: 'codex-cli',
      startedAt: iso(d),
      preview: template.preview,
      exitCode: kind === 'failed' ? 1 : 0,
    };
    if (kind === 'failed') meta.error = 'codex exit 1 — tool invocation failed';
    await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
    await fs.writeFile(path.join(dir, 'prompt.md'), template.prompt);
    if (kind !== 'running') {
      const finalMd =
        kind === 'failed'
          ? '# Run failed\n\nCodex exited with code 1 mid-turn. See stdout.log for trace.'
          : template.final;
      await fs.writeFile(path.join(dir, 'final.md'), finalMd);
    }
    await fs.writeFile(
      path.join(dir, 'stdout.log'),
      `[codex] starting ${template.agent}\n[codex] turn 1 begin\n[codex] ${kind === 'running' ? 'in progress…' : 'turn complete'}\n`,
    );
  }
  console.log(`✓ seeded ${plans.length} runs`);
}

async function seedDrafts() {
  const dir = path.join(VAULT, 'drafts');
  await fs.mkdir(dir, { recursive: true });
  const drafts = [
    {
      id: 'draft-ramp-eric-001',
      fm: {
        channel: 'email',
        to: 'eric@ramp.com',
        subject: 'AI bookkeeping inference costs',
        tool: 'gmail.send',
        status: 'pending',
        created_at: iso(new Date(NOW - 2 * 3600e3)),
      },
      body: "Hi Eric,\n\nLoved the Ramp Intelligence launch post — the receipt-classification demo was sharp.\n\nQuick question: how are you handling inference cost at that volume? We've been shipping semantic caching in AI Gateway that's cutting 40–70% on similar workloads (classification / extraction). Happy to share the benchmark numbers if useful.\n\nWorth a 15-min call next week?\n\n— Bill",
    },
    {
      id: 'draft-linear-karri-002',
      fm: {
        channel: 'linkedin',
        to: 'karri-saarinen',
        subject: 'Re: your post on design-eng workflows',
        tool: 'linkedin.dm',
        status: 'pending',
        created_at: iso(new Date(NOW - 5 * 3600e3)),
      },
      body: "Hey Karri — great post on design↔eng handoff. We've been pushing hard on v0 → code-as-source-of-truth for exactly this pain. Would love to hear what your team is still doing manually there. 10 min this week?",
    },
    {
      id: 'draft-posthog-james-003',
      fm: {
        channel: 'email',
        to: 'james@posthog.com',
        subject: 'Self-host pricing question from last week',
        tool: 'gmail.send',
        status: 'pending',
        created_at: iso(new Date(NOW - 26 * 3600e3)),
      },
      body: "Hi James,\n\nFollowing up on the pricing question from your team — I dug through our records and you're right, the enterprise tier was quoted higher than what we publish. That was a mistake on our end.\n\nCan we set up 20 minutes to re-walk the numbers? Happy to get our Head of Self-Serve on the call.\n\n— Bill",
    },
  ];
  for (const d of drafts) {
    const fm = Object.entries(d.fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
    await fs.writeFile(path.join(dir, `${d.id}.md`), `---\n${fm}\n---\n\n${d.body}\n`);
  }
  console.log(`✓ seeded ${drafts.length} pending drafts`);
}

async function seedChats() {
  const dir = path.join(VAULT, 'chats');
  await fs.mkdir(dir, { recursive: true });
  const threads = [
    {
      threadId: '20260421-142205',
      agent: 'lookalike-discovery',
      updatedAt: iso(new Date(NOW - 2 * 86400e3)),
      messages: [
        { role: 'user', content: 'Find 20 lookalike accounts for Linear.' },
        { role: 'assistant', content: 'Pulling closed-won deals matching Linear\'s profile… found 23 strong matches. Writing to companies/.' },
        { role: 'user', content: 'Great, now build a sequence for them.' },
        { role: 'assistant', content: 'Handing off to outbound agent — 5-touch sequence drafted, in Desk for review.' },
      ],
    },
    {
      threadId: '20260422-091733',
      agent: 'meeting-prep',
      updatedAt: iso(new Date(NOW - 18 * 3600e3)),
      messages: [
        { role: 'user', content: 'Brief for tomorrow\'s Ramp call.' },
        { role: 'assistant', content: 'Pulled attendees + recent public signals. Key angle: their new AI bookkeeping product + our Gateway caching. Full brief above.' },
      ],
    },
    {
      threadId: '20260423-103041',
      agent: 'pipeline-ops',
      updatedAt: iso(new Date(NOW - 4 * 3600e3)),
      messages: [
        { role: 'user', content: 'What\'s stale in Negotiation?' },
        { role: 'assistant', content: '8 deals sitting 14+ days. Datadog expansion is the oldest at 31d. Posted the full list + recommended next-moves into each deal note.' },
        { role: 'user', content: 'Tag Alex on the Datadog one.' },
        { role: 'assistant', content: 'Tagged Alex, scheduled a nudge for Monday 9am.' },
      ],
    },
    {
      threadId: '20260423-181245',
      agent: 'researcher',
      updatedAt: iso(new Date(NOW - 40 * 60e3)),
      messages: [
        { role: 'user', content: 'Deep-dive on Railway.' },
        { role: 'assistant', content: 'Series B $24M (Apr 2025, Redpoint). Backend-heavy, no edge. Low overlap with us — not a defensive priority. Full memo written.' },
      ],
    },
  ];
  for (const t of threads) {
    await fs.writeFile(path.join(dir, `${t.threadId}.json`), JSON.stringify(t, null, 2));
  }
  console.log(`✓ seeded ${threads.length} chat threads`);
}

async function main() {
  console.log(`Seeding demo runtime data into ${VAULT}`);
  try {
    await fs.access(VAULT);
  } catch {
    console.error(`✗ vault does not exist: ${VAULT}`);
    process.exit(1);
  }
  await seedRuns();
  await seedDrafts();
  await seedChats();
  console.log('\nDone. Restart the app (or refresh Home) to see activity.');
}

main().catch((e) => { console.error(e); process.exit(1); });
