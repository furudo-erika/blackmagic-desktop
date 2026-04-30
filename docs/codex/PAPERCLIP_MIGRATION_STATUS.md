# Paperclip Migration Status

This file is the repo-local status note for continuing Black Magic Desktop
migration in harness-engineering loops.

## Direction

Black Magic should move into Paperclip as a GTM product layer/plugin. Keep the
Black Magic UI, agents, outreach, GEO, and media-generation workflows that users
already value, but avoid building a second long-term orchestration runtime in
the old daemon.

## Org Chart Slice

Implemented:

- `/company` is the single organization surface.
- `/chart` redirects to `/company`.
- The organization view is a node-link chart with SVG connectors,
  absolute-positioned nodes, fit-to-screen, pan, wheel zoom, and touch
  pan/pinch zoom.
- Employee cards can be selected and edited.
- Employee cards can be dragged between teams.
- Employee cards can be dragged onto another employee to write
  `reports_to: employee:<slug>` with a cycle guard.
- Editable compatibility metadata remains in `agents/*.md` frontmatter:
  `name`, `team`, `reports_to`, and `face_seed`.
- `scripts/check-org-chart-harness.mjs` protects the Paperclip-style layout and
  interaction invariants.

Still to migrate:

- Replace the markdown-backed reports-to bridge with Paperclip agent APIs.
- Add an inspector picker for manager/reporting edits, not only drag-and-drop.
- Import/export `reports_to` into Paperclip agent `reportsTo` fields during
  cutover.
- Back the org chart with Paperclip agent APIs instead of markdown files once
  Paperclip is the active control plane.

## First-Party Credit API Policy

Keep as Black Magic first-party, credit-billed capabilities:

- `hypereal_generate` via Hypereal.
- Perplexity-backed GEO/research paths.
- Apify scrape tools, including `scrape_apify_actor`.

Remove from first-party credits and restore only as third-party integrations if
needed:

- Reddit reply relay.
- People Data Labs.
- SerpAPI.

## Next Harness Loops

1. Move approvals from draft-only approval to generic action approvals.
2. Bind agent runs to structured Issues/Tasks instead of unstructured history.
3. Add Goals that connect playbooks, runs, sequences, and GTM outcomes.
4. Enforce budgets/quotas before long-running agent actions start.
5. Unify triggers, sequences, chat runs, and scheduled work behind Paperclip
   runtime state plus heartbeat queue.
