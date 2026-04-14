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
}

function defaultVault(): string {
  return process.env.BM_VAULT_PATH ?? path.join(os.homedir(), 'BlackMagic');
}

export function loadConfig(): Config {
  const vault = defaultVault();
  const configPath = path.join(vault, '.bm', 'config.toml');

  const base: Config = {
    vault_path: vault,
    default_model: process.env.BM_DEFAULT_MODEL ?? 'gpt-5.3-codex',
    zenn_base_url: process.env.ZENN_BASE_URL ?? 'https://zenn.engineering/api/v1',
    zenn_api_key: process.env.ZENN_API_KEY,
    billing_url: process.env.BM_BILLING_URL,
    daemon_port: process.env.BM_DAEMON_PORT ? Number(process.env.BM_DAEMON_PORT) : undefined,
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

export const VAULT_ROOT = defaultVault();

export function ensureInsideVault(p: string) {
  const abs = path.resolve(VAULT_ROOT, p);
  if (!abs.startsWith(path.resolve(VAULT_ROOT))) {
    throw new Error(`path escapes vault: ${p}`);
  }
  return abs;
}
