# Changelog

All notable changes to BlackMagic AI. Dates in UTC.

## 0.3.7 — 2026-04-20

### Fixed
- **Project picker first-launch dismissal (BUG-005 follow-up)** — the
  picker now always renders as a modal with Escape / outside-click /
  ✕ dismissal, including the very first app launch. Previously 0.3.0
  only made the picker dismissable when re-opened from the sidebar;
  the first-run page-mode fallback was non-dismissable.

## 0.3.5 — 2026-04-20

### Fixed
- **Chat** — "(empty)" bubble no longer renders next to "thinking…".
  The placeholder assistant message is hidden while the request is
  in flight; the thinking bubble owns that slot.
- **Codex progress** — file_read, web_fetch, patch, and every other
  codex step now surface in the "working…" list so the UI no longer
  looks stuck during multi-step runs.

## 0.3.4 — 2026-04-20

### Added
- **Dark mode by default**. Light mode is still available via the
  sidebar toggle.

### Changed
- **Chat empty state** — dropped the hardcoded GTM scenario cards.
  Non-GTM vaults saw them as noise. Keeps a minimal header + wikilinks
  hint.

### Fixed
- **Sidebar version label** — daemon reports the real `BM_APP_VERSION`
  instead of a hardcoded `0.3.0`.

## 0.3.3 — 2026-04-20

### Fixed
- **Gatekeeper launch crash** — afterPack signs every Electron
  Framework helper (chrome_crashpad_handler, etc.) explicitly before
  sealing the framework bundle. Resolves "BlackMagic AI cannot be
  opened because of a problem" on 0.3.0–0.3.2.

## 0.3.1 / 0.3.2 (superseded)

Interim attempts at fixing the Team ID mismatch + leaf-first signing
that still missed nested helper binaries. Replaced by 0.3.3.

## 0.3.0 — 2026-04-20

Full QA pass (BUG-001 … BUG-013).

### Fixed
- **Companies** — strict domain regex gate; malformed domains can no
  longer start a run. (BUG-001)
- **Daemon `writeVaultFile`** — timestamped backup under
  `.bm/backups/` before overwriting any `companies/`, `contacts/`, or
  `deals/` profile, so retries can't silently clobber manual edits.
  (BUG-002)
- **Sidebar live-runs badge** — tighter filter (done flag, turns,
  tokensOut, 2-minute ceiling) plus refetch on window focus. (BUG-003)
- **Chat** — reconcile the last assistant message to the server's
  `final` payload on `done`. (BUG-004)
- **Project picker** — opens as a modal with Escape and outside-click
  dismissal. (BUG-005)
- **Vault + Settings** — show the active vault path. (BUG-006)
- **Playbooks** — Run Playbook disabled while required inputs are
  empty or malformed. (BUG-007)
- **Agents** — inline "New agent" form replaces `window.prompt()`.
  (BUG-008)
- **Versioning** unified at 0.3.0 across workspaces. (BUG-009)
- **Contacts** empty state with CTAs to Companies + Chat. (BUG-010)
- **Org tree** counts only files. (BUG-011)
- **Knowledge graph** shows match count + "no match" feedback.
  (BUG-012)
- **Sequences** `Run walker now` reports enrollments · fired · failed.
  (BUG-013)

## 0.2.11 (superseded)

Dropped `--options runtime` from the ad-hoc signature. Without a valid
entitlements.plist + notarized Developer ID, hardened runtime rejects
unsigned dylib loading at launch, which made 0.2.10 unable to open.
Superseded by 0.3.3 (which also fixes Team ID mismatch).

## 0.2.10 — 2026-04-20

### Fixed
- **Chat textarea** now grows based on content length on every input
  change (typing, scenario clicks, post-send clear).

## 0.2.9 — 2026-04-20

### Added
- **Force upgrade on launch** — every launch checks the R2 manifest
  and blocks with a brew-upgrade dialog if the app isn't the latest.
- **Integrations: Feishu / Metabase / Supabase.**
  - Feishu: `feishu_notify` (custom bot webhook), `feishu_send_message`
    (tenant token DM / group), `feishu_bitable_list_records`.
  - Metabase: `metabase_run_card`, `metabase_query_sql`,
    `metabase_search`.
  - Supabase: `supabase_select`, `supabase_insert`, `supabase_update`,
    `supabase_rpc`.

### Fixed
- **Sidebar live-runs badge** — honours the new `done` flag from
  `/api/agent/runs` so finished runs stop pulsing live.

## 0.2.8 — 2026-04-20

Version bump to roll the in-app upgrade banner + brew-only
distribution stack forward.

## 0.2.7 — 2026-04-20

### Added
- **Company Profiling Agent** (onboarding wizard) at
  `/onboarding/bootstrap`. Takes a domain (+ optional docs URL +
  extras), runs the bundled `bootstrap-self` playbook, populates the
  `us/` tree.
- **Apollo (direct API) + Attio (full toolkit).**
  - Apollo: `apollo_search_people`, `apollo_enrich_person`,
    `apollo_organization_search`. Replaces the Apify actor scrape.
  - Attio: `attio_search_records`, `attio_create_record` (with
    upsert), `attio_update_record`, `attio_create_note`,
    `attio_add_to_list`.
- **Upgrade banner** — R2 `version.json` check on launch; if a newer
  version exists, renderer shows a top banner with a one-click-copy
  brew upgrade command.
- **Sidebar → System → Profile company** entry.

### Fixed
- **login-gate hydration** — SSR and first client render no longer
  diverge on bridge presence.
- **/api/chat streaming** — the builtin Responses fallback streams
  token-by-token via SSE instead of returning one JSON payload. Event
  shapes normalised (`{ delta }`, `{ message }`).
- **Distribution** — dropped `electron-updater` and Windows builds;
  updates ship exclusively through brew cask.

## 0.2.6 — 2026-04-19

### Fixed
- **Chat 404 "endpoint not available on API subdomain"** — middleware
  accepts both `/v1/*` (canonical) and `/api/v1/*` (legacy) on
  `api.blackmagic.run`.
- **Gatekeeper "app is damaged"** — Homebrew cask under
  `blackmagic-ai/tap`; ad-hoc signing in afterPack; `postflight` runs
  `xattr -cr` as a backstop.
- **Billing** — `gpt-5.3-codex` aliased to `gpt-5.4` upstream so older
  daemons keep working. Credits no longer expire on monthly refresh.

### Added
- Dashboard "Install and launch" panel with copyable install + launch
  + upgrade brew commands.

## Earlier

Versions before 0.2.6 pre-date formal release notes. See git history.
