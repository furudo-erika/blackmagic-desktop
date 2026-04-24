# GEO Agent — architecture + conventions

Shipped in `0.4.7` as a native replacement for the Peec AI integration. The
goal is to get the product cited by ChatGPT / Perplexity / Google AI Overview,
measure that every day, and show change over time.

## Who does what

- **daemon** (`daemon/src/geo.ts`) — three upstream clients, context-local
  storage, aggregation into reports. Knows nothing about upstream API keys.
  Only needs a `ck_` to auth against the proxy.
- **blackmagic-web** (`src/app/api/agent-tools/[name]/route.ts`) — holds
  `SUB2API_*`, `PPLX_API_KEY`, `SERPAPI_API_KEY` in Vercel env. Three tool
  handlers: `geo_chatgpt`, `geo_pplx`, `geo_ai_overview`. Charges credits on
  2xx upstream responses.
- **apps/web `/geo`** (`apps/web/src/app/geo/page.tsx`) — dashboard.
- **geo-analyst agent** (preset in `daemon/src/context.ts`) — reads the stored
  runs, writes markdown reports into `signals/geo/weekly/` and alerts into
  `signals/geo/alerts/`.

## Request path

```
desktop daemon
  → POST https://blackmagic.engineering/api/agent-tools/geo_{chatgpt,pplx,ai_overview}
  → auth: Bearer ck_…  (user's desktop key)
  → blackmagic-web validates ck_, checks credits, enforces daily cap
  → forwards to upstream (Railway relay / Perplexity / SerpAPI)
  → inserts into bmTokenEvents, decrements userCredit.currentCredits
  → returns upstream JSON to daemon
```

The desktop never sees the Railway URL or any upstream key. That's the whole
point of the proxy — safety + billing.

## Pricing

Retail (source-of-truth in `RETAIL_CENTS` map):
- `geo_chatgpt` 7¢ — gpt-5.2 @ gpt-4o pricing: 16k×$2.5/M + 1k×$10/M ≈ 4¢
  + web_search $25/1k = 2.5¢ ≈ 7¢
- `geo_pplx` 1¢ — Sonar: $1/M in + $1/M out + $5/1k requests ≈ 0.5¢, round up
- `geo_ai_overview` 1¢ — SerpAPI $75/10k = 0.75¢, round up

Charged = retail × 1.1 → 8¢ / 2¢ / 2¢ per call. A 500-prompt × 3-model daily
sweep = 500 × (8+2+2) = 6000¢ = $60/day worst case. Daily user cap
(`DEFAULT_DAILY_CAP_CENTS = 5000`) will block before that.

## Storage (context-local)

```
signals/geo/
  config.json              # { brands: [...], models: [...] }
  prompts.json             # [{ id, text, tags, country_code, created_at }, …]
  runs/
    <YYYY-MM-DD>/
      index.json           # DailyRunSummary
      chatgpt/
        <prompt-slug>.json # GeoRunRecord
      perplexity/
        <prompt-slug>.json
      google_ai_overview/
        <prompt-slug>.json
  weekly/<iso-week>.md     # agent-written reports
  actions/<date>.md        # agent-proposed content actions
  alerts/<date>-<domain>.md # 48h source-drop alerts
```

A `GeoRunRecord` is the unit the reporters aggregate over — it holds the raw
answer, the native citations, the extracted domains, and the extracted brand
mentions (count + first-position character offset).

## Brand / citation matching

- **Brand config** (`signals/geo/config.json`) has `{ id, name, aliases,
  domains, is_us }` per brand. Exactly one brand should have `is_us: true`;
  every report that talks about "us" vs "them" keys off this.
- **Mentions** are substring-matched (case-insensitive) on `name + aliases +
  domains`. Each match counts toward the brand's `mention_count`; the
  earliest `position_char` wins for avg-position stats.
- **Citations** come from two sources: (1) the model's structured `citations` /
  `search_results` / `url_citation` annotations; (2) a bare-URL regex over the
  answer text as fallback. Duplicates are deduped by domain.

## Reports

- `reportBrands` — SoV (share of all mentions), mention_count,
  prompt_coverage, avg_position_char, citation_count (mentions of
  brand-owned domains in citations).
- `reportDomains` — per-domain citation_count / prompt_count / models[].
- `gapSources` — domains cited on prompts where competitors appear but we
  don't. This is the "what content should we pitch for?" list.
- `sovTrend` — per-day SoV for one brand.
- **`reportDelta`** — current window vs same-length prior window. Brand rows
  get `sov_prev` + `sov_delta` + `mention_delta`. Domain rows get
  `prev_citation_count` + `delta` + `status` (new/lost/up/down/flat). Also
  returns four "biggest mover" summary cards.
- **`sovTrendWithPrior`** — returns `{ current, prior }` trend arrays
  indexed by day-offset so the chart can overlay them.

Delta is the only metric users care about — the dashboard leads with it,
absolutes are secondary.

## Triggers

- `geo-daily` (shell, `0 7 * * *`) — curls `POST /api/geo/run` to kick the
  sweep. Writes all stored results for today.
- `geo-weekly` (agent, `0 9 * * 1`) — fires the GEO Analyst agent against
  the week of accumulated runs. Produces the weekly markdown report.

## When editing

- **Pricing** — only `RETAIL_CENTS` in `blackmagic-web/src/app/api/agent-
  tools/[name]/route.ts`. `PRICES_CENTS` is derived.
- **New model** — add to `GeoModel` union in `daemon/src/geo.ts`, add a
  `callX` function + branch in `runPrompt`, add an `if (name === 'geo_x')`
  block in the web route, add to `GEO_MODEL_ENUM` in `daemon/src/tools.ts`
  (used by every tool's enum param), add to `BrandsEditor` model picker and
  the `MODEL_LABELS` map in `apps/web/src/app/geo/page.tsx`.
- **Brand config shape** — changes in `Brand` / `GeoConfig` propagate to
  three places: `daemon/src/geo.ts`, `apps/web/src/lib/api.ts` (mirror
  types), and the `BrandsEditor` form. Migration of existing
  `config.json` on users' machines is not automatic — consider a one-shot
  shim if you break shape.
- **Agent prompt** — lives in `daemon/src/context.ts` under
  `PRESET_AGENTS['geo-analyst.md']`. The tool list in its frontmatter gates
  which tools the agent can call; keep it in sync with `BUILTIN_TOOLS`
  entries.

## Env vars (Vercel, blackmagic-web)

```
SUB2API_API_KEY    = <sk-…>    # Sub2API relay key (held in 1Password / Vercel)
SUB2API_BASE_URL   = https://<railway-app>.up.railway.app
PPLX_API_KEY       = <pplx-…>
SERPAPI_API_KEY    = <serp-…>
```

Actual values live in `~/blackmagic-web/.env.local` for local dev and
in Vercel's project env for prod. Never paste them into this repo.

The old `PPLX_KEY` variable (used by the existing `deep_research` tool) is
kept for back-compat; `geo_pplx` reads `PPLX_API_KEY` first, falls back to
`PPLX_KEY`.

## Sub2API quirks (geo_chatgpt)

The Railway relay exposes an OpenAI-compatible `/v1/responses` but with
strict validation:

- `model` must be `gpt-5.x`. `gpt-4o` is rejected with "The 'gpt-4o' model
  is not supported when using Codex with a ChatGPT account."
- `input` must be an **array** of Codex-shape items:
  `[{type:"message", role:"user", content:[{type:"input_text", text:"…"}]}]`.
  Plain-string input returns 400 "Input must be a list".
- `instructions` field is required.
- `reasoning.effort` of `minimal` is incompatible with `tools:[web_search]`.
  Use `low` (or higher) when you want web_search results.
- The endpoint returns SSE even with `stream:false`. The proxy handler
  parses the last `response.completed` frame out of the stream so the
  daemon sees a normal JSON blob.

## Known limitations

- Brand mention extraction is substring-based. Short brand names with real-
  English collisions (e.g. "Apple" vs fruit) will overcount. Use more
  specific aliases or rely on `domains` matching for those.
- Google AI Overview only triggers for some queries. When it doesn't, the
  run record is stored with `error: "no AI Overview block in SERP…"` — that's
  expected, not a failure to chase.
- No per-prompt country / locale yet. All queries run as en-US.
- No rate-aware backoff in the daily sweep. Concurrency is capped at 4 by
  default; set `concurrency: 1` in the trigger body if you hit 429s.
