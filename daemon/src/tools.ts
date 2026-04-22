// Built-in tool registry. Each tool has:
//  - a JSON Schema (exposed to the LLM via tools[])
//  - a handler (executed locally by the daemon)
//
// Every handler receives a `ctx` with vault + config + secrets.

import { readVaultFile, writeVaultFile, editVaultFile, renameVaultFile, listDir, grepVault } from './vault.js';
import type { Config } from './paths.js';
import { McpRegistry } from './mcp.js';
import { enrollContact } from './sequences.js';
import {
  ensureGeoSkeleton,
  loadGeoConfig,
  saveGeoConfig,
  listPrompts as geoListPrompts,
  addPrompt as geoAddPrompt,
  removePrompt as geoRemovePrompt,
  runPrompt as geoRunPrompt,
  writeRun as geoWriteRun,
  runDaily as geoRunDaily,
  reportBrands as geoReportBrands,
  reportDomains as geoReportDomains,
  gapSources as geoGapSources,
  sovTrend as geoSovTrend,
  listDailySummaries as geoListDailySummaries,
  type GeoModel,
  type Brand,
} from './geo.js';

export interface ToolCtx {
  config: Config;
  runDir: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: any, ctx: ToolCtx) => Promise<unknown>;
}

const read_file: ToolDef = {
  name: 'read_file',
  description: 'Read a file from the vault. Returns { content, frontmatter, body }.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Relative path inside the vault' } },
    required: ['path'],
  },
  handler: async (args) => readVaultFile(args.path),
};

const write_file: ToolDef = {
  name: 'write_file',
  description: 'Create or overwrite a vault file. Use frontmatter YAML at the top for structured files.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['path', 'content'],
  },
  handler: async (args) => {
    await writeVaultFile(args.path, args.content);
    return { ok: true, path: args.path };
  },
};

const edit_file: ToolDef = {
  name: 'edit_file',
  description: 'Replace a unique substring in a vault file. Fails if old_str is missing or ambiguous.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      old_str: { type: 'string' },
      new_str: { type: 'string' },
    },
    required: ['path', 'old_str', 'new_str'],
  },
  handler: async (args) => {
    await editVaultFile(args.path, args.old_str, args.new_str);
    return { ok: true };
  },
};

const rename_file: ToolDef = {
  name: 'rename_file',
  description: 'Move a vault file to a new path. Useful when a deal transitions stages.',
  parameters: {
    type: 'object',
    properties: { old_path: { type: 'string' }, new_path: { type: 'string' } },
    required: ['old_path', 'new_path'],
  },
  handler: async (args) => {
    await renameVaultFile(args.old_path, args.new_path);
    return { ok: true };
  },
};

const list_dir: ToolDef = {
  name: 'list_dir',
  description: 'List immediate children of a vault directory.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', default: '.' } },
  },
  handler: async (args) => listDir(args.path ?? '.'),
};

const grep: ToolDef = {
  name: 'grep',
  description: 'Search case-insensitive regex across vault markdown files.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string' },
      path: { type: 'string', default: '.' },
    },
    required: ['pattern'],
  },
  handler: async (args) => grepVault(args.pattern, args.path ?? '.'),
};

const web_fetch: ToolDef = {
  name: 'web_fetch',
  description: 'HTTP GET a URL. Returns status + first 20KB of text.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string' } },
    required: ['url'],
  },
  handler: async (args) => {
    const res = await fetch(args.url, { headers: { 'User-Agent': 'BlackMagic/0.1 (+https://blackmagic.engineering)' } });
    const text = (await res.text()).slice(0, 20_000);
    return { status: res.status, text };
  },
};

// Both web_search and enrich_company are proxied through blackmagic.engineering so the
// user doesn't manage third-party keys. Server side charges the user's
// credits per call and forwards the response. Authed with the vault's ck_.
async function proxyTool(toolName: string, args: Record<string, unknown>, ctx: ToolCtx) {
  const key = ctx.config.zenn_api_key;
  const base = (ctx.config.billing_url ?? 'https://blackmagic.engineering').replace(/\/+$/, '');
  if (!key) return { error: 'not signed in; no ck_ key available' };
  const res = await fetch(`${base}/api/agent-tools/${toolName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) return { error: `${res.status} ${text.slice(0, 300)}` };
  return data;
}

// web_search is handled by OpenAI's built-in tool inside the Responses
// API now, billed per search by the server-side proxy. No local tool
// definition needed.

const deep_research: ToolDef = {
  name: 'deep_research',
  description:
    'Multi-hop web research via Perplexity sonar-deep-research, proxied through blackmagic.engineering. Spends a few minutes, returns a structured report with inline citations. Use for account briefs, competitor teardowns, market scans — NOT for quick factual lookups (use the model\'s built-in web_search for those).',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'A detailed research brief. The longer and more specific, the better the report.',
      },
      focus: {
        type: 'string',
        enum: ['general', 'company', 'person', 'market', 'technical'],
        default: 'general',
      },
    },
    required: ['query'],
  },
  handler: async (args, ctx) => proxyTool('deep_research', args, ctx),
};

const enrich_company: ToolDef = {
  name: 'enrich_company',
  description:
    'Enrich a company by its domain — firmographics, funding, tech stack, key people. Charged per match.',
  parameters: {
    type: 'object',
    properties: { domain: { type: 'string' } },
    required: ['domain'],
  },
  handler: async (args, ctx) => proxyTool('enrich_company', { domain: args.domain }, ctx),
};

const enrich_contact: ToolDef = {
  name: 'enrich_contact',
  description:
    'Enrich a person by email or LinkedIn URL — role, seniority, work history. Charged per match.',
  parameters: {
    type: 'object',
    properties: {
      email: { type: 'string' },
      linkedin: { type: 'string' },
    },
  },
  handler: async (args, ctx) => proxyTool('enrich_contact', args, ctx),
};

const draft_create: ToolDef = {
  name: 'draft_create',
  description:
    'Write a draft to drafts/. Default behavior: approval-gated (status: pending). If the skill passes auto:true OR the user has turned on the global auto-send toggle in /outreach, the draft is created and immediately sent via the best-available provider (Amazon SES → Resend → MCP tool).',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', enum: ['email', 'linkedin_dm', 'linkedin_connect', 'reddit', 'manual'] },
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
      tool: { type: 'string', description: 'Which tool should send it. email → "send_email" (routes to Amazon SES / Resend). linkedin_dm → "linkedin_send_dm" (Unipile). linkedin_connect → "linkedin_send_invitation" (Unipile). Or "manual" for drafts the user will send themselves.' },
      auto: { type: 'boolean', description: 'Skip the pending gate and fire the send provider immediately. Default false — match the global /outreach setting when unset.' },
    },
    required: ['channel', 'to', 'body', 'tool'],
  },
  handler: async (args, ctx) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const slug = (args.to || 'unknown').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const relPath = `drafts/${ts}-${slug}.md`;
    const content = `---
kind: draft
channel: ${args.channel}
to: ${JSON.stringify(args.to)}
subject: ${JSON.stringify(args.subject ?? '')}
tool: ${args.tool}
status: pending
created_at: ${new Date().toISOString()}
---

${args.body}
`;
    await writeVaultFile(relPath, content);

    // Resolve auto-send: explicit args.auto > global setting > pending.
    let auto = args.auto === true;
    if (args.auto !== true && args.auto !== false) {
      try {
        const fs = await import('node:fs/promises');
        const pathMod = await import('node:path');
        const { getVaultRoot } = await import('./paths.js');
        const raw = await fs.readFile(
          pathMod.join(getVaultRoot(), '.bm', 'drafts-settings.json'),
          'utf-8',
        );
        const cfg = JSON.parse(raw);
        if (cfg?.auto_send === true) auto = true;
      } catch { /* default false */ }
    }

    if (!auto) return { ok: true, path: relPath, status: 'pending' };

    // Fire the approve path now. Reuse ctx.config for Resend fallback.
    const { approveDraft } = await import('./drafts.js');
    const id = relPath.replace(/^drafts\//, '').replace(/\.md$/, '');
    const r = await approveDraft(id, {
      resendKey: ctx.config.resend_api_key,
      resendFrom: ctx.config.from_email,
    });
    return { ok: r.ok, path: relPath, status: r.ok ? 'sent' : 'approved', provider: r.provider, messageId: r.messageId, error: r.error };
  },
};

const enrich_contact_linkedin: ToolDef = {
  name: 'enrich_contact_linkedin',
  description:
    "Enrich a person via EnrichLayer (proxycurl-compatible) using their LinkedIn profile URL. Returns structured profile fields (title, company, location, summary, experience). Uses the user's own ENRICHLAYER_API_KEY — not the proxy.",
  parameters: {
    type: 'object',
    properties: {
      linkedinUrl: { type: 'string', description: 'Full LinkedIn profile URL, e.g. https://www.linkedin.com/in/jane-doe/' },
    },
    required: ['linkedinUrl'],
  },
  handler: async (args, ctx) => {
    const key = ctx.config.enrichlayer_api_key;
    if (!key) {
      return { error: 'No ENRICHLAYER_API_KEY configured. Set it in sidebar → Integrations, or add enrichlayer_api_key to ~/BlackMagic/.bm/config.toml.' };
    }
    const url = new URL('https://enrichlayer.com/api/v2/linkedin');
    url.searchParams.set('url', args.linkedinUrl);
    url.searchParams.set('use_cache', 'if-present');
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}` },
    });
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) return { error: `enrichlayer ${res.status}: ${String(text).slice(0, 300)}` };
    return data;
  },
};

const scrape_apify_actor: ToolDef = {
  name: 'scrape_apify_actor',
  description:
    'Run any Apify actor synchronously and return the dataset items. Useful for company crawlers, LinkedIn scrapers, Google Maps harvesters, etc. Pass the actor id (e.g. "apify/google-search-scraper") and an input object matching that actor\'s schema.',
  parameters: {
    type: 'object',
    properties: {
      actorId: { type: 'string', description: 'Apify actor id, e.g. "apify/google-search-scraper" or "user~my-actor".' },
      input: { type: 'object', description: 'Actor input object per its schema.' },
    },
    required: ['actorId', 'input'],
  },
  handler: async (args, ctx) => {
    const key = ctx.config.apify_api_key;
    if (!key) {
      return { error: 'No APIFY_API_KEY configured. Set it in sidebar → Integrations, or add apify_api_key to ~/BlackMagic/.bm/config.toml.' };
    }
    const actor = encodeURIComponent(args.actorId).replace(/%2F/g, '~');
    const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args.input ?? {}),
    });
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) return { error: `apify ${res.status}: ${String(text).slice(0, 300)}` };
    return { items: data };
  },
};

// ---------------------------------------------------------------------------
// Helpers shared by the new integration-backed tools below. Read per-user
// credentials straight from the active project's integrations.json rather
// than ctx.config, so the tools stay in sync with whatever the user
// pasted in the UI (config.toml isn't updated on UI saves for the newer
// providers).
// ---------------------------------------------------------------------------
async function readIntegrationCreds(provider: string): Promise<Record<string, string> | null> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { getVaultRoot } = await import('./paths.js');
  try {
    const raw = await fs.readFile(path.join(getVaultRoot(), '.bm', 'integrations.json'), 'utf-8');
    const data = JSON.parse(raw);
    const rec = data?.[provider];
    if (!rec || rec.status !== 'connected') return null;
    return (rec.credentials ?? null) as Record<string, string> | null;
  } catch { return null; }
}

// Google Search Console — sign a JWT from a pasted service-account JSON,
// exchange for an access token, then call Search Analytics / URL
// Inspection. Tokens get cached in-memory for 55 minutes per credential
// fingerprint so a run of 10 queries doesn't hit the OAuth endpoint
// 10 times.
const gscTokenCache = new Map<string, { token: string; exp: number }>();

async function gscAccessToken(): Promise<string> {
  const creds = await readIntegrationCreds('gsc');
  if (!creds?.service_account_json) {
    throw new Error('No Google Search Console service account connected. Paste the JSON in sidebar → Integrations → Google Search Console.');
  }
  const sa = JSON.parse(creds.service_account_json) as {
    client_email: string; private_key: string;
  };
  const fp = `${sa.client_email}:${(sa.private_key || '').slice(-32)}`;
  const cached = gscTokenCache.get(fp);
  if (cached && cached.exp > Date.now()) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(claim)}`;
  const { createSign } = await import('node:crypto');
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const sig = signer.sign(sa.private_key).toString('base64url');
  const assertion = `${unsigned}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(assertion)}`,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GSC token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  const body = JSON.parse(text) as { access_token: string; expires_in: number };
  gscTokenCache.set(fp, {
    token: body.access_token,
    // Refresh 5 min before expiry to keep repeated calls fresh.
    exp: Date.now() + Math.max(0, (body.expires_in - 300)) * 1000,
  });
  return body.access_token;
}

const gsc_query: ToolDef = {
  name: 'gsc_query',
  description:
    'Query the Google Search Console Search Analytics API for the connected site. Returns impressions, clicks, CTR, and average position grouped by dimensions (query, page, country, device, date). Requires a GSC service account connected in Integrations.',
  parameters: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: 'YYYY-MM-DD. Default: 28 days ago.' },
      endDate: { type: 'string', description: 'YYYY-MM-DD. Default: today.' },
      dimensions: {
        type: 'array',
        items: { type: 'string', enum: ['query', 'page', 'country', 'device', 'date', 'searchAppearance'] },
        description: 'Default ["query"].',
      },
      rowLimit: { type: 'number', description: 'Max rows. Default 500, cap 25000.' },
      searchType: { type: 'string', enum: ['web', 'image', 'video', 'news', 'discover', 'googleNews'], description: 'Default "web".' },
    },
  },
  handler: async (args) => {
    const creds = await readIntegrationCreds('gsc');
    if (!creds?.site_url) return { error: 'No site_url configured in the gsc integration.' };
    let token: string;
    try { token = await gscAccessToken(); } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const end = args.endDate || iso(today);
    const start = args.startDate || iso(new Date(today.getTime() - 28 * 864e5));
    const body = {
      startDate: start,
      endDate: end,
      dimensions: Array.isArray(args.dimensions) && args.dimensions.length > 0 ? args.dimensions : ['query'],
      rowLimit: Math.min(typeof args.rowLimit === 'number' ? args.rowLimit : 500, 25000),
      searchType: typeof args.searchType === 'string' ? args.searchType : 'web',
    };
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(creds.site_url)}/searchAnalytics/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { error: `gsc ${res.status}: ${text.slice(0, 300)}` };
    return JSON.parse(text);
  },
};

// Google Analytics 4 — same service-account JWT dance as GSC, just
// scoped to analytics.readonly. Token cache is keyed by credential
// fingerprint so repeated tool calls inside a single agent run don't
// re-exchange. Property ID is the numeric GA4 property (Admin →
// Property Settings → "PROPERTY ID"), NOT the G-XXXX measurement ID
// — the Data API rejects measurement IDs.
const gaTokenCache = new Map<string, { token: string; exp: number }>();

async function gaAccessToken(): Promise<string> {
  const creds = await readIntegrationCreds('google_analytics');
  if (!creds?.service_account_json) {
    throw new Error('No Google Analytics service account connected. Paste the JSON in sidebar → Integrations → Google Analytics.');
  }
  const sa = JSON.parse(creds.service_account_json) as {
    client_email: string; private_key: string;
  };
  const fp = `${sa.client_email}:${(sa.private_key || '').slice(-32)}`;
  const cached = gaTokenCache.get(fp);
  if (cached && cached.exp > Date.now()) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(claim)}`;
  const { createSign } = await import('node:crypto');
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const sig = signer.sign(sa.private_key).toString('base64url');
  const assertion = `${unsigned}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(assertion)}`,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GA token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  const body = JSON.parse(text) as { access_token: string; expires_in: number };
  gaTokenCache.set(fp, {
    token: body.access_token,
    exp: Date.now() + Math.max(0, (body.expires_in - 300)) * 1000,
  });
  return body.access_token;
}

async function gaPropertyId(): Promise<string | null> {
  const creds = await readIntegrationCreds('google_analytics');
  const raw = String(creds?.property_id ?? '').trim();
  if (!raw) return null;
  // Accept "properties/123" or just "123". Data API requires the
  // `properties/123` form on the URL.
  return raw.startsWith('properties/') ? raw : `properties/${raw.replace(/^properties\//, '')}`;
}

const ga_run_report: ToolDef = {
  name: 'ga_run_report',
  description:
    'Run a GA4 Data API report on the connected property. Returns rows with the requested dimensions + metrics (e.g. sessions, activeUsers, screenPageViews by date/country/pagePath). Default window = last 28 days. Requires Google Analytics connected in Integrations.',
  parameters: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: 'YYYY-MM-DD or GA4 relative like "28daysAgo". Default "28daysAgo".' },
      endDate:   { type: 'string', description: 'YYYY-MM-DD or "today"/"yesterday". Default "today".' },
      dimensions: {
        type: 'array',
        items: { type: 'string' },
        description: 'GA4 dimension names, e.g. ["date"], ["country"], ["pagePath"], ["sessionDefaultChannelGroup"]. Default ["date"].',
      },
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description: 'GA4 metric names, e.g. ["sessions","activeUsers","screenPageViews","engagementRate","conversions"]. Default ["sessions","activeUsers","screenPageViews"].',
      },
      limit: { type: 'number', description: 'Max rows. Default 500, cap 100000.' },
      orderByMetric: { type: 'string', description: 'Metric name to sort by DESC (e.g. "sessions"). Optional.' },
    },
  },
  handler: async (args) => {
    const propId = await gaPropertyId();
    if (!propId) return { error: 'No property_id configured in the google_analytics integration.' };
    let token: string;
    try { token = await gaAccessToken(); } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
    const dims = Array.isArray(args.dimensions) && args.dimensions.length > 0
      ? args.dimensions.map((d: string) => ({ name: String(d) }))
      : [{ name: 'date' }];
    const mets = Array.isArray(args.metrics) && args.metrics.length > 0
      ? args.metrics.map((m: string) => ({ name: String(m) }))
      : [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }];
    const body: Record<string, unknown> = {
      dateRanges: [{
        startDate: String(args.startDate || '28daysAgo'),
        endDate:   String(args.endDate   || 'today'),
      }],
      dimensions: dims,
      metrics: mets,
      limit: String(Math.min(typeof args.limit === 'number' ? args.limit : 500, 100000)),
    };
    if (typeof args.orderByMetric === 'string' && args.orderByMetric.trim()) {
      body.orderBys = [{ metric: { metricName: String(args.orderByMetric) }, desc: true }];
    }
    const url = `https://analyticsdata.googleapis.com/v1beta/${propId}:runReport`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { error: `ga ${res.status}: ${text.slice(0, 400)}` };
    return JSON.parse(text);
  },
};

const ga_top_pages: ToolDef = {
  name: 'ga_top_pages',
  description:
    'Shortcut: top landing pages by sessions over the window. Returns pagePath + pageTitle with sessions, activeUsers, screenPageViews, engagementRate. Use this instead of ga_run_report when the question is "what pages are driving traffic".',
  parameters: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: 'Default "28daysAgo".' },
      endDate:   { type: 'string', description: 'Default "today".' },
      limit:     { type: 'number', description: 'Default 25, cap 1000.' },
    },
  },
  handler: async (args) => {
    const propId = await gaPropertyId();
    if (!propId) return { error: 'No property_id configured in the google_analytics integration.' };
    let token: string;
    try { token = await gaAccessToken(); } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
    const body = {
      dateRanges: [{
        startDate: String(args.startDate || '28daysAgo'),
        endDate:   String(args.endDate   || 'today'),
      }],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'screenPageViews' },
        { name: 'engagementRate' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: String(Math.min(typeof args.limit === 'number' ? args.limit : 25, 1000)),
    };
    const url = `https://analyticsdata.googleapis.com/v1beta/${propId}:runReport`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { error: `ga ${res.status}: ${text.slice(0, 400)}` };
    return JSON.parse(text);
  },
};

const ga_realtime: ToolDef = {
  name: 'ga_realtime',
  description:
    'GA4 realtime report (last 30 minutes). Returns active users broken down by the requested dimension (country, deviceCategory, unifiedScreenName, etc.). Use for "who is on the site right now".',
  parameters: {
    type: 'object',
    properties: {
      dimensions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Default ["country"]. Common: ["country"], ["deviceCategory"], ["unifiedScreenName"].',
      },
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Default ["activeUsers"].',
      },
      limit: { type: 'number', description: 'Default 50, cap 1000.' },
    },
  },
  handler: async (args) => {
    const propId = await gaPropertyId();
    if (!propId) return { error: 'No property_id configured in the google_analytics integration.' };
    let token: string;
    try { token = await gaAccessToken(); } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
    const body = {
      dimensions: (Array.isArray(args.dimensions) && args.dimensions.length > 0
        ? args.dimensions
        : ['country']
      ).map((d: string) => ({ name: String(d) })),
      metrics: (Array.isArray(args.metrics) && args.metrics.length > 0
        ? args.metrics
        : ['activeUsers']
      ).map((m: string) => ({ name: String(m) })),
      limit: String(Math.min(typeof args.limit === 'number' ? args.limit : 50, 1000)),
    };
    const url = `https://analyticsdata.googleapis.com/v1beta/${propId}:runRealtimeReport`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { error: `ga ${res.status}: ${text.slice(0, 400)}` };
    return JSON.parse(text);
  },
};

// Ghost Admin API — JWT-signed with the admin key. Ghost's format is
// "<id>:<secret>" hex-encoded; we split, base64url-decode the secret,
// sign a short-lived JWT (5 min), and use it as Bearer auth.
async function ghostAuthHeader(key: string): Promise<string> {
  const [kid, secret] = key.split(':');
  if (!kid || !secret) throw new Error('GHOST_ADMIN_API_KEY must be "<id>:<secret>" format');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT', kid };
  const claim = { iat: now, exp: now + 5 * 60, aud: '/admin/' };
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(claim)}`;
  const { createHmac } = await import('node:crypto');
  const sig = createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url');
  return `Ghost ${unsigned}.${sig}`;
}

// CMS tools — route to whichever platform (Ghost / WordPress) the user
// has connected. If both are connected, default to Ghost unless the
// caller passes `platform: "wordpress"`. Rationale: users typically have
// one primary CMS; we don't want to double-publish without an explicit
// choice.
async function resolveCmsPlatform(hint?: string): Promise<'ghost' | 'wordpress' | null> {
  if (hint === 'ghost' || hint === 'wordpress') return hint;
  const ghost = await readIntegrationCreds('ghost');
  if (ghost?.token && ghost.endpoint) return 'ghost';
  const wp = await readIntegrationCreds('wordpress');
  if (wp?.token && wp.endpoint) return 'wordpress';
  return null;
}

const cms_list_posts: ToolDef = {
  name: 'cms_list_posts',
  description:
    'List recent posts from the connected CMS (Ghost or WordPress). Returns id, title, status, url, updated_at for each. Use status="draft" to review pending drafts before they ship.',
  parameters: {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['ghost', 'wordpress'], description: 'Force a platform; auto-detected if omitted.' },
      status: { type: 'string', enum: ['published', 'draft', 'scheduled', 'any'], description: 'Default "any".' },
      limit: { type: 'number', description: 'Default 20, cap 100.' },
    },
  },
  handler: async (args) => {
    const platform = await resolveCmsPlatform(args.platform);
    if (!platform) return { error: 'No CMS connected. Paste credentials in sidebar → Integrations → Ghost or WordPress.' };
    const limit = Math.min(typeof args.limit === 'number' ? args.limit : 20, 100);
    const status = typeof args.status === 'string' ? args.status : 'any';
    if (platform === 'ghost') {
      const creds = (await readIntegrationCreds('ghost'))!;
      if (!creds.token || !creds.endpoint) return { error: 'Ghost integration missing token or endpoint.' };
      const auth = await ghostAuthHeader(creds.token);
      const base = creds.endpoint.replace(/\/+$/, '');
      const filter = status === 'any' ? '' : `&filter=status:${status}`;
      const url = `${base}/ghost/api/admin/posts/?limit=${limit}${filter}&order=updated_at%20desc`;
      const res = await fetch(url, { headers: { Authorization: auth } });
      const text = await res.text();
      if (!res.ok) return { error: `ghost ${res.status}: ${text.slice(0, 300)}` };
      const data = JSON.parse(text) as { posts: any[] };
      return {
        platform,
        posts: (data.posts || []).map((p) => ({
          id: p.id, title: p.title, status: p.status, url: p.url, updated_at: p.updated_at,
        })),
      };
    }
    // wordpress
    const creds = (await readIntegrationCreds('wordpress'))!;
    if (!creds.token || !creds.endpoint) return { error: 'WordPress integration missing token or endpoint.' };
    const base = creds.endpoint.replace(/\/+$/, '');
    const wpStatus = status === 'any' ? 'publish,draft,future,pending,private' : status === 'scheduled' ? 'future' : status;
    const url = `${base}/wp-json/wp/v2/posts?per_page=${limit}&status=${wpStatus}&orderby=modified&order=desc`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${Buffer.from(creds.token).toString('base64')}` },
    });
    const text = await res.text();
    if (!res.ok) return { error: `wordpress ${res.status}: ${text.slice(0, 300)}` };
    const data = JSON.parse(text) as any[];
    return {
      platform,
      posts: (data || []).map((p) => ({
        id: p.id, title: p.title?.rendered, status: p.status, url: p.link, updated_at: p.modified,
      })),
    };
  },
};

const cms_create_draft: ToolDef = {
  name: 'cms_create_draft',
  description:
    'Create a DRAFT blog post in the connected CMS (Ghost or WordPress). Always creates as draft — never publishes. The user reviews + publishes via their CMS UI.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      html: { type: 'string', description: 'Post body as HTML. Prefer this for formatting fidelity.' },
      markdown: { type: 'string', description: 'Post body as markdown. Used if html is missing.' },
      tags: { type: 'array', items: { type: 'string' } },
      platform: { type: 'string', enum: ['ghost', 'wordpress'] },
    },
    required: ['title'],
  },
  handler: async (args) => {
    const platform = await resolveCmsPlatform(args.platform);
    if (!platform) return { error: 'No CMS connected.' };
    const html = typeof args.html === 'string'
      ? args.html
      : typeof args.markdown === 'string'
        ? args.markdown.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')
        : '';
    if (platform === 'ghost') {
      const creds = (await readIntegrationCreds('ghost'))!;
      if (!creds.token || !creds.endpoint) return { error: 'Ghost integration missing token or endpoint.' };
      const auth = await ghostAuthHeader(creds.token);
      const base = creds.endpoint.replace(/\/+$/, '');
      const res = await fetch(`${base}/ghost/api/admin/posts/?source=html`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posts: [{
            title: args.title,
            html,
            status: 'draft',
            tags: Array.isArray(args.tags) ? args.tags.map((t: string) => ({ name: t })) : undefined,
          }],
        }),
      });
      const text = await res.text();
      if (!res.ok) return { error: `ghost ${res.status}: ${text.slice(0, 300)}` };
      const data = JSON.parse(text) as { posts: any[] };
      const p = data.posts?.[0];
      return { platform, id: p?.id, title: p?.title, status: p?.status, admin_url: `${base}/ghost/#/editor/post/${p?.id}` };
    }
    // wordpress
    const creds = (await readIntegrationCreds('wordpress'))!;
    if (!creds.token || !creds.endpoint) return { error: 'WordPress integration missing token or endpoint.' };
    const base = creds.endpoint.replace(/\/+$/, '');
    const res = await fetch(`${base}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(creds.token).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: args.title,
        content: html,
        status: 'draft',
        tags_input: Array.isArray(args.tags) ? args.tags : undefined,
      }),
    });
    const text = await res.text();
    if (!res.ok) return { error: `wordpress ${res.status}: ${text.slice(0, 300)}` };
    const data = JSON.parse(text) as any;
    return { platform, id: data.id, title: data.title?.rendered, status: data.status, admin_url: `${base}/wp-admin/post.php?post=${data.id}&action=edit` };
  },
};

// ---------------------------------------------------------------------------
// GEO (Generative Engine Optimization). Native replacement for Peec AI — runs
// the seed prompt pool daily across ChatGPT / Perplexity / Google AI Overview
// and stores raw results + extracted citations in signals/geo/. Handlers are
// thin: the real work lives in geo.ts. All state is vault-local.
// ---------------------------------------------------------------------------

const GEO_MODEL_ENUM = ['chatgpt', 'perplexity', 'google_ai_overview'] as const;

const geo_list_prompts: ToolDef = {
  name: 'geo_list_prompts',
  description:
    'GEO: list all tracked seed prompts in the pool (signals/geo/prompts.json). Use to audit coverage before adding more.',
  parameters: { type: 'object', properties: {} },
  handler: async () => {
    await ensureGeoSkeleton();
    const prompts = await geoListPrompts();
    return { prompts, count: prompts.length };
  },
};

const geo_add_prompt: ToolDef = {
  name: 'geo_add_prompt',
  description:
    'GEO: add a new seed prompt to the tracked pool. Write prompts the way a real buyer would type them into ChatGPT — natural language, first-person, not keyword-stuffed.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Natural-language prompt.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Free-form: brand/category/competitor/pain/long-tail/reverse, persona names, etc.' },
      country_code: { type: 'string', description: 'ISO country, e.g. US. Informational only — execution is always en-US for now.' },
    },
    required: ['text'],
  },
  handler: async (args) => {
    await ensureGeoSkeleton();
    const p = await geoAddPrompt({ text: args.text, tags: args.tags, country_code: args.country_code });
    return { ok: true, prompt: p };
  },
};

const geo_remove_prompt: ToolDef = {
  name: 'geo_remove_prompt',
  description: 'GEO: remove a seed prompt by id from the tracked pool.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  handler: async (args) => {
    const removed = await geoRemovePrompt(args.id);
    return { ok: removed };
  },
};

const geo_list_brands: ToolDef = {
  name: 'geo_list_brands',
  description:
    'GEO: list tracked brands (your brand + competitors) from signals/geo/config.json. Each brand has id, name, aliases, and owned domains used for mention / citation matching.',
  parameters: { type: 'object', properties: {} },
  handler: async () => {
    await ensureGeoSkeleton();
    const cfg = await loadGeoConfig();
    return { brands: cfg.brands, models: cfg.models };
  },
};

const geo_set_brands: ToolDef = {
  name: 'geo_set_brands',
  description:
    'GEO: replace the full brand list. Exactly one brand should have is_us=true — that is you. Aliases + domains drive response parsing, so include common misspellings and all owned domains.',
  parameters: {
    type: 'object',
    properties: {
      brands: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            aliases: { type: 'array', items: { type: 'string' } },
            domains: { type: 'array', items: { type: 'string' } },
            is_us: { type: 'boolean' },
          },
          required: ['id', 'name'],
        },
      },
      models: {
        type: 'array',
        items: { type: 'string', enum: GEO_MODEL_ENUM as unknown as string[] },
        description: 'Which models to run in the daily sweep. Default: all three.',
      },
    },
    required: ['brands'],
  },
  handler: async (args) => {
    await ensureGeoSkeleton();
    const cfg = await loadGeoConfig();
    cfg.brands = (args.brands ?? []) as Brand[];
    if (Array.isArray(args.models)) cfg.models = args.models as GeoModel[];
    await saveGeoConfig(cfg);
    return { ok: true, brands: cfg.brands.length, models: cfg.models };
  },
};

const geo_run_prompt: ToolDef = {
  name: 'geo_run_prompt',
  description:
    'GEO: run a single prompt through one model right now and store the result under signals/geo/runs/<today>/<model>/. Use for ad-hoc checks; the daily sweep handles the full pool.',
  parameters: {
    type: 'object',
    properties: {
      prompt_id: { type: 'string', description: 'id from geo_list_prompts. Mutually exclusive with text.' },
      text: { type: 'string', description: 'Raw prompt text (not persisted to the pool).' },
      model: { type: 'string', enum: GEO_MODEL_ENUM as unknown as string[] },
    },
    required: ['model'],
  },
  handler: async (args, ctx) => {
    await ensureGeoSkeleton();
    const cfg = await loadGeoConfig();
    let prompt = args.prompt_id
      ? (await geoListPrompts()).find((p) => p.id === args.prompt_id)
      : undefined;
    if (!prompt && args.text) {
      prompt = {
        id: `adhoc-${Date.now().toString(36)}`,
        text: String(args.text),
        created_at: new Date().toISOString(),
      };
    }
    if (!prompt) return { error: 'provide prompt_id or text' };
    const rec = await geoRunPrompt(prompt, args.model as GeoModel, ctx.config, cfg.brands);
    const p = await geoWriteRun(rec);
    return { ok: !rec.error, path: p, record: rec };
  },
};

const geo_run_daily: ToolDef = {
  name: 'geo_run_daily',
  description:
    'GEO: run the entire seed prompt pool across every configured model and write results under signals/geo/runs/<date>/. Normally fired by the daily cron trigger — call manually to backfill a day or kick off a run on demand.',
  parameters: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Override the run date (YYYY-MM-DD). Default: today.' },
      models: {
        type: 'array',
        items: { type: 'string', enum: GEO_MODEL_ENUM as unknown as string[] },
        description: 'Subset of models to run (default: all configured).',
      },
      concurrency: { type: 'number', description: '1–16. Default 4.' },
    },
  },
  handler: async (args, ctx) => {
    const summary = await geoRunDaily(ctx.config, {
      date: args.date,
      models: args.models,
      concurrency: args.concurrency,
    });
    return summary;
  },
};

const geo_report_brands: ToolDef = {
  name: 'geo_report_brands',
  description:
    'GEO: brand-level metrics — Share of Voice, mention count, prompt coverage, avg mention position, citation count. Use to quantify visibility vs competitors over a date range.',
  parameters: {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: 'YYYY-MM-DD' },
      end_date: { type: 'string', description: 'YYYY-MM-DD' },
      model: { type: 'string', enum: GEO_MODEL_ENUM as unknown as string[] },
    },
  },
  handler: async (args) => {
    const rows = await geoReportBrands(args ?? {});
    return { rows };
  },
};

const geo_report_domains: ToolDef = {
  name: 'geo_report_domains',
  description:
    'GEO: cited-domain report — which third-party domains AI models are citing across the tracked prompt pool. Highest-leverage GEO data: drives gap-source analysis and content strategy.',
  parameters: {
    type: 'object',
    properties: {
      start_date: { type: 'string' },
      end_date: { type: 'string' },
      model: { type: 'string', enum: GEO_MODEL_ENUM as unknown as string[] },
      limit: { type: 'number' },
    },
  },
  handler: async (args) => {
    const rows = await geoReportDomains(args ?? {});
    return { rows };
  },
};

const geo_gap_sources: ToolDef = {
  name: 'geo_gap_sources',
  description:
    'GEO: domains cited when competitors are mentioned but NOT when we are. This is the canonical "what content gets us cited?" list — sorted by citation_count desc.',
  parameters: {
    type: 'object',
    properties: {
      start_date: { type: 'string' },
      end_date: { type: 'string' },
      model: { type: 'string', enum: GEO_MODEL_ENUM as unknown as string[] },
      limit: { type: 'number' },
    },
  },
  handler: async (args) => {
    const rows = await geoGapSources(args ?? {});
    return { rows };
  },
};

const geo_sov_trend: ToolDef = {
  name: 'geo_sov_trend',
  description:
    'GEO: per-day Share of Voice trend for one brand across stored daily runs. Use to show whether visibility is moving up or down week over week.',
  parameters: {
    type: 'object',
    properties: {
      brand_id: { type: 'string' },
      start_date: { type: 'string' },
      end_date: { type: 'string' },
      model: { type: 'string', enum: GEO_MODEL_ENUM as unknown as string[] },
    },
    required: ['brand_id'],
  },
  handler: async (args) => {
    const points = await geoSovTrend(args);
    return { points };
  },
};

const geo_list_runs: ToolDef = {
  name: 'geo_list_runs',
  description: 'GEO: list daily-run summaries (date, model count, ok/error counts).',
  parameters: { type: 'object', properties: {} },
  handler: async () => ({ runs: await geoListDailySummaries() }),
};

// ---------------------------------------------------------------------------
// HubSpot CRM (bring-your-own API key). Private App token goes in
// hubspot_api_key (or HUBSPOT_API_KEY env). Base: https://api.hubapi.com.
// Every handler does low-level fetch — no SDK, no extra deps.
// ---------------------------------------------------------------------------

const HUBSPOT_BASE = 'https://api.hubapi.com';

async function hubspotFetch(
  key: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const res = await fetch(`${HUBSPOT_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let data: any = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) {
      const msg =
        (data && typeof data === 'object' && 'message' in data && String(data.message)) ||
        String(text).slice(0, 200) ||
        `hubspot ${res.status}`;
      return { ok: false, status: res.status, data, error: msg };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// Find a contact id by email (or return the id if already numeric).
async function resolveHubspotContact(key: string, idOrEmail: string): Promise<{ id?: string; error?: string }> {
  if (/^\d+$/.test(idOrEmail)) return { id: idOrEmail };
  const r = await hubspotFetch(key, '/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: idOrEmail }] }],
      properties: ['email'],
      limit: 1,
    },
  });
  if (!r.ok) return { error: r.error };
  const hit = Array.isArray(r.data?.results) && r.data.results[0];
  if (!hit) return { error: `no hubspot contact with email ${idOrEmail}` };
  return { id: String(hit.id) };
}

function needsHubspotKey(ctx: ToolCtx) {
  if (!ctx.config.hubspot_api_key) {
    return { ok: false, error: 'set HUBSPOT_API_KEY in sidebar → Integrations → Integration keys' };
  }
  return null;
}

const hubspot_create_contact: ToolDef = {
  name: 'hubspot_create_contact',
  description:
    'Create a HubSpot contact by email. Extra fields go in properties (firstname, lastname, phone, jobtitle, company, …). Idempotent via hubspot_search if you want dedup.',
  parameters: {
    type: 'object',
    properties: {
      email: { type: 'string' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      properties: { type: 'object' },
    },
    required: ['email'],
  },
  handler: async (args, ctx) => {
    const gate = needsHubspotKey(ctx);
    if (gate) return gate;
    const props: Record<string, unknown> = { email: args.email, ...(args.properties ?? {}) };
    if (args.firstName) props.firstname = args.firstName;
    if (args.lastName) props.lastname = args.lastName;
    const r = await hubspotFetch(ctx.config.hubspot_api_key!, '/crm/v3/objects/contacts', {
      method: 'POST',
      body: { properties: props },
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: { id: r.data?.id, properties: r.data?.properties } };
  },
};

const hubspot_update_contact: ToolDef = {
  name: 'hubspot_update_contact',
  description:
    'Update a HubSpot contact by id or email. Pass any HubSpot property names in properties (custom props work too).',
  parameters: {
    type: 'object',
    properties: {
      id_or_email: { type: 'string' },
      properties: { type: 'object' },
    },
    required: ['id_or_email', 'properties'],
  },
  handler: async (args, ctx) => {
    const gate = needsHubspotKey(ctx);
    if (gate) return gate;
    const key = ctx.config.hubspot_api_key!;
    const resolved = await resolveHubspotContact(key, String(args.id_or_email));
    if (resolved.error) return { ok: false, error: resolved.error };
    const r = await hubspotFetch(key, `/crm/v3/objects/contacts/${resolved.id}`, {
      method: 'PATCH',
      body: { properties: args.properties ?? {} },
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: { id: r.data?.id, properties: r.data?.properties } };
  },
};

const hubspot_create_company: ToolDef = {
  name: 'hubspot_create_company',
  description: 'Create a HubSpot company. `domain` and `name` seed the record; extras go in properties.',
  parameters: {
    type: 'object',
    properties: {
      domain: { type: 'string' },
      name: { type: 'string' },
      properties: { type: 'object' },
    },
    required: ['domain'],
  },
  handler: async (args, ctx) => {
    const gate = needsHubspotKey(ctx);
    if (gate) return gate;
    const props: Record<string, unknown> = { domain: args.domain, ...(args.properties ?? {}) };
    if (args.name) props.name = args.name;
    const r = await hubspotFetch(ctx.config.hubspot_api_key!, '/crm/v3/objects/companies', {
      method: 'POST',
      body: { properties: props },
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: { id: r.data?.id, properties: r.data?.properties } };
  },
};

const hubspot_associate: ToolDef = {
  name: 'hubspot_associate',
  description:
    'Associate two HubSpot records, e.g. contact→company or note→contact. Uses the v4 default association.',
  parameters: {
    type: 'object',
    properties: {
      from_type: { type: 'string', description: 'e.g. contacts, companies, notes, tasks' },
      from_id: { type: 'string' },
      to_type: { type: 'string' },
      to_id: { type: 'string' },
      association_type: { type: 'string', description: 'Optional — defaults to HubSpot default association.' },
    },
    required: ['from_type', 'from_id', 'to_type', 'to_id'],
  },
  handler: async (args, ctx) => {
    const gate = needsHubspotKey(ctx);
    if (gate) return gate;
    const p = `/crm/v4/objects/${encodeURIComponent(args.from_type)}/${encodeURIComponent(args.from_id)}/associations/default/${encodeURIComponent(args.to_type)}/${encodeURIComponent(args.to_id)}`;
    const r = await hubspotFetch(ctx.config.hubspot_api_key!, p, { method: 'PUT' });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: r.data };
  },
};

const hubspot_create_note: ToolDef = {
  name: 'hubspot_create_note',
  description:
    'Create a HubSpot note and (optionally) associate it to a contact or company. Body is plain text/markdown; HubSpot renders it.',
  parameters: {
    type: 'object',
    properties: {
      contact_id_or_email: { type: 'string' },
      company_id: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['body'],
  },
  handler: async (args, ctx) => {
    const gate = needsHubspotKey(ctx);
    if (gate) return gate;
    const key = ctx.config.hubspot_api_key!;
    const r = await hubspotFetch(key, '/crm/v3/objects/notes', {
      method: 'POST',
      body: {
        properties: {
          hs_note_body: String(args.body),
          hs_timestamp: new Date().toISOString(),
        },
      },
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const noteId = r.data?.id as string | undefined;
    const associations: string[] = [];
    if (noteId && args.contact_id_or_email) {
      const resolved = await resolveHubspotContact(key, String(args.contact_id_or_email));
      if (resolved.id) {
        const a = await hubspotFetch(key, `/crm/v4/objects/notes/${noteId}/associations/default/contacts/${resolved.id}`, { method: 'PUT' });
        if (a.ok) associations.push(`contact:${resolved.id}`);
      }
    }
    if (noteId && args.company_id) {
      const a = await hubspotFetch(key, `/crm/v4/objects/notes/${noteId}/associations/default/companies/${args.company_id}`, { method: 'PUT' });
      if (a.ok) associations.push(`company:${args.company_id}`);
    }
    return { ok: true, data: { id: noteId, associations } };
  },
};

const hubspot_create_task: ToolDef = {
  name: 'hubspot_create_task',
  description:
    'Create a HubSpot task (subject + optional body + due date). Associates to a contact if contact_id_or_email is given.',
  parameters: {
    type: 'object',
    properties: {
      subject: { type: 'string' },
      body: { type: 'string' },
      owner_id: { type: 'string' },
      contact_id_or_email: { type: 'string' },
      due_date: { type: 'string', description: 'ISO date (yyyy-mm-dd) or full ISO timestamp.' },
    },
    required: ['subject'],
  },
  handler: async (args, ctx) => {
    const gate = needsHubspotKey(ctx);
    if (gate) return gate;
    const key = ctx.config.hubspot_api_key!;
    const props: Record<string, unknown> = {
      hs_task_subject: args.subject,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'MEDIUM',
      hs_timestamp: new Date().toISOString(),
    };
    if (args.body) props.hs_task_body = args.body;
    if (args.owner_id) props.hubspot_owner_id = args.owner_id;
    if (args.due_date) {
      const d = new Date(args.due_date);
      if (!Number.isNaN(d.getTime())) props.hs_task_due_date = String(d.getTime());
    }
    const r = await hubspotFetch(key, '/crm/v3/objects/tasks', { method: 'POST', body: { properties: props } });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const taskId = r.data?.id as string | undefined;
    let association: string | undefined;
    if (taskId && args.contact_id_or_email) {
      const resolved = await resolveHubspotContact(key, String(args.contact_id_or_email));
      if (resolved.id) {
        const a = await hubspotFetch(key, `/crm/v4/objects/tasks/${taskId}/associations/default/contacts/${resolved.id}`, { method: 'PUT' });
        if (a.ok) association = `contact:${resolved.id}`;
      }
    }
    return { ok: true, data: { id: taskId, association } };
  },
};

const hubspot_search: ToolDef = {
  name: 'hubspot_search',
  description:
    'Search HubSpot objects (contacts, companies, deals, …) by a free-text query. Useful for dedup before create.',
  parameters: {
    type: 'object',
    properties: {
      object_type: { type: 'string', description: 'contacts | companies | deals | tickets' },
      query: { type: 'string' },
    },
    required: ['object_type', 'query'],
  },
  handler: async (args, ctx) => {
    const gate = needsHubspotKey(ctx);
    if (gate) return gate;
    const r = await hubspotFetch(
      ctx.config.hubspot_api_key!,
      `/crm/v3/objects/${encodeURIComponent(args.object_type)}/search`,
      { method: 'POST', body: { query: args.query, limit: 10 } },
    );
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const results = Array.isArray(r.data?.results)
      ? r.data.results.map((x: any) => ({ id: x.id, properties: x.properties }))
      : [];
    return { ok: true, data: { total: r.data?.total ?? results.length, results } };
  },
};

// ---------------------------------------------------------------------------
// Apollo.io — direct REST (bring-your-own Apollo API key). Faster and cheaper
// than scraping through Apify. Docs: https://apolloio.github.io/apollo-api-docs
// Every call POSTs with `api_key` in the body (Apollo's historic convention).
// ---------------------------------------------------------------------------

const APOLLO_BASE = 'https://api.apollo.io';

async function apolloFetch(
  key: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const res = await fetch(`${APOLLO_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({ api_key: key, ...body }),
    });
    const text = await res.text();
    let data: any = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) {
      const msg =
        (data && typeof data === 'object' && 'error' in data && String(data.error)) ||
        (data && typeof data === 'object' && 'message' in data && String(data.message)) ||
        String(text).slice(0, 200) ||
        `apollo ${res.status}`;
      return { ok: false, status: res.status, data, error: msg };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function needsApolloKey(ctx: ToolCtx) {
  if (!ctx.config.apollo_api_key) {
    return { ok: false, error: 'set APOLLO_API_KEY in sidebar → Integrations → Integration keys' };
  }
  return null;
}

const apollo_search_people: ToolDef = {
  name: 'apollo_search_people',
  description:
    'Search Apollo for people by title/seniority/organization. Returns a paged list with names, titles, LinkedIn URLs, and (credit-gated) emails.',
  parameters: {
    type: 'object',
    properties: {
      person_titles: { type: 'array', items: { type: 'string' } },
      person_seniorities: { type: 'array', items: { type: 'string' } },
      organization_domains: { type: 'array', items: { type: 'string' } },
      organization_num_employees_ranges: { type: 'array', items: { type: 'string' } },
      q_keywords: { type: 'string' },
      page: { type: 'number' },
      per_page: { type: 'number' },
    },
  },
  handler: async (args, ctx) => {
    const gate = needsApolloKey(ctx); if (gate) return gate;
    const r = await apolloFetch(ctx.config.apollo_api_key!, '/v1/mixed_people/search', args);
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: { total: r.data?.pagination?.total_entries ?? null, people: r.data?.people ?? [] } };
  },
};

const apollo_enrich_person: ToolDef = {
  name: 'apollo_enrich_person',
  description:
    'Enrich a single person by email OR (first_name + last_name + organization_name/domain). Returns firmographics + (credit-gated) work email + phone.',
  parameters: {
    type: 'object',
    properties: {
      email: { type: 'string' },
      first_name: { type: 'string' },
      last_name: { type: 'string' },
      organization_name: { type: 'string' },
      domain: { type: 'string' },
      linkedin_url: { type: 'string' },
      reveal_personal_emails: { type: 'boolean' },
      reveal_phone_number: { type: 'boolean' },
    },
  },
  handler: async (args, ctx) => {
    const gate = needsApolloKey(ctx); if (gate) return gate;
    const r = await apolloFetch(ctx.config.apollo_api_key!, '/v1/people/match', args);
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: r.data?.person ?? null };
  },
};

const apollo_organization_search: ToolDef = {
  name: 'apollo_organization_search',
  description:
    'Search Apollo for companies (firmographics). Returns a paged list with domain, employee count, industry, technologies.',
  parameters: {
    type: 'object',
    properties: {
      q_organization_name: { type: 'string' },
      organization_num_employees_ranges: { type: 'array', items: { type: 'string' } },
      organization_locations: { type: 'array', items: { type: 'string' } },
      technology_uids: { type: 'array', items: { type: 'string' } },
      organization_industry_tag_ids: { type: 'array', items: { type: 'string' } },
      page: { type: 'number' },
      per_page: { type: 'number' },
    },
  },
  handler: async (args, ctx) => {
    const gate = needsApolloKey(ctx); if (gate) return gate;
    const r = await apolloFetch(ctx.config.apollo_api_key!, '/v1/mixed_companies/search', args);
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: { total: r.data?.pagination?.total_entries ?? null, organizations: r.data?.organizations ?? [] } };
  },
};

// ---------------------------------------------------------------------------
// Attio CRM (bring-your-own API key). Bearer token. Base https://api.attio.com.
// Attio models records generically — every write hits /v2/objects/<slug>/records.
// ---------------------------------------------------------------------------

const ATTIO_BASE = 'https://api.attio.com/v2';

async function attioFetch(
  key: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const res = await fetch(`${ATTIO_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let data: any = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) {
      const msg =
        (data?.error?.message && String(data.error.message)) ||
        (data?.message && String(data.message)) ||
        String(text).slice(0, 200) ||
        `attio ${res.status}`;
      return { ok: false, status: res.status, data, error: msg };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function needsAttioKey(ctx: ToolCtx) {
  if (!ctx.config.attio_api_key) {
    return { ok: false, error: 'set ATTIO_API_KEY in sidebar → Integrations → Integration keys' };
  }
  return null;
}

const attio_search_records: ToolDef = {
  name: 'attio_search_records',
  description:
    'Query an Attio object (e.g. "people", "companies", or any custom object slug) by filter. Uses the /records/query endpoint. Pass filter as an Attio-style condition tree (leave empty for no filter).',
  parameters: {
    type: 'object',
    properties: {
      object: { type: 'string', description: 'Attio object slug (people | companies | deals | <custom>)' },
      filter: { type: 'object' },
      sorts: { type: 'array', items: { type: 'object' } },
      limit: { type: 'number' },
      offset: { type: 'number' },
    },
    required: ['object'],
  },
  handler: async (args, ctx) => {
    const gate = needsAttioKey(ctx); if (gate) return gate;
    const body: Record<string, unknown> = {};
    if (args.filter) body.filter = args.filter;
    if (args.sorts) body.sorts = args.sorts;
    if (args.limit) body.limit = args.limit;
    if (args.offset) body.offset = args.offset;
    const r = await attioFetch(ctx.config.attio_api_key!, `/objects/${encodeURIComponent(String(args.object))}/records/query`, {
      method: 'POST',
      body,
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const list = Array.isArray(r.data?.data) ? r.data.data : [];
    return { ok: true, data: { count: list.length, records: list } };
  },
};

const attio_create_record: ToolDef = {
  name: 'attio_create_record',
  description:
    'Create a record in an Attio object. `values` is a map of attribute slug → value in Attio\'s expected shape (e.g. `name: [{ first_name, last_name }]`, `email_addresses: [{ email_address }]`, `domains: [{ domain }]`). Works for standard and custom objects.',
  parameters: {
    type: 'object',
    properties: {
      object: { type: 'string' },
      values: { type: 'object' },
      matching_attribute: { type: 'string', description: 'Optional: attribute slug to dedup on (upsert behaviour).' },
    },
    required: ['object', 'values'],
  },
  handler: async (args, ctx) => {
    const gate = needsAttioKey(ctx); if (gate) return gate;
    const slug = encodeURIComponent(String(args.object));
    const body: Record<string, unknown> = { data: { values: args.values } };
    const path = args.matching_attribute
      ? `/objects/${slug}/records?matching_attribute=${encodeURIComponent(String(args.matching_attribute))}`
      : `/objects/${slug}/records`;
    const r = await attioFetch(ctx.config.attio_api_key!, path, {
      method: args.matching_attribute ? 'PUT' : 'POST',
      body,
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: r.data?.data ?? null };
  },
};

const attio_update_record: ToolDef = {
  name: 'attio_update_record',
  description:
    'Patch attributes on an existing Attio record by id. Only pass the attribute slugs you want to change.',
  parameters: {
    type: 'object',
    properties: {
      object: { type: 'string' },
      record_id: { type: 'string' },
      values: { type: 'object' },
    },
    required: ['object', 'record_id', 'values'],
  },
  handler: async (args, ctx) => {
    const gate = needsAttioKey(ctx); if (gate) return gate;
    const r = await attioFetch(
      ctx.config.attio_api_key!,
      `/objects/${encodeURIComponent(String(args.object))}/records/${encodeURIComponent(String(args.record_id))}`,
      { method: 'PATCH', body: { data: { values: args.values } } },
    );
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: r.data?.data ?? null };
  },
};

const attio_create_note: ToolDef = {
  name: 'attio_create_note',
  description:
    'Attach a note to an Attio record. `parent_object` + `parent_record_id` identify the target; `content_markdown` is the body.',
  parameters: {
    type: 'object',
    properties: {
      parent_object: { type: 'string' },
      parent_record_id: { type: 'string' },
      title: { type: 'string' },
      content_markdown: { type: 'string' },
    },
    required: ['parent_object', 'parent_record_id', 'content_markdown'],
  },
  handler: async (args, ctx) => {
    const gate = needsAttioKey(ctx); if (gate) return gate;
    const r = await attioFetch(ctx.config.attio_api_key!, '/notes', {
      method: 'POST',
      body: {
        data: {
          parent_object: args.parent_object,
          parent_record_id: args.parent_record_id,
          title: args.title ?? 'Black Magic note',
          format: 'markdown',
          content: args.content_markdown,
        },
      },
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: r.data?.data ?? null };
  },
};

const attio_add_to_list: ToolDef = {
  name: 'attio_add_to_list',
  description:
    'Add a record to an Attio list by list id (or slug). `parent_record_id` is the record to enrol.',
  parameters: {
    type: 'object',
    properties: {
      list: { type: 'string', description: 'Attio list id or slug.' },
      parent_object: { type: 'string' },
      parent_record_id: { type: 'string' },
      entry_values: { type: 'object' },
    },
    required: ['list', 'parent_object', 'parent_record_id'],
  },
  handler: async (args, ctx) => {
    const gate = needsAttioKey(ctx); if (gate) return gate;
    const r = await attioFetch(
      ctx.config.attio_api_key!,
      `/lists/${encodeURIComponent(String(args.list))}/entries`,
      {
        method: 'POST',
        body: {
          data: {
            parent_object: args.parent_object,
            parent_record_id: args.parent_record_id,
            entry_values: args.entry_values ?? {},
          },
        },
      },
    );
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: r.data?.data ?? null };
  },
};

// ---------------------------------------------------------------------------
// Feishu (Lark) — dual-mode.
//   Chat side: feishu_webhook_url is a custom bot webhook — drop-in Slack
//   replacement. Cheap, no OAuth.
//   Data side: feishu_app_id + feishu_app_secret exchange for a
//   tenant_access_token; with it we can read Bitable (multi-dim tables),
//   send rich messages to arbitrary chats, and pull docs. We cache the
//   token for its ~2h lifetime.
// ---------------------------------------------------------------------------

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';
let feishuTokenCache: { token: string; expiresAt: number } | null = null;

async function feishuToken(appId: string, appSecret: string): Promise<string | { error: string }> {
  const now = Date.now();
  if (feishuTokenCache && feishuTokenCache.expiresAt > now + 60_000) {
    return feishuTokenCache.token;
  }
  try {
    const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.code !== 0 || !data.tenant_access_token) {
      return { error: `feishu token: ${data?.msg ?? res.status}` };
    }
    const ttl = Math.max(60, Number(data.expire) || 7000) * 1000;
    feishuTokenCache = { token: data.tenant_access_token, expiresAt: now + ttl };
    return data.tenant_access_token;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function feishuAuthed(
  ctx: ToolCtx,
  pathname: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> },
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const appId = ctx.config.feishu_app_id;
  const appSecret = ctx.config.feishu_app_secret;
  if (!appId || !appSecret) {
    return { ok: false, status: 0, data: null, error: 'set FEISHU_APP_ID + FEISHU_APP_SECRET in sidebar → Integrations → Integration keys' };
  }
  const tok = await feishuToken(appId, appSecret);
  if (typeof tok !== 'string') return { ok: false, status: 0, data: null, error: tok.error };
  try {
    const url = new URL(`${FEISHU_BASE}${pathname}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || (data && data.code !== 0)) {
      return { ok: false, status: res.status, data, error: data?.msg || `feishu ${res.status}` };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

const feishu_notify: ToolDef = {
  name: 'feishu_notify',
  description:
    'Send a message to a Feishu/Lark group via custom bot webhook (feishu_webhook_url). text is a plain string; use msg_type "interactive" + card for rich content.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      msg_type: { type: 'string', enum: ['text', 'post', 'interactive'] },
      card: { type: 'object', description: 'Lark card JSON when msg_type=interactive.' },
    },
  },
  handler: async (args, ctx) => {
    const url = ctx.config.feishu_webhook_url;
    if (!url) return { ok: false, error: 'set FEISHU_WEBHOOK_URL in sidebar → Integrations → Integration keys' };
    const msgType = args.msg_type || (args.card ? 'interactive' : 'text');
    const payload: Record<string, unknown> = { msg_type: msgType };
    if (msgType === 'text') payload.content = { text: String(args.text ?? '') };
    else if (msgType === 'interactive') payload.card = args.card;
    else payload.content = args.text;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data.code !== undefined && data.code !== 0)) {
        return { ok: false, status: res.status, error: data?.msg || `feishu ${res.status}` };
      }
      return { ok: true, data: { posted: true } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

const feishu_send_message: ToolDef = {
  name: 'feishu_send_message',
  description:
    'Send a Feishu/Lark message to a user or chat by ID (uses tenant access token — requires feishu_app_id + feishu_app_secret). receive_id_type is open_id | user_id | chat_id | email.',
  parameters: {
    type: 'object',
    properties: {
      receive_id: { type: 'string' },
      receive_id_type: { type: 'string', enum: ['open_id', 'user_id', 'chat_id', 'email'] },
      msg_type: { type: 'string', enum: ['text', 'interactive', 'post'] },
      content_text: { type: 'string' },
      card: { type: 'object' },
    },
    required: ['receive_id', 'receive_id_type'],
  },
  handler: async (args, ctx) => {
    const msgType = args.msg_type || (args.card ? 'interactive' : 'text');
    let content: string;
    if (msgType === 'text') content = JSON.stringify({ text: String(args.content_text ?? '') });
    else if (msgType === 'interactive') content = JSON.stringify(args.card ?? {});
    else content = JSON.stringify(args.content_text ?? {});
    const r = await feishuAuthed(ctx, '/im/v1/messages', {
      method: 'POST',
      query: { receive_id_type: String(args.receive_id_type) },
      body: { receive_id: args.receive_id, msg_type: msgType, content },
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: r.data?.data ?? null };
  },
};

const feishu_bitable_list_records: ToolDef = {
  name: 'feishu_bitable_list_records',
  description:
    'List records from a Feishu Bitable (multi-dim table). Identify by app_token (spreadsheet / base id) + table_id. filter is a Feishu filter expression string; page_size defaults to 100.',
  parameters: {
    type: 'object',
    properties: {
      app_token: { type: 'string' },
      table_id: { type: 'string' },
      filter: { type: 'string' },
      view_id: { type: 'string' },
      page_size: { type: 'number' },
      page_token: { type: 'string' },
    },
    required: ['app_token', 'table_id'],
  },
  handler: async (args, ctx) => {
    const r = await feishuAuthed(
      ctx,
      `/bitable/v1/apps/${encodeURIComponent(String(args.app_token))}/tables/${encodeURIComponent(String(args.table_id))}/records`,
      {
        query: {
          page_size: (args.page_size as number) || 100,
          page_token: args.page_token as string | undefined,
          view_id: args.view_id as string | undefined,
          filter: args.filter as string | undefined,
        },
      },
    );
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const d = r.data?.data ?? {};
    return {
      ok: true,
      data: {
        total: d.total ?? null,
        has_more: d.has_more ?? false,
        page_token: d.page_token ?? null,
        records: d.items ?? [],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Metabase — BI/analytics as a data source. Use api key auth (x-api-key
// header) so we don't juggle sessions. Card = saved question; dataset = SQL.
// ---------------------------------------------------------------------------

function needsMetabase(ctx: ToolCtx): { url: string; key: string } | { ok: false; error: string } {
  const url = (ctx.config.metabase_site_url || '').replace(/\/+$/, '');
  const key = ctx.config.metabase_api_key || '';
  if (!url || !key) {
    return { ok: false, error: 'set METABASE_SITE_URL + METABASE_API_KEY in sidebar → Integrations → Integration keys' };
  }
  return { url, key };
}

async function metabaseFetch(
  url: string,
  key: string,
  pathname: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const res = await fetch(`${url}${pathname}`, {
      method: init?.method ?? 'GET',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let data: any = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) {
      const msg = (data?.message && String(data.message)) || String(text).slice(0, 200) || `metabase ${res.status}`;
      return { ok: false, status: res.status, data, error: msg };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

const metabase_run_card: ToolDef = {
  name: 'metabase_run_card',
  description:
    'Execute a saved Metabase question (card) by id and return its rows. parameters is an optional array of Metabase parameter objects.',
  parameters: {
    type: 'object',
    properties: {
      card_id: { type: 'number' },
      parameters: { type: 'array', items: { type: 'object' } },
    },
    required: ['card_id'],
  },
  handler: async (args, ctx) => {
    const cfg = needsMetabase(ctx); if ('ok' in cfg && cfg.ok === false) return cfg;
    const { url, key } = cfg as { url: string; key: string };
    const r = await metabaseFetch(url, key, `/api/card/${Number(args.card_id)}/query`, {
      method: 'POST',
      body: { parameters: args.parameters ?? [] },
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const data = r.data?.data ?? r.data;
    const cols = data?.cols?.map((c: any) => c.name) ?? [];
    const rows = data?.rows ?? [];
    return { ok: true, data: { row_count: rows.length, columns: cols, rows: rows.slice(0, 1000) } };
  },
};

const metabase_query_sql: ToolDef = {
  name: 'metabase_query_sql',
  description:
    'Run an ad-hoc SQL query against a Metabase database by id (native dataset). Use for exploration when a saved card does not exist yet.',
  parameters: {
    type: 'object',
    properties: {
      database_id: { type: 'number' },
      sql: { type: 'string' },
      template_tags: { type: 'object' },
    },
    required: ['database_id', 'sql'],
  },
  handler: async (args, ctx) => {
    const cfg = needsMetabase(ctx); if ('ok' in cfg && cfg.ok === false) return cfg;
    const { url, key } = cfg as { url: string; key: string };
    const r = await metabaseFetch(url, key, '/api/dataset', {
      method: 'POST',
      body: {
        type: 'native',
        database: Number(args.database_id),
        native: { query: String(args.sql), 'template-tags': args.template_tags ?? {} },
      },
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const data = r.data?.data ?? r.data;
    const cols = data?.cols?.map((c: any) => c.name) ?? [];
    const rows = data?.rows ?? [];
    return { ok: true, data: { row_count: rows.length, columns: cols, rows: rows.slice(0, 1000) } };
  },
};

const metabase_search: ToolDef = {
  name: 'metabase_search',
  description: 'Search Metabase content (cards, dashboards, collections) by name/model.',
  parameters: {
    type: 'object',
    properties: {
      q: { type: 'string' },
      models: { type: 'array', items: { type: 'string' }, description: 'e.g. ["card","dashboard"]' },
    },
    required: ['q'],
  },
  handler: async (args, ctx) => {
    const cfg = needsMetabase(ctx); if ('ok' in cfg && cfg.ok === false) return cfg;
    const { url, key } = cfg as { url: string; key: string };
    const qs = new URLSearchParams({ q: String(args.q) });
    for (const m of (args.models as string[] | undefined) ?? []) qs.append('models', m);
    const r = await metabaseFetch(url, key, `/api/search?${qs.toString()}`);
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const list = r.data?.data ?? r.data ?? [];
    return { ok: true, data: { count: Array.isArray(list) ? list.length : 0, items: list } };
  },
};

// ---------------------------------------------------------------------------
// Supabase — Postgres via PostgREST with the service_role key. The project
// URL is SUPABASE_URL (e.g. https://xxxx.supabase.co). Every call hits
// /rest/v1/<table> with service_role Authorization + apikey headers.
// ---------------------------------------------------------------------------

function needsSupabase(ctx: ToolCtx): { url: string; key: string } | { ok: false; error: string } {
  const url = (ctx.config.supabase_url || '').replace(/\/+$/, '');
  const key = ctx.config.supabase_service_role_key || '';
  if (!url || !key) {
    return { ok: false, error: 'set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in sidebar → Integrations → Integration keys' };
  }
  return { url, key };
}

async function supabaseFetch(
  url: string,
  key: string,
  pathname: string,
  init?: { method?: string; body?: unknown; prefer?: string; headers?: Record<string, string> },
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const headers: Record<string, string> = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    };
    if (init?.prefer) headers.Prefer = init.prefer;
    const res = await fetch(`${url}${pathname}`, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let data: any = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) {
      const msg =
        (data?.message && String(data.message)) ||
        (data?.error && String(data.error)) ||
        String(text).slice(0, 200) ||
        `supabase ${res.status}`;
      return { ok: false, status: res.status, data, error: msg };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

const supabase_select: ToolDef = {
  name: 'supabase_select',
  description:
    'Read rows from a Supabase (Postgres) table via PostgREST. `filter` is a PostgREST query string like "status=eq.open&created_at=gt.2026-01-01". Use `select` to pick columns (defaults to *).',
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      select: { type: 'string' },
      filter: { type: 'string', description: 'Raw PostgREST filter querystring, e.g. id=eq.42&status=in.(open,pending).' },
      order: { type: 'string' },
      limit: { type: 'number' },
      offset: { type: 'number' },
    },
    required: ['table'],
  },
  handler: async (args, ctx) => {
    const cfg = needsSupabase(ctx); if ('ok' in cfg && cfg.ok === false) return cfg;
    const { url, key } = cfg as { url: string; key: string };
    const qs = new URLSearchParams();
    qs.set('select', String(args.select ?? '*'));
    if (args.order) qs.set('order', String(args.order));
    if (args.limit !== undefined) qs.set('limit', String(args.limit));
    if (args.offset !== undefined) qs.set('offset', String(args.offset));
    const filter = args.filter ? `&${String(args.filter)}` : '';
    const r = await supabaseFetch(url, key, `/rest/v1/${encodeURIComponent(String(args.table))}?${qs.toString()}${filter}`);
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const rows = Array.isArray(r.data) ? r.data : [];
    return { ok: true, data: { count: rows.length, rows } };
  },
};

const supabase_insert: ToolDef = {
  name: 'supabase_insert',
  description:
    'Insert one or more rows into a Supabase table. `rows` is a single object or an array. Set `on_conflict` + `upsert: true` to do an upsert.',
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      rows: { },
      upsert: { type: 'boolean' },
      on_conflict: { type: 'string' },
    },
    required: ['table', 'rows'],
  },
  handler: async (args, ctx) => {
    const cfg = needsSupabase(ctx); if ('ok' in cfg && cfg.ok === false) return cfg;
    const { url, key } = cfg as { url: string; key: string };
    const qs = new URLSearchParams();
    if (args.upsert && args.on_conflict) qs.set('on_conflict', String(args.on_conflict));
    const prefer = [
      'return=representation',
      args.upsert ? 'resolution=merge-duplicates' : '',
    ].filter(Boolean).join(',');
    const r = await supabaseFetch(url, key, `/rest/v1/${encodeURIComponent(String(args.table))}${qs.toString() ? `?${qs.toString()}` : ''}`, {
      method: 'POST',
      body: args.rows,
      prefer,
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const rows = Array.isArray(r.data) ? r.data : [r.data];
    return { ok: true, data: { inserted: rows.length, rows } };
  },
};

const supabase_update: ToolDef = {
  name: 'supabase_update',
  description:
    'Update rows in a Supabase table. `filter` is a PostgREST querystring that scopes the update (required — PostgREST refuses unscoped updates). `patch` is the partial row.',
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      filter: { type: 'string' },
      patch: { type: 'object' },
    },
    required: ['table', 'filter', 'patch'],
  },
  handler: async (args, ctx) => {
    const cfg = needsSupabase(ctx); if ('ok' in cfg && cfg.ok === false) return cfg;
    const { url, key } = cfg as { url: string; key: string };
    const r = await supabaseFetch(url, key, `/rest/v1/${encodeURIComponent(String(args.table))}?${String(args.filter)}`, {
      method: 'PATCH',
      body: args.patch,
      prefer: 'return=representation',
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const rows = Array.isArray(r.data) ? r.data : [r.data];
    return { ok: true, data: { updated: rows.length, rows } };
  },
};

const supabase_rpc: ToolDef = {
  name: 'supabase_rpc',
  description:
    'Invoke a Supabase Postgres function via PostgREST (/rest/v1/rpc/<fn>). `args` is passed as JSON body.',
  parameters: {
    type: 'object',
    properties: {
      fn: { type: 'string' },
      args: { type: 'object' },
    },
    required: ['fn'],
  },
  handler: async (args, ctx) => {
    const cfg = needsSupabase(ctx); if ('ok' in cfg && cfg.ok === false) return cfg;
    const { url, key } = cfg as { url: string; key: string };
    const r = await supabaseFetch(url, key, `/rest/v1/rpc/${encodeURIComponent(String(args.fn))}`, {
      method: 'POST',
      body: args.args ?? {},
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    return { ok: true, data: r.data };
  },
};

// ---------------------------------------------------------------------------
// Slack — webhook-only (simplest integration, no OAuth). channel is a hint;
// the real channel is fixed in the webhook configuration.
// ---------------------------------------------------------------------------

const slack_notify: ToolDef = {
  name: 'slack_notify',
  description:
    'Post a message to the configured Slack incoming webhook. The channel is fixed in the webhook config; `channel` here is just a hint for the model.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      channel: { type: 'string', description: 'Optional hint (webhook channel is fixed server-side).' },
      blocks: { type: 'array', description: 'Optional Slack Block Kit payload.' },
    },
    required: ['text'],
  },
  handler: async (args, ctx) => {
    const url = ctx.config.slack_webhook_url;
    if (!url) return { ok: false, error: 'set SLACK_WEBHOOK_URL in sidebar → Integrations → Integration keys' };
    try {
      const payload: Record<string, unknown> = { text: args.text };
      if (args.channel) payload.channel = args.channel;
      if (Array.isArray(args.blocks)) payload.blocks = args.blocks;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 200) };
      return { ok: true, data: { posted: true } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

// ---------------------------------------------------------------------------
// Email via Resend (https://resend.com). Simpler than Gmail OAuth — a single
// API key plus a verified `from_email`. If body_html isn't supplied we emit a
// naive markdown→HTML conversion (paragraph breaks + link auto-detection).
// ---------------------------------------------------------------------------

function naiveMarkdownToHtml(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const withLinks = (s: string) =>
    s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`)
     .replace(/(^|\s)(https?:\/\/[^\s<)]+)(?=\s|$)/g, (_, pre, u) => `${pre}<a href="${u}">${u}</a>`)
     .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
     .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const paragraphs = escape(md.trim()).split(/\n{2,}/);
  return paragraphs.map((p) => `<p>${withLinks(p).replace(/\n/g, '<br/>')}</p>`).join('\n');
}

const send_email: ToolDef = {
  name: 'send_email',
  description:
    'Send a transactional email using whichever provider the user has connected: Amazon SES (preferred, BYOK) → Resend (legacy fallback). body_markdown is required; body_html overrides the auto-converted markdown. from defaults to the provider\'s configured sender.',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string' },
      subject: { type: 'string' },
      body_markdown: { type: 'string' },
      body_html: { type: 'string' },
      from: { type: 'string' },
      reply_to: { type: 'string' },
    },
    required: ['to', 'subject', 'body_markdown'],
  },
  handler: async (args, ctx) => {
    const { sendEmailViaBestProvider } = await import('./email-sender.js');
    const result = await sendEmailViaBestProvider(
      {
        to: args.to,
        subject: args.subject,
        body_markdown: args.body_markdown,
        body_html: args.body_html,
        from: args.from,
        reply_to: args.reply_to,
      },
      { resendKey: ctx.config.resend_api_key, resendFrom: ctx.config.from_email },
    );
    if (!result.ok) return { ok: false, error: result.error, tried: result.triedProviders };
    return { ok: true, data: { id: result.messageId, from: result.from, to: args.to, provider: result.provider } };
  },
};

// ---------------------------------------------------------------------------
// LinkedIn via Apify actors. LinkedIn itself has no public DM API; the best
// we can do is wrap Apify actors. DM sending requires a session cookie
// (linkedin_cookie) and is ToS-grey-area — we log a warning rather than
// no-op, so the user makes the call.
// ---------------------------------------------------------------------------

async function runApifyActor(
  ctx: ToolCtx,
  actorId: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; data?: any; error?: string }> {
  const key = ctx.config.apify_api_key;
  if (!key) return { ok: false, error: 'set APIFY_API_KEY in sidebar → Integrations → Integration keys' };
  const actor = encodeURIComponent(actorId).replace(/%2F/g, '~');
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) return { ok: false, status: res.status, error: `apify ${res.status}: ${String(text).slice(0, 200)}` };
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const linkedin_enrich_company: ToolDef = {
  name: 'linkedin_enrich_company',
  description:
    "Enrich a LinkedIn company via an Apify actor. Accepts a LinkedIn company URL or a domain (domain gets auto-converted to a LinkedIn URL guess). Uses the user's APIFY_API_KEY.",
  parameters: {
    type: 'object',
    properties: {
      url_or_domain: { type: 'string' },
    },
    required: ['url_or_domain'],
  },
  handler: async (args, ctx) => {
    const raw = String(args.url_or_domain).trim();
    let liUrl = raw;
    if (!/linkedin\.com/i.test(raw)) {
      const slug = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').split('.')[0];
      liUrl = `https://www.linkedin.com/company/${slug}/`;
    }
    const r = await runApifyActor(ctx, 'code_crafter/linkedin-companies-scraper', {
      urls: [liUrl],
      startUrls: [{ url: liUrl }],
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const item = Array.isArray(r.data) ? r.data[0] : r.data;
    if (!item) return { ok: false, error: 'actor returned no items' };
    const pruned = {
      name: item.name ?? item.companyName,
      url: item.url ?? liUrl,
      domain: item.website ?? item.websiteUrl,
      industry: item.industry,
      size: item.companySize ?? item.staffCount,
      hq: item.headquarter ?? item.headquarters,
      description: item.description,
      followers: item.followerCount ?? item.followers,
      specialities: item.specialities ?? item.specialties,
    };
    return { ok: true, data: pruned };
  },
};

// Unipile-backed LinkedIn tools. Canonical path for LinkedIn
// automation — replaces the brittle cookie-based apify scraper.
// Requires Unipile integration connected (sidebar → Integrations → Unipile).
const linkedin_list_accounts: ToolDef = {
  name: 'linkedin_list_accounts',
  description: "List the LinkedIn accounts the user has connected in Unipile. Returns each account's id (use as `account_id` in the other linkedin_* tools), display name, and status. Needs Unipile integration (sidebar → Integrations → Unipile).",
  parameters: { type: 'object', properties: {} },
  handler: async () => {
    const { listLinkedInAccounts } = await import('./unipile-linkedin.js');
    return listLinkedInAccounts();
  },
};

const linkedin_send_dm: ToolDef = {
  name: 'linkedin_send_dm',
  description: "Send a LinkedIn DM via the user's Unipile account. `recipient` may be a LinkedIn profile URL (we resolve it) or a Unipile provider_id. Respects LinkedIn's own rate limits — Unipile handles throttling server-side. Preferred over linkedin_dm_via_apify (deprecated).",
  parameters: {
    type: 'object',
    properties: {
      account_id: { type: 'string', description: 'Unipile LinkedIn account id — list via linkedin_list_accounts if unknown.' },
      recipient: { type: 'string', description: 'Full LinkedIn profile URL or Unipile provider_id.' },
      text: { type: 'string' },
      attachments: { type: 'array', items: { type: 'string' }, description: 'Optional array of Unipile attachment ids.' },
    },
    required: ['account_id', 'recipient', 'text'],
  },
  handler: async (args) => {
    const { sendLinkedInDm } = await import('./unipile-linkedin.js');
    return sendLinkedInDm({
      account_id: args.account_id,
      recipient: args.recipient,
      text: args.text,
      attachments: Array.isArray(args.attachments) ? args.attachments : undefined,
    });
  },
};

const linkedin_send_invitation: ToolDef = {
  name: 'linkedin_send_invitation',
  description: "Send a LinkedIn connection request via Unipile. Optional `message` is the blurb shown in the invite (LinkedIn caps at ~300 chars, keep it tight).",
  parameters: {
    type: 'object',
    properties: {
      account_id: { type: 'string' },
      recipient: { type: 'string', description: 'LinkedIn profile URL or provider_id.' },
      message: { type: 'string' },
    },
    required: ['account_id', 'recipient'],
  },
  handler: async (args) => {
    const { sendLinkedInInvitation } = await import('./unipile-linkedin.js');
    return sendLinkedInInvitation({ account_id: args.account_id, recipient: args.recipient, message: args.message });
  },
};

const linkedin_get_profile_unipile: ToolDef = {
  name: 'linkedin_get_profile',
  description: "Fetch a LinkedIn profile via Unipile. `identifier` can be a profile URL or provider_id. Returns headline, title, company, location, plus Unipile's provider_id for later calls.",
  parameters: {
    type: 'object',
    properties: {
      account_id: { type: 'string' },
      identifier: { type: 'string' },
    },
    required: ['account_id', 'identifier'],
  },
  handler: async (args) => {
    const { getLinkedInProfile } = await import('./unipile-linkedin.js');
    return getLinkedInProfile({ account_id: args.account_id, identifier: args.identifier });
  },
};

const linkedin_dm_via_apify: ToolDef = {
  name: 'linkedin_dm_via_apify',
  description:
    "DEPRECATED — prefer linkedin_send_dm (Unipile). Send a LinkedIn DM via an Apify actor using the user's li_at cookie. Brittle: breaks on session rotation, ToS-grey-area. Kept only for users who haven't connected Unipile yet.",
  parameters: {
    type: 'object',
    properties: {
      profile_url: { type: 'string' },
      message: { type: 'string' },
    },
    required: ['profile_url', 'message'],
  },
  handler: async (args, ctx) => {
    if (!ctx.config.apify_api_key) {
      return { ok: false, error: 'set APIFY_API_KEY in sidebar → Integrations → Integration keys' };
    }
    if (!ctx.config.linkedin_cookie) {
      return { ok: false, error: 'set LINKEDIN_COOKIE in sidebar → Integrations → Integration keys (li_at=…). Note: ToS-grey-area; use cautiously.' };
    }
    console.warn('[tools] linkedin_dm_via_apify — ToS-grey-area automation; triple-check before enabling in a cron');
    const r = await runApifyActor(ctx, 'apimaestro/linkedin-outreach-send-message-invitation-gpt', {
      cookie: ctx.config.linkedin_cookie,
      profileUrls: [args.profile_url],
      message: args.message,
    });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const item = Array.isArray(r.data) ? r.data[0] : r.data;
    return { ok: true, data: { sent: Boolean(item), actorResult: item ?? null } };
  },
};

const enroll_contact_in_sequence: ToolDef = {
  name: 'enroll_contact_in_sequence',
  description:
    'Enroll a contact in a multi-touch drip sequence. Writes sequence/sequence_step/sequence_enrolled_at into the contact frontmatter. The daily sequence cron fires each touch when its day offset elapses.',
  parameters: {
    type: 'object',
    properties: {
      contact_path: { type: 'string', description: 'e.g. contacts/acme-cloud/jane-doe.md' },
      sequence_path: { type: 'string', description: 'e.g. sequences/cold-outbound-5-touch.md' },
    },
    required: ['contact_path', 'sequence_path'],
  },
  handler: async (args) => enrollContact(args.contact_path, args.sequence_path),
};

// Send a notification to every messaging channel the user has connected
// in Integrations. Channel-agnostic by design: the user picks which
// integrations to wire up (Slack / Discord / Telegram / Feishu / Email);
// this tool fans out to all of them. Skills should call this instead of
// hardcoding any specific provider — that way one user's pipeline ends
// up in their Slack and another's ends up in their Telegram without the
// skill knowing or caring.
//
// urgency hint: "low" → quiet line, "normal" → default, "high" → @here
// or equivalent if the channel supports it. Skills SHOULD use "high"
// sparingly (paged-style alerts only).
const notify: ToolDef = {
  name: 'notify',
  description:
    "Send a notification. On macOS always fires a native desktop notification via Notification Center. Also fans out to every messaging channel the user has connected (Slack / Discord / Telegram / Feishu). Use this from skills instead of calling a specific channel — the user's Integrations decide where else it lands.",
  parameters: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Short title (≤ 80 chars).' },
      body: { type: 'string', description: 'Markdown body of the notification.' },
      urgency: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Default normal.' },
      link: { type: 'string', description: 'Optional URL the recipient should open.' },
    },
    required: ['subject', 'body'],
  },
  handler: async (args, ctx) => {
    // Lazy-load credentials from the same vault file the UI writes to.
    // Each channel handler is best-effort: a single failure doesn't
    // block the others.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { getVaultRoot } = await import('./paths.js');
    let store: any = {};
    try {
      const raw = await fs.readFile(path.join(getVaultRoot(), '.bm', 'integrations.json'), 'utf-8');
      store = JSON.parse(raw);
    } catch {}

    const subject = String(args.subject || '').slice(0, 200);
    const body = String(args.body || '');
    const urgency = (args.urgency === 'high' || args.urgency === 'low') ? args.urgency : 'normal';
    const link = typeof args.link === 'string' ? args.link : '';
    const text = `*${subject}*\n${body}${link ? `\n${link}` : ''}`;

    const sends: Array<{ channel: string; ok: boolean; detail?: string }> = [];

    async function tryPost(channel: string, url: string, payload: any) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        sends.push({ channel, ok: res.ok, detail: res.ok ? undefined : `${res.status}` });
      } catch (err) {
        sends.push({ channel, ok: false, detail: err instanceof Error ? err.message : String(err) });
      }
    }

    // macOS native notification — always fires on darwin regardless of
    // which messaging integrations are connected. User still gets a
    // visible ping on their own machine even with zero webhooks set up.
    // Uses osascript's `display notification` so no extra deps; sound
    // defaults to "Ping" for normal/high urgency, silent for low.
    if (process.platform === 'darwin') {
      try {
        const { spawn } = await import('node:child_process');
        const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const soundClause = urgency === 'low'
          ? ''
          : ' sound name "Ping"';
        // body can span multiple lines — osascript expects one line for
        // the inner string, so collapse newlines to a bullet.
        const oneLine = body.replace(/\n+/g, ' · ').slice(0, 280);
        const script = `display notification "${esc(oneLine)}" with title "${esc(subject.slice(0, 80))}"${soundClause}`;
        const proc = spawn('osascript', ['-e', script], { stdio: 'ignore' });
        proc.on('error', () => {});
        sends.push({ channel: 'macos', ok: true });
      } catch (err) {
        sends.push({ channel: 'macos', ok: false, detail: err instanceof Error ? err.message : String(err) });
      }
    }

    // Slack — incoming webhook (config.slack_webhook_url) OR bot token
    // from integrations.slack. Webhook path is simplest, use it if set.
    const slackUrl = ctx.config.slack_webhook_url;
    if (slackUrl) {
      await tryPost('slack', slackUrl, {
        text: urgency === 'high' ? `<!here> ${text}` : text,
      });
    }

    // Feishu — webhook stored as integrations.feishu.token (or .endpoint).
    const feishuRec = store.feishu;
    if (feishuRec?.status === 'connected') {
      const url = feishuRec.credentials?.endpoint || feishuRec.credentials?.token;
      if (url && /^https?:\/\//.test(url)) {
        await tryPost('feishu', url, {
          msg_type: 'interactive',
          card: {
            header: {
              title: { tag: 'plain_text', content: subject.slice(0, 100) },
              template: urgency === 'high' ? 'red' : urgency === 'low' ? 'grey' : 'blue',
            },
            elements: [
              { tag: 'div', text: { tag: 'lark_md', content: body.slice(0, 4000) } },
              ...(link ? [{ tag: 'action', actions: [{ tag: 'button', text: { tag: 'plain_text', content: 'Open' }, url, type: 'primary' }] }] : []),
            ],
          },
        });
      }
    }

    // Discord — webhook stored as integrations.discord.endpoint.
    const discordRec = store.discord;
    if (discordRec?.status === 'connected') {
      const url = discordRec.credentials?.endpoint;
      if (url && /^https?:\/\//.test(url)) {
        await tryPost('discord', url, {
          content: urgency === 'high' ? `@here ${text}` : text,
        });
      }
    }

    // Telegram — bot token + a chat_id. Bot API needs a chat to post to;
    // we pull it from credentials.chat_id (user pastes both when connecting).
    const tgRec = store.telegram;
    if (tgRec?.status === 'connected') {
      const token = tgRec.credentials?.token;
      const chatId = tgRec.credentials?.chat_id;
      if (token && chatId) {
        await tryPost(
          'telegram',
          `https://api.telegram.org/bot${token}/sendMessage`,
          { chat_id: chatId, text, parse_mode: 'Markdown' },
        );
      }
    }

    if (sends.length === 0) {
      return {
        ok: false,
        error: 'No notification channel connected. Connect Slack, Feishu, Discord, or Telegram in Integrations.',
      };
    }
    return { ok: sends.some((s) => s.ok), sends };
  },
};

// Schedule a recurring trigger from inside a chat. Used when the user
// tells an agent "yeah run this every Monday at 9" — the agent calls
// this tool, a triggers/<name>.md file appears in the vault, and the
// daemon's cron loop picks it up on the next listTriggers() refresh.
//
// Bindings supported: skill (preferred — invokes via the skill's
// declared agent), agent (raw agent task), or shell (raw command).
// Exactly one of skill/agent/shell must be set.
const trigger_create: ToolDef = {
  name: 'trigger_create',
  description:
    "Schedule a recurring trigger that runs a skill, agent, or shell command on a cron. Use when the user asks to automate something — e.g. 'do this every Monday at 9am'. Returns the trigger file path.",
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: "Slug for the trigger, e.g. 'weekly-competitor-scan'. Must be lowercase + hyphens.",
      },
      cron: {
        type: 'string',
        description: "Standard 5-field cron in local time, e.g. '0 9 * * 1' for Mondays at 9am.",
      },
      skill: { type: 'string', description: 'Skill slug to invoke (filename in playbooks/, no .md).' },
      agent: { type: 'string', description: 'Agent slug to invoke directly.' },
      shell: { type: 'string', description: 'Raw shell command (rare — prefer skill/agent).' },
      description: { type: 'string', description: 'One-line description shown in the Triggers UI.' },
      enabled: { type: 'boolean', description: 'Default true.' },
    },
    required: ['name', 'cron'],
  },
  handler: async (args) => {
    const slug = String(args.name || '').trim().replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    if (!slug) return { error: 'name required' };
    const bindings = ['skill', 'agent', 'shell'].filter((k) => typeof args[k] === 'string' && args[k].length > 0);
    if (bindings.length === 0) return { error: 'must set one of skill, agent, or shell' };
    if (bindings.length > 1) return { error: `only one binding allowed, got ${bindings.join('+')}` };
    const lines: string[] = ['---'];
    lines.push(`kind: trigger`);
    lines.push(`name: ${slug}`);
    lines.push(`cron: '${String(args.cron).replace(/'/g, "''")}'`);
    if (args.skill) lines.push(`skill: ${args.skill}`);
    if (args.agent) lines.push(`agent: ${args.agent}`);
    if (args.shell) lines.push(`shell: ${JSON.stringify(args.shell)}`);
    lines.push(`enabled: ${args.enabled === false ? 'false' : 'true'}`);
    lines.push('---');
    lines.push('');
    lines.push(args.description || `Auto-created by an agent at ${new Date().toISOString()}.`);
    lines.push('');
    const relPath = `triggers/${slug}.md`;
    await writeVaultFile(relPath, lines.join('\n'));
    return { ok: true, path: relPath };
  },
};

export const BUILTIN_TOOLS: ToolDef[] = [
  notify,
  trigger_create,
  gsc_query,
  ga_run_report,
  ga_top_pages,
  ga_realtime,
  cms_list_posts,
  cms_create_draft,
  read_file,
  write_file,
  edit_file,
  rename_file,
  list_dir,
  grep,
  web_fetch,
  deep_research,
  enrich_company,
  enrich_contact,
  enrich_contact_linkedin,
  scrape_apify_actor,
  geo_list_prompts,
  geo_add_prompt,
  geo_remove_prompt,
  geo_list_brands,
  geo_set_brands,
  geo_run_prompt,
  geo_run_daily,
  geo_report_brands,
  geo_report_domains,
  geo_gap_sources,
  geo_sov_trend,
  geo_list_runs,
  draft_create,
  enroll_contact_in_sequence,
  hubspot_create_contact,
  hubspot_update_contact,
  hubspot_create_company,
  hubspot_associate,
  hubspot_create_note,
  hubspot_create_task,
  hubspot_search,
  apollo_search_people,
  apollo_enrich_person,
  apollo_organization_search,
  attio_search_records,
  attio_create_record,
  attio_update_record,
  attio_create_note,
  attio_add_to_list,
  feishu_notify,
  feishu_send_message,
  feishu_bitable_list_records,
  metabase_run_card,
  metabase_query_sql,
  metabase_search,
  supabase_select,
  supabase_insert,
  supabase_update,
  supabase_rpc,
  slack_notify,
  send_email,
  linkedin_enrich_company,
  linkedin_list_accounts,
  linkedin_send_dm,
  linkedin_send_invitation,
  linkedin_get_profile_unipile,
  linkedin_dm_via_apify,
];

export function allTools(): ToolDef[] {
  return [...BUILTIN_TOOLS, ...McpRegistry.tools()];
}

export function toolsByName(): Map<string, ToolDef> {
  return new Map(allTools().map((t) => [t.name, t]));
}

// Render for OpenAI Responses API tools[] field.
export function toolsAsOpenAI(tools: ToolDef[]) {
  return tools.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
