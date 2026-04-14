import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { ensureInsideVault, VAULT_ROOT } from './paths.js';

const SKELETON_DIRS = [
  'agents',
  'companies',
  'contacts',
  'deals/open',
  'deals/closed-won',
  'deals/closed-lost',
  'playbooks',
  'triggers',
  'drafts',
  'runs',
  '.bm',
];

const DEFAULT_CLAUDE_MD = `# Black Magic — Your CLAUDE.md

This file is read by every agent on every call. Keep it short and opinionated.

## Our Company

_One paragraph: what you sell, to whom._

## ICP (Ideal Customer Profile)

- Company size:
- Industries:
- Tech stack we fit with:
- Geos:

## Tone

- Voice:
- Forbidden words: "unlock", "revolutionize", "streamline", "leverage", "unleash"
- Email length cap: 90 words

## Sources of Truth

- Companies: \`companies/\`
- Contacts: \`contacts/<company-slug>/\`
- Deals: \`deals/\` (open/closed-won/closed-lost)
`;

const DEFAULT_AGENTS: Record<string, string> = {
  'researcher.md': `---
kind: agent
name: researcher
model: gpt-5.3-codex
tools:
  - read_file
  - write_file
  - edit_file
  - list_dir
  - grep
  - web_fetch
  - web_search
  - pdl_enrich
temperature: 0.2
---

You are the research agent. Given a company domain, produce a
companies/<slug>.md with rich frontmatter (name, domain, industry,
size, revenue, hq, icp_score, icp_reasons, enriched_at) and a 150-word
body covering what they do, recent news, and best-guess buying committee.

Use \`pdl_enrich\` first for firmographics, then \`web_search\` for news.
Never fabricate fields — write \`null\` if unknown.
`,
  'sdr.md': `---
kind: agent
name: sdr
model: gpt-5.3-codex
tools:
  - read_file
  - write_file
  - list_dir
  - grep
  - draft_create
temperature: 0.4
---

You are the SDR agent. Given a contact and their company file, draft
outbound emails into drafts/. Each draft references one concrete
signal from the company file. Max 90 words. No forbidden words from
CLAUDE.md. You NEVER send; you only call draft_create.
`,
  'ae.md': `---
kind: agent
name: ae
model: gpt-5.3-codex
tools:
  - read_file
  - write_file
  - edit_file
  - list_dir
  - grep
temperature: 0.3
---

You are the AE agent. You manage deals/. Given a deal file, analyze
stage health, identify stalls, and propose the next step. Edit the
deal's frontmatter (next_step, health) and append a dated note to
the body.
`,
};

const DEFAULT_PLAYBOOKS: Record<string, string> = {
  'enrich-company.md': `---
kind: playbook
name: enrich-company
agent: researcher
inputs:
  - name: domain
    required: true
---

Enrich the company at \`{{domain}}\`. Produce a full
\`companies/<slug>.md\` with frontmatter and a 150-word body.
`,
  'qualify-icp.md': `---
kind: playbook
name: qualify-icp
agent: researcher
inputs:
  - name: domain
    required: true
---

Read \`companies/<slug-of-{{domain}}>.md\` (call enrich-company first
if missing). Compare against ICP in CLAUDE.md. Update the file's
frontmatter with \`icp_score\` (0-100) and \`icp_reasons\` (list).
`,
  'draft-outbound.md': `---
kind: playbook
name: draft-outbound
agent: sdr
inputs:
  - name: contact_path
    required: true
---

Draft a first-touch email to the contact in \`{{contact_path}}\`.
Reference exactly one concrete signal from the company file.
Output via draft_create.
`,
};

export async function ensureVault(): Promise<{ created: boolean }> {
  let created = false;
  await fs.mkdir(VAULT_ROOT, { recursive: true });
  for (const dir of SKELETON_DIRS) {
    await fs.mkdir(path.join(VAULT_ROOT, dir), { recursive: true });
  }

  const claudePath = path.join(VAULT_ROOT, 'CLAUDE.md');
  if (!fsSync.existsSync(claudePath)) {
    await fs.writeFile(claudePath, DEFAULT_CLAUDE_MD, 'utf-8');
    created = true;
  }

  for (const [name, body] of Object.entries(DEFAULT_AGENTS)) {
    const p = path.join(VAULT_ROOT, 'agents', name);
    if (!fsSync.existsSync(p)) await fs.writeFile(p, body, 'utf-8');
  }

  for (const [name, body] of Object.entries(DEFAULT_PLAYBOOKS)) {
    const p = path.join(VAULT_ROOT, 'playbooks', name);
    if (!fsSync.existsSync(p)) await fs.writeFile(p, body, 'utf-8');
  }

  const mcpPath = path.join(VAULT_ROOT, '.bm', 'mcp.json');
  if (!fsSync.existsSync(mcpPath)) {
    await fs.writeFile(mcpPath, JSON.stringify({ servers: {} }, null, 2), 'utf-8');
  }

  return { created };
}

export async function readVaultFile(relPath: string) {
  const abs = ensureInsideVault(relPath);
  const raw = await fs.readFile(abs, 'utf-8');
  const parsed = matter(raw);
  return { content: raw, frontmatter: parsed.data, body: parsed.content };
}

export async function writeVaultFile(relPath: string, content: string) {
  const abs = ensureInsideVault(relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf-8');
}

export async function editVaultFile(relPath: string, oldStr: string, newStr: string) {
  const abs = ensureInsideVault(relPath);
  const raw = await fs.readFile(abs, 'utf-8');
  if (!raw.includes(oldStr)) throw new Error(`old_str not found in ${relPath}`);
  const count = raw.split(oldStr).length - 1;
  if (count > 1) throw new Error(`old_str ambiguous (${count} matches) in ${relPath}`);
  await fs.writeFile(abs, raw.replace(oldStr, newStr), 'utf-8');
}

export async function renameVaultFile(oldPath: string, newPath: string) {
  const oldAbs = ensureInsideVault(oldPath);
  const newAbs = ensureInsideVault(newPath);
  await fs.mkdir(path.dirname(newAbs), { recursive: true });
  await fs.rename(oldAbs, newAbs);
}

export async function listDir(relPath = '.') {
  const abs = ensureInsideVault(relPath);
  const entries = await fs.readdir(abs, { withFileTypes: true });
  return entries.map((e) => ({
    name: e.name,
    type: e.isDirectory() ? 'dir' : 'file',
    path: path.posix.join(relPath, e.name),
  }));
}

export async function walkTree(relPath = '.'): Promise<Array<{ path: string; type: 'file' | 'dir' }>> {
  const out: Array<{ path: string; type: 'file' | 'dir' }> = [];
  async function go(rel: string) {
    const abs = ensureInsideVault(rel);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const e of entries) {
      const childRel = path.posix.join(rel, e.name);
      if (e.name === '.bm' || e.name === 'node_modules' || e.name.startsWith('.DS_Store')) continue;
      if (e.isDirectory()) {
        out.push({ path: childRel, type: 'dir' });
        await go(childRel);
      } else {
        out.push({ path: childRel, type: 'file' });
      }
    }
  }
  await go(relPath);
  return out;
}

export async function grepVault(pattern: string, relPath = '.') {
  const re = new RegExp(pattern, 'i');
  const hits: Array<{ path: string; line: number; text: string }> = [];
  const files = (await walkTree(relPath)).filter((f) => f.type === 'file');
  for (const f of files) {
    if (!/\.(md|txt|json|toml|yaml|yml)$/i.test(f.path)) continue;
    const abs = ensureInsideVault(f.path);
    const txt = await fs.readFile(abs, 'utf-8');
    const lines = txt.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i]!)) {
        hits.push({ path: f.path, line: i + 1, text: lines[i]!.slice(0, 200) });
      }
    }
  }
  return hits;
}

export function slugFromDomain(domain: string): string {
  return domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\./g, '-');
}
