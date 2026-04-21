# Changelog

All notable changes to BlackMagic AI. Dates in UTC.

## 0.4.4 — 2026-04-21

### Fixed
- **"Upgrade and relaunch" relaunch loop.** The auto-upgrade script
  ran `brew upgrade --cask blackmagic-ai` without first refreshing
  brew's tap cache, so brew saw no newer version, exited 0, and the
  app relaunched into the same "out of date" dialog forever. The
  script now runs `brew update --quiet` first, passes `--greedy`
  (bypass brew's cask-auto-update heuristics), and if the installed
  version still doesn't match the latest after the upgrade, force a
  `brew reinstall --cask blackmagic-ai`. Log at
  `~/Library/Logs/BlackMagic AI/auto-upgrade-*.log` keeps a diff of
  installed vs latest so the next stuck upgrade is visible at a
  glance.

## 0.4.3 — 2026-04-21

### Added
- **GEO Analyst agent** (`agents/geo-analyst.md`), seeded to every
  vault. Executes the 12-step Generative Engine Optimization loop
  from the internal GEO PRD — ICP lock → Seed Query audit → prompt
  expansion → (Peec fan-out) → 6-field response parsing → 6-metric
  scoring → Gap Source analysis → Owned/Earned/Paid recommendations
  → draft distribution → 48h source-drop alerts → pipeline
  attribution → weekly report. English-only scope (ChatGPT, Google
  AI Overviews, Perplexity, Gemini, Claude, Copilot, Grok). Model:
  `gpt-5.4`.
- **Peec AI integration** (BYOK, `X-API-Key`, base
  `https://api.peec.ai/customer/v1`). Nine tools wired into the
  daemon: `peec_list_brands`, `peec_list_prompts`,
  `peec_create_prompt`, `peec_prompt_suggestions`,
  `peec_accept_prompt_suggestion`, `peec_report_brands` (SoV /
  Citation Rank / sentiment / visibility), `peec_report_domains`
  (cited sources — the highest-leverage GEO data, drives Gap
  analysis), `peec_report_urls`, `peec_source_content`. Key goes in
  Settings → Integrations → Peec AI. Peec's API is Enterprise-tier
  + beta per their docs; errors surface verbatim.
- **`geo-weekly` trigger** (Monday 07:00 cron). Fires the
  geo-analyst, pulls the week's Peec snapshot, diffs against last
  week's run, writes the weekly report to
  `signals/geo/weekly/<iso-week>.md`, and drops 48h source-drop
  alerts into `signals/geo/alerts/`.
- **`signals/geo/{runs,weekly,actions,alerts}`** directories in the
  vault skeleton so weekly snapshots, reports, action lists, and
  source-drop alerts each have their own home.

### Changed
- **Triggers now accept an `agent:` frontmatter field.** Previously
  triggers either ran a shell command, a playbook, or fell back to
  the hardcoded `researcher` agent. With `agent: geo-analyst` (or
  any agent slug) a cron can now fire any agent directly.

## 0.4.2 — 2026-04-21

### Removed
- **Demo brand names in Chat default scenarios.** `DEFAULT_SCENARIOS`
  still held six GTM prompt templates referencing `acme.com`,
  `beta-corp`, `jane@acme.com` even though the rendered scenario
  cards were dropped in 0.3.4 — the array still shipped in the
  bundle and its `length > 0` was what gated the "What do you want
  to do? / Reference files in your vault with [[wikilinks]]" copy.
  Array is now empty; Chat's empty state is blank unless a caller
  passes its own `scenarios`. The Team cockpit's agent-scoped
  scenarios are unaffected.

### Changed
- **Empty-state renders scenario cards when callers provide them.**
  For callers that do pass `scenarios` (e.g. agent-specific chats),
  the cards come back as a tidy grid, without the generic
  "What do you want to do?" title on top.

## 0.4.1 — 2026-04-21

### Fixed
- **Chat 呼吸灯 now persists through the whole run.** The thinking
  bubble previously had a lone `animate-pulse` dot that vanished the
  moment streaming text started, so during long replies the UI
  looked idle. Upgraded to the same animate-ping halo the sidebar
  and cockpit use, and pinned a second breathing dot next to the
  Chat title that stays on for the full duration of `sendMut.isPending`
  — streaming phase included.

## 0.4.0 — 2026-04-21

### Added
- **Agent cockpit** at `/team?slug=<agent>`. Clicking an agent in the
  Team sidebar now lands on a purpose-built page instead of opening
  the raw .md file or a duplicate chat. Shows identity + tools,
  status strip (last run · skill count · live indicator), the
  playbooks that agent owns as runnable skill cards (with inline
  inputs), and the 8 most recent runs by this agent. Header CTA
  deep-links into the main Chat with the agent preselected via
  `/?agent=<slug>`. Works for any agent file in the vault — no more
  404 on dynamic slugs under static export.
- **Chat agent picker.** The main Chat header now has a small
  dropdown populated from `agents/*.md`. Pick "auto (researcher)" or
  route the next message to any specific agent (Deal Manager,
  LinkedIn Outreach Agent, etc.). Setting it from the URL
  (`/?agent=<slug>`) preselects for deep links.

### Changed
- **Friendlier display names for the three base agents.** `ae` →
  "Deal Manager", `researcher` → "Research Agent", `sdr` →
  "Outreach Agent". Slugs stay stable so existing playbooks
  (`agent: researcher`, etc.) keep working. A migration rewrites
  existing vaults' frontmatter only when the `name:` field still
  matches the bare slug, so user renames are preserved.

## 0.3.12 — 2026-04-21

### Added
- **Seed six GTM persona agents into every vault.** The vault-backed
  sidebar in 0.3.11 correctly showed whatever was in `agents/*.md`,
  which for most projects meant just `ae`, `researcher`, `sdr`. Now
  every vault also seeds `website-visitor.md`, `linkedin-outreach.md`,
  `meeting-prep.md`, `lookalike-discovery.md`,
  `closed-lost-revival.md`, and `pipeline-ops.md` with real system
  prompts, tool allowlists, and Lucide-icon frontmatter. Existing
  vaults pick them up on next daemon start (missing-files-only
  write). Users can edit or delete any of them — sidebar reflects
  whatever is on disk.

## 0.3.11 — 2026-04-21

### Changed
- **Sidebar Team is now vault-backed.** The Team section used to be
  a hardcoded Swan-style GTM list (Website Visitor Agent, LinkedIn
  Outreach Agent, …). It now reads `agents/*.md` from the active
  project's vault and lists whatever role files exist there. Each
  entry links to the agent's definition in the vault editor so you
  can inspect/edit the system prompt directly. Falls back to the
  old hardcoded list only if the vault has no agents at all.

## 0.3.10 — 2026-04-21

### Added
- **Sidebar breathing light while a run is live.** Every nav item
  (Skills, Sequences, Triggers, Companies, Contacts, Deals, Org,
  Knowledge graph, Files, Integrations, Agent roles, Settings, Team
  agents) now shows the same animate-ping flame dot that the Runs
  row uses whenever `liveCount > 0`. Gives the whole sidebar a
  shared "呼吸灯" pulse so it's obvious at a glance that an agent is
  working, even when you've navigated away from /runs.

## 0.3.9 — 2026-04-21

### Changed
- **Auto-upgrade on out-of-date launch.** The launch-time version
  gate used to offer only "Copy command and quit". It now offers
  **Upgrade and relaunch** when Homebrew is on disk — the app spawns
  a detached shell that waits for the current process to exit, runs
  `brew upgrade --cask blackmagic-ai`, then `open -a "BlackMagic AI"`
  to reopen automatically. Output goes to
  `~/Library/Logs/BlackMagic AI/auto-upgrade-*.log` so a failed
  upgrade leaves a breadcrumb. Homebrew path is probed at
  `/opt/homebrew/bin/brew` and `/usr/local/bin/brew`; on systems
  without brew we fall back to the previous copy-command dialog.

## 0.3.8 — 2026-04-20

### Added
- **End-to-end LinkedIn outreach loop** — new universal skill
  `li-campaign-loop` + sequence `linkedin-post-signal` + preset
  trigger `linkedin-daily-outreach` (weekday 09:00). The loop
  gathers LinkedIn engagement signal, picks the top prospects,
  enriches each contact, calls `draft_create` for both
  `linkedin_connect` and `linkedin_dm`, enrolls the contact into the
  LinkedIn sequence, and writes a summary note to
  `signals/linkedin/<date>-loop.md`. Replaces the Apidog-era
  LinkedIn trigger that only printed usage output. Available in
  every project — seeded on vault creation and installable into
  existing vaults via Triggers → Install presets.

### Fixed
- **Chat tool stream** — `→ list_dir` / `✓ read_file` lines now
  include the load-bearing argument (path, url, domain, query, …)
  so users can see what the agent is actually touching instead of
  staring at an opaque list of tool names. The daemon forwards the
  call arguments on both pending + completed events.

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
