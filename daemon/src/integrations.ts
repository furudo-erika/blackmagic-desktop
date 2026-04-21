// Per-user integrations stored at ~/BlackMagic/.bm/integrations.json.
// Credentials stay local; we never upload them.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from './paths.js';

export type IntegrationProvider =
  | 'hubspot'
  | 'attio'
  | 'salesforce'
  | 'gong'
  | 'unipile'
  | 'slack'
  | 'gmail'
  | 'feishu'
  | 'metabase'
  | 'supabase'
  | 'calcom'
  | 'discord'
  | 'telegram'
  | 'notion'
  | 'linear'
  | 'github'
  | 'stripe'
  | 'apify'
  | 'amazon_ses';

export const PROVIDERS: IntegrationProvider[] = [
  'hubspot', 'attio', 'salesforce', 'gong', 'unipile', 'slack', 'gmail',
  'feishu', 'metabase', 'supabase',
  'calcom', 'discord', 'telegram', 'notion', 'linear', 'github', 'stripe',
  'apify', 'amazon_ses',
];

export interface IntegrationRecord {
  status: 'connected' | 'disconnected';
  connectedAs?: string | null;
  connectedAt?: string | null;
  credentials?: Record<string, string>;  // never sent to the UI; daemon-internal
}

type Store = Partial<Record<IntegrationProvider, IntegrationRecord>>;

const FILE = () => path.join(getVaultRoot(), '.bm', 'integrations.json');

async function load(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(FILE(), 'utf-8')) as Store;
  } catch {
    return {};
  }
}

async function save(store: Store): Promise<void> {
  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  await fs.writeFile(FILE(), JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

export async function listIntegrations() {
  const store = await load();
  return PROVIDERS.map((p) => {
    const r = store[p];
    return {
      provider: p,
      status: r?.status ?? 'disconnected',
      connectedAs: r?.connectedAs ?? null,
      connectedAt: r?.connectedAt ?? null,
    };
  });
}

export async function saveIntegration(
  provider: IntegrationProvider,
  credentials: Record<string, string>,
): Promise<void> {
  if (!PROVIDERS.includes(provider)) throw new Error(`unknown provider: ${provider}`);
  const store = await load();
  const connectedAs =
    credentials.email ?? credentials.workspace ?? credentials.account ?? null;
  store[provider] = {
    status: 'connected',
    connectedAs,
    connectedAt: new Date().toISOString(),
    credentials,
  };
  await save(store);
}

export async function deleteIntegration(provider: IntegrationProvider): Promise<void> {
  const store = await load();
  delete store[provider];
  await save(store);
}

export async function readCredentials(
  provider: IntegrationProvider,
): Promise<Record<string, string> | null> {
  const store = await load();
  return store[provider]?.credentials ?? null;
}

// OAuth start URLs. V1: each provider's native OAuth app URL with a
// redirect-back to the local daemon. For providers where we don't yet have
// a registered OAuth app, return a marker URL the renderer can show a
// "Paste token instead" hint for.
export function oauthStartUrl(
  provider: IntegrationProvider,
  daemonPort: number,
  localToken: string,
  billingUrl: string,
): { browserUrl: string; supported: boolean } {
  const returnUrl = `http://127.0.0.1:${daemonPort}/integrations/${provider}/callback?token=${encodeURIComponent(localToken)}`;
  // Blackmagic.run hosts the per-provider auth page; it'll bounce the user
  // into the real OAuth flow once apps are registered.
  const browserUrl = `${billingUrl.replace(/\/+$/, '')}/oauth/${provider}?return=${encodeURIComponent(returnUrl)}`;
  return { browserUrl, supported: true };
}
