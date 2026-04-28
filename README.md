# Black Magic Desktop

**The local-first AI GTM engineer that lives in your filesystem.**

<p>
  <a href="https://github.com/blackmagic-ai/blackmagic-desktop/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://github.com/blackmagic-ai/blackmagic-desktop/releases"><img src="https://img.shields.io/badge/version-0.5.47-green.svg" alt="Version"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/node-%3E%3D20.9-brightgreen.svg" alt="Node">
</p>

Black Magic Desktop is an open-source Electron app that runs a personal **AI go-to-market engineer** on top of a plain-markdown context. Companies, contacts, deals, playbooks, and memory all live in `~/BlackMagic/` as `.md` files on your disk — readable by Obsidian, vim, or `cat`. A codex-class agent reads and edits those files for you.

> No company, contact, deal, or memory content ever leaves your machine. The cloud only meters tokens for billing.

---

## Why Black Magic?

Most "AI for sales" tools are SaaS dashboards that lock your CRM data inside a vendor database, sprinkle a chatbot on top, and bill per seat. Black Magic flips it:

- **Your data is on your disk.** A folder of markdown. If we vanish tomorrow, your context still opens in any text editor.
- **The agent is the product.** Every action — enrich a company, draft an email, advance a deal stage, fire a daily trigger — is the agent calling `read_file` / `write_file` / `edit_file` against the same context you can edit by hand.
- **Approval gates, not autopilot.** Outbound side effects (send email, post to LinkedIn, mutate CRM) land in `drafts/` first. A human clicks Approve. No silent autopilot outreach.
- **Bring your own integrations.** 25+ first-party connectors plus arbitrary MCP servers via `.bm/mcp.json`.

---

## ✨ Features

- 🗂 **Markdown-native context.** Your CRM is a folder. `companies/acme.md`, `contacts/acme/jane-doe.md`, `deals/open/acme-q2.md`. Frontmatter for structured fields, body for notes. Wikilinks (`[[Acme]]`) resolve across the whole context.
- 💬 **Chat-driven workflow.** Ask "enrich acme.com and draft a first-touch email to their head of RevOps" — the agent fetches the web, calls enrichment APIs, writes `companies/acme.md`, drops a draft in `drafts/`.
- 🤖 **Multi-agent runtime.** Define roles in `agents/sdr.md`, `agents/researcher.md`, `agents/ae.md`. Each agent has its own system prompt, tool list, and memory.
- 📅 **Sequences + triggers.** Multi-touch outreach with a daily drip cron. Triggers as plain markdown (`triggers/competitor-news.md`) — cron schedule or inbound webhook fires an agent run against a playbook.
- 📚 **Playbooks.** 33 reusable prompt templates out of the box — closed-lost revival, deal manager, GEO agent, LinkedIn outreach, lookalike discovery, meeting prep, outreach, pipeline ops, research, website-visitor follow-up, and more.
- 🔍 **Brand monitor + GEO.** Track your brand and competitors across Google AI Overviews and traditional SERPs. Built-in presets for one-click setup.
- 🌐 **3D knowledge ontology.** A Three.js force-directed graph at `/ontology` that renders the full graph of companies, contacts, deals, and the relationships between them.
- 🔗 **Wikilinks + backlinks.** `[[Company]]` resolution across the context, with backlink panels on every note.
- 🧩 **MCP server registry.** Drop any Model Context Protocol server into `.bm/mcp.json` — instantly available as agent tools.
- 📤 **Export PDF.** Any run, chat, context page, or GEO report exports to a full-page PDF with one click.
- 🔔 **Native notifications.** Sidebar breathing dots + macOS/Windows notifications for agent starts, completions, and trigger firings.
- 🔒 **Local-first daemon.** A Node HTTP/WS server bound to `127.0.0.1`, spawned by Electron. No incoming connections, no telemetry beyond per-call token counts for billing.

---

## 🚀 Quick start

### macOS (recommended — Homebrew)

```sh
brew install --cask blackmagic-ai/tap/blackmagic-ai
```

Homebrew strips the quarantine flag, so the app opens without the "BlackMagic AI is damaged" warning that macOS shows on a direct DMG download.

### Windows

Grab the latest `.exe` from [Releases](https://github.com/blackmagic-ai/blackmagic-desktop/releases) and run it.

### Run from source

Requirements: Node ≥ 20.9, pnpm 10.

```bash
git clone https://github.com/blackmagic-ai/blackmagic-desktop.git
cd blackmagic-desktop
pnpm install
cp .env.example .env
pnpm dev
```

Three workspaces start in parallel: the Next.js renderer, the Electron shell, and the Node daemon. The desktop window opens on its own.

### Build a distributable

```bash
pnpm package:mac   # → apps/desktop/release/*.dmg (arm64 + x64)
pnpm package:win   # → apps/desktop/release/*.exe
```

---

## 🏗 Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Electron shell (apps/desktop)                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Next.js renderer (apps/web)                         │  │
│  │  TanStack Query + Zustand + shadcn/ui                │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ▲ ▼                               │
│                       HTTP / WS                            │
│                          ▲ ▼                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Daemon (daemon/) — Node, 127.0.0.1 only             │  │
│  │  • Agent loop (Responses API)                        │  │
│  │  • Tool dispatch (file ops, web, integrations)       │  │
│  │  • Cron + webhook triggers                           │  │
│  │  • MCP server registry                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ▲ ▼                               │
└──────────────────────────┼─────────────────────────────────┘
                           │
                  ┌────────▼─────────┐
                  │  ~/BlackMagic/   │  Markdown context
                  │  (your data)     │  on local disk
                  └──────────────────┘
```

**Repo layout:**

```
apps/
  desktop/          Electron main + preload (Node)
  web/              Next.js renderer (static export, loaded by Electron)
packages/
  core/             Zustand stores + TanStack Query hooks + API client
  ui/               shadcn atoms (zero business logic)
  views/            Shared pages (Chat, Context, Agents, Runs, Settings)
  context/          Markdown context ops (read/write/frontmatter/watch)
  adapter-codex/    Responses API client + agent loop
daemon/             Node HTTP/WS server on 127.0.0.1, spawned by Electron
scripts/            Release tooling
```

**Your context (`~/BlackMagic/`):**

```
CLAUDE.md               # global: your ICP, tone, forbidden words
agents/                 # role definitions (sdr.md, researcher.md, ae.md)
companies/              # one .md per company (frontmatter + notes)
contacts/<company>/     # one .md per contact
deals/
  open/                 # one .md per open opportunity
  closed-won/
  closed-lost/
playbooks/              # reusable prompt templates
triggers/               # cron / webhook definitions
drafts/                 # outbound drafts, awaiting human review
runs/<timestamp>/       # per-run log dirs
.bm/
  config.toml           # API key, daemon port, default model
  mcp.json              # MCP server registry
```

---

## 🧩 Integrations

First-party connectors (configure once in **Settings → Integrations**):

| CRM            | Outreach        | Comms          | Productivity   | Data            |
|----------------|-----------------|----------------|----------------|-----------------|
| HubSpot        | Apollo          | Gmail          | Notion         | Apify           |
| Salesforce     | Unipile         | Slack          | Linear         | PDL             |
| Attio          | Amazon SES      | Discord        | GitHub         | EnrichLayer     |
| Pipedrive      | Resend          | Telegram       | Google Calendar| Google Search Console |
|                | Ghost           | Feishu         | Cal.com        | Google Analytics |
|                | WordPress       |                |                | Metabase        |
|                |                 |                |                | RB2B            |
|                |                 |                |                | Stripe          |

Plus arbitrary **MCP servers** via `.bm/mcp.json` for anything else.

---

## 🛠 Development

```bash
pnpm dev              # all workspaces in parallel
pnpm dev:daemon       # daemon only (HTTP + WS on an ephemeral port)
pnpm dev:web          # Next.js renderer in a normal browser
pnpm dev:desktop      # Electron shell

pnpm typecheck        # turbo-orchestrated TS check
pnpm lint
pnpm test             # unit tests across packages
pnpm test:e2e         # smoke test the running daemon
```

Environment overrides live in `.env` — see [`.env.example`](.env.example) for the (small) list. None are required in production; first-launch onboarding wires everything for you.

---

## 🤝 Contributing

PRs and issues welcome. Before opening a large PR:

1. Open an issue to discuss the design.
2. Run `pnpm typecheck && pnpm lint && pnpm test` — must pass.
3. For UI changes, include screenshots or a short Loom.

We follow a "small, frequent commits" style — see the recent git log for the cadence.

---

## 📄 License

Apache License 2.0 — see [LICENSE](LICENSE).

You can fork it, audit it, self-host it, ship a derivative product on top of it. We just ask that you preserve the license + attribution.
