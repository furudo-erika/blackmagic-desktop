# Website Visitor Agent (`website-visitor`)

**Deanonymization pipeline.** Website visitor → qualified lead → draft.

- Definition: `daemon/src/context.ts` ≈ lines 620–657
- Model: `gpt-5.3-codex` · Temperature: 0.25 · Icon: `Globe`

## Purpose

Processes deanonymized visitor records (dropped by an external pixel
into `signals/visitors/<date>.json`), scores each company against ICP,
enriches survivors, identifies the likely buying-committee contact, and
drafts a first-touch email.

## Tools allowed

```
read_file, write_file, edit_file, list_dir, grep,
web_fetch, web_search,
enrich_company, enrich_contact,
draft_create, enroll_contact_in_sequence
```

## Context I/O

- Reads: `signals/visitors/<date>.json`, `us/icp.md`
- Writes: `companies/<slug>.md`, `contacts/<company>/<name>.md`,
  `drafts/<ts>-<to>.md`
- Optional HubSpot push if `hubspot_api_key` is set

## Trigger

None direct. The `visitor-identify` playbook listens to new files
landing in `signals/visitors/` and invokes this agent.

## Dependencies

- **ICP must exist** (`us/icp.md`). Agent refuses to score without it.
- `enrich_company` / `enrich_contact` (proxied through blackmagic.engineering)
- Optional: `hubspot_api_key` for HubSpot object creation

## Quirks

- Falls back to `web_fetch` when enrichment returns nothing (small orgs,
  stealth). Don't remove that fallback — it's the only path for companies
  PDL doesn't know about.
- Scoring runs ICP against the enriched record, not the raw visitor
  record, so the order `enrich → score → draft` matters. Rewriting that
  order breaks score quality.
- Buying-committee detection is heuristic: it prefers VP/Director titles
  in engineering / devtools / sales-ops within the target function set
  defined in the ICP. If ICP has no function set it picks the most
  senior contact in the highest-signal department.
