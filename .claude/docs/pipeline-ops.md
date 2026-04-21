# Pipeline Ops Agent (`pipeline-ops`)

**Weekly pipeline health.** Flags stalled deals + one recovery action each.

- Definition: `daemon/src/vault.ts` ≈ lines 785–811
- Model: `gpt-5.3-codex` · Temperature: 0.2 · Icon: `Activity`

## Purpose

Reads every open deal, flags four failure modes (stuck >14d, missing
next step on Proposal+, late-stage pushed twice, sequence reply-rate
down >30% WoW), ranks by ARR at risk, and proposes exactly **one**
recovery action per flagged deal (owner, channel, timing, expected
outcome, kill criterion).

## Tools allowed

```
read_file, write_file, edit_file, list_dir, grep, draft_create
```

No external tools — all signals the agent needs are already in the
vault.

## Vault I/O

- Reads: `deals/open/*.md`, `sequences/*`, `drafts/*`
- Writes: `signals/pipeline-health/<date>.md`
- Optional: drafts DMs to deal owners via `draft_create`

## Trigger

- **`swan-weekly-pipeline-health`** (`daemon/src/vault.ts` ≈ line 2227)
  — cron `0 8 * * 1` (Mondays 08:00). Note this trigger fires the
  `revops-pipeline-health` playbook rather than the agent directly; the
  playbook ultimately calls this agent.

## Dependencies

None.

## Quirks

- **One-action-per-deal cap.** The agent must not propose "do A then B
  then C" for a single deal — that's how rollups become noise. If you
  lift the cap you'll break the report's legibility.
- `health` field values read from deal frontmatter are expected to be
  exactly `green` / `yellow` / `red` (maintained by the `ae` agent). Any
  other value is treated as unknown.
- "ARR at risk" is computed from the deal's `arr` frontmatter field if
  present, otherwise falls back to `value`. Missing both → deal is
  still flagged but ranked at the bottom.
- The 30% sequence-reply-drop heuristic compares last 7 days vs prior
  7 days. Don't widen the window without updating the copy in the
  report ("reply rate dropped 30% week-over-week").
