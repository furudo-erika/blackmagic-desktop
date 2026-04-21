# Research Agent (`researcher`)

**Default chat agent.** Everything unroutable lands here.

- Definition: `daemon/src/vault.ts` ≈ lines 534–573
- Model: `gpt-5.3-codex` · Temperature: 0.2 · Icon: `Search`

## Purpose

Freeform research + chat. Enriches companies, pulls live web context,
drafts outbound emails, and enrolls contacts into sequences when the user
asks for follow-through. This is the agent the Chat page uses when no
other agent is selected.

## Tools allowed

```
read_file, write_file, edit_file, list_dir, grep,
web_fetch, web_search,
enrich_company, enrich_contact, enrich_contact_linkedin,
draft_create, enroll_contact_in_sequence
```

## Vault I/O

- Writes `companies/<slug>.md` with firm data after enrichment
- Writes `drafts/<ts>-<to>.md` for any outbound it proposes (approve-gated)
- Reads from anywhere; treats `signals/*`, `deals/*`, `us/*` as context

## Trigger

None direct. Playbooks that delegate to it: `enrich-company`,
`deep-research-account`, `brand-mention-scan`, etc.

## Dependencies

- `enrich_company` / `enrich_contact` / `enrich_contact_linkedin` — all
  proxied through `blackmagic.engineering/api/agent-tools/*` using the user's
  `ck_` token. No BYO key required on the desktop side.
- `web_search` is OpenAI Responses built-in; billed per search by the
  proxy.

## Quirks

- **Migration shim**: `daemon/src/vault.ts` (≈ line 2337) silently adds
  `draft_create` + `enroll_contact_in_sequence` to existing
  `agents/researcher.md` files on old vaults so long-running users don't
  miss the behavior. Don't remove that unless you also write a cleanup
  migration.
- Default-model fallback lives here — if a chat request has no agent set,
  the code path resolves to this slug.
- Tool list is intentionally wide because this is the generalist; other
  agents get narrower allowlists.
