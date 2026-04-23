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
  | 'pipedrive'
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
  | 'amazon_ses'
  | 'gsc'
  | 'google_analytics'
  | 'ghost'
  | 'wordpress'
  | 'rb2b'
  | 'hypereal'
  | 'google_calendar';

export const PROVIDERS: IntegrationProvider[] = [
  'hubspot', 'attio', 'salesforce', 'pipedrive', 'gong', 'unipile', 'slack', 'gmail',
  'google_calendar',
  'feishu', 'metabase', 'supabase',
  'calcom', 'discord', 'telegram', 'notion', 'linear', 'github', 'stripe',
  'apify', 'amazon_ses',
  'gsc', 'google_analytics', 'ghost', 'wordpress', 'rb2b', 'hypereal',
];

export interface IntegrationRecord {
  status: 'connected' | 'disconnected';
  connectedAs?: string | null;
  connectedAt?: string | null;
  credentials?: Record<string, string>;  // never sent to the UI; daemon-internal
}

type Store = Partial<Record<IntegrationProvider, IntegrationRecord>>;

const FILE = () => path.join(getVaultRoot(), '.bm', 'integrations.json');
const ENV_FILE = () => path.join(getVaultRoot(), '.env');

async function load(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(FILE(), 'utf-8')) as Store;
  } catch {
    return {};
  }
}

// Per-provider mapping from credential field → environment variable.
// Skills + scripts inside the vault `load_dotenv()` and reach for these
// names. Only BYOK (bring-your-own-key) integrations are mirrored here —
// LLM credits live in `config.toml` and never touch `.env`, so skills
// can't accidentally use the user's `ck_` token to bypass billing.
const ENV_MAPPING: Record<IntegrationProvider, Record<string, string>> = {
  apify:        { token: 'APIFY_API_TOKEN' },
  amazon_ses:   {
    access_key_id:     'AWS_ACCESS_KEY_ID',
    secret_access_key: 'AWS_SECRET_ACCESS_KEY',
    region:            'AWS_REGION',
    from:              'SES_FROM',
  },
  feishu:       { token: 'FEISHU_WEBHOOK', endpoint: 'FEISHU_WEBHOOK' },
  hubspot:      { token: 'HUBSPOT_API_KEY' },
  attio:        { token: 'ATTIO_API_KEY', endpoint: 'ATTIO_BASE_URL' },
  salesforce:   { token: 'SALESFORCE_ACCESS_TOKEN', endpoint: 'SALESFORCE_INSTANCE_URL' },
  pipedrive:    { token: 'PIPEDRIVE_API_KEY', endpoint: 'PIPEDRIVE_DOMAIN' },
  gong:         { token: 'GONG_ACCESS_KEY' },
  unipile:      { token: 'UNIPILE_API_KEY', endpoint: 'UNIPILE_BASE_URL' },
  slack:        { token: 'SLACK_BOT_TOKEN' },
  // Gmail — user OAuth via blackmagic.engineering proxy. Daemon receives
  // access_token (+ optional refresh_token) and uses them to hit the
  // Gmail REST API for listing/reading/sending messages. Scopes:
  // https://www.googleapis.com/auth/gmail.modify (read + send, no
  // permanent delete). Legacy `token` field kept as alias for
  // backwards-compat with older saved creds.
  gmail:        {
    access_token:  'GMAIL_ACCESS_TOKEN',
    refresh_token: 'GMAIL_REFRESH_TOKEN',
    token:         'GMAIL_OAUTH_TOKEN',
    email:         'GMAIL_ADDRESS',
  },
  metabase:     { token: 'METABASE_API_KEY', endpoint: 'METABASE_BASE_URL' },
  supabase:     { token: 'SUPABASE_SERVICE_ROLE_KEY', endpoint: 'SUPABASE_URL' },
  calcom:       { token: 'CALCOM_API_KEY' },
  discord:      { token: 'DISCORD_BOT_TOKEN', endpoint: 'DISCORD_WEBHOOK' },
  telegram:     { token: 'TELEGRAM_BOT_TOKEN' },
  notion:       { token: 'NOTION_API_KEY' },
  linear:       { token: 'LINEAR_API_KEY' },
  github:       { token: 'GITHUB_TOKEN' },
  stripe:       { token: 'STRIPE_RESTRICTED_KEY' },
  // Google Search Console — user pastes a service-account JSON as
  // `service_account_json` (the whole blob) plus the `site_url` they
  // own in GSC (e.g. "sc-domain:example.com" or "https://example.com/").
  gsc:          { service_account_json: 'GSC_SERVICE_ACCOUNT_JSON', site_url: 'GSC_SITE_URL' },
  // Google Analytics 4 — service-account JSON + the numeric GA4
  // Property ID (not the "G-XXXX" measurement ID). The service account
  // needs Viewer access on the property; grant it in Admin → Property
  // Access Management.
  google_analytics: {
    service_account_json: 'GA_SERVICE_ACCOUNT_JSON',
    property_id:          'GA_PROPERTY_ID',
  },
  // Ghost — Admin API key (format "<id>:<secret>") + Admin API URL.
  ghost:        { token: 'GHOST_ADMIN_API_KEY', endpoint: 'GHOST_ADMIN_API_URL' },
  // WordPress — application-password auth (user:app_password) + site URL.
  wordpress:    { token: 'WORDPRESS_APP_PASSWORD', endpoint: 'WORDPRESS_SITE_URL' },
  rb2b:         { token: 'RB2B_API_KEY' },
  // Hypereal — image/video generation cloud (NeoLab's hypereal.cloud).
  // Users paste the `sk_live_…` API key from hypereal.cloud/dashboard/keys.
  hypereal:     { token: 'HYPEREAL_API_KEY', endpoint: 'HYPEREAL_BASE_URL' },
  // Google Calendar — user OAuth via blackmagic.engineering proxy. Daemon
  // receives access_token (+ optional refresh_token, expiry). Scopes:
  // https://www.googleapis.com/auth/calendar (read + write events).
  google_calendar: {
    access_token:  'GOOGLE_CALENDAR_ACCESS_TOKEN',
    refresh_token: 'GOOGLE_CALENDAR_REFRESH_TOKEN',
    calendar_id:   'GOOGLE_CALENDAR_ID',
  },
};

const ENV_HEADER = `# AUTO-GENERATED by BlackMagic AI from .bm/integrations.json — do not edit by hand.
# This file mirrors your BYOK (bring-your-own-key) integrations as plain
# KEY=value pairs so skills + scripts can \`load_dotenv()\` them. LLM
# billing keys live in .bm/config.toml and are never written here.
`;

function escapeEnvValue(v: string): string {
  // Wrap in double quotes if value has whitespace/special chars; escape
  // backslashes and double quotes inside the quoted form.
  if (/^[A-Za-z0-9_./:@\-+=]+$/.test(v)) return v;
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function writeEnvMirror(store: Store): Promise<void> {
  const lines: string[] = [ENV_HEADER];
  // Stable provider order = PROVIDERS array order, so diffs stay clean.
  for (const provider of PROVIDERS) {
    const rec = store[provider];
    const creds = rec?.credentials;
    if (!creds || rec.status !== 'connected') continue;
    const mapping = ENV_MAPPING[provider];
    if (!mapping) continue;
    const block: string[] = [];
    for (const [credField, envKey] of Object.entries(mapping)) {
      const v = creds[credField];
      if (!v) continue;
      block.push(`${envKey}=${escapeEnvValue(String(v))}`);
    }
    if (block.length > 0) {
      lines.push(`# ── ${provider} ─────────────────────────────────────────────`);
      lines.push(...block);
      lines.push('');
    }
  }
  await fs.mkdir(path.dirname(ENV_FILE()), { recursive: true });
  await fs.writeFile(ENV_FILE(), lines.join('\n'), 'utf-8');
}

async function save(store: Store): Promise<void> {
  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  await fs.writeFile(FILE(), JSON.stringify(store, null, 2) + '\n', 'utf-8');
  await writeEnvMirror(store);
}

/** Re-emit the .env mirror from the current integrations.json. Called
 *  on daemon startup so users who upgrade past this version get their
 *  pre-existing integrations exposed via .env without having to
 *  re-paste anything. */
export async function regenerateEnvMirror(): Promise<void> {
  await writeEnvMirror(await load());
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
