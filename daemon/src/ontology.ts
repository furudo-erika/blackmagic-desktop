// Build a graph of the vault:
//   nodes  = each .md file with frontmatter (labeled by `kind`)
//   edges  = derived from frontmatter fields that reference other files:
//            - contacts/<co>/*.md `company: acme.com`  → companies/acme-com.md
//            - deals/*.md         `company: acme.com`  → companies/acme-com.md
//            - drafts/*.md        `to: jane@acme.com`  → contacts/acme-com/jane.md
//            - memory entries     `account_name: acme.com` → company
// Plus cross-folder references wherever a frontmatter value matches a
// known company slug / contact slug / deal slug.

import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { VAULT_ROOT } from './paths.js';
import { walkTree, slugFromDomain } from './vault.js';

export interface OntoNode {
  id: string;
  kind: string;
  label: string;
  path: string;
  mtime: number;
  size: number;
}

export interface OntoEdge {
  source: string;
  target: string;
  label?: string;
}

function kindFromPath(rel: string): OntoNode['kind'] {
  const top = rel.split('/')[0] ?? '';
  if (top === 'companies') return 'company';
  if (top === 'contacts') return 'contact';
  if (top === 'deals') return 'deal';
  if (top === 'drafts') return 'draft';
  if (top === 'agents') return 'agent';
  if (top === 'playbooks') return 'playbook';
  if (top === 'triggers') return 'trigger';
  if (top === 'memory') return 'memory';
  if (top === 'knowledge') return 'knowledge';
  return 'other';
}

export async function buildOntology(): Promise<{ nodes: OntoNode[]; edges: OntoEdge[] }> {
  const files = (await walkTree('.')).filter(
    (f) => f.type === 'file' && /\.md$/i.test(f.path) && !f.path.startsWith('runs/') && !f.path.startsWith('.bm/'),
  );

  const nodes: OntoNode[] = [];
  const edges: OntoEdge[] = [];

  // Maps for resolving references.
  const companyByDomain = new Map<string, string>();  // "acme.com" → node id
  const companyBySlug = new Map<string, string>();     // "acme-com"
  const contactByEmail = new Map<string, string>();    // "jane@acme.com"
  const fmByPath = new Map<string, Record<string, any>>();

  for (const f of files) {
    const abs = path.join(VAULT_ROOT, f.path);
    let raw = '';
    try {
      raw = await fs.readFile(abs, 'utf-8');
    } catch {
      continue;
    }
    const parsed = matter(raw);
    const fm = parsed.data ?? {};
    const stat = await fs.stat(abs).catch(() => null);
    const kind = kindFromPath(f.path);
    const slug = path.basename(f.path, '.md');
    const label =
      typeof fm.name === 'string'
        ? fm.name
        : typeof fm.subject === 'string'
          ? fm.subject
          : slug;

    nodes.push({
      id: f.path,
      kind,
      label,
      path: f.path,
      mtime: stat?.mtimeMs ?? 0,
      size: stat?.size ?? 0,
    });
    fmByPath.set(f.path, fm);

    if (kind === 'company') {
      if (typeof fm.domain === 'string') companyByDomain.set(fm.domain.toLowerCase(), f.path);
      companyBySlug.set(slug, f.path);
    }
    if (kind === 'contact' && typeof fm.email === 'string') {
      contactByEmail.set(fm.email.toLowerCase(), f.path);
    }
  }

  // Resolve references.
  for (const [srcPath, fm] of fmByPath) {
    const src = srcPath;
    // company reference via frontmatter.company
    const domainish =
      typeof fm.company === 'string'
        ? fm.company.toLowerCase()
        : typeof fm.domain === 'string' && kindFromPath(src) !== 'company'
          ? fm.domain.toLowerCase()
          : null;
    if (domainish) {
      const hit =
        companyByDomain.get(domainish) ?? companyBySlug.get(slugFromDomain(domainish));
      if (hit && hit !== src) edges.push({ source: src, target: hit, label: 'company' });
    }

    // draft → contact via `to:` email
    if (kindFromPath(src) === 'draft' && typeof fm.to === 'string') {
      const hit = contactByEmail.get(fm.to.toLowerCase());
      if (hit) edges.push({ source: src, target: hit, label: 'to' });
    }

    // memory → company via account_name
    if (kindFromPath(src) === 'memory' && typeof fm.account_name === 'string') {
      const dn = fm.account_name.toLowerCase();
      const hit = companyByDomain.get(dn) ?? companyBySlug.get(slugFromDomain(dn));
      if (hit) edges.push({ source: src, target: hit, label: 'memory' });
    }

    // trigger / playbook pointing to agent
    if (
      (kindFromPath(src) === 'trigger' || kindFromPath(src) === 'playbook') &&
      typeof fm.agent === 'string'
    ) {
      const target = `agents/${fm.agent}.md`;
      if (fmByPath.has(target)) edges.push({ source: src, target, label: 'agent' });
    }

    // trigger → playbook
    if (kindFromPath(src) === 'trigger' && typeof fm.playbook === 'string') {
      const target = `playbooks/${fm.playbook}.md`;
      if (fmByPath.has(target)) edges.push({ source: src, target, label: 'playbook' });
    }
  }

  return { nodes, edges };
}
