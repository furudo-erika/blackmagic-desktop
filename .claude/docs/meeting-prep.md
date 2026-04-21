# Meeting Prep Agent (`meeting-prep`)

**≤1-page pre-meeting brief.**

- Definition: `daemon/src/vault.ts` ≈ lines 693–725
- Model: `gpt-5.3-codex` · Temperature: 0.2 · Icon: `CalendarClock`

## Purpose

Given attendees + a company, produces a dense one-page brief: attendee
backgrounds (LinkedIn, role, tenure), recent company news (14-day
window), prior vault mentions, a proposed agenda, 3–5 discovery
questions, 2–3 risks, and a single-sentence success criterion.

## Tools allowed

```
read_file, write_file, list_dir, grep,
web_fetch, web_search,
enrich_company, enrich_contact
```

No `draft_create` — the brief itself is the output, not an outbound
message. No edit tools — briefs are written once, fresh each time.

## Vault I/O

- Reads: `companies/<slug>.md`, `contacts/<company>/*`, `deals/*/`,
  `signals/*`
- Writes: `drafts/<ts>-brief-<meeting>.md` (named "draft" but it's a
  brief, not an outbound)

## Trigger

None. Called manually from the Team cockpit or by the
`meeting-pull-records` / `meeting-research-news` playbooks.

## Dependencies

- `enrich_contact` is optional — falls back to web_search if unavailable
- News source is `web_search` with a 14-day recency bias; don't widen
  that window without updating the system prompt to rank by novelty

## Quirks

- "No fluff" is a hard system rule: if a section has no real data the
  agent writes "gap: no data on <X>" instead of inventing filler. Keep
  that — it's what makes the brief trustworthy.
- One-page cap is enforced in-prompt, not by tooling. If you expand the
  scope (e.g. add a "competitive landscape" block), trim another section
  or the brief stops being a brief.
