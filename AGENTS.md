# AGENTS.md

Guidance for Codex agents working in Black Magic Desktop.

## Purpose

Black Magic Desktop is being migrated onto Paperclip. The old desktop repo is
the compatibility/source system for existing agents, UI, outreach, GEO,
sequences, integrations, and markdown workspaces.

## Migration Direction

- Paperclip becomes the control plane.
- Black Magic becomes a GTM product layer on top of Paperclip.
- Preserve Black Magic UI, agents, outreach, GEO, ontology, and specific GTM
  workflows where they still matter.
- Do not grow the old daemon into a second orchestration runtime.

## Read First

1. `README.md`
2. `docs/codex/HARNESS_ENGINEERING.md`
3. Paperclip migration docs in
   `/Users/bill/Desktop/paperclip-master/doc/blackmagic/BLACKMAGIC_ON_PAPERCLIP.md`

## Repo Map

- `daemon/src/`: local daemon, tools, sync, GEO, integrations, context prompts
- `apps/web/`: Next.js UI
- `apps/desktop/`: Electron shell
- `scripts/`: release and helper scripts

## Provider Policy

First-party credit-billed providers to keep:

- Hypereal
- Perplexity
- Apify

Providers to remove from first-party credits and restore only as third-party
integrations if needed:

- Reddit reply relay
- People Data Labs
- SerpAPI

## Harness Engineering Rules

- Humans steer; agents execute.
- Make repo-local docs the source of truth for decisions.
- When blocked, add missing harness: docs, tests, scripts, fixtures, logs, or
  checks.
- Work in small verified slices.
- Prefer Paperclip primitives for new orchestration: issues, goals, approvals,
  budgets, heartbeat runs, plugin entities, and jobs.

## Verification

Run the smallest relevant check for the slice. Common commands:

```sh
pnpm -r typecheck
pnpm -r build
```

If a command cannot run, report it clearly with the reason.
