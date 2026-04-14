# Black Magic Desktop — Product Definition

## What It Is

Black Magic Desktop is a local, open-source Electron app that runs a personal AI GTM engineer on top of a markdown vault. You install it, point it at your Zenn-issued API key, and a codex-class model can now read and edit your companies / contacts / deals / playbooks as plain `.md` files on disk.

No company, contact, deal, or memory content ever leaves your machine. The cloud (blackmagic.run + zenn.engineering) only sees authentication and per-request token counts for billing.

## Core Principles

1. **Local-first, file-first.** The vault is the source of truth. No SQLite fallback for domain data — only `.md` files with frontmatter. If the app disappears, your data is still there and readable by Obsidian, vim, or `cat`.
2. **The agent edits files.** Every useful action (enrich a company, draft an email, mark a deal stage) is the agent calling `write_file` / `edit_file` inside the vault. No opaque DB rows, no hidden state.
3. **Codex model via Zenn.** Default model is `gpt-5.3-codex`. Wire protocol is the OpenAI Responses API hosted at `https://zenn.engineering/api/v1`. Users are billed at OpenAI list prices; Zenn's 50% discount is our margin.
4. **Adapters, not a hardcoded runtime.** The default adapter shells into our own Node agent loop with the Responses API. Advanced users can swap in a different adapter (e.g., pointing at OpenRouter or Anthropic) via `.bm/config.toml`. Borrowed from Paperclip.
5. **Unopinionated tools.** Tools come from three places: (a) built-ins the daemon ships with (file ops, web fetch, grep), (b) MCP servers the user configures in `.bm/mcp.json`, (c) per-agent tool lists declared in `agents/<name>.md` frontmatter.
6. **Triggers are cron + webhook.** A trigger is a markdown file with a schedule or inbound URL. When it fires, the daemon spawns an agent run against a playbook.
7. **Approval gates, not autonomy.** Outbound side effects (send email, post to LinkedIn, mutate CRM) produce a draft in `drafts/` first. A human clicks Approve. No autopilot outreach.
8. **Cloud is a bill meter.** `blackmagic.run` receives `{tokens_in, tokens_out, model, timestamp}` per agent call, charges the user's `user_credit` in cents, and nothing else. Vault content is never uploaded.

## What It Is Not

- **Not a SaaS CRM.** Your data isn't in our database. We can't restore it, can't see it, can't subpoena it.
- **Not a chatbot.** There's a chat page, but the chat is a thin UI over the same agent loop that drives triggers and playbooks.
- **Not Obsidian-dependent.** Vault happens to be Obsidian-compatible (plain md + frontmatter). Black Magic doesn't require Obsidian.
- **Not multi-tenant.** One vault per machine per user. Teams share via git, not via a central server.

## User Flow (V1)

1. Download `Black Magic-<ver>.dmg` (or `.exe`) from blackmagic.run.
2. Launch, sign in with your blackmagic.run account, paste (or auto-retrieve) a `ck_` key.
3. App writes the key to `~/BlackMagic/.bm/config.toml`, seeds the vault skeleton, starts the daemon on 127.0.0.1.
4. Open Chat: "Enrich acme.com and draft a first-touch email to their head of RevOps."
5. Agent (gpt-5.3-codex) calls `web_fetch`, `pdl_enrich`, writes `companies/acme.md`, writes `drafts/acme-first-touch-<ts>.md`. Token count posts to blackmagic.run.
6. User reviews the draft, clicks Approve → Gmail MCP sends it.

## Pricing Model

- Zenn charges us X for 1M tokens at `gpt-5.3-codex` (input $2.50 / output $7.50).
- We charge the user OpenAI's list price (double Zenn's, per their 50%-off statement).
- Every agent call posts a `token_event` row: `{user_id, model, input_tokens, output_tokens, cost_cents}`. Balance in `user_credit` decrements. When balance ≤ 0, daemon refuses new agent calls and surfaces "top up".

## Out of Scope for V1

- Team sync / multi-user vault
- Real-time collaboration
- Auto-updater
- Mobile
- Self-hosted zenn swap (possible later via adapter config)
