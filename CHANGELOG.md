# Changelog

All notable changes to BlackMagic AI. Dates in UTC.

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
  tokensOut, 2-minute ceiling) plus refetch on window focus. Stops the
  "N live" badge from sticking after runs complete. (BUG-003)
- **Chat** — reconcile the last assistant message to the server's
  `final` payload on `done`; fixes "(empty)" bubbles when streamed text
  deltas didn't fire. (BUG-004)
- **Project picker** — opens as a modal with Escape and outside-click
  dismissal when invoked from the sidebar. (BUG-005)
- **Vault + Settings** — show the active vault path instead of the
  hardcoded `~/BlackMagic/`. (BUG-006)
- **Playbooks** — Run Playbook is disabled while required inputs are
  empty or the domain field is malformed; includes inline reason.
  (BUG-007)
- **Agents** — replaced `window.prompt()` (disabled in packaged
  Electron) with an inline "New agent" form. (BUG-008)
- **Versioning** — unified at 0.3.0 across workspaces and the daemon
  `/api/health` response. (BUG-009)
- **Contacts** — empty state with CTAs to Companies enrichment and
  Chat. (BUG-010)
- **Org tree** — counts only files, ignoring directory entries from
  the vault walk. (BUG-011)
- **Knowledge graph** — match count and "no match" feedback next to
  the Highlight input. (BUG-012)
- **Sequences** — `Run walker now` reports enrollments · fired ·
  failed after a walk. (BUG-013)

### Released
- Homebrew cask bumped to 0.3.0 via `blackmagic-ai/homebrew-tap`.
  `brew upgrade --cask blackmagic-ai`.
