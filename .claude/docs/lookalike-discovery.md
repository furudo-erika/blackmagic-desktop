# Lookalike Discovery Agent (`lookalike-discovery`)

**Closed-won → 20–50 twins.**

- Definition: `daemon/src/vault.ts` ≈ lines 727–750
- Model: `gpt-5.3-codex` · Temperature: 0.3 · Icon: `Copy`

## Purpose

Takes one closed-won deal as the seed and finds 20–50 firmographic +
behavioral lookalikes. For each match writes a `companies/<slug>.md`
with an ICP score, the clearest "lookalike reason" (one sentence), and
the likely champion role.

## Tools allowed

```
read_file, write_file, list_dir, grep,
web_fetch, web_search, enrich_company
```

## Vault I/O

- Reads: `deals/closed-won/*.md`, `us/icp.md`
- Writes: `companies/<slug>.md` (one per lookalike match)

## Trigger

None. Invoked by the `won-lookalikes` playbook.

## Dependencies

- `enrich_company` for firmographic matching
- `us/icp.md` used to score, not just match

## Quirks

- **Hard cap: 50 matches**. If the seed is broad the agent stops at 50
  rather than flood the vault.
- **Early-stop rule**: if ICP score drops below 50 for three consecutive
  candidates, the agent exits. This prevents burning enrichment credits
  down the long tail.
- No sequence enrollment from this agent — producing the candidate list
  is the whole job. Follow-through is the outreach agent's problem.
- Does not rely on a third-party "lookalike" service (e.g. Clay,
  Clearbit Prospector). Uses plain `web_search` + `enrich_company`,
  which means results depend heavily on how thorough the seed deal's
  `companies/<slug>.md` file is.
