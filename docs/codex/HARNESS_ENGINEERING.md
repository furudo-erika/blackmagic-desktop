# Harness Engineering for Black Magic

Source: https://openai.com/index/harness-engineering/

This repo should be operated in harness-engineering mode during the Paperclip
migration. The goal is not to keep adding features to the old daemon. The goal
is to preserve Black Magic product value while moving orchestration into
Paperclip.

## Principles

1. Humans steer; agents execute.
   User decisions become repo-local docs and executable changes.

2. Keep the repo legible to Codex.
   Important decisions cannot live only in chat. Put migration policy, provider
   policy, verification commands, and compatibility notes in checked-in docs.

3. Do not retry blindly.
   When a migration task stalls, add the missing harness: importers, tests,
   scripts, logs, typed boundaries, smoke checks, or docs.

4. Work in small slices.
   Save state, implement one migration surface, verify it, commit it, then move
   to the next surface.

5. Prefer Paperclip primitives.
   New approvals, runtime scheduling, budget controls, tasks, goals, and agent
   state belong in Paperclip or the Black Magic Paperclip plugin.

6. Keep compatibility clear.
   Markdown import/export and old daemon APIs are compatibility paths, not the
   long-term source of truth.

## Provider Policy

Keep as first-party credit-billed capabilities:

- Hypereal
- Perplexity
- Apify

Move out of first-party credits and require third-party integrations if
restored:

- Reddit reply relay
- People Data Labs
- SerpAPI

## Migration Loop

For each slice:

1. Identify the user-visible workflow.
2. Map old Black Magic behavior to Paperclip primitives.
3. Implement the narrowest useful path.
4. Run targeted verification.
5. Record policy or architecture changes in docs.
6. Commit the slice.

If verification fails repeatedly, improve the harness before continuing.

## Current Migration Invariants

- `/company` is the single Black Magic organization surface.
- `/chart` may redirect to `/company`, but it must not grow a second org UI.
- The company surface must remain a real node-link organization chart:
  SVG connector edges, absolute-positioned nodes, pan/zoom viewport, and a
  fit-to-screen control. Do not regress it into a team grid or kanban board.
- Black Magic agent files remain the compatibility source during migration.
  Editable org metadata is stored in `agents/*.md` frontmatter:
  - `name`
  - `team`
  - `reports_to: team:<TeamName>` as the bridge toward Paperclip `reportsTo`
  - `face_seed`
- Paperclip is still the long-term control plane. The markdown fields above
  are import/export compatibility and should map to Paperclip agents, org
  hierarchy, and plugin metadata during cutover.
