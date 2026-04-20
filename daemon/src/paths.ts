import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import toml from 'toml';

export interface Config {
  vault_path: string;
  default_model: string;
  zenn_base_url: string;
  zenn_api_key?: string;
  billing_url?: string;
  daemon_port?: number;
  apify_api_key?: string;
  enrichlayer_api_key?: string;
  hubspot_api_key?: string;
  slack_webhook_url?: string;
  resend_api_key?: string;
  from_email?: string;
  linkedin_cookie?: string;
}

function defaultVault(): string {
  return process.env.BM_VAULT_PATH ?? path.join(os.homedir(), 'BlackMagic');
}

// Root of the "home" vault (the folder that contains the projects registry).
// This never changes — the registry lives here, even after switching to a
// different project vault.
export function homeVault(): string {
  return defaultVault();
}

// Active vault. Mutable — the projects registry module updates this when the
// user activates a different project. Every runtime code path reads live via
// getVaultRoot() / ensureInsideVault().
let activeVault: string = defaultVault();

export function getVaultRoot(): string {
  return activeVault;
}

export function setVaultRoot(p: string) {
  activeVault = p;
}

export function loadConfig(): Config {
  const vault = getVaultRoot();
  const configPath = path.join(vault, '.bm', 'config.toml');

  // Daemon talks to our API proxy. The proxy holds the upstream keys and
  // never exposes them. Client only auths with its own ck_.
  //
  // Two URLs:
  //   billing_url    — blackmagic.run (dashboard, /auth/cli, /api/token-events, /api/sync/*)
  //   zenn_base_url  — api.blackmagic.run/api/v1 (OpenAI-shape proxy: /responses etc.)
  //                    Codex appends /responses to whatever this is. Do not include trailing slash.
  // In dev both resolve to localhost:3001.
  const billingUrl = process.env.BM_BILLING_URL ?? 'https://blackmagic.run';
  const apiUrl = process.env.BM_API_URL ?? billingUrl.replace('blackmagic.run', 'api.blackmagic.run');
  const defaultZennBase = `${apiUrl.replace(/\/+$/, '')}/v1`;
  const base: Config = {
    vault_path: vault,
    default_model: process.env.BM_DEFAULT_MODEL ?? 'gpt-5.4',
    zenn_base_url: process.env.ZENN_BASE_URL ?? defaultZennBase,
    zenn_api_key: process.env.ZENN_API_KEY,
    billing_url: billingUrl,
    daemon_port: process.env.BM_DAEMON_PORT ? Number(process.env.BM_DAEMON_PORT) : undefined,
    apify_api_key: process.env.APIFY_API_KEY,
    enrichlayer_api_key: process.env.ENRICHLAYER_API_KEY,
    hubspot_api_key: process.env.HUBSPOT_API_KEY,
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

// Legacy alias. Prefer getVaultRoot() — this only reflects the vault at
// module-load time and will not track project switches.
export const VAULT_ROOT = defaultVault();

export function ensureInsideVault(p: string) {
  const root = getVaultRoot();
  const abs = path.resolve(root, p);
  if (!abs.startsWith(path.resolve(root))) {
    throw new Error(`path escapes vault: ${p}`);
  }
  return abs;
}
