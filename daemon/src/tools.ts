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
