# Black Magic Desktop

Local-first AI GTM engineer. Your context lives in `~/BlackMagic/` as plain markdown. The app drives Codex models (gpt-5.3-codex) via zenn.engineering to read, edit, and extend that vault.

**Privacy**: all company, contact, deal, and memory data stays on your machine. The cloud only meters tokens for billing.

**License**: MIT. Fork it, audit it, self-host it.

## v0.2.0 highlights

- **Sequences**: multi-touch outreach engine with a daily drip cron (see `apps/web/src/app/sequences`).
- **Brand monitor + competitor/news presets**: one-click trigger recipes under `triggers/`.
- **Wikilinks + backlinks**: `[[Company]]` resolution across the vault, with backlink panels on every note.
- **Apify + EnrichLayer**: new integrations for scraping and contact enrichment.
- **3D ontology**: Three.js knowledge graph at `/ontology` ported from apidog-team.

## Install

### macOS (recommended — Homebrew)

```sh
brew install --cask blackmagic-ai/tap/blackmagic-ai
```

Homebrew strips the quarantine flag, so the app opens without the
"BlackMagic AI is damaged" warning that macOS shows on a direct DMG download.

### Run from source

```bash
pnpm install
cp .env.example .env
# edit .env: set ZENN_API_KEY=ck_...
pnpm dev
```

## Layout

```
apps/
  desktop/          Electron main + preload (Node)
  web/              Next.js renderer (static export, loaded by Electron)
packages/
  core/             Zustand stores + TanStack Query hooks + API client (headless)
  ui/               shadcn atoms (zero business logic)
  views/            Shared pages (Chat, Vault, Agents, Runs, Settings)
  vault/            Markdown vault ops (read/write/frontmatter/watch)
  adapter-codex/    zenn Responses API client + agent loop
daemon/             Node HTTP/WS server on 127.0.0.1, spawned by Electron
doc/
  PRODUCT.md        What this is, principles
  SPEC-v1.md        Build contract for V1
  VAULT.md          Vault directory layout + frontmatter conventions
  AGENT.md          Agent runtime + tool reference
  BILLING.md        zenn + Supabase token events
```

## Pack

```bash
pnpm package:mac   # → apps/desktop/release/*.dmg (arm64 + x64)
pnpm package:win   # → apps/desktop/release/*.exe
```

## Vault

After first run, `~/BlackMagic/` is seeded with:

```
CLAUDE.md               # global: your ICP, tone, forbidden words
agents/                 # role definitions (sdr.md, researcher.md, ae.md)
companies/              # one .md per company (frontmatter + notes)
contacts/<company>/     # one .md per contact
deals/
  open/                 # one .md per open opportunity
  closed-won/
  closed-lost/
playbooks/              # reusable prompt templates (was "Skills")
triggers/               # cron / webhook definitions
drafts/                 # outbound drafts, awaiting human review
runs/<timestamp>/       # per-run log dirs
.bm/
  config.toml           # ck_ key (from login), daemon port, default model
  mcp.json              # MCP server registry (HubSpot, Gmail, Apollo, ...)
```
