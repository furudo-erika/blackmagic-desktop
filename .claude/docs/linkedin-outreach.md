# LinkedIn Outreach Agent (`linkedin-outreach`)

**Daily LinkedIn signal loop.**

- Definition: `daemon/src/vault.ts` ≈ lines 659–691
- Model: `gpt-5.3-codex` · Temperature: 0.3 · Icon: `Linkedin`

## Purpose

Reads the day's LinkedIn engagement signal, picks the top 5 prospects,
enriches each profile, drafts a connect note + a DM, enrolls them into
the `linkedin-post-signal` sequence, and summarizes the run.

## Tools allowed

```
read_file, write_file, edit_file, list_dir, grep,
web_fetch, web_search,
enrich_company, enrich_contact, enrich_contact_linkedin,
draft_create, enroll_contact_in_sequence
```

## Vault I/O

- Reads: `signals/linkedin/<date>.md` (scraped by upstream job)
- Writes: `contacts/<company>/<name>.md`, `drafts/<ts>-*.md`,
  `signals/linkedin/<date>-loop.md` (per-run summary so the trigger log
  always points at something real)
- Enrolls into `sequences/linkedin-post-signal.md`

## Trigger

`linkedin-daily-outreach` (`daemon/src/vault.ts` ≈ line 2245)
— cron `0 9 * * 1-5` (weekdays 09:00).

## Dependencies

- `ENRICHLAYER_API_KEY` (proxycurl-compatible) for
  `enrich_contact_linkedin`. Without it the agent bails loudly rather
  than skipping.
- The upstream job that writes `signals/linkedin/<date>.md` — if empty,
  agent writes a "nothing to do today" summary and exits.

## Quirks

- **Hard caps**: connect note ≤ 280 chars, DM ≤ 60 words.
- Never picks more than 5 prospects per day — even if the signal file
  has 50. Respects LinkedIn's request-volume red lines.
- The run summary is not decorative — it's what the Triggers UI links
  to. If the summary file isn't written, the run shows as "no output"
  in the trigger log. Keep that write.
- Never uses `li_at` session cookie tools directly (ToS-gray-area);
  restricts itself to proxycurl + draft-only writes.
