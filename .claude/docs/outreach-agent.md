# Outreach Agent (`sdr`)

**SDR persona.** Drafts outbound emails — never sends.

- Definition: `daemon/src/context.ts` ≈ lines 574–593
- Model: `gpt-5.3-codex` · Temperature: 0.4 · Icon: `Send`

## Purpose

Writes short, signal-referenced first-touch emails that reference a
specific trigger (hiring, funding, product launch, signal file) pulled
from the context. Never fabricates — if no signal exists the agent asks.

## Tools allowed

```
read_file, write_file, list_dir, grep, draft_create
```

Deliberately minimal: no web, no enrichment. Research happens before
this agent runs; the SDR's job is only to turn research into a message.

## Context I/O

- Reads `companies/*.md`, `contacts/*.md`, `signals/*.md`, `us/brand/*`
- Writes one `drafts/<ts>-<to>.md` per target (status: pending)

## Trigger

None direct. Fired by playbooks: `draft-outbound`, `li-draft-message`,
`li-campaign-loop`, `signal-based-outbound`.

## Dependencies

- `draft_create` tool (local, writes to context's `drafts/`)
- Respects `CLAUDE.md` and `us/brand/` forbidden-word lists

## Quirks

- **Hard 90-word cap** on email body — check the system prompt before
  changing.
- Never writes subject lines longer than 6 words.
- Refuses to draft without a named signal; will surface "missing signal"
  rather than invent a trigger.
- Separate temperature (0.4) from the rest of the roster because copy
  needs a touch more variance. Don't lower it or emails turn templated.
