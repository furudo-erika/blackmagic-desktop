// Built-in tool registry. Each tool has:
//  - a JSON Schema (exposed to the LLM via tools[])
//  - a handler (executed locally by the daemon)
//
// Every handler receives a `ctx` with vault + config + secrets.

import { readVaultFile, writeVaultFile, editVaultFile, renameVaultFile, listDir, grepVault } from './vault.js';
import type { Config } from './paths.js';
import { McpRegistry } from './mcp.js';
import { enrollContact } from './sequences.js';

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
    const res = await fetch(args.url, { headers: { 'User-Agent': 'BlackMagic/0.1 (+https://blackmagic.run)' } });
    const text = (await res.text()).slice(0, 20_000);
    return { status: res.status, text };
  },
};

// Both web_search and enrich_company are proxied through blackmagic.run so the
// user doesn't manage third-party keys. Server side charges the user's
// credits per call and forwards the response. Authed with the vault's ck_.
async function proxyTool(toolName: string, args: Record<string, unknown>, ctx: ToolCtx) {
  const key = ctx.config.zenn_api_key;
  const base = (ctx.config.billing_url ?? 'https://blackmagic.run').replace(/\/+$/, '');
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
    'Multi-hop web research via Perplexity sonar-deep-research, proxied through blackmagic.run. Spends a few minutes, returns a structured report with inline citations. Use for account briefs, competitor teardowns, market scans — NOT for quick factual lookups (use the model\'s built-in web_search for those).',
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
  description: 'Write a draft to drafts/. Approve-gated: nothing is sent until the human approves in the UI.',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', enum: ['email', 'linkedin_dm', 'linkedin_connect'] },
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
      tool: { type: 'string', description: 'Which approve-gated tool should send it (e.g. gmail.send)' },
    },
    required: ['channel', 'to', 'body', 'tool'],
  },
  handler: async (args) => {
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
    return { ok: true, path: relPath };
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
      return { error: 'No ENRICHLAYER_API_KEY configured. Set it in Settings → Integrations, or add enrichlayer_api_key to ~/BlackMagic/.bm/config.toml.' };
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
      return { error: 'No APIFY_API_KEY configured. Set it in Settings → Integrations, or add apify_api_key to ~/BlackMagic/.bm/config.toml.' };
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
    return { ok: false, error: 'set HUBSPOT_API_KEY in Settings → Integration keys' };
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
    return { ok: false, error: 'set APOLLO_API_KEY in Settings → Integration keys' };
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
    return { ok: false, error: 'set ATTIO_API_KEY in Settings → Integration keys' };
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
    if (!url) return { ok: false, error: 'set SLACK_WEBHOOK_URL in Settings → Integration keys' };
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
    'Send a transactional email via Resend. body_markdown is required; body_html is optional (overrides the auto-converted markdown). from defaults to the configured from_email.',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string' },
      subject: { type: 'string' },
      body_markdown: { type: 'string' },
      body_html: { type: 'string' },
      from: { type: 'string' },
    },
    required: ['to', 'subject', 'body_markdown'],
  },
  handler: async (args, ctx) => {
    const key = ctx.config.resend_api_key;
    if (!key) return { ok: false, error: 'set RESEND_API_KEY in Settings → Integration keys' };
    const from = args.from || ctx.config.from_email;
    if (!from) return { ok: false, error: 'set from_email (or pass `from`) in Settings → Integration keys' };
    try {
      const html = args.body_html || naiveMarkdownToHtml(String(args.body_markdown));
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: args.to,
          subject: args.subject,
          html,
          text: args.body_markdown,
        }),
      });
      const text = await res.text();
      let data: any = null;
      if (text) { try { data = JSON.parse(text); } catch { data = text; } }
      if (!res.ok) {
        const msg =
          (data && typeof data === 'object' && 'message' in data && String(data.message)) ||
          String(text).slice(0, 200) ||
          `resend ${res.status}`;
        return { ok: false, status: res.status, error: msg };
      }
      return { ok: true, data: { id: data?.id, from, to: args.to } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
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
  if (!key) return { ok: false, error: 'set APIFY_API_KEY in Settings → Integration keys' };
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

const linkedin_dm_via_apify: ToolDef = {
  name: 'linkedin_dm_via_apify',
  description:
    "Send a LinkedIn DM via an Apify actor. BRITTLE: needs the user's session cookie (linkedin_cookie) and technically violates LinkedIn ToS — use for personal outreach only. Prefer send_email + a connection request when in doubt.",
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
      return { ok: false, error: 'set APIFY_API_KEY in Settings → Integration keys' };
    }
    if (!ctx.config.linkedin_cookie) {
      return { ok: false, error: 'set LINKEDIN_COOKIE in Settings → Integration keys (li_at=…). Note: ToS-grey-area; use cautiously.' };
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

export const BUILTIN_TOOLS: ToolDef[] = [
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
  slack_notify,
  send_email,
  linkedin_enrich_company,
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
