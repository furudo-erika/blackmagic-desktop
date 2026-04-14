// Built-in tool registry. Each tool has:
//  - a JSON Schema (exposed to the LLM via tools[])
//  - a handler (executed locally by the daemon)
//
// Every handler receives a `ctx` with vault + config + secrets.

import { readVaultFile, writeVaultFile, editVaultFile, renameVaultFile, listDir, grepVault } from './vault.js';
import type { Config } from './paths.js';

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

const web_search: ToolDef = {
  name: 'web_search',
  description: 'Live web search via Perplexity Sonar. Returns answer + citations. Requires PPLX_API_KEY.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  handler: async (args) => {
    const key = process.env.PPLX_API_KEY;
    if (!key) return { error: 'PPLX_API_KEY not set' };
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: args.query }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  },
};

const pdl_enrich: ToolDef = {
  name: 'pdl_enrich',
  description: 'Enrich a company domain via PeopleDataLabs. Requires PDL_API_KEY.',
  parameters: {
    type: 'object',
    properties: { domain: { type: 'string' } },
    required: ['domain'],
  },
  handler: async (args) => {
    const key = process.env.PDL_API_KEY;
    if (!key) return { error: 'PDL_API_KEY not set' };
    const url = `https://api.peopledatalabs.com/v5/company/enrich?website=${encodeURIComponent(args.domain)}&api_key=${key}`;
    const res = await fetch(url);
    return { status: res.status, data: await res.json().catch(() => null) };
  },
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

export const BUILTIN_TOOLS: ToolDef[] = [
  read_file,
  write_file,
  edit_file,
  rename_file,
  list_dir,
  grep,
  web_fetch,
  web_search,
  pdl_enrich,
  draft_create,
];

export function toolsByName(): Map<string, ToolDef> {
  return new Map(BUILTIN_TOOLS.map((t) => [t.name, t]));
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
