import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import toml from 'toml';

export interface Config {
  context_path: string;
  default_model: string;
  zenn_base_url: string;
  zenn_api_key?: string;
  billing_url?: string;
  daemon_port?: number;
  apify_api_key?: string;
  hubspot_api_key?: string;
  apollo_api_key?: string;
  attio_api_key?: string;
  // Salesforce. OAuth2 bearer token (access_token from a Connected App)
  // plus the instance URL returned by the token endpoint
  // (e.g. https://acme.my.salesforce.com). API v59.0 is the baseline.
  salesforce_access_token?: string;
  salesforce_instance_url?: string;
  // Pipedrive. api_token + workspace domain
  // (https://<domain>.pipedrive.com/api/v1). Token auth via query string
  // is still Pipedrive's canonical pattern.
  pipedrive_api_key?: string;
  pipedrive_domain?: string;
  // Feishu (Lark). Tenant access comes from app_id + app_secret — the daemon
  // exchanges them for a tenant_access_token on demand. A separate
  // feishu_webhook_url supports the simple "notify this group chat" path.
  feishu_app_id?: string;
  feishu_app_secret?: string;
  feishu_webhook_url?: string;
  // Metabase. Either an API key (preferred, session-less) or username +
  // password. Base URL always required.
  metabase_site_url?: string;
  metabase_api_key?: string;
  // Supabase. service_role key gives full DB access via PostgREST.
  supabase_url?: string;
  supabase_service_role_key?: string;
  slack_webhook_url?: string;
  resend_api_key?: string;
  from_email?: string;
  linkedin_cookie?: string;
  notifications_enabled?: boolean;
  notify_agent_started?: boolean;
  notify_agent_completed?: boolean;
  notify_trigger_fired?: boolean;
  notify_trigger_completed?: boolean;
}

function defaultContext(): string {
  return process.env.BM_CONTEXT_PATH ?? path.join(os.homedir(), 'BlackMagic');
}

// Root of the "home" context (the folder that contains the projects registry).
// This never changes — the registry lives here, even after switching to a
// different project context.
export function homeContext(): string {
  return defaultContext();
}

// Active context. Mutable — the projects registry module updates this when the
// user activates a different project. Every runtime code path reads live via
// getContextRoot() / ensureInsideContext().
let activeContext: string = defaultContext();

export function getContextRoot(): string {
  return activeContext;
}

export function setContextRoot(p: string) {
  activeContext = p;
}

export function loadConfig(): Config {
  const context = getContextRoot();
  const configPath = path.join(context, '.bm', 'config.toml');

  // Daemon talks to our API proxy. The proxy holds the upstream keys and
  // never exposes them. Client only auths with its own ck_.
  //
  // Two URLs:
  //   billing_url    — blackmagic.engineering (dashboard, /auth/cli, /api/token-events, /api/sync/*)
  //   zenn_base_url  — api.blackmagic.engineering/api/v1 (OpenAI-shape proxy: /responses etc.)
  //                    Codex appends /responses to whatever this is. Do not include trailing slash.
  // In dev both resolve to localhost:3001.
  const billingUrl = process.env.BM_BILLING_URL ?? 'https://blackmagic.engineering';
  const apiUrl = process.env.BM_API_URL ?? billingUrl.replace('blackmagic.engineering', 'api.blackmagic.engineering');
  const defaultZennBase = `${apiUrl.replace(/\/+$/, '')}/v1`;
  const base: Config = {
    context_path: context,
    default_model: process.env.BM_DEFAULT_MODEL ?? 'gpt-5.5',
    zenn_base_url: process.env.ZENN_BASE_URL ?? defaultZennBase,
    zenn_api_key: process.env.ZENN_API_KEY,
    billing_url: billingUrl,
    daemon_port: process.env.BM_DAEMON_PORT ? Number(process.env.BM_DAEMON_PORT) : undefined,
    apify_api_key: process.env.APIFY_API_KEY,
    hubspot_api_key: process.env.HUBSPOT_API_KEY,
    apollo_api_key: process.env.APOLLO_API_KEY,
    attio_api_key: process.env.ATTIO_API_KEY,
    salesforce_access_token: process.env.SALESFORCE_ACCESS_TOKEN,
    salesforce_instance_url: process.env.SALESFORCE_INSTANCE_URL,
    pipedrive_api_key: process.env.PIPEDRIVE_API_KEY,
    pipedrive_domain: process.env.PIPEDRIVE_DOMAIN,
    feishu_app_id: process.env.FEISHU_APP_ID,
    feishu_app_secret: process.env.FEISHU_APP_SECRET,
    feishu_webhook_url: process.env.FEISHU_WEBHOOK_URL,
    metabase_site_url: process.env.METABASE_SITE_URL,
    metabase_api_key: process.env.METABASE_API_KEY,
    supabase_url: process.env.SUPABASE_URL,
    supabase_service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    slack_webhook_url: process.env.SLACK_WEBHOOK_URL,
    resend_api_key: process.env.RESEND_API_KEY,
    from_email: process.env.BM_FROM_EMAIL,
    linkedin_cookie: process.env.LINKEDIN_COOKIE,
  };

  if (fs.existsSync(configPath)) {
    try {
      const parsed = toml.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<Config>;
      return { ...base, ...parsed };
    } catch (err) {
      console.error('[config] failed to parse .bm/config.toml:', err);
    }
  }

  return base;
}

// Legacy alias. Prefer getContextRoot() — this only reflects the context at
// module-load time and will not track project switches.
export const CONTEXT_ROOT = defaultContext();

export function ensureInsideContext(p: string) {
  const root = getContextRoot();
  const abs = path.resolve(root, p);
  if (!abs.startsWith(path.resolve(root))) {
    throw new Error(`path escapes context: ${p}`);
  }
  return abs;
}
