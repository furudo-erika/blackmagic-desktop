# Deal Manager (`ae`)

**AE agent.** Runs the `deals/` folder.

- Definition: `daemon/src/vault.ts` ≈ lines 594–613
- Model: `gpt-5.3-codex` · Temperature: 0.3 · Icon: `Briefcase`

## Purpose

Analyzes pipeline health per-deal, spots stalls, proposes next steps,
and maintains deal frontmatter (`next_step`, `health`, dated notes).
Pure local heuristics — no external calls.

## Tools allowed

```
read_file, write_file, edit_file, list_dir, grep
```

## Vault I/O

- Reads + edits `deals/open/*.md`, `deals/closed-won/*.md`,
  `deals/closed-lost/*.md`
- Appends dated notes at the bottom of each deal file rather than
  rewriting history
- Updates frontmatter keys: `next_step`, `health` (green/yellow/red),
  `last_activity_at`

## Trigger

None direct. Playbooks: `won-analyze`, `lost-pull-history`,
`pipeline-scan-stale`.

## Dependencies

None. Entirely offline — the AE's job is to reason about what's already
in the vault, not fetch new data.

## Quirks

- No web / enrichment tools on purpose. If you need research before a
  deal review, run `researcher` first, then hand off.
- `health` enum is only three values: `green`, `yellow`, `red`. Any other
  value will break the pipeline-ops weekly rollup.
- Appends rather than overwrites — preserve that pattern when adding
  new behaviors so the deal file stays an audit trail.
