# `.claude/docs` — per-agent dev notes

Quick-reference docs so future sessions can land on any agent without
re-reading `daemon/src/vault.ts`. One file per agent, format:

- Slug, name, model, temperature, icon
- Purpose (1–2 sentences)
- Tools allowed
- Vault inputs / outputs
- Trigger (cron if any)
- Config / env dependencies
- Quirks + gotchas a future dev needs to know

All agents are defined in `daemon/src/vault.ts` under `DEFAULT_AGENTS`
(≈ lines 533–921). None live outside that map. The web sidebar metadata
is in `apps/web/src/config/agents.ts` — it's display-only, not a second
definition.

## Agents

| Doc | Slug | Purpose |
|-----|------|---------|
| [research-agent.md](research-agent.md) | `researcher` | Default chat agent, research + enrichment + drafts |
| [outreach-agent.md](outreach-agent.md) | `sdr` | Drafts signal-referenced outbound emails (≤90 words) |
| [deal-manager.md](deal-manager.md) | `ae` | Manages `deals/` — stall detection, next-step proposals |
| [website-visitor.md](website-visitor.md) | `website-visitor` | Qualifies deanonymized web visitors → drafts |
| [linkedin-outreach.md](linkedin-outreach.md) | `linkedin-outreach` | Daily LinkedIn signal loop → drafts + sequence |
| [meeting-prep.md](meeting-prep.md) | `meeting-prep` | ≤1-page pre-meeting brief per attendee |
| [lookalike-discovery.md](lookalike-discovery.md) | `lookalike-discovery` | Finds 20–50 firmographic twins of a closed-won |
| [closed-lost-revival.md](closed-lost-revival.md) | `closed-lost-revival` | Scans closed-lost + drafts re-engagement |
| [pipeline-ops.md](pipeline-ops.md) | `pipeline-ops` | Weekly pipeline-health flagging + recovery actions |
| [geo-agent.md](geo-agent.md) | `geo-analyst` | Daily GEO sweep (ChatGPT / PPLX / AI Overview) + delta dashboard |

## When adding a new agent

1. Add markdown body to `DEFAULT_AGENTS` in `daemon/src/vault.ts` with
   frontmatter (`kind`, `slug`, `name`, `icon`, `model`, `tools`, `temperature`).
2. Allow-list every tool the agent can call in the frontmatter `tools:`
   field — the runtime filters `BUILTIN_TOOLS` by this list.
3. Add the agent's icon to `SIDEBAR_AGENT_ICONS` in
   `apps/web/src/components/sidebar.tsx` if it should show in the Team nav.
4. Drop a `<slug>.md` doc in this directory — even if brief.
5. Optionally add a preset trigger at the bottom of `vault.ts`
   (`PRESET_TRIGGERS` / `DEFAULT_TRIGGERS`) referencing `agent: <slug>`.
