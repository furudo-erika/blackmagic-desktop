# Agent Runtime

## Wire protocol

Every agent turn is a `POST` to `${ZENN_BASE_URL}/responses`:

```http
POST https://zenn.engineering/api/v1/responses
Authorization: Bearer ck_...
Content-Type: application/json

{
  "model": "gpt-5.3-codex",
  "input": [
    { "role": "system",    "content": "<rendered from CLAUDE.md + agents/<name>.md>" },
    { "role": "user",      "content": "<task>" },
    { "role": "tool",      "tool_call_id": "...", "content": "<tool result>" }
  ],
  "tools": [ { "type": "function", "function": {...} } ],
  "stream": true
}
```

Responses API streams events as SSE. Key events we handle:

- `response.output_text.delta` → append to user-visible stream
- `response.function_call_arguments.done` → execute tool, push result back as next input turn
- `response.completed` → close stream, compute token totals, post billing event

The loop continues (tool → response → tool → …) until the model produces an assistant message with no further tool calls, or until `max_turns` (default 20) is hit.

## Agent definition

An agent is `agents/<name>.md`. Frontmatter declares model, tools, temperature. Body is the system prompt.

On each call the daemon composes the system prompt as:

```
[CLAUDE.md contents]

---

[agents/<name>.md body]

---

## Available tools
<human-readable tool list for the model>
```

## Built-in tools (V1)

| Tool | Purpose | Dangerous? |
|---|---|---|
| `read_file(path)` | Read a vault file | No |
| `write_file(path, content)` | Create/overwrite a vault file | Medium |
| `edit_file(path, old, new)` | Targeted edit | Medium |
| `rename_file(old_path, new_path)` | Move within vault | Medium |
| `list_dir(path)` | List vault contents | No |
| `grep(pattern, path?)` | ripgrep inside vault | No |
| `web_fetch(url)` | GET + readability extract | No |
| `web_search(query)` | Perplexity Sonar | No (paid) |
| `pdl_enrich(domain)` | PeopleDataLabs company enrich | No (paid) |
| `enrichlayer_person(linkedin_url)` | Person/email enrich | No (paid) |
| `apify_linkedin_search(title, geo?, limit?)` | LinkedIn profile search | No (paid) |
| `draft_create(channel, to, subject?, body, tool)` | Write a file into `drafts/` — NEVER sends | No |

Approve-gated tools (exposed but agent cannot call directly; only the UI `/api/drafts/:id/approve` route triggers them):

- `gmail.send` (via Gmail MCP)
- `linkedin.dm` (via LinkedIn MCP)
- `hubspot.create_deal` / `hubspot.update_deal` (via HubSpot MCP)

## MCP tools

`.bm/mcp.json` lists MCP servers:

```json
{
  "servers": {
    "gmail": { "command": "npx", "args": ["-y", "@gmail-mcp/server"] },
    "hubspot": { "command": "npx", "args": ["-y", "@hubspot-mcp/server"], "env": { "HUBSPOT_TOKEN": "..." } },
    "apollo": { "command": "npx", "args": ["-y", "apollo-mcp"] }
  }
}
```

At daemon boot, each server is spawned, initialized, and its `tools/list` response is merged into the tool registry with the prefix `<server>.<tool>`.

Per-agent tool allowlist (in agent frontmatter) decides which of the registry entries are exposed on any given call.

## Run logs

Every invocation creates `runs/<iso-ts>-<agent>/`:

- `prompt.md` — rendered system + user message
- `tool-calls.jsonl` — one JSON object per tool call (name, args, result, duration, tokens)
- `final.md` — assistant final message
- `meta.json` — `{ model, input_tokens, output_tokens, cost_cents, agent, playbook? }`

## Token metering

On `response.completed`, daemon:

1. Reads `usage.input_tokens` and `usage.output_tokens` from the zenn response.
2. Looks up `$/MTok` for `model` in `BILLING.md` price table.
3. Computes `cost_cents = (input_tokens * price_in + output_tokens * price_out) / 1e6 * 100`.
4. Appends `{model, in, out, cost_cents, ts}` to `runs/<ts>/meta.json`.
5. `POST ${BM_BILLING_URL}/api/token-events` with the tuple, auth'd with the user's `ck_` key.
6. If the response is 402 (credits exhausted), daemon refuses future agent runs and surfaces "top up" in UI.

## Concurrency

- One run per agent per vault at a time (lockfile in `runs/<ts>/.lock`).
- Global max-concurrent runs default 3.
- Chat messages from the UI are their own runs with agent=`chat`.

## MCP integration

Black Magic Desktop speaks the Model Context Protocol (stdio transport) as a
client. External capabilities — Gmail, Slack, LinkedIn, etc. — are plugged in
by declaring servers in `~/BlackMagic/.bm/mcp.json`:

```json
{
  "servers": {
    "gmail": { "command": "npx", "args": ["-y", "@gongrzhe/server-gmail-autoauth-mcp"] },
    "slack": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-slack"], "env": { "SLACK_TOKEN": "..." } }
  }
}
```

On daemon startup each server is spawned and the JSON-RPC handshake runs:

1. `initialize` (`protocolVersion: "2024-11-05"`) → capabilities + `serverInfo`.
2. `notifications/initialized`.
3. `tools/list` → inventory of that server's tools.

Every discovered tool is registered in the daemon's tool registry under the
namespaced name `<server>.<rawTool>` (e.g. `gmail.send_email`). They show up in
`GET /api/tools` with `source: "mcp"` alongside built-ins. The agent loop
calls them exactly like any other tool — handler forwards `tools/call` over
stdio to the owning subprocess.

A failing server (missing binary, handshake timeout) is logged and skipped;
the daemon keeps running. Servers are stopped on SIGTERM/SIGINT.

### Approve-gated send

Drafts written by `draft_create` carry a `tool:` frontmatter field naming the
MCP tool that should deliver the message (e.g. `gmail.send_email`). `POST
/api/drafts/:id/approve`:

- If the named tool is an MCP tool that's currently available, the daemon
  calls it with `{to, subject, body}` (shape expected by Gmail MCP + most
  outreach servers), flips `status: sent`, records `sent_at` and `message_id`
  (when the server returns one), and returns `{ok: true, messageId?}`.
- If the tool isn't wired, the draft is marked `approved` and the response
  includes a note pointing the user at `.bm/mcp.json`. This preserves the
  V1 behaviour for environments without MCP configured.
- On MCP call failure the draft stays at `approved` with `last_error` and
  the endpoint returns `{ok: false, error}`.

OAuth for third-party services lives inside each MCP server (typical pattern
for Gmail / Slack MCPs). The daemon never handles those credentials directly.
