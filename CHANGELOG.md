# Changelog

All notable changes to BlackMagic AI. Dates in UTC.

## 0.4.12 — 2026-04-21

### Fixed
- **Manual edits to company/contact/deal profiles are now
  discoverable and restorable.** Saving a profile from the vault
  editor stamps `human_edited_at:` into the frontmatter; the
  Companies list surfaces a flame-colored `edited` badge on those
  rows with a tooltip explaining that re-enrichment stashes a
  backup under `.bm/backups/` before overwriting. The company
  detail drawer now also lists the last 20 backups for that file
  with links into the vault viewer, so recovering a clobbered
  manual note is one click instead of a terminal dive (QA
  BUG-03).
- **New `GET /api/vault/backups?path=...`** endpoint that returns
  the list of timestamped backups the daemon has already been
  writing under `.bm/backups/` for profile files. Used by the
  Companies detail drawer; also handy for external tooling.

## 0.4.11 — 2026-04-21

### Added
- **Feishu, Metabase, Supabase** now show up as cards on the
  Integrations page. The daemon already accepted keys for all three
  (Settings → Integration keys), but the card UI was missing so
  users couldn't see that Feishu/Metabase/Supabase were wired. Feishu
  joins the Messaging group; Metabase + Supabase get their own new
  "Data" group.
- **Brand tile for every integration card.** Each provider now
  shows a colored square with its short glyph (H / A / SF / G / U /
  S / M / 飞 / MB) next to the name, so cards are visually
  distinguishable at a glance instead of all looking the same.

### Changed
- **Company Profiler is now a first-class Team agent.** Moved out of
  Sidebar → System → "Profile company" (where it was buried under
  Integrations / Agent roles / Settings) into the **Team** section at
  the top of the list. Seeded as `agents/company-profiler.md` with
  `pin: first` frontmatter so it always sorts above the other nine
  agents. Icon is Sparkles.
- **Sidebar agent rows respect `href:` frontmatter.** Agents with
  an explicit `href` in frontmatter route there instead of the
  generic `/team?slug=X` cockpit. Company Profiler uses this to
  jump straight to `/onboarding/bootstrap` (the bootstrap-self
  playbook that crawls your domain + docs and populates the `us/`
  tree) — clicking it in Team takes you to the form, not a chat.
  Other agents still land on the chat cockpit.
- **Sort by `pin` then name.** Team list sort now honors a
  `pin: first` frontmatter field before alpha-sorting, so pinned
  agents never get bumped down as new ones are added.

## 0.4.10 — 2026-04-21

### Changed
- **All 10 agent system prompts rewritten autonomous-first.** Every
  agent now executes a full READ → PLAN → ACT → SUMMARIZE cycle in
  one run instead of stopping midway to ask the user what to do. The
  three classic "I can't continue without X" halt points — missing
  ICP, empty signal file, missing personas — now auto-bootstrap with
  a best-effort default marked `draft: true` in frontmatter so a
  human can review later, and the agent keeps going. Halts are
  reserved for genuine hard blockers (missing API credential a tool
  can't run without, destructive action requiring confirmation,
  persistent upstream 5xx) and come with a one-line statement of the
  exact resolution needed.
- **GEO Analyst auto-bootstraps personas + brand config.** Step 1
  (personas < 2) now derives 2 draft personas from `us/company.md` +
  `us/icp.md` + `us/customers/top.md`. Step 2 (no brands or no
  `is_us: true`) infers from `us/company.md` + `us/competitors/*`
  and calls `geo_set_brands`. Step 3 (thin prompt pool) generates
  candidates per persona × 6 query types. The full 10-step loop now
  runs to the weekly report without interruption.
- **Every seeded agent gains `revision:` frontmatter.** `ensureVault`
  now compares the template's revision vs the user's on-disk file
  and overwrites when newer. This retires stale `peec_*` tool lists
  on vaults seeded in 0.4.3 and ships prompt rewrites without
  requiring manual vault cleanup. Future edits only need a revision
  bump to propagate.

## 0.4.9 — 2026-04-21

### Fixed
- **Sidebar breathing light is now per-agent, not global.** Earlier
  versions lit every nav item (Skills, Companies, Integrations,
  Settings…) whenever any run was live, which made the whole
  sidebar look busy for no reason. Breathing is now scoped to the
  specific Team row whose agent has a live run. Non-Team rows no
  longer pulse — the Runs row's `liveCount` pill covers "how many
  agents are running total".

### Changed
- **Cockpit starter prompt asks agents to execute, not narrate.**
  The default "Kick off <Agent>" starter used to say "walk me
  through the first thing you would do … reply with: (1) concrete
  first step, (2) tools you would call, (3) expected output". That
  reliably produced essays instead of work. New starter "Run
  <Agent> end-to-end" tells the agent to actually execute, only
  stopping for genuinely ambiguous human decisions, and to summarize
  what it wrote when done.

## 0.4.8 — 2026-04-21

### Fixed
- **Auto-upgrade now reads the Homebrew cask directly.** Both the
  launch-time hard gate and the renderer's soft upgrade banner used
  to compare against the R2 `version.json` manifest. That manifest
  is only refreshed by `./scripts/release.sh`, which means any
  0.4.x version bumped in the repo but not packaged looked "up to
  date" to the installed app — exactly why 0.4.6 on disk never saw
  0.4.7. Source of truth is now the tap's cask file at
  `https://raw.githubusercontent.com/blackmagic-ai/homebrew-tap/main/Casks/blackmagic-ai.rb`,
  parsed with a regex on `version "X.Y.Z"`. No R2 dependency, cache-
  busted per check.

## 0.4.7 — 2026-04-21

### Added
- **GEO is now native.** Drops the Peec AI integration and replaces it
  with a daily sweep that runs your seed-prompt pool through ChatGPT
  (gpt-5.2 + web_search), Perplexity Sonar, and Google AI Overview
  (via SerpAPI) — all proxied through blackmagic.run, so you never
  manage upstream keys. Credits are charged at OpenAI / Perplexity /
  SerpAPI list price + 10% markup (8¢ / 2¢ / 2¢ per call). Results
  land in `signals/geo/runs/<date>/<model>/<prompt>.json`.
- **`/geo` dashboard.** Four "biggest mover" cards at the top (SoV
  up/down, new/lost domain). Brand SoV bars render the prior-period
  ghost behind the current bar + a signed Δ column with up/down/flat
  arrows. SoV line chart overlays the prior period as a dashed line
  so you see the week-over-week shape, not just the absolute. Domain
  data split into four tables: biggest gains, biggest losses, new
  this period, lost this period. Gap sources (domains cited when
  competitors are mentioned but not when you are) keep their own
  panel.
- **Twelve new `geo_*` tools** wired into the rewritten GEO Analyst
  agent: `geo_list_prompts`, `geo_add_prompt`, `geo_remove_prompt`,
  `geo_list_brands`, `geo_set_brands`, `geo_run_prompt`,
  `geo_run_daily`, `geo_report_brands`, `geo_report_domains`,
  `geo_gap_sources`, `geo_sov_trend`, `geo_list_runs`.
- **Two triggers.** `geo-daily` fires `POST /api/geo/run` at 07:00
  every day to refresh the pool; `geo-weekly` runs the GEO Analyst
  agent every Monday 09:00 against the week's stored snapshots.

### Removed
- **Peec AI integration.** The nine `peec_*` tools are gone. The
  `peec_api_key` setting is retired — proxying through
  blackmagic.run means no per-user third-party key to manage.

## 0.4.6 — 2026-04-21

### Fixed
- **Agent cockpit client-side exception.** The scenarios `useMemo`
  lived after the early-return guards in `AgentCockpit`, so hook
  order changed between "loading" and "loaded" renders and React
  crashed the page with "a client-side exception has occurred".
  Moved the memo above the guards so hook order stays stable.

## 0.4.5 — 2026-04-21

### Changed
- **Agent cockpit is now an interactive workspace.** Clicking an
  agent used to land on a read-only "what it can do / tools / runs"
  page with a separate "Chat with X" button that page-jumped you
  away. Now the cockpit embeds ChatSurface inline: chat on the
  left (scoped to that agent, its own thread), skills + recent
  runs + tools in the right rail. No more hop to /Chat, no more
  "what do I do" confusion — the chat input is the primary action.
- **Empty state points at chat.** When an agent has zero skills
  (like the new GEO Analyst), the "Skills" rail says "just chat on
  the left" instead of the old confusing "Add a playbook with
  agent: <slug>" message. A default starter prompt ("Kick off
  <Agent>…") is seeded into the empty chat so there's always one
  obvious next move.
- **Chat agent picker switches threads.** Selecting a different
  agent now swaps the thread to that agent's own history
  (`bm-team-thread-<slug>`). The picker label reads "Agent:" with
  tooltip "Switch agents — each one has its own thread so you can
  run many in parallel". Swapping back to Default (Research Agent)
  restores the global chat thread.

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
