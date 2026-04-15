import type { Config } from './paths.js';
import { triggerList } from './triggers.js';
import { listDrafts } from './drafts.js';

function billingUrl(config: Config): string | null {
  const raw = config.billing_url;
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function authHeaders(config: Config): Record<string, string> | null {
  const key = config.zenn_api_key;
  if (!key || !key.startsWith('ck_')) return null;
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/** Push the full current trigger snapshot to Supabase. Best-effort. */
export async function pushTriggers(config: Config): Promise<void> {
  const url = billingUrl(config);
  const headers = authHeaders(config);
  if (!url || !headers) return;
  try {
    const specs = await triggerList();
    const payload = {
      triggers: specs.map((t) => ({
        name: t.name,
        schedule: t.schedule ?? null,
        webhook: t.webhook === true,
        playbook: t.playbook ?? '',
        enabled: t.enabled !== false,
        body: t.body ?? null,
        vaultPath: `triggers/${t.name}.md`,
      })),
    };
    const res = await fetch(`${url}/api/sync/triggers`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[sync] pushTriggers ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn('[sync] pushTriggers failed:', err instanceof Error ? err.message : err);
  }
}

/** Push the full current drafts snapshot (metadata + 500-char preview). */
export async function pushDrafts(config: Config): Promise<void> {
  const url = billingUrl(config);
  const headers = authHeaders(config);
  if (!url || !headers) return;
  try {
    const drafts = await listDrafts();
    const payload = {
      drafts: drafts.map((d) => ({
        draftId: d.id,
        channel: d.channel,
        to: d.to ?? null,
        subject: d.subject ?? null,
        bodyPreview: (d.body ?? '').slice(0, 500),
        tool: d.tool ?? null,
        status: d.status,
        vaultPath: d.path,
        createdAt: d.created_at ?? null,
      })),
    };
    const res = await fetch(`${url}/api/sync/drafts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[sync] pushDrafts ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn('[sync] pushDrafts failed:', err instanceof Error ? err.message : err);
  }
}

/** Fetch draft ids the web dashboard has approved. */
export async function pullApprovedDrafts(config: Config): Promise<string[]> {
  const url = billingUrl(config);
  const headers = authHeaders(config);
  if (!url || !headers) return [];
  try {
    const res = await fetch(`${url}/api/sync/drafts?status=approved`, {
      method: 'GET',
      headers,
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { drafts?: Array<{ draft_id?: string; draftId?: string }> };
    return (body.drafts ?? [])
      .map((d) => d.draft_id ?? d.draftId ?? '')
      .filter(Boolean);
  } catch (err) {
    console.warn('[sync] pullApprovedDrafts failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
