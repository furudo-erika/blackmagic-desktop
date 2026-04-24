# Closed-Lost Revival Agent (`closed-lost-revival`)

**Re-engage dead deals when a trigger reappears.**

- Definition: `daemon/src/context.ts` ≈ lines 752–783
- Model: `gpt-5.3-codex` · Temperature: 0.35 · Icon: `RotateCcw`

## Purpose

Scans `deals/closed-lost/`, reads each deal's original loss reason,
cross-references against recent signals + fresh web news (30-day
window), scores revival strength, and drafts a re-engagement email for
the top 5 — explicitly referencing both the old loss reason and the new
trigger ("last time it was X — now I saw Y").

## Tools allowed

```
read_file, write_file, edit_file, list_dir, grep,
web_fetch, web_search, draft_create
```

No enrichment on this agent by design — it's working from existing
closed-lost files which already have enrichment from when they were
open. Stale firmographics aren't the blocker; a new trigger is.

## Context I/O

- Reads: `deals/closed-lost/*.md`, `signals/*`
- Writes: appends a "Revival (ts)" note to the deal file, writes
  `drafts/<ts>-revival-<company>.md` per top-5 pick

## Trigger

None direct. Invoked by playbook-only flow.

## Dependencies

None beyond `web_search`.

## Quirks

- **Revival email rule**: must explicitly name the old loss reason AND
  the new trigger in the first line. This is a quality anchor — if the
  email reads generic, the loop broke. Keep that rule in the system
  prompt.
- Temperature 0.35 is deliberately higher than the research agents
  (0.2) — revival emails need a specific, slightly provocative edge.
- "Top 5" is enforced so the revival loop doesn't turn into a spam
  campaign against every lost deal.
- Scoring logic is heuristic and lives in-prompt, not in code. If you
  want deterministic ranking, pre-filter in a playbook before invoking
  this agent.
