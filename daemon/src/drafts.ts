import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { VAULT_ROOT } from './paths.js';
import { writeVaultFile } from './vault.js';

export interface Draft {
  id: string;
  path: string;
  channel: string;
  to: string;
  subject?: string;
  body: string;
  tool: string;
  status: 'pending' | 'approved' | 'sent' | 'rejected';
  created_at?: string;
}

export async function listDrafts(): Promise<Draft[]> {
  const dir = path.join(VAULT_ROOT, 'drafts');
  try {
    const entries = await fs.readdir(dir);
    const out: Draft[] = [];
    for (const f of entries) {
      if (!f.endsWith('.md')) continue;
      const raw = await fs.readFile(path.join(dir, f), 'utf-8');
      const m = matter(raw);
      const fm = m.data as any;
      out.push({
        id: path.basename(f, '.md'),
        path: `drafts/${f}`,
        channel: fm.channel ?? 'email',
        to: fm.to ?? '',
        subject: fm.subject,
        body: m.content.trim(),
        tool: fm.tool ?? '',
        status: fm.status ?? 'pending',
        created_at: fm.created_at,
      });
    }
    out.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    return out;
  } catch {
    return [];
  }
}

export async function readDraft(id: string): Promise<Draft | null> {
  const all = await listDrafts();
  return all.find((d) => d.id === id) ?? null;
}

export async function setDraftStatus(id: string, status: Draft['status']) {
  const dir = path.join(VAULT_ROOT, 'drafts');
  const fp = path.join(dir, `${id}.md`);
  const raw = await fs.readFile(fp, 'utf-8');
  const m = matter(raw);
  const next = matter.stringify(m.content, { ...m.data, status });
  await writeVaultFile(`drafts/${id}.md`, next);
}

export async function approveDraft(id: string): Promise<{ ok: true; note: string }> {
  const d = await readDraft(id);
  if (!d) throw new Error('draft not found');
  // V1: we only flip status to "approved". Actual send happens when an MCP
  // server (gmail / linkedin) is configured and wired in a later milestone.
  await setDraftStatus(id, 'approved');
  return {
    ok: true,
    note: 'Marked approved. Wire a Gmail/LinkedIn MCP in ~/BlackMagic/.bm/mcp.json to auto-send.',
  };
}

export async function rejectDraft(id: string) {
  await setDraftStatus(id, 'rejected');
  return { ok: true };
}
