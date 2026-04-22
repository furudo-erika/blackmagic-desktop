// Unipile-backed LinkedIn automation — the canonical path.
//
// Unipile (https://www.unipile.com) is a messaging-abstraction API that
// wraps LinkedIn's native flows (plus WhatsApp / Instagram / Telegram /
// Messenger) behind a single REST surface. For BlackMagic users doing
// LinkedIn outbound, this replaces:
//
//   - the brittle `linkedin_dm_via_apify` path (needs a li_at cookie,
//     ToS-grey-area, breaks on every LinkedIn session rotation)
//   - the "draft + paste manually" dance for LinkedIn DMs + connection
//     requests
//
// Unipile charges per connected account (see https://www.unipile.com/pricing-api/);
// users bring their own Unipile API key + instance URL via
// Integrations → Unipile. The key auths via the `X-API-KEY` header.
//
// This module owns the low-level HTTP. The tools in tools.ts wrap it
// and expose `linkedin_send_dm`, `linkedin_send_invitation`, and
// `linkedin_get_profile` to agents.

import fs from 'node:fs/promises';
import path from 'node:path';
import { getVaultRoot } from './paths.js';

interface UnipileCreds {
  token: string;
  endpoint: string; // e.g. "https://api8.unipile.com:13851"
}

async function readUnipileCreds(): Promise<UnipileCreds | null> {
  try {
    const raw = await fs.readFile(path.join(getVaultRoot(), '.bm', 'integrations.json'), 'utf-8');
    const data = JSON.parse(raw);
    const rec = data?.unipile;
    if (!rec || rec.status !== 'connected') return null;
    const c = rec.credentials ?? {};
    if (!c.token || !c.endpoint) return null;
    return { token: String(c.token), endpoint: String(c.endpoint).replace(/\/+$/, '') };
  } catch { return null; }
}

export async function unipileRequest(
  method: string,
  pathAndQuery: string,
  body?: unknown,
): Promise<{ ok: boolean; status?: number; data?: any; error?: string }> {
  const creds = await readUnipileCreds();
  if (!creds) {
    return {
      ok: false,
      error: 'Unipile not connected. Open sidebar → Integrations → Unipile, paste your API key + instance URL (https://api…unipile.com:…). Unipile pricing: https://www.unipile.com/pricing-api/.',
    };
  }
  const url = `${creds.endpoint}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'X-API-KEY': creds.token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    if (!res.ok) {
      const msg = (data && typeof data === 'object' && (data.message || data.error)) || String(text).slice(0, 300) || `unipile ${res.status}`;
      return { ok: false, status: res.status, error: msg, data };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Convenience wrappers — the LinkedIn-specific endpoints our skills care
// about most. All take `account_id` (the Unipile-side LinkedIn account
// identifier, retrievable via `GET /api/v1/accounts`).

export async function listLinkedInAccounts() {
  const r = await unipileRequest('GET', '/api/v1/accounts?provider=LINKEDIN');
  if (!r.ok) return r;
  return { ok: true, data: r.data?.items ?? r.data };
}

export async function sendLinkedInDm(opts: {
  account_id: string;
  recipient: string; // provider_id (LinkedIn URN) OR public profile URL
  text: string;
  attachments?: string[];
}) {
  // Unipile accepts attendees as provider_ids. If the caller passed a
  // full LinkedIn URL, resolve it first via GET /users/{identifier}.
  let providerId = opts.recipient;
  if (/^https?:\/\//.test(opts.recipient)) {
    const resolved = await unipileRequest(
      'GET',
      `/api/v1/users/${encodeURIComponent(opts.recipient)}?account_id=${encodeURIComponent(opts.account_id)}`,
    );
    if (!resolved.ok) return { ok: false, error: `Could not resolve recipient URL via Unipile: ${resolved.error}` };
    providerId = resolved.data?.provider_id ?? resolved.data?.id ?? providerId;
  }
  return unipileRequest('POST', '/api/v1/chats', {
    account_id: opts.account_id,
    attendees_ids: [providerId],
    text: opts.text,
    attachments: opts.attachments,
  });
}

export async function sendLinkedInInvitation(opts: {
  account_id: string;
  recipient: string;
  message?: string;
}) {
  let providerId = opts.recipient;
  if (/^https?:\/\//.test(opts.recipient)) {
    const resolved = await unipileRequest(
      'GET',
      `/api/v1/users/${encodeURIComponent(opts.recipient)}?account_id=${encodeURIComponent(opts.account_id)}`,
    );
    if (!resolved.ok) return { ok: false, error: `Could not resolve recipient URL: ${resolved.error}` };
    providerId = resolved.data?.provider_id ?? resolved.data?.id ?? providerId;
  }
  return unipileRequest('POST', '/api/v1/users/invite', {
    account_id: opts.account_id,
    provider_id: providerId,
    message: opts.message ?? '',
  });
}

export async function getLinkedInProfile(opts: { account_id: string; identifier: string }) {
  return unipileRequest(
    'GET',
    `/api/v1/users/${encodeURIComponent(opts.identifier)}?account_id=${encodeURIComponent(opts.account_id)}`,
  );
}
