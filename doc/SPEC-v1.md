# Black Magic Desktop — V1 Spec

Build contract. When this doc conflicts with `PRODUCT.md`, this doc controls V1.

## 1. V1 Scope — In

1. Electron app launching on macOS (arm64 + x64) and Windows x64.
2. Bundled Node daemon on `127.0.0.1:<port>`, port written to `~/BlackMagic/.bm/config.toml`.
3. Vault at `~/BlackMagic/` by default, seeded on first launch.
4. Single agent runtime using the OpenAI Responses API against `https://zenn.engineering/api/v1`.
5. 12 built-in tools (see `AGENT.md`).
6. MCP client able to host external MCP servers declared in `.bm/mcp.json`.
7. Renderer (Next.js static export) with these pages:
   - Chat
   - Vault (file browser + editor)
   - Companies, Contacts, Deals (structured views over vault folders)
   - Agents (list + edit role md)
   - Playbooks (list + edit + run)
   - Triggers (list + enable/disable)
   - Outreach (drafts queue)
   - Runs (history + detail)
   - Tools (MCP registry)
   - Settings (API key, vault path, model, billing balance)
8. Trigger runtime (cron + webhook) in the daemon.
9. Draft → approve → send pipeline with Gmail MCP.
10. Token metering → `blackmagic.engineering/api/token-events`.

## 2. V1 Scope — Out

- Auto-update (manual .dmg re-install)
- Code signing (user may need to `xattr -d` on first open)
- Multi-tenant, team sync
- Mobile / web-only mode
- Plugin marketplace
- Streaming SSE to renderer for every intermediate token (we'll push full message chunks)

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Electron Main (apps/desktop)                                │
│  - spawns daemon subprocess with .env.local                 │
│  - creates BrowserWindow loading apps/web static export     │
│  - BrowserWindow preload exposes bmBridge.daemonPort        │
└─────────────┬──────────────────────────┬────────────────────┘
              │ fork                     │ loadURL
              ▼                          ▼
┌──────────────────────────┐  ┌─────────────────────────────┐
│ Daemon (daemon/)         │  │ Renderer (Next.js)          │
│  Hono HTTP + WS on       │  │  fetch('http://127.0.0.1:<p>│
│  127.0.0.1:<port>        │  │        /api/...')           │
│                          │  │                             │
│  - /api/chat             │◀─┤                             │
│  - /api/agent/run        │  │                             │
│  - /api/vault/*          │  │                             │
│  - /api/tools/*          │  │                             │
│  - /api/triggers/*       │  │                             │
│  - /ws (stream events)   │  │                             │
└──────┬──────────┬────────┘  └─────────────────────────────┘
       │          │
       │ HTTPS    │ fs
       ▼          ▼
 zenn API    ~/BlackMagic/
```

## 4. Key Invariants

- **Daemon binds 127.0.0.1 only.** Never `0.0.0.0`. Never listens on a public port.
- **Renderer talks to daemon via fetch to 127.0.0.1**, not Electron IPC. Keeps views usable in the browser when developing.
- **Every mutating call requires a local-auth token** (generated on daemon start, passed to renderer via preload). Prevents a malicious website in the same Electron session from hitting the daemon.
- **No vault content on the wire** except to the zenn Responses API (which is the whole point of a remote LLM call). Token event bodies contain model + token counts + timestamp only.
- **Drafts require explicit human Approve** before any send tool is called. The agent cannot call `gmail.send` directly; it can only call `draft.create`.

## 5. Ports, Paths, Config

| Key | Default | Override |
|---|---|---|
| Daemon port | ephemeral (picked at boot) | `BM_DAEMON_PORT` |
| Vault path | `~/BlackMagic/` | `BM_VAULT_PATH` / `.bm/config.toml` |
| Model | `gpt-5.3-codex` | `.bm/config.toml` `default_model` |
| Zenn base URL | `https://zenn.engineering/api/v1` | `ZENN_BASE_URL` |
| Billing backend | `https://blackmagic.engineering` | `BM_BILLING_URL` |

## 6. HTTP API (daemon)

All require `Authorization: Bearer <local-token>`.

```
GET  /api/health                     → { ok, version, vaultPath, model }
POST /api/chat                       { messages, agent? } → SSE stream
POST /api/agent/run                  { agent, task, stream? } → runId
GET  /api/agent/runs                 → [{ runId, agent, startedAt, status }]
GET  /api/agent/runs/:id             → full run log
GET  /api/vault/tree                 → file tree under vault
GET  /api/vault/file?path=...        → { content, frontmatter }
PUT  /api/vault/file                 { path, content } → { ok }
POST /api/vault/init                 → seed skeleton if missing
GET  /api/tools                      → [{ name, source, description }]
GET  /api/triggers                   → list
POST /api/triggers/:name/fire        → manual fire
GET  /api/drafts                     → list drafts
POST /api/drafts/:id/approve         → executes the send tool
POST /api/drafts/:id/reject          → deletes the draft
WS   /ws                             → run events, file change events
```

## 7. Milestones

| M | Outcome |
|---|---------|
| M0 | Monorepo + spec (this commit) |
| M1 | Daemon boots, `/api/health` returns 200, vault seeded |
| M2 | Agent loop calls zenn, writes `companies/<slug>.md` from a chat prompt |
| M3 | Electron wraps renderer + daemon; Chat page works end-to-end |
| M4 | Vault browser + editor pages |
| M5 | Playbooks (run a saved prompt against a target file) |
| M6 | Triggers (cron + webhook) |
| M7 | MCP client + Gmail draft/approve/send |
| M8 | Packaging (.dmg arm64+x64, .exe x64); smoke tested |
| M9 | Supabase cleanup + token_events endpoint; landing updated |

## 8. Success Criteria for V1

1. `pnpm package:mac` produces a runnable `.dmg` that seeds a vault, opens Chat, lets me send "Enrich acme.com", produces `companies/acme.md` with non-empty frontmatter, and deducts credits via a visible balance change on blackmagic.engineering.
2. `pnpm package:win` produces a runnable `.exe` with the same flow.
3. Re-launching the app finds the existing vault and resumes without re-seeding.
4. Supabase schema has only billing/auth tables; no domain data.
