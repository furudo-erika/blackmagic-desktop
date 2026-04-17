import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { getVaultRoot } from './paths.js';
import { writeVaultFile } from './vault.js';
import { McpRegistry } from './mcp.js';

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

function normalizeCreatedAt(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return undefined;
}

export async function listDrafts(): Promise<Draft[]> {
  const dir = path.join(getVaultRoot(), 'drafts');
  try {
    const entries = await fs.readdir(dir);
    const out: Draft[] = [];
    for (const f of entries) {
      if (!f.endsWith('.md')) continue;
      try {
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
          created_at: normalizeCreatedAt(fm.created_at),
        });
      } catch {
        // Skip malformed drafts instead of hiding the whole inbox.
      }
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
  const dir = path.join(getVaultRoot(), 'drafts');
  const fp = path.join(dir, `${id}.md`);
  const raw = await fs.readFile(fp, 'utf-8');
  const m = matter(raw);
  const next = matter.stringify(m.content, { ...m.data, status });
  await writeVaultFile(`drafts/${id}.md`, next);
}

async function setDraftFrontmatter(id: string, patch: Record<string, unknown>) {
  const dir = path.join(getVaultRoot(), 'drafts');
  const fp = path.join(dir, `${id}.md`);
  const raw = await fs.readFile(fp, 'utf-8');
  const m = matter(raw);
  const next = matter.stringify(m.content, { ...m.data, ...patch });
  await writeVaultFile(`drafts/${id}.md`, next);
}

function extractMessageId(result: any): string | undefined {
  if (!result) return undefined;
  if (typeof result.messageId === 'string') return result.messageId;
  if (typeof result.id === 'string') return result.id;
  const content = Array.isArray(result.content) ? result.content : [];
  for (const c of content) {
    if (c && typeof c.text === 'string') {
      const m = c.text.match(/([A-Za-z0-9_-]{10,})/);
      if (m) return m[1];
    }
  }
  return undefined;
}

export async function approveDraft(
  id: string,
): Promise<{ ok: boolean; note?: string; messageId?: string; error?: string }> {
  const d = await readDraft(id);
  if (!d) throw new Error('draft not found');

  // If the draft's tool isn't an MCP tool we have, just mark approved.
  if (!d.tool || !d.tool.includes('.') || !McpRegistry.hasTool(d.tool)) {
    await setDraftStatus(id, 'approved');
    return {
      ok: true,
      note: `Marked approved. MCP tool "${d.tool}" not wired; configure in ~/BlackMagic/.bm/mcp.json to auto-send.`,
    };
  }

  // Build args from the draft frontmatter. For gmail.send_email-style tools,
  // {to, subject, body} is the canonical shape — pass extras through too.
  const args: Record<string, unknown> = {
    to: d.to,
    subject: d.subject ?? '',
    body: d.body,
  };

  try {
    const result = await McpRegistry.callPrefixed(d.tool, args);
    const messageId = extractMessageId(result);
    const sentAt = new Date().toISOString();
    await setDraftFrontmatter(id, { status: 'sent', sent_at: sentAt, ...(messageId ? { message_id: messageId } : {}) });
    return { ok: true, messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setDraftFrontmatter(id, { status: 'approved', last_error: msg });
    return { ok: false, error: msg, note: `MCP call failed: ${msg}` };
  }
}

export async function rejectDraft(id: string) {
  await setDraftStatus(id, 'rejected');
  return { ok: true };
}
