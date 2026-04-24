# Context Layout & Frontmatter Conventions

## Root

`~/BlackMagic/` by default. Override with `BM_CONTEXT_PATH` or `.bm/config.toml → context_path`.

```
~/BlackMagic/
├── CLAUDE.md
├── agents/
│   ├── sdr.md
│   ├── researcher.md
│   └── ae.md
├── companies/
│   └── <slug>.md
├── contacts/
│   └── <company-slug>/
│       └── <person-slug>.md
├── deals/
│   ├── open/<slug>.md
│   ├── closed-won/<slug>.md
│   └── closed-lost/<slug>.md
├── playbooks/
│   ├── enrich-company.md
│   ├── qualify-icp.md
│   └── draft-outbound.md
├── triggers/
│   ├── pipeline-scan.md       (cron)
│   └── hubspot-closed-won.md  (webhook)
├── drafts/
│   └── <ts>-<slug>.md
├── runs/
│   └── <iso-ts>-<agent>/
│       ├── prompt.md
│       ├── tool-calls.jsonl
│       └── final.md
└── .bm/
    ├── config.toml
    ├── mcp.json
    └── index.sqlite           (optional, derived — safe to delete)
```

## CLAUDE.md (root)

Global config the agent reads on every call. Free-form markdown. Suggested sections:

- `## Our Company` — what we sell, in one paragraph.
- `## ICP` — company fit criteria (size, industry, tech stack, geography).
- `## Tone` — brand voice, forbidden words.
- `## Sources of Truth` — "deals/ is authoritative, HubSpot is mirror."

## Frontmatter conventions

YAML frontmatter. Keys in snake_case. Unknown keys are preserved.

### `companies/<slug>.md`

```yaml
---
kind: company
domain: acme.com
name: Acme Inc.
industry: "SaaS / DevTools"
size: "200-500"
revenue: "$20-50M"
hq: "San Francisco, CA"
icp_score: 82
icp_reasons: ["size fit", "uses HubSpot", "recent Series B"]
enriched_at: 2026-04-14T00:00:00Z
enriched_by: researcher
sources:
  - "https://news.ycombinator.com/..."
  - "pdl:2026-04-14"
---

# Acme Inc.

<free-form notes, news, buying committee, what-changed-this-week>
```

### `contacts/<company-slug>/<person-slug>.md`

```yaml
---
kind: contact
company: acme.com
name: Jane Doe
role: "Head of RevOps"
seniority: director
linkedin: https://linkedin.com/in/janedoe
email: jane@acme.com
email_source: apollo
last_touch: 2026-04-10
posture: champion | user | economic_buyer | blocker | unknown
---
```

### `deals/<state>/<slug>.md`

```yaml
---
kind: deal
state: open | closed-won | closed-lost
company: acme.com
amount_usd: 48000
stage: proposal
open_date: 2026-02-01
close_date: null
owner: me
next_step: "Legal review Thu"
health: green | yellow | red
competitors: ["Vendor A"]
---
```

### `agents/<name>.md`

```yaml
---
kind: agent
name: researcher
model: gpt-5.3-codex
tools:
  - read_file
  - write_file
  - web_fetch
  - pdl_enrich
  - grep
temperature: 0.2
---

You are the research agent. When given a company domain, produce
a frontmatter-rich companies/<slug>.md entry...
```

### `playbooks/<name>.md`

```yaml
---
kind: playbook
name: enrich-company
agent: researcher
inputs:
  - name: domain
    required: true
---

Fetch the company at `{{domain}}`, produce a full companies/<slug>.md with:
- frontmatter: domain, name, industry, size, revenue, hq, icp_score, icp_reasons
- body: 150-word summary, recent news, buying committee guesses.
```

### `triggers/<name>.md`

```yaml
---
kind: trigger
name: pipeline-scan
schedule: "0 9 * * 1-5"        # cron, local TZ
playbook: pipeline-health
enabled: true
---

Scan deals/open/ every weekday at 9am. For each deal with no
activity in >7 days, append a "⚠ stale" note.
```

or webhook:

```yaml
---
kind: trigger
name: hubspot-closed-won
webhook: true
playbook: closed-won-lookalike
enabled: true
---
```

Webhook URL: `http://127.0.0.1:<port>/webhook/hubspot-closed-won?token=<local-token>`.

### `drafts/<ts>-<slug>.md`

```yaml
---
kind: draft
channel: email | linkedin_dm | linkedin_connect
to: jane@acme.com
subject: "..."
tool: gmail.send
status: pending | approved | sent | rejected
created_at: 2026-04-14T12:34:00Z
created_by: sdr
---

<body the agent wrote>
```

## Naming Rules

- `<slug>` = lowercase, hyphenated. For companies, the eTLD+1 domain (`acme.co.uk` → `acme-co-uk`). For people, `<first>-<last>`.
- Agents never invent slugs for things they can't verify. If an email lookup fails, write `email: null, email_source: unknown`, don't fabricate.
- The agent is allowed to rename files (e.g., when moving a deal from `open/` to `closed-won/`) via the `rename_file` tool.

## Reserved paths

- `.bm/` — config & caches. Agents must not read or write here except via dedicated daemon APIs.
- `runs/` — agents append to their own run dir, never modify someone else's.
