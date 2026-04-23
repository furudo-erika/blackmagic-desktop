# Changelog

All notable changes to BlackMagic AI. Dates in UTC.

## 0.4.80 — 2026-04-23

### Changed
- **Resend logo swapped again** (landing integrations grid) to a cleaner
  square "R" asset from gstatic. The previous cdn.resend.com rebrand
  image was loading inconsistently.

### Added
- **Content Studio agent.** New agent seeded into every vault at
  \`agents/content-studio.md\`. Wraps the existing
  \`hypereal_generate\` tool with a full creative playbook:
  - **Promo videos + Reels / TikToks / Shorts** via Seedance 2.0
    (default), Veo-3, Kling-1.6, Hailuo-02, Vidu-Q1 — kind:
    \`video\`, with aspect + duration defaults that match each
    surface (9:16 social, 16:9 horizontal, 1:1 square).
  - **Product + lifestyle stills** (IG, TikTok covers, blog
    headers) via gpt-image-2 — kind: \`image\`, aspect presets for
    4:5 feed / 9:16 story / 16:9 blog.
  - **Voice-over / narration** — kind: \`voice\`, voice_id + script.
  - **Blog posts** — full drafts anchored in \`us/brand/voice.md\`,
    saved as CMS drafts (Ghost / WordPress) with a matching
    generated header image attached in the same run.
  - **Social captions + ad variants** — 3-5 variants per ask,
    written to \`drafts/\` for human pick + send.
  Ships with starter prompts for TikTok hooks, IG product shots,
  blog posts, and founder-style Reels. Every generation logs
  provenance (model / prompt / job_id / aspect / duration) into
  \`signals/content/<iso-date>-<slug>.md\`.

## 0.4.79 — 2026-04-23

### Changed
- **Removed the agent gallery tiles from the chat empty state** (reverted
  the 0.4.73 re-add). Picking a card still triggered a client-side
  exception on some installs via the corrupt-thread path — rolling the
  UI back to the 0.4.70 layout. Composer with the agent picker pill
  stays; empty state now only shows the starter-prompt cards for the
  currently-selected agent.

## 0.4.78 — 2026-04-23

### Fixed
- **Chat crashed with `Cannot read properties of undefined (reading 'length')`
  when clicking any agent tile on the empty-state gallery.** Root cause:
  `loadThread` blindly assigned `data.messages` from `/api/chats/:id` into
  React state — if the stored chat JSON was missing the `messages` field
  (older/partial file on disk), the next render choked on `messages.length`
  / `messages.map` and blew up the whole chat surface with a client-side
  exception. Now guards with `Array.isArray(data.messages) ? ... : []`, so
  a corrupt thread file just shows an empty chat instead of bricking the
  page.

## 0.4.77 — 2026-04-23

### Added
- **End-to-end lead pipeline: `enrich → score → route → sync`.**
  Scoring and routing used to be prompt-driven — the LLM was
  asked to "stamp an icp_score", results drifted run-to-run, and
  nothing pushed back to the CRM. This release replaces that
  with a deterministic rule engine backed by two vault files:
  - `us/market/icp.md` frontmatter `rubric:` block — weighted
    predicates (`between`, `in`, `any_of`, `contains`, `gte`,
    `lte`, `equals`) over any record field. Every hit adds its
    weight; `icp_score` = round(100 × hits / total).
  - `us/team/routing.md` frontmatter `rules:` — first-match
    owner assignment with per-CRM owner ids
    (`hubspot_owner_id`, `salesforce_owner_id`,
    `pipedrive_owner_id`, `attio_workspace_member_id`).
  Both files are seeded with working defaults on new vaults;
  edit the YAML and every future run picks up the change.
- **`enrich_score_route` tool.** One-shot orchestrator: given a
  domain, it enriches, scores against the rubric, picks an
  owner, and upserts the record into every connected CRM
  (HubSpot, Attio, Salesforce, Pipedrive) plus the local
  `companies/<slug>.md`. Per-target results come back
  independently — a missing Pipedrive key doesn't fail the
  HubSpot write.
- **Salesforce CRM — real tools, not just a declaration.** Was
  listed in integrations with zero handlers. Now ships
  `salesforce_create_contact`, `salesforce_update_contact`,
  `salesforce_create_account`, `salesforce_create_note`,
  `salesforce_search` (SOQL). OAuth2 bearer + instance URL,
  REST v59.0.
- **Pipedrive CRM added** — `pipedrive_create_person`,
  `pipedrive_update_person`, `pipedrive_create_organization`,
  `pipedrive_create_note`, `pipedrive_search`. API v1.
- **New `/pipeline` page** in the sidebar. Paste a domain,
  optionally override fields, hit Run — see the rubric
  breakdown, the owner rule that fired, and per-target sync
  status (vault + each CRM). Same engine the agent calls via
  `enrich_score_route`, so UI and agent can't drift.
- **HTTP routes:** `GET /api/pipeline/rubric`,
  `POST /api/pipeline/score`, `POST /api/pipeline/route`,
  `POST /api/pipeline/run`.

## 0.4.76 — 2026-04-23

### Changed
- **Resend logo** on the marketing integrations grid swapped to the
  rebrand-era "R" square image from cdn.resend.com/posts — the
  white-PNG-with-CSS-mask approach was rendering flat on the
  colored tiles.

## 0.4.75 — 2026-04-23

### Changed
- **RB2B logo** on the marketing integrations grid swapped to their
  LinkedIn company-logo CDN url (the webflow-hosted SVG was loading
  mis-cropped on some tiles).

## 0.4.74 — 2026-04-23

### Added
- **RB2B integration** (de-anonymize US site visitors). New
  `rb2b_list_visitors` tool + `rb2b-visitor-sweep` skill: pulls
  yesterday's identified sessions, scores them against `us/market/icp.md`,
  drops HOT/WARM into `companies/` + `contacts/`, writes a daily
  `signals/visitors/<date>.md`, and notifies. Works as a trigger:
  `0 9 * * 1-5`.
- **Hypereal integration** (AI content — image, video, voice). New
  `hypereal_generate` tool wraps hypereal.cloud's unified API
  (Seedance 2.0, Veo-3, Kling, WAN, ElevenLabs) so agents can
  auto-produce demo/promo media without a human in the loop. Docs:
  https://hypereal.cloud/docs.
- **Gmail API** (full read + send, not just an OAuth stub). New tools:
  `gmail_list_messages`, `gmail_get_message`, `gmail_send`. Scope is
  `gmail.modify` (read + label + send, never permanent delete). New
  `inbox-triage` skill: classifies unread into REPLY_TODAY / FYI /
  SPAM and writes a daily digest — never auto-replies.
- **Google Calendar API**. New tools: `gcal_list_events`,
  `gcal_create_event` (with optional Meet auto-provisioning),
  `gcal_delete_event`. Scope `calendar`. New `meeting-digest` skill:
  end-of-day prep brief for tomorrow's external meetings, pulling
  CRM deal-stage + recent Gmail threads with each attendee.

### Changed
- **Gmail credential shape widened** from single `token` to
  `access_token` + `refresh_token` + `email`. Legacy `token` field
  still recognised for backwards-compat with older saved creds.
- **Resend logo** on the marketing homepage updated to the official
  white PNG (rendered as monochrome silhouette in brand color on the
  white tiles).
- **Integrations page** (desktop): added Hypereal card under a new
  "AI content generation" group, Google Calendar card next to
  Cal.com under Scheduling, updated Gmail / RB2B descriptions to
  point at the new skills.

## 0.4.73 — 2026-04-23

### Changed
- **Chat empty state shows the agents as a tiled card grid again.**
  Regression from 0.4.70 when the agent picker moved into the
  composer pill — the empty Chat page dropped the gallery along
  with it, leaving a blank canvas. Now: before you pick an agent
  or send anything, Chat tiles every vault agent as an icon +
  name + tagline card; click one to select it as the routing
  agent for this thread. The whole gallery disappears the moment
  the first message goes out.

## 0.4.72 — 2026-04-23

### Fixed
- **GEO "Run now" button felt unresponsive.** The sweep itself takes
  ~30s but the button only changed its text label to "Running…" —
  easy to miss, so people would re-click thinking the first click
  hadn't registered. Now: swaps in a spinning loader icon the instant
  you click, label reads "Running… (can take ~30s)" so the wait is
  expected, and the button is `disabled` against double-fires.
- **Every primitive Button now has a pressed-state animation** — a
  quick `scale(0.96)` on `:active` so every click gives immediate
  tactile feedback, not just the GEO one.

## 0.4.71 — 2026-04-23

### Changed
- **Composer agent pill relabeled "No agent"** (was "Default agent" /
  "Default"). There isn't a default agent — when nothing is picked
  the message goes straight to BlackMagic AI with no agent routing,
  so the pill now says so plainly.
- **Sidebar footer: full "BlackMagic AI" wordmark no longer gets
  truncated.** The version number moved onto its own line under the
  logo/wordmark row so the name always fits at the narrow sidebar
  width.

## 0.4.70 — 2026-04-23

### Changed
- **Unified chat composer across Home and /chat.** Extracted the
  composer into `components/composer.tsx` and swapped both pages
  onto it. Same rounded-card look (the one you liked on Home), same
  auto-size textarea, same ⌘↵ to send, same `@`-mention popover to
  loop in agents, same `/` slash commands (`/clear`, `/skills`,
  `/agent`).
- **Agent picker now lives inside the composer.** Killed the Agents
  cards grid that used to dominate the empty state of /chat —
  instead a pill-button on the left of the composer footer shows
  the current routing agent (with its monogram icon) and opens an
  inline menu of every agent in the vault, ChatGPT-style. Much
  less visual clutter and the pick follows you into the message
  you're already typing. Header's redundant "Agent: …" dropdown
  removed since the pill replaces it.
- **Home composer picker hands off correctly to /chat.** If you
  pick a specific agent on the Home composer, Send routes to
  `/chat?agent=<slug>` and writes to that agent's per-agent thread
  bucket (`bm-team-thread-<slug>`) so the chat opens the right
  history; otherwise you land on the default thread as before.

## 0.4.69 — 2026-04-23

### Fixed
- **Brand monitor returned unrelated Reddit posts as "mentions".**
  The `brand-monitor-apify` and `reddit-pulse` skills called
  `trudax/reddit-scraper-lite` with `sort: "new"`, which ignores the
  search term when fresh hits are sparse and just returns recent posts
  from Reddit's firehose. Example bug report: searching for `apidog`
  surfaced an AutoModerator welcome post in r/Morocco that mentioned
  neither Apidog nor Apifox anywhere. The skills also had no
  post-scrape verification — whatever Apify returned became a
  "mention", then got misclassified as a `question`.

  Two fixes in `daemon/src/vault.ts`:
  - Switched both skills to `sort: "relevance"`.
  - Added an explicit verify-keyword-presence step: drop any scraped
    item where the keyword does not appear case-insensitively in
    `title + body + url + author`. This kills the false positives
    that the scraper leaks even on relevance sort.

## 0.4.68 — 2026-04-23

### Fixed
- **Chat sent from Home vanished mid-stream; page "froze" on the
  empty agent gallery.** Root cause: when you composed on Home, it
  wrote a fresh `bm-last-thread` + pending prompt to localStorage
  and routed to `/chat`. The chat surface installs a 1s interval
  to detect thread changes from other tabs, and the interval's
  closure captured `threadId` at effect-setup time (right after
  the setup block resets it to `''`). Every second it compared the
  new thread ID in localStorage against the stale `''`, decided
  the thread changed, and called `loadThread()` — which hits
  `getChat` on a thread the daemon hasn't persisted yet, falls
  into the catch branch, and runs `setMessages([])`. That wiped
  the user's message and the in-flight assistant reply mid-stream,
  so when the mutation finished you were left with
  `messages.length === 0` + `sendMut.isPending === false`, which
  is exactly the empty-state agent gallery. Fix: the interval now
  reads `threadId` through a ref (latest value, no stale
  closure) and bails out entirely while a send is in flight
  (`sendPendingRef.current`). Multi-tab sync still works once the
  current send completes.

## 0.4.67 — 2026-04-22

### Added
- **Google Analytics (GA4) integration.** Connect a GA4 property by
  pasting a service-account JSON + numeric Property ID under
  Integrations → Analytics → Google Analytics. Service-account-based
  auth uses the same JWT-for-access-token dance as GSC (scope
  `analytics.readonly`) and caches the token in-memory for ~55 min
  per credential fingerprint.
- **Three new agent tools:** `ga_run_report` (generic GA4 Data API
  report: dimensions/metrics/date-range/limit/orderBy),
  `ga_top_pages` (shortcut for "which pages drove sessions" with
  sessions, activeUsers, screenPageViews, engagementRate — ordered
  DESC by sessions), and `ga_realtime` (last-30-min active users
  broken down by country / device / screen). All three route
  through a shared `gaAccessToken()` helper and accept either
  `"properties/123"` or bare `"123"` for the property ID.
- **`ga-traffic-brief` skill.** Weekly analytics digest that
  classifies pages into SURGE (sessions up ≥50% WoW, ≥200 sessions
  current window), DROP (down ≥30% WoW, ≥200 sessions prior
  window), and CONVERT (engagementRate above property average AND
  conversions > 0). Writes
  `signals/analytics/<date>-brief.md`, fires `notify()` with the
  top items, and self-schedules on request. Pairs with
  `gsc-content-brief` so you see the *query → session → outcome*
  funnel in one place. The seeded researcher agent picks up
  `ga_run_report`, `ga_top_pages`, `ga_realtime` automatically on
  upgrade via the tools-migration path.

## 0.4.66 — 2026-04-22

### Fixed
- **Funnel stages are now clickable.** On
  `/knowledge/funnel` each of the eight stages (Target, Aware, MQL,
  SQL, Opportunity, Negotiation, Customer, Closed Lost) was
  rendering as a static list row with no handler — clicking did
  nothing. Each row is now a link that deep-links into the Deals
  page filtered by that stage
  (`/deals?stage=<name>`). The Deals page reads the `stage` query
  param, filters by the `stage:` frontmatter field on each deal,
  and shows a dismissible "stage: <name>" chip in the header so
  users can clear the filter in one click.

## 0.4.65 — 2026-04-22

### Changed
- **Moved the BlackMagic AI logo to the bottom-left** of the sidebar
  (previously top-left). The macOS traffic-light gutter stays
  draggable but is now unbranded; the logo + wordmark sit in the
  footer row alongside the version string and theme toggle, giving
  the top of the sidebar more breathing room for the project
  switcher and nav.

## 0.4.64 — 2026-04-22

### Added
- **Outbound Agent** — new default agent that orchestrates the full
  new-business loop end-to-end: **discover → enrich → ICP-score →
  draft → send → notify**. Pinned first in the agents directory.
  Wires up 16 tools (Apify discovery, company/contact enrichment,
  ICP scoring, draft creation, SES send, LinkedIn DM via Unipile,
  notify, trigger_create) so it can complete an outbound round
  without the user bouncing between agents. Preflight gates it on
  Apify + Amazon SES + `us/market/icp.md` + `us/brand/voice.md`
  (which matches what the pipeline actually reads). Autonomous
  doctrine baked in: "never halt on missing signals, pick the
  strongest inferable angle and proceed"; hard caps at 10 companies
  / 5 sent emails per run to keep Apify + SES spend bounded. One of
  the starter prompts — "Run a full outbound round" — is
  one-click from the agent detail page.
- **Native macOS notifications in the `notify` tool.** Instead of
  requiring a messaging webhook to get a visible ping, `notify`
  now fires an `osascript display notification` on darwin **in
  addition to** any connected messaging integrations. Sound = Ping
  for normal/high urgency, silent for low. Title = subject (80 chars
  max), body = flattened to one line (280 chars max). Users get a
  real Notification Center alert even with zero webhooks connected;
  those with Slack / Feishu / Discord / Telegram connected get
  both.

## 0.4.63 — 2026-04-22

### Fixed
- **"Retry Send" → `500 fetch failed` on email drafts.** The daemon
  runs inside Electron, whose fetch() occasionally gets intercepted
  by Chromium's network stack (proxy / VPN auto-config / PAC files)
  with no real underlying error — just a cryptic "fetch failed".
  Standalone Node smoke tests worked, in-app sends didn't. Swapped
  the Amazon SES call to use Node's native `https` module
  end-to-end, which sidesteps the Chromium layer entirely. If the
  request still fails it now surfaces the real reason (ENOTFOUND /
  ETIMEDOUT / etc) instead of the generic message. Smoke-verified:
  real AWS SES messageId returns through the new path.

### Changed
- **"Tools" sidebar row renamed back to "Integrations".** Was a
  naming churn that left every error message and deep link
  mismatched ("Tools → Amazon SES" vs a sidebar that said "Tools").
  All 14 error strings across daemon + UI now say "Integrations".
  Sidebar label, Integrations page title, Settings legacy-panel
  callout, preflight modal copy — all match the actual page title
  again.

## 0.4.62 — 2026-04-22

### Fixed
- **Settings → Integration keys now clearly points to Tools for the
  newer BYOK integrations.** Users opening Settings looking for
  Amazon SES / GSC / Ghost / WordPress / Unipile / Discord /
  Telegram / Notion / Linear / GitHub / Stripe / Cal.com / RB2B
  were finding an old `config.toml`-backed list of ~14 legacy keys
  and asking "where's Amazon SES?". Added a flame-tinted callout at
  the top of the legacy panel that names the missing providers
  explicitly and ships a one-click "Open Tools →" button. Section
  title renamed to "Integration keys (legacy)" so the split is
  obvious at a glance. Nothing under the hood changed — the legacy
  `config.toml` path still works for EnrichLayer / Apollo / Slack
  webhook / Resend / From email / LinkedIn cookie. Everything else
  belongs in Tools.

## 0.4.61 — 2026-04-22

### Added
- **Pre-flight readiness modal for agents + skills.** Clicking Run now
  pops a modal that verifies the thing is actually ready to run before
  spawning anything: listed **integrations** must be connected,
  listed **us/\* files** must exist and not be the seed template,
  listed **CLI tools** must be in PATH. Missing pieces surface as:
  - integration chip → one-click "Connect" button that jumps to
    sidebar → Tools → \<provider\>;
  - us/\* file chip → inline "Fill now" textarea that writes back to
    the vault, preflight re-checks automatically on save;
  - CLI chip → copy-pasteable install command
    (`npm install -g apidog-cli` etc).
  Required inputs from the skill's `inputs:` frontmatter render as
  form fields in the same modal, prefilled with defaults. Only when
  every gate is green does the Run button un-disable. Escape hatch:
  "Run anyway →" sends `force: true` to the daemon for users who
  know what they're doing.
- **`/api/preflight/:kind/:slug` daemon endpoint** — reads the
  resource's `requires:` frontmatter (`integrations`, `us_files`,
  `cli`, `optional_integrations`) and returns a structured
  `{ ready, missing, optional_integrations, inputs, optional_inputs }`.
  `POST /api/agent/run` now refuses to start with 412 + the
  preflight payload unless the caller sets `force: true`, so agents
  can't accidentally run blind to a missing key.
- **`requires:` frontmatter on every new default skill** — brand-
  monitor-apify, competitor-radar, doc-leads-discover,
  linkedin-intel-weekly, reddit-pulse (all need Apify + us/market/\*
  files), api-endpoint-test (needs apidog-cli + node),
  kol-discover / kol-score / kol-outreach-draft (creator-marketing
  chain with Apify + us/brand + us/market/icp), gsc-content-brief
  (needs GSC integration), cms-blog-stats / cms-publish-draft (soft
  requirement — Ghost OR WordPress, checked at call time). Existing
  skills without `requires:` keep working unchanged — absence = no
  gates.

## 0.4.59 — 2026-04-22

### Fixed
- **Draft approval now sends through the connected email provider
  instead of erroring on "MCP tool gmail.send_email not wired".** The
  old path only knew how to call MCP-registered tools, so users who
  pasted Amazon SES credentials in Integrations → Amazon SES got a
  misleading "configure ~/BlackMagic/.bm/mcp.json" note every time
  they approved. New `email-sender.ts` module owns the decision: if
  Amazon SES is connected, it signs a SESv2 `SendEmail` with AWS
  SigV4 and fires that; if Resend is configured (legacy), it falls
  back to Resend; otherwise it surfaces the actual SES/Resend error
  (e.g. `SES 403: security token invalid`) rather than the generic
  "nothing connected". The built-in `send_email` tool and the
  draft-approval path both share this logic now.

### Added
- **Auto-send drafts toggle** on the Outreach page. When on, every
  draft the agent creates is approved + sent immediately via the
  best-available provider — no manual click required. Setting
  persists at `.bm/drafts-settings.json` so it survives restarts.
  Skills can override per-call with `draft_create({..., auto: true})`
  (explicit `true` wins) or `auto: false` to force the gate even when
  the global toggle is on. Default is off — existing vaults keep
  approval-gated behavior until you flip it.
- **SESv2 SigV4 request signing in the daemon**, no external AWS SDK.
  Uses Node's built-in `crypto` for HMAC-SHA256; ~50 lines.
  Least-privilege `ses:SendEmail` IAM action is enough.

## 0.4.58 — 2026-04-22

### Fixed
- **Agent Output — final answer renders as chat-formatted markdown.**
  The agent's final response used to hide inside a `<details>` as
  "Show final answer" and then render the text inside a monospace
  `<pre>` that echoed literal `##`, `**`, and `-` syntax. Replaced
  with a prominent "Final answer" block (label + card) that pipes the
  text through the shared `<Markdown>` component, so headings, bold,
  lists, links, and code blocks render the way they do in chat.
- **Entity page body renders as markdown.** Company / contact / deal
  note bodies were displayed as raw text via `whitespace-pre-wrap`,
  so any markdown the agent wrote into the note (e.g. a Company
  Profile with sections and bullets) appeared as literal syntax.
  Now routed through `<Markdown>` for proper GFM rendering.

## 0.4.57 — 2026-04-22

### Fixed
- **Home composer Send now actually runs the prompt instead of just
  navigating to /chat.** The home page stashed the typed prompt into
  `localStorage.bm-pending-prompt` and pushed the user to `/chat` —
  but ChatSurface only *prefilled* the input, leaving the user to
  press Send a second time. Chat now consumes the pending prompt via
  a ref, defers one tick so thread-hydration's `setMessages([])`
  commits first, then auto-fires `send()`. User clicks Send once,
  the query actually runs.
- **Agent gallery no longer bleeds through while a run is in flight.**
  The empty-state gallery was gated only on `messages.length === 0`,
  so the brief window between "user message committed" and "thread
  hydration reset" could leave it rendering next to the Thinking…
  bubble (visible in bug screenshot). Added `!sendMut.isPending` to
  the gate — a live run always wins the empty-state.

### Removed
- **"View as Markdown" link on assistant replies.** Copy stays; the
  blob-URL open-in-new-tab was noise. Dropped `ExternalLink` import
  alongside.

## 0.4.56 — 2026-04-22

### Fixed
- **Agent page — Input panel no longer dumps raw markdown.** The in-flight
  prompt used to render inside a `<pre>` block that echoed literal `**`,
  `###`, and list syntax, and the panel happily expanded to 800 chars of
  it — so a long prompt pushed the whole "Processing / Output" flow way
  below the fold. Replaced with a one-line summary (markdown syntax
  stripped to plain text, capped at 140 chars) plus a "Show full prompt"
  toggle that expands to properly rendered GFM via the shared
  `<Markdown>` component.

## 0.4.55 — 2026-04-22

### Removed
- **Onboarding announcement bar deleted.** The banner's "Run now"
  button was unclickable in Electron (the draggable `-webkit-app-region`
  was swallowing pointer events inside the banner) and the layout fixes
  only ever made it less broken, not actually usable. Rather than keep
  patching it, ripped it out entirely — `OnboardingBanner` component
  removed, no longer mounted in `AppShell`. The Getting-started
  checklist on the homepage already covers the same "run your first
  agent" nudge without blocking a strip across the top of the app.

## 0.4.54 — 2026-04-22

### Changed
- **Homepage is now a real dashboard, not empty panels.** Replaced the
  three always-empty "Pending / Running / Recent threads" cards with a
  layered control center:
  - A 4-cell KPI strip at the top — Today's runs, Running now, Pending
    approvals, Total threads — each a link into the relevant page.
  - A 14-week **activity heatmap** (GitHub contribution-graph style,
    14×7 dot grid) that colors each day by how many agent runs started.
    Tooltips on hover, flame-tinted scale, legend underneath. Pulls
    timestamps straight from `runId` — no new API surface.
  - A **Getting started** checklist in the side column with a flame
    progress bar: vault opened → agent installed → first run → first
    draft reviewed. Steps auto-tick as the user completes them.
  - Compact "Running now / Pending approvals / Recent threads" rows
    demoted below the fold so the first screen is information, not
    emptiness.

### Fixed
- **Announcement bar no longer eats the top of the sidebar.** The
  onboarding banner used to render full-width above the sidebar, which
  pushed the whole sidebar down and left a visually broken strip over
  the app chrome. Moved it inside the main content column so the
  sidebar runs from the very top; also dropped the 88px traffic-light
  gutter since the banner no longer sits behind the macOS window
  controls.

## 0.4.53 — 2026-04-22

### Added
- **Hero illustration on the homepage.** Reused the retro-pixelated
  volcano landscape from the marketing site (`03.webp`) — same
  aesthetic as the rest of the brand, drops in cleanly above the
  composer. 16:7 aspect, gradient mask blending into the page bg
  at the bottom, "BlackMagic · control center" pill in the top-left
  with a flame pulse dot. Static asset shipped in the desktop app's
  `public/` so it loads from disk in Electron.

## 0.4.52 — 2026-04-22

### Changed
- **Homepage redesigned Stark-style — control center, not a chat
  staring contest.** The root route used to dump you straight into
  ChatSurface; that surface still exists at `/chat` but `/` is now
  a clean landing page with a centered serif "Hello. *What should
  &lt;org&gt; do?*" headline, a primary composer, and three status
  cards underneath: **Pending approvals** (drafts awaiting review,
  pulled from `listDrafts`), **Running jobs** (live runs, pulled
  from `listRuns`, count badge goes flame when > 0), **Recent
  threads** (last 4 chat threads, click to load). Composer hands
  off to `/chat` via a `bm-pending-prompt` localStorage handoff so
  the chat surface auto-prefills the textarea (user can still edit
  + pick an agent before firing). ⌘↵ shortcut to send.
- **Sidebar slimmed: drop Dashboard and Activity rows.** Both lived
  in places now surfaced on the home dashboard (Dashboard's runtime
  stats are still reachable via ⌘K and the GEO tab; Activity ↔
  Running jobs surfaces on Home). Added a `Home` row at the very
  top of the nav so the new dashboard is one click from anywhere.
  Chat row continues to be collapsible with thread history.
- **Chat surface now reads `bm-pending-prompt` on mount** and
  pre-fills the textarea, so the home composer hand-off is
  seamless. Empty-state and command popovers all preserved.

## 0.4.51 — 2026-04-22

### Fixed
- **Onboarding announcement bar collided with the macOS traffic-light
  buttons.** The banner from 0.4.49 rendered at the very top of the
  `flex flex-col h-screen` shell with no left clearance, which on
  darwin meant its agent icon and "Welcome —" text sat directly under
  the red/yellow/green window controls — visually broken and you
  couldn't click the controls without overshooting the banner. Banner
  content now starts at `padding-left: max(env(safe-area-inset-left),
  88px)` so the traffic lights have an unobstructed gutter, and the
  banner's empty-region is marked `-webkit-app-region: drag` so the
  cleared strip is a real macOS drag handle (interactive children
  opt back out via `no-drag`).

## 0.4.50 — 2026-04-22

### Changed
- **Agent icons redesigned Vercel-style.** Dropped the gradient
  tile + hand-drawn glyph from 0.4.49 — too busy. Replaced with the
  Vercel/Linear/Resend project-tile pattern: a neutral surface
  (cream or `#1F1B15` per theme) with a thin subtle border, a
  Vercel-signature 1px inset top sheen, and a bold 1–2 letter
  monogram in a single per-agent accent color. "Company Profiler"
  → `CP` in amber, "GEO Analyst" → `GA` in flame, "Researcher" →
  `R` in blue, etc. No SVG paths to maintain, perfect typography
  alignment, and a row of 11 agents now reads as 11 distinct,
  legible tiles instead of a kindergarten sticker book. Used
  everywhere the old icon component was — sidebar Agents sub-rows,
  chat gallery cards, /agents hero, onboarding banner.

## 0.4.49 — 2026-04-22

### Added
- **Per-agent SVG icons with gradient tiles, replacing the generic
  lucide silhouettes.** New `AgentIcon` component (`components/agent-icon.tsx`)
  ships 11 hand-drawn glyphs paired with distinct linear-gradient
  backgrounds — Company Profiler gets the building scanner on
  amber→orange, Researcher gets the magnifying glass on sky→blue,
  GEO Analyst keeps the radar on flame, LinkedIn Outreach gets the
  proper "in" mark on LinkedIn blue, and so on. Sized presets (sm/md/
  lg/xl). Wired up in three highest-traffic spots: chat agent
  gallery cards, sidebar Agents sub-rows, and the /agents hero. Old
  `Bot` lucide stays as a fallback for any agent slug that hasn't
  been themed yet.
- **App-wide onboarding announcement bar.** `OnboardingBanner` mounts
  in `AppShell` between the upgrade bar and the sidebar, so the
  Company Profiler nudge shows on every page until you've actually
  run it (or dismissed). Reads the `pin: first` agent from the
  vault, checks `listRuns` for any completed runs against that
  agent, and renders a slim flame-tinted strip with the agent icon,
  one-sentence pitch, "Run now" CTA (links to `/agents?slug=…` and
  primes localStorage), and an X dismiss. Per-vault dismissal in
  `localStorage` so switching projects re-triggers the prompt.
- **RB2B integration for website visitor de-anonymization.** New
  `rb2b` provider in Integrations (Visitor identification group),
  `RB2B_API_KEY` mirrored into `<vault>/.env`. Plus a new
  `rb2b-visitor-pull` skill (Website Visitor agent) that fetches
  identified visitors from the RB2B API every N hours, ICP-scores
  them against `us/market/icp.md`, upserts companies/ + contacts/
  files, and appends a daily summary to `signals/visitors/<date>.md`.
  Runs through the existing `web_fetch` tool — no new daemon-side
  tool wiring needed.

### Changed
- **In-chat ProfilerOnboardingBanner removed in favor of the global
  bar.** The banner used to live inside the chat empty-state, which
  meant new users only saw it if they happened to land on `/`. Now
  it's everywhere until the work is done.

## 0.4.48 — 2026-04-22

### Added
- **7 new skills + 3 new BYOK integrations, all generalized from the
  apidog-team corpus.** None of the skills hardcode a vendor, a
  keyword, or a notification channel — every config input comes from
  `us/*` or an integration record.

  **Tier 1 — zero-integration-dependency skills:**
  - `api-endpoint-test` — generate + run a JSON test suite via
    `apidog-cli` (free npm package) against any REST backend. Discovers
    routes from Next/Express/FastAPI code or an OpenAPI spec; covers
    auth / validation / method / 404 / happy-path. No Apidog account
    needed.
  - `kol-discover` → `kol-score` → `kol-outreach-draft` — KOL
    creator-marketing loop: LinkedIn search via Apify, score against
    ICP from `us/market/icp.md`, draft approval-gated DMs/emails via
    `draft_create`. Writes a tracking CSV to `kol/`.

  **Tier 2 — behind new integrations:**
  - `gsc-content-brief` — REWRITE / PUSH / GAP SEO analysis from
    Google Search Console Search Analytics. Writes a weekly content
    brief to `signals/seo/<date>-brief.md`.
  - `cms-blog-stats` — blog overview across Ghost / WordPress.
  - `cms-publish-draft` — push a reviewed `drafts/` post to the
    connected CMS as a draft (never auto-publishes).

- **3 new integrations**:
  - **Google Search Console** (SEO group) — paste a service-account
    JSON + the site URL. The daemon signs an RS256 JWT from the
    private key, exchanges it for an OAuth access token at Google's
    token endpoint, and caches the token for 55 min per key fingerprint.
    No OAuth dance for the user — just paste the JSON.
  - **Ghost** (Content/CMS group) — Admin API key (`<id>:<secret>` hex
    format) + Admin API URL. HMAC-SHA256 JWT auth per Ghost's spec.
  - **WordPress** (Content/CMS group) — application-password auth
    (`user:app_password`) + site URL. Uses the `/wp-json/wp/v2/posts`
    REST endpoint.

- **3 new agent tools**: `gsc_query` (GSC Search Analytics),
  `cms_list_posts` (Ghost/WordPress dispatch), `cms_create_draft`
  (always creates as draft — never publishes). Researcher + SDR
  agents pick them up via vault migration.

- **Vault templates seeded on `ensureVault()`**:
  `templates/daily-ops.md`, `templates/weekly-ops.md` — copy-me
  starting points for recurring ops rhythm notes. New `kol/` skeleton
  dir for the KOL skill outputs.

### Changed
- **Integrations paste form learns 3 new shapes**: GSC accepts a
  JSON blob (auto-detected via leading `{` — same pattern as SES),
  Ghost shows the `<id>:<secret>` hint, WordPress shows the
  `user:app_password` hint. The existing `{...}` auto-spread still
  works uniformly across all JSON-accepting providers.

## 0.4.47 — 2026-04-22

### Changed
- **Agent page is no longer a chat staring contest — it's a
  step-by-step run viewer.** Picking an agent in the sidebar now
  drops you into a 3-panel dashboard: **Input** (the prompt the
  agent received), **Processing** (live tool-call timeline with
  per-step status — done ✓ / running ◐ / error ⚠), **Output**
  (every file the run wrote, deduplicated, each linking into the
  Vault editor). Top-of-panel meta strip shows live status badge
  with elapsed time, plus a Stop button while the run is going.
  Empty state surfaces the agent's `starter_prompts` from
  `agents/<slug>.md` as one-click kick-off chips.
- **Composer at the bottom kicks off new runs OR adds context to
  the in-flight one.** Send button reads "Run" when idle, "Add"
  when a run is live. Polling refreshes the timeline every 2s while
  live, every 5s otherwise (run list).
- **Picking an agent in Chat now navigates to that agent's page
  directly.** The dropdown in the chat header and the agent gallery
  cards on the empty-state both `router.push('/agents?slug=…')`
  instead of just toggling local picker state. No more two-step
  "pick agent → see options → click → chat" — one click takes you
  to the dashboard for that agent. The Run-now onboarding banner
  for Company Profiler keeps its inline-execute behavior (it still
  needs to dispatch its prompt against the picked agent without
  navigating away mid-flow).

### Notes
- Output detection scans tool calls for `write_file`, `edit_file`,
  `create_file`, `apply_patch`, `append_file` and pulls the `path`
  / `file` / `file_path` arg. Add new write-tool names to the
  `WRITE_TOOLS` set in `apps/web/src/app/agents/page.tsx` if you
  introduce a custom one.
- "Pending steps" preview not implemented yet — that requires
  adding a `steps:` array to skill frontmatter so the timeline can
  render `▢ queued` rows ahead of the cursor. Tracking for a
  follow-up.

## 0.4.46 — 2026-04-22

### Changed
- **Agents row in the sidebar is now expandable; `/agents` is just a
  full-screen chat.** The 2-pane "agent list left, chat right" page
  felt like an extra step — the sidebar is already a list. Click the
  Agents chevron to reveal every agent in the vault (icon + name +
  live-pulse dot when running); click any sub-row to drop straight
  into a full-width chat with that agent at `/agents?slug=<agent>`.
  Bare `/agents` redirects to your last-picked agent (localStorage
  `bm-last-agent`) or the first one. Active sub-row gets a flame
  border like the rest of the active-state chrome. Auto-expands
  whenever you're already inside `/agents/*`.
- **Dashboard and GEO promoted out of the Intelligence section.**
  They were sitting under Triggers/Memory/Skills which buried two
  of the most-checked surfaces. Both rows now sit right under
  `Desk` at the top of the nav so "what happened today?" is one
  click from anywhere. Dashboard ↔ GEO tab strip stays.

### Notes
- Stayed on query strings (`?slug=`) instead of `/agents/[slug]` —
  the app builds with Next static export, which requires
  `generateStaticParams` for every dynamic segment, and an empty
  list means the route doesn't render at all. Query params
  sidestep that and deep-link the same way.

## 0.4.45 — 2026-04-22

### Fixed
- **0.4.44 build failure: `KnowledgeTabs is not a valid Page export field`.**
  Next.js disallows non-default exports from `app/<route>/page.tsx`, and the
  Knowledge sub-pages were importing the tab strip + card components straight
  from `app/knowledge/page.tsx`. Moved the shared bits into
  `components/knowledge-tabs.tsx` and updated all four sub-pages to import
  from there. Cask 0.4.44 never went out — this is the first 0.4.4x release
  with the Swan-style sidebar reaching brew.

## 0.4.44 — 2026-04-22

### Changed
- **Sidebar restructured Swan-style — flat data rows on top, an
  Intelligence section in the middle, Other at the bottom.** Multi-
  agent stays (still 11 agents under `Agents` row), but the chrome
  around them now follows the canonical "data → intelligence →
  account" grouping. Top group: `Chat` (collapsible), `Agents`,
  `Desk` (was Inbox), `Companies`, `Contacts`, `Deals`, `Activity`
  (was Runs), `Outreach`. Intelligence: `Knowledge` (expandable —
  General / ICPs / Funnel / Tags), `Memory`, `Skills` (re-surfaced),
  `Triggers`, `Tools` (was Integrations), `Dashboard`, `GEO`,
  `Ontology`, `Files`. Other: `Account` (was Settings).

### Added
- **`/memory` page.** Single-textarea editor backed by `MEMORY.md` at
  the vault root. Whatever you type lives in the project's memory and
  is read by every agent at the start of every run — the per-project
  sticky note. Dirty-state indicator + Save button; persists via the
  existing readFile/writeFile daemon endpoints, no new API surface.
- **`/knowledge` tabbed hub** (General / ICPs / Funnel / Tags). Each
  tab is its own route so deep-links work. General lists the canonical
  `us/` files (company profile, brand voice, product); ICPs links into
  `us/market/icp.md` + personas; Funnel renders the eight default
  stages with descriptions; Tags scans every company/contact/deal
  frontmatter and rolls up `tags:` usage counts. Editing happens in
  the Vault editor — these pages are navigation hubs, not mini-CMSes.
- **Knowledge sidebar entry is expandable** with a chevron — click
  the row to land on `/knowledge`, click the chevron to reveal the
  four sub-tabs. Auto-expands when you're inside any `/knowledge/*`
  route.

## 0.4.43 — 2026-04-22

### Changed
- **Sidebar reshuffled to feel less like a graveyard of links.** "New
  chat" is gone — it duplicated what an empty Chat does for free. The
  `Chat` row is now collapsible (default collapsed): click the chevron
  to reveal your last 10 threads (preview text, click → load thread,
  with a small `+ New chat` at the top of the expanded list). Threads
  fetch lazily — `listChats` only fires when you actually expand the
  section, so the closed sidebar makes zero extra requests. Section
  label `Work` renamed to `Intelligence` to match the surrounding
  product vocabulary.
- **GEO promoted to a top-level sidebar row.** Previously the only way
  to reach the GEO dashboard from the chrome was either a tab inside
  Dashboard or ⌘K — easy to miss, and the user couldn't tell from the
  nav that GEO existed at all. New `Radar` icon row sits right under
  Dashboard. Tab strip inside Dashboard/GEO stays so they still feel
  like one tabbed surface.
- **/agents back to 2-pane.** The middle "threads for this agent"
  column added in 0.4.41 was redundant once the sidebar Chat section
  exposes thread history globally. Layout is again
  `[ agent list (240) | ChatSurface ]`. URL state shrinks back to
  `?slug=`. Per-agent thread persistence still works under the hood
  via `bm-team-thread-<slug>` localStorage slots.

## 0.4.42 — 2026-04-22

### Added
- **Five Apify-driven Skills, vendor-neutral, ship in every vault.**
  Generalized from the apidog-team pipelines so any user with their
  own Apify token gets a real research workflow: `brand-monitor-apify`
  (Reddit + Twitter/X mention sweep), `competitor-radar` (weekly
  pricing/changelog/blog diff), `doc-leads-discover` (ICP-signal
  Google search → approval-gated draft outbound), `linkedin-intel-
  weekly` (competitors + KOLs profile + post diff), `reddit-pulse`
  (daily brand + category narrative check). Each reads its watchlist
  from `us/market/*.md` — no hardcoded keywords, domains, webhooks,
  or notification providers. Five matching preset triggers ship
  disabled; flip enabled after pasting your Apify token.
- **Channel-agnostic `notify` agent tool.** Skills and agents call
  `notify({ subject, body, urgency })` and the daemon fans the
  message out to every messaging integration the user has connected:
  Slack (incoming webhook), Feishu (interactive card with urgency
  → header colour), Discord (webhook with `@here` for high urgency),
  Telegram (bot API to a configured chat). No skill names a specific
  provider — connecting more integrations just adds destinations.
- **`<vault>/.env` mirror of BYOK integrations.** Every BYOK key
  (Apify, SES, Feishu, HubSpot, Slack, Notion, …) you save in
  Integrations now also writes to `<vault>/.env` as plain
  `KEY=value` pairs (`APIFY_API_TOKEN`, `AWS_ACCESS_KEY_ID`,
  `SES_FROM`, `FEISHU_WEBHOOK`, …). Vault scripts just
  `load_dotenv()` and read env vars — no custom JSON parsing. Daemon
  regenerates `.env` from `integrations.json` on startup so existing
  connections light up automatically.
- **`trigger_create` agent tool.** Agents can schedule their own
  triggers mid-conversation. Tell an agent "run this every Monday at
  9am" → it calls `trigger_create({ name, cron, skill })` → a
  `triggers/<name>.md` appears and the cron loop picks it up on the
  next refresh. Bindings: `skill` (preferred), `agent`, or `shell`.

### Changed
- **Trigger frontmatter accepts `skill:` as alias for `playbook:`.**
  Same filesystem (`playbooks/*.md`), same runner — just the
  user-facing word. Existing `playbook:` triggers keep working.
- **Researcher + SDR agents gain `notify`, `trigger_create`, and
  `scrape_apify_actor` via vault migration.** Existing vaults pick
  these up on next daemon start; new vaults seed them from day one.

## 0.4.41 — 2026-04-22

### Changed
- **/agents goes from 2-pane to 3-pane (Slack-style).** Layout is now
  `[ agents (240) | threads for selected agent (260) | chat (rest) ]`.
  The middle pane lists every past chat thread you've had with the
  selected agent — preview line, message count, "5m / 3h / 2d" relative
  timestamp — sorted most-recent-first. Click a thread → the right
  pane reloads ChatSurface against that thread's stored history.
  `+` at the top of the threads pane mints a fresh thread; per-row
  hover reveals a delete button. URL state widened to `?slug=&thread=`
  so any pane is deep-linkable. Switching agents auto-prime the most
  recent thread (or starts fresh if none exist). All wired through
  the existing `/api/chats` endpoint — no backend change.

## 0.4.40 — 2026-04-22

### Changed
- **/agents is now a split-pane workspace, not a directory dead-end.**
  The previous design was a grid of cards where every click did nothing
  but bounce you to `/?agent=<slug>` — a wasted page load and a wasted
  scroll. The page now mounts as `[ agent list (240px) | ChatSurface ]`:
  pick an agent on the left, chat with it on the right, no navigation
  in between. Each row gets a small icon, the name, and a live-pulse
  dot if the agent has a run in flight; the search input filters in
  place. `?slug=<agent>` deep-links the selection. `+ New agent`
  collapses into a tiny inline form on the left rail. The chat surface
  on the right is the same `ChatSurface` component as `/`, so the
  `@`-mention popover, `/`-slash commands, and per-agent thread
  history (`bm-team-thread-<slug>`) all carry over.

## 0.4.39 — 2026-04-22

### Changed
- **/agents redesigned: clean directory cards, no internal leakage.**
  The previous page dumped every implementation detail onto the
  surface — model name (`gpt-5.3-codex`), temperature (`temp 0.3`),
  the full tool list as chips (`read_file`, `write_file`, `edit_file`,
  `list_dir`, `grep`, `web_fetch`, `web_search`, `enrich_company`,
  `deep_research`, `geo_list_prompts`, `geo_add_prompt`, `+10`…),
  raw "You are the AE (Deal Manager) agent. You manage `deals/`."
  system-prompt prose, "edit .md" links, and a "last run —" footer.
  All of that is removed. The page is now a 3-column responsive grid
  of clean cards: a flame-tinted icon tile, the agent's name, a
  one-sentence tagline (with the boilerplate `You are the X agent.`
  prefix programmatically stripped before render), and a live-pulse
  dot if a run is in flight. The whole card is the click target →
  opens chat with that agent (`/?agent=<slug>`). Pinned agents
  (frontmatter `pin: first`) float to the top, then alpha-sorted.
  Power users who want the raw .md can still open it through
  `/vault?path=agents/<slug>.md`. Subtitle on the page header
  rewritten to user-facing language too — no more references to
  "Role definitions under agents/".

## 0.4.38 — 2026-04-22

### Added
- **`@`-mention and `/`-slash autocomplete in the chat composer.**
  Typing `@` (or `/`) at the start of a token now opens a popover
  above the textarea: `@` lists every agent in the active vault
  (filtered as you type, name + slug), `/` lists slash commands
  (`/clear` resets the local thread, `/agent` queues a switch,
  `/skills` jumps to the skill catalog). ↑/↓ navigate, ↵ or Tab
  selects, Esc cancels. Selecting a mention inserts `@<slug>` into
  your message so the receiving agent can see who you wanted looped
  in. Triggers only fire after whitespace or at start-of-line, so
  email addresses and URLs don't accidentally pop the menu. Composer
  placeholder updated to advertise both affordances. Previously the
  chat surface was a plain textarea with zero hinting — typing `@`
  did nothing visible, even though entity-comment composers had
  supported mentions since 0.4.24.

## 0.4.37 — 2026-04-22

### Changed
- **Sidebar nav re-shaped: collapse the Team multi-row into a single
  Agents entry, surface Ontology, demote Skills.** The previous nav
  rendered every agent as its own sidebar row (10+ rows for a typical
  GTM project), which dwarfed everything else and made the rest of
  the app harder to scan. The Team section is gone — a single
  `Agents` row replaces it and links to the existing `/agents`
  directory page where you pick the one you want. The Work section
  drops the `Skills` row entirely (skills are an internal capability
  agents pull in during chat — exposing a top-level nav for them was
  noise) and gains an `Ontology` row so the vault graph isn't hidden
  behind ⌘K only. Triggers and Runs stay where they were. The
  `/skills` route still exists for power users / debugging — just
  not advertised in the sidebar or palette anymore.
- **GEO is now a tab inside Dashboard.** The standalone `/geo` page
  felt orphaned — Dashboard and GEO are both "what's happening across
  my agents" surfaces. Both routes now share a tab strip
  (`Runtimes / GEO`) in their PageHeader, so flipping between them is
  one click and they read as one tabbed dashboard. The two routes
  stay separate files (each is ~500 lines, the queries don't overlap)
  but the user-visible shell ties them together.

## 0.4.36 — 2026-04-22

### Added
- **Stop button on the Runs page for stuck "running" entries.** A run
  shows as `running` whenever `final.md` is missing — which happens
  both for genuinely live invocations and for runs whose daemon/codex
  subprocess died without flushing output (daemon crash, app
  force-quit, OS reboot). There was no way to clear those from the
  UI, so they sat at the top of `/runs` forever. Every running row
  now has a Stop button that hits a new `POST /api/agent/runs/:id/stop`
  endpoint: the daemon writes a sentinel `final.md` ("Run canceled…")
  and flips `meta.canceled = true` + `exitCode = 130`. The row
  re-derives as a new `canceled` status on the next 5-second refetch,
  with a neutral grey badge so canceled runs stay visible but
  visually distinct from real completions/failures. Best-effort
  SIGTERM is sent if `meta.pid` is recorded; absent PID tracking the
  marker alone is enough to unstick the list.

## 0.4.35 — 2026-04-22

### Removed
- **Skills middle "Files" column dropped — back to a clean 2-pane.**
  Every skill is a single `SKILL.md` and the placeholder `config/` /
  `templates/` rows just sat there labelled `(empty)`. The Skills
  browser is now `[ skills list (280px) | skill content ]` — the
  frontmatter table, Inputs form, Run button, and SKILL.md body all
  get the full right pane to themselves.

## 0.4.34 — 2026-04-22

### Removed
- **Skills section dropped from the agent cockpit.** Listing the
  capabilities an agent uses on its own profile page was redundant —
  skills are invoked automatically inside chat when the agent picks
  them, so re-surfacing them as tiles on the agent page added visual
  noise without behavior change. The Properties rail still shows the
  skills *count* for at-a-glance audit, and the dedicated `/skills`
  browser remains the place to inspect or test individual skills.

## 0.4.33 — 2026-04-22

### Changed
- **Playbooks → Skills (visible rename + concept fix).** The product
  surface now uses "Skills" everywhere it used "Playbooks": the route
  moved from `/playbooks` to `/skills`, the sidebar row label is
  "Skills", the command-palette entry, the Automations hub card, and
  the getting-started copy all align. The old `/playbooks` URL is a
  permanent redirect to `/skills` so bookmarks and in-app deep links
  still resolve. Vault filesystem stays at `playbooks/*.md` for now —
  no migration is needed and existing user vaults keep working.
- **Agent cockpit Skills section is no longer a list of mini-runners.**
  The previous design rendered each skill as a `PlaybookCard` with its
  own input form and Run button, which mis-modeled what a skill is — a
  capability the agent pulls in mid-conversation when the task fits,
  not a standalone script the user kicks off from an agent's profile.
  The cockpit now shows passive `SkillTile` cards (icon + name + 1-line
  summary + input chips) under the heading "Skills <agent> can use".
  Clicking a tile jumps to `/skills?skill=<slug>` to inspect the
  skill's definition. To actually use a skill, you talk to the agent
  in chat and it invokes the right one — same way Claude Skills works.
- **Skills detail "Run skill" button rephrased as "Invoke via
  <agent>".** Same code path (`POST /api/agent/run` with the rendered
  skill prompt), but the label and supporting microcopy now make it
  clear that invoking a skill always happens *through* its agent — the
  Skills page just lets you trigger one isolated invocation for
  testing. Header subtitle rewritten to say "Capabilities your agents
  invoke during a conversation" instead of the misleading "one-shot
  tasks your agents know how to run".

## 0.4.32 — 2026-04-22

### Added
- **Apify and Amazon SES integrations.** Two new cards on the
  Integrations page: Apify (Scraping group) and Amazon SES (Email
  infrastructure group). Apify takes a single `apify_api_…` token.
  Amazon SES accepts a JSON blob with `access_key_id`,
  `secret_access_key`, `region`, and `from` so a single least-privilege
  `ses:SendEmail` key covers the whole outreach loop; the paste box
  auto-detects a leading `{` and spreads the parsed object into the
  credential record. Creds land in the same
  `~/BlackMagic/.bm/integrations.json` vault as every other provider
  and never leave the machine.

### Changed
- **Outreach switched from Resend to Amazon SES.** `doc-leads.py`'s
  `send_email()` now calls SES v2 `SendEmail` via boto3 with the keys
  from the amazon_ses integration record (env vars still win). Sends
  record an `ses_message_id` in `email-log.json` instead of the old
  `resend_id`, with the same List-Unsubscribe header + HTML/Text
  multipart body.
- **Apify-using scripts read from the integrations vault.**
  `brand-monitor.py`, `reddit-marketing.py`, `linkedin-intel.py`,
  `apify_monitor.py`, and `doc-leads.py` now resolve
  `APIFY_API_TOKEN` from `apify` integration credentials (env var
  takes priority). Paste the token once in the UI and every trigger
  picks it up — no more per-script .env juggling. Shared via a new
  `scripts/_bm_integrations.py` helper.

## 0.4.31 — 2026-04-22

### Changed
- **Agent cockpit rebuilt as a Linear-style entity page.** The old
  `/team?slug=…` view was a slim chat header with a right rail of
  skills and runs — visually noisy and disconnected from the rest
  of the app's entity surfaces (company / contact / deal all use
  the activity-feed + Properties-rail layout). The cockpit now
  renders through the same `EntityDetail` component: breadcrumbs
  (`Team → <agent>`), a big title with live/idle dot, the agent's
  description as subtitle, the activity feed with threaded @-
  mention comments underneath, run history, and a sticky right-
  rail Properties card showing Status (Running / Idle), Last run,
  Skills count, Tools count, and the Assignee picker. Because the
  activity-log / assignee / runs APIs accept any vault path,
  `agents/<slug>.md` is now a first-class entity you can assign
  tasks to, comment on with @-mentions, and watch a run timeline
  for — same interaction vocabulary as the rest of the product.
  Starter prompts render as one-click cards above the skills list
  and dispatch into `/runs` directly. EntityDetail's `title` prop
  accepts React nodes now so we can inline the icon tile + live
  dot into the header.
- **Skills browser (formerly Playbooks) rebuilt as a Claude-Skills-
  style 3-pane browser.** The old single-column accordion made you
  scroll 10 cards deep to find anything. The page now splits into
  `[ skills list | file tree | skill content ]`: the left column
  groups skills by their frontmatter `group:` (GTM starter pack,
  Building blocks, Research, …) and hyperlinks each row with a
  selected-state flame border; the middle column shows the
  selected skill's file layout (`SKILL.md` always present, with
  placeholder `config/` and `templates/` folders staged for future
  multi-file skills); the right column renders a
  Claude-Skills-shaped detail view — an 8×2 frontmatter table
  (name / version / agent / author / inputs), an Inputs form, a
  primary "Run skill" button, the SKILL.md body in a monospaced
  reader, and a breadcrumb trail above it all
  (`playbooks › slug › SKILL.md`). URL state lives in a `?skill=`
  param so deep links work and the first skill auto-selects.

## 0.4.30 — 2026-04-22

### Fixed
- **Shell triggers failing with `ModuleNotFoundError` / `env: node: No such
  file or directory`.** The daemon runs inside the Electron app, which
  launches with a minimal PATH (no `/opt/homebrew/bin`, no
  `/usr/local/bin`). Any trigger that shelled out to Homebrew python or
  nvm/Homebrew node bombed before the script even imported its
  dependencies. Shell triggers now prepend `/opt/homebrew/{bin,sbin}` and
  `/usr/local/{bin,sbin}` to PATH before spawning, so `/usr/bin/env
  python3` finds Homebrew's python (with user site-packages) and
  `/usr/bin/env node` finds nvm/Homebrew node. Fire-now and cron-driven
  runs are both affected.

## 0.4.28 — 2026-04-21

### Added
- **Seven new integrations** targeting indie-hacker workflows:
  Cal.com (scheduling), Discord and Telegram (messaging/community),
  Notion (knowledge base), Linear and GitHub (engineering), Stripe
  (payments). Each appears as a card on the Integrations page with
  its canonical brand mark. Credential storage reuses the existing
  per-user `~/BlackMagic/.bm/integrations.json` vault — nothing
  leaves the machine. OAuth is flagged for GitHub, Linear, and
  Notion (they all ship paste-token fallbacks until the hosted OAuth
  apps are registered); Cal.com, Discord, Telegram, and Stripe are
  API-key/bot-token flows from day one. Grouping reshuffled to
  surface new categories: Scheduling, Knowledge, Engineering, and
  Payments alongside the existing CRM, Sales, Messaging, and Data
  groups.

## 0.4.27 — 2026-04-21

### Changed
- **Domain migrated: `blackmagic.run` → `blackmagic.engineering`.**
  Every hardcoded URL, default config value, documentation string,
  comment, and changelog reference across both repos has been
  rewritten. API subdomain moves correspondingly
  (`api.blackmagic.run` → `api.blackmagic.engineering`). The
  desktop daemon's billing-URL default, the web app's
  `NEXT_PUBLIC_BASE_URL`, the upgrade cask references, and the
  `auto-upgrade` log all point at the new domain out of the box.
  Users can keep the old domain pinned in their local
  `.bm/config.toml` or Vercel env if they want to stage the cutover,
  since every URL is env-var overrideable. Old domain kept as a
  301 redirect upstream to avoid breaking any existing bookmarks.

## 0.4.26 — 2026-04-21

### Restored
- **Team section is back in the sidebar.** 0.4.15 dropped the per-
  agent row list in favor of the chat-gallery picker; users missed
  it because agents are a primary navigation surface, not just a
  chat-mode toggle. Team section now reads `agents/*.md` from the
  active vault and renders one row per agent — Company Profiler
  pinned first (via frontmatter `pin: first`), rest alpha-sorted,
  each with its own lucide icon pulled from frontmatter `icon:`
  (Radar for GEO Analyst, Linkedin for LinkedIn Outreach, etc). The
  breathing-flame dot is back too: the icon of any agent with a
  live run pulses, so you can scan the sidebar and know exactly
  which agent is working right now. Rows route to the /team cockpit
  with the right slug.

## 0.4.25 — 2026-04-21

### Changed
- **Company Profiler now leads the agent gallery + has a "Run now"
  onboarding banner.** The chat empty-state gallery used to sort
  agents strictly alphabetical, so the Profiler got buried behind
  Closed-Lost Revival / Deal Manager. Gallery now honors the
  `pin: first` frontmatter field — any agent seeded with
  `pin: first` floats to the very top of the grid, then the rest
  sorts A-Z. Above the gallery, a flame-tinted banner promotes the
  pinned agent with a one-click "Run now" button that auto-selects
  the agent + dispatches its starter prompt (falls back to a
  bootstrap prompt if the agent has none). The banner is
  dismissable and remembers dismissal per-vault in localStorage —
  once you've profiled once it gets out of the way. New users hit
  `/` and the very next move is visibly "Run Company Profiler".

## 0.4.24 — 2026-04-21

### Added
- **Entity activity + assignee + runs — the Multica-inspired agent
  interaction foundation.** Every company, contact, and deal can now
  carry an `assignee` in frontmatter, have its own append-only
  activity log at `signals/activity/<kind>/<slug>.jsonl`, and filter
  agent runs by entity via the new `entity_ref` field stamped into
  `runs/<id>/meta.json`. New daemon routes:
  - `GET/POST /api/entity/activity?path=…` — list + post comments
  - `GET/PUT /api/entity/assignee?path=…` — read + set assignee
  - `GET /api/entity/runs?path=…` — runs scoped to this entity
- **Mention-triggered agent runs.** `@agent-slug` inside an entity
  comment enqueues a run for that agent, scoped to the entity. The
  run's `entity_ref` ties it back so the UI can show it in the live
  card + history on that entity's page.
- **Mention inheritance.** Replying in a comment thread without an
  explicit `@` inherits the parent's mentions — the looped-in agent
  stays looped-in for follow-up replies without needing a repeat @.
- **Assignment-triggered runs.** Setting an entity's assignee to an
  agent in the right-rail picker auto-enqueues a run where the agent
  reads that entity and executes its loop against it. Reassigning
  to a different agent re-triggers; assigning to a member or
  unassigning does not.
- **`/entity/[kind]/[slug]` detail route.** New Multica-style entity
  view with: breadcrumbs → title + subtitle → AgentLiveCard for
  running runs → entity body → Activity feed with threaded comments
  (@ mentions rendered in flame) → Run history (collapsible list) →
  right-rail Properties with the MEMBERS / AGENTS Assignee picker.
  Accessible directly via URL; list-page drawer migration lands
  next release.

## 0.4.23 — 2026-04-21

### Changed
- **Sidebar restored to sectioned structure (WORK / VAULT / SYSTEM).**
  The 0.4.21 flat 6-row list hid Playbooks, Triggers, Runs under
  "Automations" and hid Companies, Contacts, Deals under "Vault" —
  which made recurring tasks ("what's running now?", "pull up the
  acme contact") a two-click scan. Restored direct rows for all 13
  destinations, grouped under lightweight uppercase section labels
  (not clickable, no chevrons). Runs row now shows a live-pulse
  badge when any agent is mid-run. /automations is still reachable
  from ⌘K as a hub for newcomers.

### Fixed
- **Dashboard activity heatmap was rendering at 5× size.** The SVG
  used `className="w-full"` with a small viewBox, so `preserveAspect
  meet` scaled every cell + label uniformly up to ~60px squares and
  giant "Mon/Wed/Fri/Less/More" text on wider panels. Switched to
  fixed-pixel rendering with `maxWidth: 100%` + `height: auto` so
  the heatmap stays at its native 11px cell size regardless of
  container width.

## 0.4.22 — 2026-04-21

### Fixed
- **`/automations` was 404.** The 0.4.21 sidebar rewrite added an
  Automations row linking to `/automations`, but that route didn't
  exist — I referenced it without creating the page. The new hub
  page shows four cards (Skills / Triggers / GEO / Runs) linking to
  the dedicated pages that already existed, with a live-run pulse
  on the Runs card when agents are actively working. Verified every
  other sidebar link resolves (`/`, `/outreach`, `/dashboard`,
  `/vault`, `/automations`, `/settings` + the palette jumps).
- **Auto-upgrade no longer hangs at "Waiting for previous process to
  exit…".** The upgrader shell script still had the pre-0.4.19 design's
  opening step: wait up to 30s for the main Electron pid to exit, then
  `pkill` the app. But 0.4.19's progress-window rewrite deliberately
  keeps the main process alive so it can host the progress BrowserWindow
  and tail the brew log. Those two designs contradicted each other —
  the script stalled 30s on a pid that would never exit, then `pkill`
  killed the progress window along with the main app, and brew ran
  blind. Dropped the opening wait + pkill; brew now starts downloading
  immediately while the progress window shows real-time output. The
  second wait loop near end-of-script (after brew finishes) still
  handles the replace-and-relaunch dance as designed.

## 0.4.21 — 2026-04-21

### Changed
- **Sidebar flat again — dropped the category/chevron structure.**
  0.4.20 wrapped every destination in a collapsible category with a
  chevron; Multica's sidebar is a flat list of rows with subtle
  section labels, not nested trees. Sidebar is now six flat rows:
  Chat · Inbox · Dashboard · Vault · Automations · Settings. Inner
  sub-navigation lives on each destination page (tabs on `/vault`,
  `/automations`) rather than in the nav. New chat + ⌘K Search
  remain pinned at the top, separated by a thin divider.

## 0.4.20 — 2026-04-21

### Changed
- **Sidebar rewritten Multica-style.** 14 always-on rows collapsed
  down to 6 grouped sections: Chat, Inbox, Dashboard, Vault,
  Automations, Settings. Every section starts collapsed; click the
  chevron to expand its children. Collapse state persists per-user
  in localStorage so you come back to what you had open. New chat
  + ⌘K Search pinned to the top of the nav.

### Added
- **⌘K command palette.** Jumps between routes with a single
  keystroke. Searches on the section label or hint text (e.g. type
  "geo" to jump to the GEO dashboard, or "int" for Integrations).
  Enter selects the top match; Esc dismisses.
- **`/dashboard` page — Multica Runtimes clone.** Two-panel layout:
  runtimes list on the left (This Mac / Cloud proxy / each project
  vault), detail on the right with 7d/30d/90d toggle, four metric
  cards (input tokens, output tokens, runs, spend), an activity
  heatmap (7 rows × N weeks, flame-intensity scaled), and a daily-
  cost bar chart. Pure SVG charts, no new dependencies. First-pass
  attribution is single-runtime (This Mac gets the full count);
  per-runtime tagging lands in a follow-up once the daemon
  surfaces a `runtime:` field on each run.

## 0.4.19 — 2026-04-21

### Added
- **Real upgrade progress window.** Clicking "Upgrade and relaunch"
  now opens a small native Electron window with a live progress
  bar, a staged status line ("Downloading the DMG…", "Moving app
  into place…", "Finishing…"), an elapsed-time counter, and a
  tailing log panel so the user can see brew's actual output
  scrolling in real time. A "Reveal log" button opens the full log
  file in Finder. When brew finishes, the window flips to
  "Upgrade complete — reopening…" for two seconds before the main
  app exits; the shell script waits for every process in
  `/Applications/BlackMagic AI.app` to die, kills stragglers, and
  re-opens the replaced bundle. No more "I clicked upgrade and
  nothing happened" — there's always something on screen until the
  new version comes up.

## 0.4.18 — 2026-04-21

### Changed
- **Agent gallery cards now look like agents, not clones.** 0.4.16's
  cards all rendered the same generic Bot icon next to the name and
  showed the bare slug underneath — the grid was a wall of
  identical briefcase-ish tiles with technical kebab-case strings
  that told the user nothing. Each card now pulls its frontmatter
  `icon:` (Radar for GEO Analyst, Linkedin for LinkedIn Outreach,
  Calendar for Meeting Prep, etc) and renders it inside a rounded
  icon tile with a per-agent accent color. The slug is gone,
  replaced by a tagline pulled from the agent's own body — the
  first real prose line, so "Research Agent" reads "You are the
  Research + Chat agent — the default generalist." instead of
  "researcher". Hover adds a subtle lift; the picked agent keeps
  its flame ring. Cards feel like distinct agents now.

## 0.4.17 — 2026-04-21

### Fixed
- **Upgrade now opens a real progress window.** Previous versions
  silently exited the app and spawned brew in the background — from
  the user's perspective the screen just went blank for 60 seconds,
  which looked broken and led to frantic re-clicking. Clicking
  "Upgrade and relaunch" now opens a Terminal.app window titled
  "BlackMagic AI — Upgrading" that tails the real-time brew log, so
  you watch download percentages and install steps scroll live. The
  Terminal auto-closes when brew finishes (flag-file handshake), and
  the app reopens on top. No more silent upgrade loop.

## 0.4.16 — 2026-04-21

### Changed
- **Agent gallery is now always laid flat on the empty chat page.**
  0.4.15 put the gallery in the empty state but hid it the moment
  an agent was picked (starter prompts replaced it). The gallery
  now stays visible above the starter prompts in a 4-column grid,
  and the currently-picked agent gets a flame-colored ring so
  there's no confusion about which agent will handle the next
  message. Starter-prompts heading also names the agent
  ("Starter prompts for GEO Analyst") so the two sections don't
  feel disconnected.

## 0.4.15 — 2026-04-21

### Fixed
- **Upgrade loop + zombie daemons.** Three linked bugs that left
  users stuck on an "out of date" prompt with 10+ dead daemon
  processes and a broken install. First, `daemonProcess.kill()`
  only ran on `window-all-closed`, which on macOS doesn't fire on
  app relaunches — so every auto-upgrade cycle piled another
  daemon onto the stack. Cleanup now runs on `before-quit` +
  `will-quit` with a SIGTERM → SIGKILL escalation. Second, the
  upgrade dialog closed instantly when clicked and showed no
  feedback, so users clicked again and spawned a second brew
  process that collided on the download lock; there's now an
  `upgradeInProgress` guard plus a native macOS notification
  ("Downloading the latest version. The app will reopen in about
  a minute.") so the click clearly did something. Third, the
  upgrade shell script now force-kills any lingering
  `/Applications/BlackMagic AI.app` processes and clears stale
  brew `.incomplete` download locks before running `brew upgrade`,
  so a killed prior attempt can't brick the next one.

### Changed
- **Sidebar is less cluttered.** Dropped the per-agent Team
  section entirely — ten near-identical rows bloated the nav and
  buried the primary Chat entry point. Agents are now picked from
  the chat surface itself: the Agent dropdown in the header and a
  gallery of agent cards in the chat empty state. Renamed the
  "Work" section to "Automations". Pruned "Agent roles", "Org
  tree", and "Knowledge graph" from the main sidebar (still
  reachable by URL if anyone relied on them).
- **Chat empty state now routes through agents.** With no messages
  in the thread, the chat shows either a grid of agent cards
  ("Pick an agent") or — once one is selected — that agent's own
  starter prompts pulled live from its vault frontmatter. One
  click on a card swaps the routing agent; one click on a starter
  prompt fills the composer.

## 0.4.14 — 2026-04-21

### Changed
- **Agent activity stream redesigned.** The old "thinking…" bubble
  with its truncated 6-line tool log was replaced with a structured
  activity stream inspired by Tukwork's CoWork surface. Each tool
  call renders as its own row with a status icon (pending spinner /
  ✓ done / ⚠ error), the tool name in title case, a bordered chip
  for the load-bearing argument (filename, domain, prompt id), and
  a muted tail with the full path / URL. Reasoning-summary deltas
  render as italic `… <thought>` rows with a spark icon, so the
  user sees the model's rationale for the next tool instead of a
  parade of opaque names. A live `Processing… Ns` timer at the
  bottom keeps long autonomous runs from feeling stalled.
- **Assistant messages now have a Copy · View as Markdown footer.**
  Renders below every finished assistant bubble: one-click copy of
  the full markdown source, plus "View as Markdown" which opens the
  raw text in a new tab (easier than trying to select pretty-
  rendered prose). Same footer pattern as the CoWork reference so
  shipping a long plan or report no longer requires a trip to the
  runs page.

## 0.4.13 — 2026-04-21

### Added
- **Agent cockpit now shows reasoning between tool calls.** Long
  autonomous runs (GEO Analyst, Pipeline Ops, Closed-Lost Revival)
  used to render as a silent parade of tool names — you could see
  which tools fired but not why. The daemon now forwards the
  model's reasoning-summary deltas through the chat stream, and the
  cockpit renders them as dimmed `… <thought>` lines interleaved
  with the `→ tool` / `✓ tool` markers. Gives you a live window on
  what the agent is deciding, not just what it's doing.

### Fixed
- **Agent no longer exits silently after hitting turn budget.**
  `runAgent` used to cap at 20 turns and, if the model was still
  mid-tool-chain, write an empty `final.md` and leave the chat
  showing `(empty)`. The default budget is now 50 turns, agents can
  raise it via `max_turns:` frontmatter (GEO Analyst defaults to
  100), and when the budget does run out the agent writes an
  explicit closing message listing the last few tools called and
  telling the user to re-run to pick up from the files already
  written. No more mystery silences — the
  2026-04-21T09-17-21-931Z-geo-analyst case.

- **Real brand logos on integration cards.** 0.4.11 shipped colored
  tiles with initials ("H", "A", "SF", "飞", "MB", …) as a
  placeholder. Swapped for actual brand SVGs (Simple Icons paths,
  MIT licensed) — HubSpot sprocket, Salesforce cloud, Slack hash,
  Gmail envelope, Feishu/Lark bubble, Metabase dot-chart, Supabase
  lightning. Each path renders in white on the brand's colored
  background tile.

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
  (via SerpAPI) — all proxied through blackmagic.engineering, so you never
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
  blackmagic.engineering means no per-user third-party key to manage.

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
  a hardcoded GTM list (Website Visitor Agent, LinkedIn
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
  `api.blackmagic.engineering`.
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
