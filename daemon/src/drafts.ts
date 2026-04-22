import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { getVaultRoot } from './paths.js';
import { writeVaultFile } from './vault.js';
import { McpRegistry } from './mcp.js';
import { sendEmailViaBestProvider } from './email-sender.js';

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

async function readRawFrontmatter(id: string): Promise<Record<string, unknown> | null> {
  try {
    const fp = path.join(getVaultRoot(), 'drafts', `${id}.md`);
    const raw = await fs.readFile(fp, 'utf-8');
    return (matter(raw).data ?? {}) as Record<string, unknown>;
  } catch { return null; }
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
  resendConfig?: { resendKey?: string; resendFrom?: string },
): Promise<{ ok: boolean; note?: string; messageId?: string; error?: string; provider?: string }> {
  const d = await readDraft(id);
  if (!d) throw new Error('draft not found');

  // Route by channel. Email drafts prefer the built-in BYOK path
  // (Amazon SES → Resend) over an MCP tool. LinkedIn + other channels
  // still go through MCP if the tool is configured; otherwise fall
  // back to "marked approved, send manually".
  const isEmail = d.channel === 'email' || /^(send_email|gmail\.|ses\.)/.test(d.tool);

  if (isEmail) {
    const result = await sendEmailViaBestProvider(
      {
        to: d.to,
        subject: d.subject ?? '(no subject)',
        body_markdown: d.body,
      },
      resendConfig,
    );
    if (result.ok) {
      const sentAt = new Date().toISOString();
      await setDraftFrontmatter(id, {
        status: 'sent',
        sent_at: sentAt,
        provider: result.provider,
        ...(result.messageId ? { message_id: result.messageId } : {}),
      });
      return { ok: true, messageId: result.messageId, provider: result.provider };
    }
    // Email provider failed — keep draft as `approved` so the user can
    // retry after fixing creds, but surface the real error instead of
    // the misleading "MCP tool not wired" note.
    await setDraftFrontmatter(id, { status: 'approved', last_error: result.error });
    return {
      ok: false,
      error: result.error,
      note: result.error,
    };
  }

  // LinkedIn channels: prefer Unipile (native, stable) over the
  // apify-cookie path. The agent may have requested a specific account
  // via `account_id` in the frontmatter; otherwise we pick the first
  // connected LinkedIn account.
  if (d.channel === 'linkedin_dm' || d.channel === 'linkedin_connect') {
    try {
      const { listLinkedInAccounts, sendLinkedInDm, sendLinkedInInvitation } =
        await import('./unipile-linkedin.js');
      // frontmatter.account_id wins; otherwise list + take first.
      const rawFm: any = (await readRawFrontmatter(id)) ?? {};
      let accountId: string | undefined = typeof rawFm.account_id === 'string' ? rawFm.account_id : undefined;
      if (!accountId) {
        const acctRes = await listLinkedInAccounts();
        if (!acctRes.ok) {
          await setDraftFrontmatter(id, { status: 'approved', last_error: acctRes.error });
          return { ok: false, error: acctRes.error, note: acctRes.error };
        }
        const items = Array.isArray(acctRes.data) ? acctRes.data : [];
        accountId = items[0]?.id ?? items[0]?.account_id;
      }
      if (!accountId) {
        const msg = 'No LinkedIn account connected in Unipile. Open sidebar → Tools → Unipile to link your LinkedIn account first.';
        await setDraftFrontmatter(id, { status: 'approved', last_error: msg });
        return { ok: false, error: msg, note: msg };
      }
      const sendRes = d.channel === 'linkedin_connect'
        ? await sendLinkedInInvitation({ account_id: accountId, recipient: d.to, message: d.body })
        : await sendLinkedInDm({ account_id: accountId, recipient: d.to, text: d.body });
      if (sendRes.ok) {
        const sentAt = new Date().toISOString();
        await setDraftFrontmatter(id, { status: 'sent', sent_at: sentAt, provider: 'unipile' });
        return { ok: true, provider: 'unipile' };
      }
      await setDraftFrontmatter(id, { status: 'approved', last_error: sendRes.error ?? 'unipile error' });
      return { ok: false, error: sendRes.error, note: sendRes.error };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await setDraftFrontmatter(id, { status: 'approved', last_error: msg });
      return { ok: false, error: msg, note: msg };
    }
  }

  // Other non-email channels: try an MCP tool if the draft names one.
  if (d.tool && d.tool.includes('.') && McpRegistry.hasTool(d.tool)) {
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

  // No MCP tool wired and not an email channel — LinkedIn DM etc.
  // Mark approved; user will send manually or via an MCP wiring later.
  await setDraftStatus(id, 'approved');
  return {
    ok: true,
    note: `Marked approved. Channel "${d.channel}" has no auto-send provider wired — send manually or configure an MCP tool for "${d.tool}".`,
  };
}

export async function rejectDraft(id: string) {
  await setDraftStatus(id, 'rejected');
  return { ok: true };
}
