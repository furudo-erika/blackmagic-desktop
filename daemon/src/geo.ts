// GEO (Generative Engine Optimization) native implementation.
//
// Replaces the Peec AI integration. Runs a pool of seed prompts daily across
// ChatGPT, Perplexity, and (optionally) Google AI Overview via SerpAPI. Stores
// raw responses + extracted citations under signals/geo/ in the context, so the
// geo-analyst agent (and the /geo dashboard) can compute Share of Voice,
// citation rank, cited-domain reports, and gap-source analysis without any
// external reporting service.
//
// Files in context:
//   signals/geo/config.json          — brand + competitor definitions
//   signals/geo/prompts.json         — seed prompt pool
//   signals/geo/runs/<date>/<model>/<slug>.json
//                                     — one raw+extracted result per prompt×model
//   signals/geo/runs/<date>/index.json — summary of that day's run
//
// Models enabled depend on which API keys are configured. Missing key for a
// model = that model is skipped gracefully in the daily run.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getContextRoot, type Config } from './paths.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeoModel = 'chatgpt' | 'perplexity' | 'google_ai_overview';

export interface Brand {
  id: string;
  name: string;
  // Name variants and owned domains. Any match in a response counts as a
  // mention / citation for this brand.
  aliases?: string[];
  domains?: string[];
  is_us?: boolean;
}

export interface GeoConfig {
  brands: Brand[];
  // Which models to run by default. Missing API key for a listed model is a
  // warning, not an error — that model is skipped in the run.
  models: GeoModel[];
}

export interface GeoPrompt {
  id: string;
  text: string;
  // Free-form tags: "brand", "category", "competitor", "pain", "long-tail",
  // "reverse", persona names, etc. Used for filter/group-by later.
  tags?: string[];
  country_code?: string;
  created_at: string;
}

export interface ExtractedCitation {
  url: string;
  domain: string;
  // 1-indexed position in the citation list as returned by the model.
  position: number;
}

export interface ExtractedMention {
  brand_id: string;
  // 1-indexed position of first occurrence in the answer text (characters).
  position_char: number;
  count: number;
}

export interface GeoRunRecord {
  prompt_id: string;
  prompt_text: string;
  model: GeoModel;
  date: string; // YYYY-MM-DD
  ran_at: string; // ISO
  // Model's raw answer text (markdown).
  answer: string;
  // Citations the model surfaced (PPLX, Google AI Overview, ChatGPT search).
  citations: ExtractedCitation[];
  // Brand mentions detected in the answer text.
  mentions: ExtractedMention[];
  // All domains referenced anywhere in the answer (deduped).
  domains: string[];
  error?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_cents?: number;
}

// ---------------------------------------------------------------------------
// Context paths + file helpers
// ---------------------------------------------------------------------------

function geoRoot() { return path.join(getContextRoot(), 'signals', 'geo'); }
function configPath() { return path.join(geoRoot(), 'config.json'); }
function promptsPath() { return path.join(geoRoot(), 'prompts.json'); }
function runsRoot() { return path.join(geoRoot(), 'runs'); }

async function readJson<T>(p: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(p, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(p: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export async function ensureGeoSkeleton(): Promise<void> {
  await fs.mkdir(geoRoot(), { recursive: true });
  await fs.mkdir(runsRoot(), { recursive: true });
  await fs.mkdir(path.join(geoRoot(), 'weekly'), { recursive: true });
  await fs.mkdir(path.join(geoRoot(), 'actions'), { recursive: true });
  await fs.mkdir(path.join(geoRoot(), 'alerts'), { recursive: true });
  if (!fsSync.existsSync(configPath())) {
    const defaultCfg: GeoConfig = {
      brands: [],
      models: ['chatgpt', 'perplexity', 'google_ai_overview'],
    };
    await writeJson(configPath(), defaultCfg);
  }
  if (!fsSync.existsSync(promptsPath())) {
    await writeJson(promptsPath(), [] as GeoPrompt[]);
  }
}

export async function loadGeoConfig(): Promise<GeoConfig> {
  return readJson<GeoConfig>(configPath(), { brands: [], models: ['chatgpt', 'perplexity', 'google_ai_overview'] });
}

export async function saveGeoConfig(cfg: GeoConfig): Promise<void> {
  await writeJson(configPath(), cfg);
}

export async function listPrompts(): Promise<GeoPrompt[]> {
  return readJson<GeoPrompt[]>(promptsPath(), []);
}

export async function savePrompts(prompts: GeoPrompt[]): Promise<void> {
  await writeJson(promptsPath(), prompts);
}

export async function addPrompt(input: { text: string; tags?: string[]; country_code?: string }): Promise<GeoPrompt> {
  const prompts = await listPrompts();
  const slug = slugify(input.text).slice(0, 48);
  const id = `${slug}-${Math.random().toString(36).slice(2, 8)}`;
  const p: GeoPrompt = {
    id,
    text: input.text,
    tags: input.tags,
    country_code: input.country_code,
    created_at: new Date().toISOString(),
  };
  prompts.push(p);
  await savePrompts(prompts);
  return p;
}

export async function removePrompt(id: string): Promise<boolean> {
  const prompts = await listPrompts();
  const filtered = prompts.filter((p) => p.id !== id);
  if (filtered.length === prompts.length) return false;
  await savePrompts(filtered);
  return true;
}

// ---------------------------------------------------------------------------
// API clients — one per model. Each returns { answer, citations } or error.
// ---------------------------------------------------------------------------

interface ModelResult {
  answer: string;
  citations: ExtractedCitation[];
  tokens_in?: number;
  tokens_out?: number;
  error?: string;
}

// All three model providers hit the blackmagic.engineering proxy, authed with the
// user's ck_ key. The proxy holds the upstream credentials, charges credits
// from the user's balance (at OpenAI/Perplexity/SerpAPI list price + 10%
// markup), and never exposes the upstream URL to the desktop. Every model
// returns { answer, citations } after light normalization here.
async function callProxy(toolName: 'geo_chatgpt' | 'geo_pplx' | 'geo_ai_overview', body: Record<string, unknown>, cfg: Config): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const key = cfg.zenn_api_key;
  if (!key) return { ok: false, status: 0, data: null, error: 'not signed in (no ck_ key)' };
  const base = (cfg.billing_url ?? 'https://blackmagic.engineering').replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/api/agent-tools/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) {
      const msg = typeof data?.error === 'object' ? data.error.message : typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300);
      return { ok: false, status: res.status, data, error: `${toolName} ${res.status}: ${msg}` };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ChatGPT + web_search via the proxy's geo_chatgpt tool. The proxy returns
// the raw Responses API payload (already de-streamed).
async function callChatGPT(promptText: string, cfg: Config): Promise<ModelResult> {
  const r = await callProxy('geo_chatgpt', { prompt: promptText }, cfg);
  if (!r.ok) return { answer: '', citations: [], error: r.error };
  const data = r.data;
  const answer = extractResponsesAnswer(data);
  const citations = extractResponsesCitations(data);
  return {
    answer,
    citations,
    tokens_in: data?.usage?.input_tokens,
    tokens_out: data?.usage?.output_tokens,
  };
}

function extractResponsesAnswer(data: any): string {
  if (!data) return '';
  // New Responses API: output is an array of items; find the last message.
  if (Array.isArray(data.output)) {
    for (let i = data.output.length - 1; i >= 0; i--) {
      const item = data.output[i];
      if (item.type === 'message' && Array.isArray(item.content)) {
        const text = item.content
          .filter((c: any) => c.type === 'output_text' || c.type === 'text')
          .map((c: any) => c.text ?? '')
          .join('');
        if (text) return text;
      }
    }
  }
  if (typeof data.output_text === 'string') return data.output_text;
  return '';
}

function extractResponsesCitations(data: any): ExtractedCitation[] {
  const out: ExtractedCitation[] = [];
  if (!Array.isArray(data?.output)) return out;
  let pos = 0;
  for (const item of data.output) {
    if (item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const c of item.content) {
      const annotations: any[] = c.annotations ?? [];
      for (const a of annotations) {
        if (a.type === 'url_citation' && typeof a.url === 'string') {
          pos += 1;
          out.push({ url: a.url, domain: safeDomain(a.url), position: pos });
        }
      }
    }
  }
  return out;
}

// Perplexity Sonar via the proxy. Citations are native.
async function callPerplexity(promptText: string, cfg: Config): Promise<ModelResult> {
  const r = await callProxy('geo_pplx', { prompt: promptText }, cfg);
  if (!r.ok) return { answer: '', citations: [], error: r.error };
  const data = r.data;
  const answer = data?.choices?.[0]?.message?.content ?? '';
  const citations: ExtractedCitation[] = [];
  const searchResults: any[] = Array.isArray(data?.search_results) ? data.search_results : [];
  if (searchResults.length > 0) {
    searchResults.forEach((sr, i) => {
      const url = typeof sr.url === 'string' ? sr.url : null;
      if (url) citations.push({ url, domain: safeDomain(url), position: i + 1 });
    });
  } else if (Array.isArray(data?.citations)) {
    data.citations.forEach((url: unknown, i: number) => {
      if (typeof url === 'string') citations.push({ url, domain: safeDomain(url), position: i + 1 });
    });
  }
  return {
    answer,
    citations,
    tokens_in: data?.usage?.prompt_tokens,
    tokens_out: data?.usage?.completion_tokens,
  };
}

// Google AI Overview via the proxy (SerpAPI upstream).
async function callGoogleAIOverview(promptText: string, cfg: Config): Promise<ModelResult> {
  const r = await callProxy('geo_ai_overview', { prompt: promptText }, cfg);
  if (!r.ok) return { answer: '', citations: [], error: r.error };
  const data = r.data;
  const overview = data?.ai_overview;
  if (!overview) {
    return { answer: '', citations: [], error: 'no AI Overview block in SERP (AI Overview only triggers for some queries)' };
  }
  const answer = aiOverviewToText(overview);
  const citations: ExtractedCitation[] = [];
  const refs: any[] = Array.isArray(overview.references) ? overview.references : [];
  refs.forEach((ref, i) => {
    const u = typeof ref.link === 'string' ? ref.link : null;
    if (u) citations.push({ url: u, domain: safeDomain(u), position: i + 1 });
  });
  return { answer, citations };
}

function aiOverviewToText(overview: any): string {
  const blocks: any[] = Array.isArray(overview?.text_blocks) ? overview.text_blocks : [];
  const parts: string[] = [];
  for (const b of blocks) {
    if (typeof b.snippet === 'string') parts.push(b.snippet);
    if (Array.isArray(b.list)) {
      for (const li of b.list) {
        if (typeof li.snippet === 'string') parts.push('- ' + li.snippet);
        if (typeof li.title === 'string') parts.push('- ' + li.title);
      }
    }
  }
  return parts.join('\n').trim();
}

// ---------------------------------------------------------------------------
// Extraction — scan answer text for brand mentions and bare URLs/domains
// ---------------------------------------------------------------------------

const URL_REGEX = /https?:\/\/[^\s<>)"']+/g;

export function safeDomain(u: string): string {
  try {
    const host = new URL(u).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function extractDomains(text: string, citations: ExtractedCitation[]): string[] {
  const set = new Set<string>();
  for (const c of citations) if (c.domain) set.add(c.domain);
  const matches = text.match(URL_REGEX) ?? [];
  for (const m of matches) {
    const d = safeDomain(m);
    if (d) set.add(d);
  }
  return Array.from(set);
}

export function extractMentions(text: string, brands: Brand[]): ExtractedMention[] {
  const out: ExtractedMention[] = [];
  const lower = text.toLowerCase();
  for (const b of brands) {
    const needles: string[] = [b.name, ...(b.aliases ?? [])].filter(Boolean);
    let count = 0;
    let firstPos = -1;
    for (const n of needles) {
      const needle = n.toLowerCase();
      if (!needle) continue;
      let idx = 0;
      while (true) {
        const hit = lower.indexOf(needle, idx);
        if (hit < 0) break;
        count += 1;
        if (firstPos < 0 || hit < firstPos) firstPos = hit;
        idx = hit + needle.length;
      }
    }
    // Also credit the brand when one of its owned domains appears anywhere.
    for (const d of b.domains ?? []) {
      const needle = d.toLowerCase();
      if (!needle) continue;
      let idx = 0;
      while (true) {
        const hit = lower.indexOf(needle, idx);
        if (hit < 0) break;
        count += 1;
        if (firstPos < 0 || hit < firstPos) firstPos = hit;
        idx = hit + needle.length;
      }
    }
    if (count > 0) out.push({ brand_id: b.id, position_char: firstPos, count });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runPrompt(prompt: GeoPrompt, model: GeoModel, cfg: Config, brands: Brand[]): Promise<GeoRunRecord> {
  const date = new Date().toISOString().slice(0, 10);
  const ran_at = new Date().toISOString();
  const empty: GeoRunRecord = {
    prompt_id: prompt.id,
    prompt_text: prompt.text,
    model,
    date,
    ran_at,
    answer: '',
    citations: [],
    mentions: [],
    domains: [],
  };
  let result: ModelResult;
  if (model === 'chatgpt') result = await callChatGPT(prompt.text, cfg);
  else if (model === 'perplexity') result = await callPerplexity(prompt.text, cfg);
  else if (model === 'google_ai_overview') result = await callGoogleAIOverview(prompt.text, cfg);
  else return { ...empty, error: `unknown model ${model}` };

  if (result.error) return { ...empty, error: result.error, answer: result.answer };
  const answer = result.answer ?? '';
  const domains = extractDomains(answer, result.citations);
  const mentions = extractMentions(answer, brands);
  return {
    ...empty,
    answer,
    citations: result.citations,
    mentions,
    domains,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
  };
}

export async function writeRun(rec: GeoRunRecord): Promise<string> {
  const dir = path.join(runsRoot(), rec.date, rec.model);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${slugify(rec.prompt_id)}.json`);
  await writeJson(file, rec);
  return path.relative(getContextRoot(), file);
}

export interface DailyRunSummary {
  date: string;
  models: GeoModel[];
  prompts_total: number;
  runs_total: number;
  runs_ok: number;
  runs_error: number;
  errors: Array<{ prompt_id: string; model: GeoModel; error: string }>;
  duration_ms: number;
}

export async function runDaily(cfg: Config, opts: { date?: string; models?: GeoModel[]; concurrency?: number } = {}): Promise<DailyRunSummary> {
  await ensureGeoSkeleton();
  const geoCfg = await loadGeoConfig();
  const prompts = await listPrompts();
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const models = opts.models ?? geoCfg.models ?? [];
  const started = Date.now();

  // Concurrent-run guard. Two parallel runDaily invocations writing to
  // the same _progress.json (e.g. user double-clicked "Run now" because
  // the progress strip vanished on tab-switch) cause the UI counter to
  // oscillate wildly (150 → 15 → 150). Refuse to start if a recent run
  // is already marked running. 30min staleness threshold so a daemon
  // crash mid-run doesn't permanently wedge future runs.
  {
    const existingProgressPath = path.join(runsRoot(), date, '_progress.json');
    const existing = await readJson<any | null>(existingProgressPath, null);
    if (existing && existing.running === true) {
      const startedAtMs = Date.parse(existing.started_at ?? '');
      const ageMs = Number.isFinite(startedAtMs) ? Date.now() - startedAtMs : Infinity;
      if (Number.isFinite(ageMs) && ageMs < 30 * 60_000) {
        throw Object.assign(
          new Error(`A GEO run is already in progress for ${date} — wait for it to finish or check /signals/geo/runs/${date}/_progress.json`),
          { code: 'GEO_RUN_LOCKED' },
        );
      }
    }
  }

  // Skip models missing keys, log a clean error so the summary shows why.
  const missing: string[] = [];
  const enabled: GeoModel[] = [];
  for (const m of models) {
    const reason = missingKeyReason(m, cfg);
    if (reason) missing.push(reason); else enabled.push(m);
  }

  const errors: DailyRunSummary['errors'] = [];
  let runsOk = 0;
  let runsErr = 0;
  const concurrency = Math.max(1, opts.concurrency ?? 4);

  const work: Array<{ prompt: GeoPrompt; model: GeoModel }> = [];
  for (const p of prompts) for (const m of enabled) work.push({ prompt: p, model: m });

  // Progress JSON the UI polls while "Run now" is pending. Written to
  // signals/geo/runs/<date>/_progress.json after each completed call so
  // the user sees "12/90 · ChatGPT · prompt-foo" instead of a frozen
  // "Running…" button. Cleared at end of run.
  const progressPath = path.join(runsRoot(), date, '_progress.json');
  await fs.mkdir(path.dirname(progressPath), { recursive: true });
  let done = 0;
  async function writeProgress(current: { model: GeoModel; prompt_id: string } | null) {
    try {
      await writeJson(progressPath, {
        started_at: new Date(started).toISOString(),
        date,
        total: work.length,
        done,
        current,
        ok: runsOk,
        error: runsErr,
        running: true,
      });
    } catch {}
  }
  await writeProgress(null);

  // Per-call timeout so one stuck Perplexity request can't hang the
  // whole sweep. 90s is generous (real calls are 5-30s); anything
  // longer is almost certainly a network stall.
  const PER_CALL_TIMEOUT_MS = 90_000;
  function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout after ${Math.round(ms / 1000)}s: ${label}`)), ms);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= work.length) return;
      const item = work[i];
      if (!item) return;
      const { prompt, model } = item;
      await writeProgress({ model, prompt_id: prompt.id });
      try {
        const rec = await withTimeout(
          runPrompt(prompt, model, cfg, geoCfg.brands),
          PER_CALL_TIMEOUT_MS,
          `${model} / ${prompt.id}`,
        );
        rec.date = date;
        await writeRun(rec);
        if (rec.error) { runsErr += 1; errors.push({ prompt_id: prompt.id, model, error: rec.error }); }
        else runsOk += 1;
      } catch (err) {
        runsErr += 1;
        errors.push({ prompt_id: prompt.id, model, error: err instanceof Error ? err.message : String(err) });
      }
      done += 1;
      await writeProgress(null);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const summary: DailyRunSummary = {
    date,
    models: enabled,
    prompts_total: prompts.length,
    runs_total: work.length,
    runs_ok: runsOk,
    runs_error: runsErr,
    errors: errors.slice(0, 50),
    duration_ms: Date.now() - started,
  };
  if (missing.length > 0) {
    (summary as any).skipped_models = missing;
  }
  const indexPath = path.join(runsRoot(), date, 'index.json');
  await writeJson(indexPath, summary);
  // Mark progress as finished so the UI's pending poller stops the
  // spinner promptly even before the mutation's HTTP response unwinds.
  try {
    await writeJson(progressPath, {
      started_at: new Date(started).toISOString(),
      date,
      total: work.length,
      done: work.length,
      current: null,
      ok: runsOk,
      error: runsErr,
      running: false,
      finished_at: new Date().toISOString(),
    });
  } catch {}
  return summary;
}

// Latest progress snapshot — UI polls this while "Run now" is in flight
// to show "<done>/<total> · <current model> · <current prompt>" instead
// of an opaque spinner. Returns null if no run has ever started.
export async function getRunProgress(): Promise<unknown | null> {
  // Look at today's progress first, then fall back to most recent date
  // with a _progress.json (e.g. if a run from late yesterday is still
  // active across midnight).
  const today = new Date().toISOString().slice(0, 10);
  const candidates = [today, ...(await listRunDates()).reverse()];
  const seen = new Set<string>();
  for (const d of candidates) {
    if (seen.has(d)) continue;
    seen.add(d);
    const p = path.join(runsRoot(), d, '_progress.json');
    const data = await readJson<unknown | null>(p, null);
    if (data) return data;
  }
  return null;
}

function missingKeyReason(_m: GeoModel, cfg: Config): string | null {
  // All three tools are proxied through blackmagic.engineering now. Only pre-flight
  // check we need is that the user is signed in (has a ck_ key).
  if (!cfg.zenn_api_key) return 'not signed in (run `bm auth` or set ZENN_API_KEY)';
  return null;
}

// ---------------------------------------------------------------------------
// Reporting — aggregate stored run records into metrics
// ---------------------------------------------------------------------------

async function listRunDates(): Promise<string[]> {
  try {
    const entries = await fs.readdir(runsRoot(), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name)).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

async function readRunsForRange(startDate?: string, endDate?: string, model?: GeoModel): Promise<GeoRunRecord[]> {
  const dates = await listRunDates();
  const inRange = dates.filter((d) => (!startDate || d >= startDate) && (!endDate || d <= endDate));
  const out: GeoRunRecord[] = [];
  for (const d of inRange) {
    const dateDir = path.join(runsRoot(), d);
    let modelDirs: string[];
    try {
      const entries = await fs.readdir(dateDir, { withFileTypes: true });
      modelDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch { continue; }
    for (const m of modelDirs) {
      if (model && m !== model) continue;
      const modelDir = path.join(dateDir, m);
      let files: string[];
      try { files = (await fs.readdir(modelDir)).filter((f) => f.endsWith('.json')); } catch { continue; }
      for (const f of files) {
        const rec = await readJson<GeoRunRecord | null>(path.join(modelDir, f), null);
        if (rec) out.push(rec);
      }
    }
  }
  return out;
}

export interface BrandReportRow {
  brand_id: string;
  name: string;
  // Share of Voice: mentions for this brand / total mentions across tracked
  // brands in the window. 0-1.
  sov: number;
  mention_count: number;
  prompt_coverage: number; // fraction of prompts where brand is mentioned at least once
  avg_position_char: number | null;
  citation_count: number; // times a domain owned by this brand appears in citations
}

export async function reportBrands(opts: { start_date?: string; end_date?: string; model?: GeoModel } = {}): Promise<BrandReportRow[]> {
  const cfg = await loadGeoConfig();
  const runs = await readRunsForRange(opts.start_date, opts.end_date, opts.model);
  const totals: Record<string, { mentions: number; positions: number[]; prompts: Set<string>; citations: number }> = {};
  let grandMentions = 0;
  for (const b of cfg.brands) totals[b.id] = { mentions: 0, positions: [], prompts: new Set(), citations: 0 };
  for (const r of runs) {
    for (const m of r.mentions) {
      const t = totals[m.brand_id];
      if (!t) continue;
      t.mentions += m.count;
      grandMentions += m.count;
      if (m.position_char >= 0) t.positions.push(m.position_char);
      t.prompts.add(r.prompt_id);
    }
    for (const b of cfg.brands) {
      const owned = new Set((b.domains ?? []).map((d) => d.toLowerCase()));
      const t = totals[b.id];
      if (!t) continue;
      for (const c of r.citations) if (owned.has(c.domain)) t.citations += 1;
    }
  }
  const uniquePrompts = new Set(runs.map((r) => r.prompt_id)).size || 1;
  return cfg.brands.map((b) => {
    const t = totals[b.id] ?? { mentions: 0, positions: [], prompts: new Set<string>(), citations: 0 };
    const avgPos = t.positions.length > 0 ? t.positions.reduce((a, c) => a + c, 0) / t.positions.length : null;
    return {
      brand_id: b.id,
      name: b.name,
      sov: grandMentions > 0 ? t.mentions / grandMentions : 0,
      mention_count: t.mentions,
      prompt_coverage: t.prompts.size / uniquePrompts,
      avg_position_char: avgPos,
      citation_count: t.citations,
    };
  }).sort((a, b) => b.sov - a.sov);
}

export interface DomainReportRow {
  domain: string;
  citation_count: number;
  prompt_count: number;
  models: GeoModel[];
}

export async function reportDomains(opts: { start_date?: string; end_date?: string; model?: GeoModel; limit?: number } = {}): Promise<DomainReportRow[]> {
  const runs = await readRunsForRange(opts.start_date, opts.end_date, opts.model);
  const map: Record<string, { count: number; prompts: Set<string>; models: Set<GeoModel> }> = {};
  for (const r of runs) {
    for (const c of r.citations) {
      const d = c.domain;
      if (!d) continue;
      if (!map[d]) map[d] = { count: 0, prompts: new Set(), models: new Set() };
      map[d].count += 1;
      map[d].prompts.add(r.prompt_id);
      map[d].models.add(r.model);
    }
  }
  const rows: DomainReportRow[] = Object.entries(map).map(([domain, v]) => ({
    domain,
    citation_count: v.count,
    prompt_count: v.prompts.size,
    models: Array.from(v.models),
  })).sort((a, b) => b.citation_count - a.citation_count);
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

export interface GapSourceRow extends DomainReportRow {
  cited_for_brands: string[]; // names
}

// Domains that cite competitors but NOT us — the money shot for GEO.
export async function gapSources(opts: { start_date?: string; end_date?: string; model?: GeoModel; limit?: number } = {}): Promise<GapSourceRow[]> {
  const cfg = await loadGeoConfig();
  const usBrand = cfg.brands.find((b) => b.is_us);
  if (!usBrand) return [];
  const runs = await readRunsForRange(opts.start_date, opts.end_date, opts.model);
  // Domains citing competitors, map to which competitor(s) they cite.
  const competitorCited: Record<string, Set<string>> = {};
  const usCited = new Set<string>();
  const promptCoverage: Record<string, Set<string>> = {};
  const modelCoverage: Record<string, Set<GeoModel>> = {};
  const counts: Record<string, number> = {};
  const ownedByUs = new Set((usBrand.domains ?? []).map((d) => d.toLowerCase()));
  for (const r of runs) {
    const hasCompetitor = r.mentions.find((m) => {
      const brand = cfg.brands.find((b) => b.id === m.brand_id);
      return brand && !brand.is_us;
    });
    const hasUs = r.mentions.find((m) => m.brand_id === usBrand.id);
    for (const c of r.citations) {
      const d = c.domain;
      if (!d || ownedByUs.has(d)) continue;
      counts[d] = (counts[d] ?? 0) + 1;
      if (!promptCoverage[d]) promptCoverage[d] = new Set();
      if (!modelCoverage[d]) modelCoverage[d] = new Set();
      promptCoverage[d].add(r.prompt_id);
      modelCoverage[d].add(r.model);
      if (hasUs) usCited.add(d);
      if (hasCompetitor) {
        if (!competitorCited[d]) competitorCited[d] = new Set();
        for (const m of r.mentions) {
          const brand = cfg.brands.find((b) => b.id === m.brand_id);
          if (brand && !brand.is_us) competitorCited[d].add(brand.name);
        }
      }
    }
  }
  const gap: GapSourceRow[] = [];
  for (const d of Object.keys(competitorCited)) {
    if (usCited.has(d)) continue;
    const brandSet = competitorCited[d] ?? new Set<string>();
    gap.push({
      domain: d,
      citation_count: counts[d] ?? 0,
      prompt_count: promptCoverage[d]?.size ?? 0,
      models: Array.from(modelCoverage[d] ?? new Set<GeoModel>()),
      cited_for_brands: Array.from(brandSet),
    });
  }
  gap.sort((a, b) => b.citation_count - a.citation_count);
  return opts.limit ? gap.slice(0, opts.limit) : gap;
}

// SoV per-day trend for a brand, for charting.
export interface SovTrendPoint { date: string; sov: number; mentions: number }

export async function sovTrend(opts: { brand_id: string; start_date?: string; end_date?: string; model?: GeoModel } = { brand_id: '' }): Promise<SovTrendPoint[]> {
  const dates = await listRunDates();
  const inRange = dates.filter((d) => (!opts.start_date || d >= opts.start_date) && (!opts.end_date || d <= opts.end_date));
  const points: SovTrendPoint[] = [];
  for (const d of inRange) {
    const runs = await readRunsForRange(d, d, opts.model);
    let brandMentions = 0;
    let totalMentions = 0;
    for (const r of runs) {
      for (const m of r.mentions) {
        totalMentions += m.count;
        if (m.brand_id === opts.brand_id) brandMentions += m.count;
      }
    }
    points.push({
      date: d,
      sov: totalMentions > 0 ? brandMentions / totalMentions : 0,
      mentions: brandMentions,
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Delta report — current window vs the same-length prior window. This is what
// users actually look at: "did I gain or lose ground this week?" Returns
// both rich per-entity deltas (brands, domains, gap) and a handful of
// "biggest mover" summary cards the UI can render on top.
// ---------------------------------------------------------------------------

export interface BrandDeltaRow extends BrandReportRow {
  sov_prev: number;
  sov_delta: number; // signed; +0.034 means +3.4pp
  mention_delta: number;
}

export interface DomainDeltaRow extends DomainReportRow {
  prev_citation_count: number;
  delta: number; // signed
  status: 'new' | 'lost' | 'up' | 'down' | 'flat';
}

export type DeltaFallback = 'none' | 'shrink_to_latest_pair' | 'no_prior_data';

export interface DeltaMeta {
  window_actual: {
    current: { start: string; end: string; days: number };
    prior: { start: string; end: string; days: number } | null;
  };
  prior_data_available: boolean;
  fallback_applied: DeltaFallback;
  runs_in_current: number;
  runs_in_prior: number;
}

export interface DeltaReport {
  window: { start: string; end: string; days: number };
  prev_window: { start: string; end: string };
  brands: BrandDeltaRow[];
  domains_top_up: DomainDeltaRow[];
  domains_top_down: DomainDeltaRow[];
  domains_new: DomainDeltaRow[];
  domains_lost: DomainDeltaRow[];
  movers: {
    brand_sov_up: BrandDeltaRow | null;
    brand_sov_down: BrandDeltaRow | null;
    new_domain: DomainDeltaRow | null;
    lost_domain: DomainDeltaRow | null;
  };
  meta: DeltaMeta;
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function reportDelta(opts: { start_date?: string; end_date?: string; model?: GeoModel } = {}): Promise<DeltaReport> {
  const requestedEnd = opts.end_date ?? new Date().toISOString().slice(0, 10);
  const requestedStart = opts.start_date ?? addDaysISO(requestedEnd, -14);
  const requestedDays = Math.round((new Date(requestedEnd).getTime() - new Date(requestedStart).getTime()) / 86400000) + 1;
  const requestedPrevEnd = addDaysISO(requestedStart, -1);
  const requestedPrevStart = addDaysISO(requestedPrevEnd, -(requestedDays - 1));

  // Decide whether to honour the requested windows or shrink to the latest
  // run-vs-previous-run pair. Shrink only when the prior window is empty
  // but at least 2 distinct run-dates exist somewhere.
  const allDates = await listRunDates();
  const inWindow = (d: string, s: string, e: string) => d >= s && d <= e;
  const runsInCurrent = allDates.filter((d) => inWindow(d, requestedStart, requestedEnd)).length;
  const runsInPrior = allDates.filter((d) => inWindow(d, requestedPrevStart, requestedPrevEnd)).length;

  let start = requestedStart;
  let end = requestedEnd;
  let days = requestedDays;
  let prevStart = requestedPrevStart;
  let prevEnd = requestedPrevEnd;
  let fallback: DeltaFallback = 'none';
  let priorAvailable = runsInPrior > 0;

  if (runsInPrior === 0 && allDates.length >= 2) {
    // Shrink: latest run vs previous run, both single-day windows.
    const r0 = allDates[allDates.length - 1]!;
    const r1 = allDates[allDates.length - 2]!;
    start = r0;
    end = r0;
    days = 1;
    prevStart = r1;
    prevEnd = r1;
    fallback = 'shrink_to_latest_pair';
    priorAvailable = true;
  } else if (runsInPrior === 0 && allDates.length < 2) {
    // Only one run ever (or zero): no honest delta possible. Keep current
    // window so the UI still has brands/domains for "current period only";
    // prior window collapses to null in meta.
    fallback = 'no_prior_data';
    priorAvailable = false;
  }

  const [brandsNow, brandsPrev, domainsNow, domainsPrev] = await Promise.all([
    reportBrands({ start_date: start, end_date: end, model: opts.model }),
    fallback === 'no_prior_data'
      ? Promise.resolve([] as BrandReportRow[])
      : reportBrands({ start_date: prevStart, end_date: prevEnd, model: opts.model }),
    reportDomains({ start_date: start, end_date: end, model: opts.model }),
    fallback === 'no_prior_data'
      ? Promise.resolve([] as DomainReportRow[])
      : reportDomains({ start_date: prevStart, end_date: prevEnd, model: opts.model }),
  ]);

  const prevBrandMap = new Map(brandsPrev.map((b) => [b.brand_id, b]));
  const brands: BrandDeltaRow[] = brandsNow.map((b) => {
    const p = prevBrandMap.get(b.brand_id);
    return {
      ...b,
      sov_prev: p?.sov ?? 0,
      sov_delta: b.sov - (p?.sov ?? 0),
      mention_delta: b.mention_count - (p?.mention_count ?? 0),
    };
  });

  const prevDomainMap = new Map(domainsPrev.map((d) => [d.domain, d]));
  const nowDomainSet = new Set(domainsNow.map((d) => d.domain));
  const domainRows: DomainDeltaRow[] = domainsNow.map((d) => {
    const prev = prevDomainMap.get(d.domain);
    const prevCount = prev?.citation_count ?? 0;
    const delta = d.citation_count - prevCount;
    const status: DomainDeltaRow['status'] = prevCount === 0 ? 'new' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    return { ...d, prev_citation_count: prevCount, delta, status };
  });
  // Lost = in prev but not in current window.
  const lost: DomainDeltaRow[] = [];
  for (const p of domainsPrev) {
    if (nowDomainSet.has(p.domain)) continue;
    lost.push({
      ...p,
      citation_count: 0,
      prompt_count: 0,
      models: [],
      prev_citation_count: p.citation_count,
      delta: -p.citation_count,
      status: 'lost',
    });
  }

  const sortedByDelta = [...domainRows].sort((a, b) => b.delta - a.delta);
  const topUp = sortedByDelta.filter((r) => r.delta > 0 && r.status !== 'new').slice(0, 10);
  const topDown = sortedByDelta.filter((r) => r.delta < 0).reverse().slice(0, 10);
  const newRows = domainRows.filter((r) => r.status === 'new').sort((a, b) => b.citation_count - a.citation_count).slice(0, 10);
  const lostRows = lost.sort((a, b) => b.prev_citation_count - a.prev_citation_count).slice(0, 10);

  const sortedBrandsUp = [...brands].sort((a, b) => b.sov_delta - a.sov_delta);
  const sortedBrandsDown = [...brands].sort((a, b) => a.sov_delta - b.sov_delta);

  const priorDays = Math.round((new Date(prevEnd).getTime() - new Date(prevStart).getTime()) / 86400000) + 1;
  const meta: DeltaMeta = {
    window_actual: {
      current: { start, end, days },
      prior: fallback === 'no_prior_data' ? null : { start: prevStart, end: prevEnd, days: priorDays },
    },
    prior_data_available: priorAvailable,
    fallback_applied: fallback,
    runs_in_current: runsInCurrent,
    runs_in_prior: runsInPrior,
  };

  return {
    window: { start, end, days },
    prev_window: { start: prevStart, end: prevEnd },
    brands: brands.sort((a, b) => b.sov - a.sov),
    domains_top_up: topUp,
    domains_top_down: topDown,
    domains_new: newRows,
    domains_lost: lostRows,
    movers: {
      brand_sov_up: sortedBrandsUp[0] && sortedBrandsUp[0].sov_delta > 0 ? sortedBrandsUp[0] : null,
      brand_sov_down: sortedBrandsDown[0] && sortedBrandsDown[0].sov_delta < 0 ? sortedBrandsDown[0] : null,
      new_domain: newRows[0] ?? null,
      lost_domain: lostRows[0] ?? null,
    },
    meta,
  };
}

// Current-window trend plus prior-window overlay, indexed by day-offset so the
// UI can render two lines side-by-side (x = days from window start).
export interface TrendOverlay {
  current: Array<{ day_index: number; date: string; sov: number; mentions: number }>;
  prior: Array<{ day_index: number; date: string; sov: number; mentions: number }>;
  window: { start: string; end: string; days: number };
  prev_window: { start: string; end: string };
  meta: DeltaMeta;
}

export async function sovTrendWithPrior(opts: { brand_id: string; start_date?: string; end_date?: string; model?: GeoModel }): Promise<TrendOverlay> {
  const requestedEnd = opts.end_date ?? new Date().toISOString().slice(0, 10);
  const requestedStart = opts.start_date ?? addDaysISO(requestedEnd, -14);
  const requestedDays = Math.round((new Date(requestedEnd).getTime() - new Date(requestedStart).getTime()) / 86400000) + 1;
  const requestedPrevEnd = addDaysISO(requestedStart, -1);
  const requestedPrevStart = addDaysISO(requestedPrevEnd, -(requestedDays - 1));

  // Same fallback rules as reportDelta so the chart label stays in sync.
  const allDates = await listRunDates();
  const inWindow = (d: string, s: string, e: string) => d >= s && d <= e;
  const runsInCurrent = allDates.filter((d) => inWindow(d, requestedStart, requestedEnd)).length;
  const runsInPrior = allDates.filter((d) => inWindow(d, requestedPrevStart, requestedPrevEnd)).length;

  let start = requestedStart;
  let end = requestedEnd;
  let days = requestedDays;
  let prevStart = requestedPrevStart;
  let prevEnd = requestedPrevEnd;
  let fallback: DeltaFallback = 'none';
  let priorAvailable = runsInPrior > 0;

  if (runsInPrior === 0 && allDates.length >= 2) {
    const r0 = allDates[allDates.length - 1]!;
    const r1 = allDates[allDates.length - 2]!;
    start = r0; end = r0; days = 1;
    prevStart = r1; prevEnd = r1;
    fallback = 'shrink_to_latest_pair';
    priorAvailable = true;
  } else if (runsInPrior === 0 && allDates.length < 2) {
    fallback = 'no_prior_data';
    priorAvailable = false;
  }

  const [now, prev] = await Promise.all([
    sovTrend({ brand_id: opts.brand_id, start_date: start, end_date: end, model: opts.model }),
    fallback === 'no_prior_data'
      ? Promise.resolve([] as SovTrendPoint[])
      : sovTrend({ brand_id: opts.brand_id, start_date: prevStart, end_date: prevEnd, model: opts.model }),
  ]);
  const toDayIdx = (windowStart: string) => (p: { date: string; sov: number; mentions: number }) => ({
    day_index: Math.round((new Date(p.date).getTime() - new Date(windowStart).getTime()) / 86400000),
    ...p,
  });
  const priorDays = Math.round((new Date(prevEnd).getTime() - new Date(prevStart).getTime()) / 86400000) + 1;
  const meta: DeltaMeta = {
    window_actual: {
      current: { start, end, days },
      prior: fallback === 'no_prior_data' ? null : { start: prevStart, end: prevEnd, days: priorDays },
    },
    prior_data_available: priorAvailable,
    fallback_applied: fallback,
    runs_in_current: runsInCurrent,
    runs_in_prior: runsInPrior,
  };
  return {
    current: now.map(toDayIdx(start)),
    prior: prev.map(toDayIdx(prevStart)),
    window: { start, end, days },
    prev_window: { start: prevStart, end: prevEnd },
    meta,
  };
}

export async function listDailySummaries(): Promise<DailyRunSummary[]> {
  const dates = await listRunDates();
  const out: DailyRunSummary[] = [];
  for (const d of dates) {
    const s = await readJson<DailyRunSummary | null>(path.join(runsRoot(), d, 'index.json'), null);
    if (s) out.push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
