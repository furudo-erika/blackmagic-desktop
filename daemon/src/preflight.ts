// Pre-flight readiness checks. Runs BEFORE an agent/skill starts so the
// UI can ask the user to paste missing keys / fill missing us/* files /
// install missing CLI tools instead of letting the agent spawn, reach a
// "if X not set, stop" check inside the prompt, and bail halfway through
// with a cryptic "(failed)".
//
// Source of truth: each agent/skill .md's frontmatter.
//
//   requires:
//     integrations: [apify, amazon_ses]
//     us_files:    [us/market/competitors.md]
//     cli:         [apidog-cli]
//     optional_integrations: [feishu, slack, discord, telegram]
//
// All four lists are optional; anything absent = "no requirement of
// that kind". An agent/skill with no requires field returns ready=true.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import matter from 'gray-matter';
import { getVaultRoot } from './paths.js';

export interface MissingIntegration {
  kind: 'integration';
  provider: string;
  label: string;
  hint: string;
}
export interface MissingFile {
  kind: 'us_file';
  path: string;
  hint: string;
  exists: boolean;
  isSeed: boolean;
}
export interface MissingCli {
  kind: 'cli';
  name: string;
  install: string;
}

export interface PreflightInput {
  name: string;
  required: boolean;
  description?: string;
  enum?: string[];
  default?: unknown;
}

export interface PreflightResult {
  ready: boolean;
  missing: {
    integrations: MissingIntegration[];
    us_files: MissingFile[];
    cli: MissingCli[];
  };
  optional_integrations: MissingIntegration[];
  inputs: PreflightInput[];
  optional_inputs: PreflightInput[];
}

const INTEGRATION_LABELS: Record<string, string> = {
  apify: 'Apify',
  amazon_ses: 'Amazon SES',
  feishu: 'Feishu',
  slack: 'Slack',
  discord: 'Discord',
  telegram: 'Telegram',
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
  pipedrive: 'Pipedrive',
  attio: 'Attio',
  gmail: 'Gmail',
  notion: 'Notion',
  linear: 'Linear',
  github: 'GitHub',
  stripe: 'Stripe',
  calcom: 'Cal.com',
  unipile: 'Unipile',
  gsc: 'Google Search Console',
  google_analytics: 'Google Analytics',
  ghost: 'Ghost',
  wordpress: 'WordPress',
  rb2b: 'RB2B',
  metabase: 'Metabase',
  supabase: 'Supabase',
  gong: 'Gong',
};

async function loadIntegrations(): Promise<Record<string, any>> {
  try {
    const raw = await fs.readFile(path.join(getVaultRoot(), '.bm', 'integrations.json'), 'utf-8');
    return JSON.parse(raw);
  } catch { return {}; }
}

function isConnected(store: Record<string, any>, provider: string): boolean {
  const rec = store[provider];
  return Boolean(rec && rec.status === 'connected' && rec.credentials);
}

async function fileExistsAndFilled(rel: string): Promise<{ exists: boolean; isSeed: boolean }> {
  const full = path.join(getVaultRoot(), rel);
  try {
    const stat = await fs.stat(full);
    if (!stat.isFile()) return { exists: false, isSeed: false };
    const body = await fs.readFile(full, 'utf-8');
    // "Seed template" heuristic: frontmatter revision with no body content,
    // or placeholder markers like TODO / <your-company-here>.
    const parsed = matter(body);
    const content = parsed.content.trim();
    const seedMarkers = [
      /TODO/,
      /<your[^>]*>/i,
      /REPLACE[_-]?ME/i,
      /placeholder/i,
      /replace this with your own/i,
      /one paragraph about us/i,
      /paste your real content/i,
    ];
    const isSeed = content.length < 40 || seedMarkers.some((re) => re.test(content));
    return { exists: true, isSeed };
  } catch {
    return { exists: false, isSeed: false };
  }
}

async function cliAvailable(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', [name], { stdio: 'ignore' });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

function cliInstallHint(name: string): string {
  const npm = ['apidog-cli', 'apify-cli', 'vercel', 'wrangler'];
  if (npm.includes(name)) return `npm install -g ${name}`;
  return `install "${name}" and make sure it's on your PATH`;
}

export interface ResourceDef { path: string; kind: 'agent' | 'skill' }

export async function resolveResource(kind: 'agent' | 'skill', slug: string): Promise<string | null> {
  const dirs = kind === 'agent' ? ['agents'] : ['playbooks', 'skills'];
  for (const dir of dirs) {
    const p = path.join(getVaultRoot(), dir, `${slug}.md`);
    if (fsSync.existsSync(p)) return p;
  }
  return null;
}

export async function preflight(kind: 'agent' | 'skill', slug: string): Promise<PreflightResult & { error?: string }> {
  const rp = await resolveResource(kind, slug);
  const empty: PreflightResult = {
    ready: true,
    missing: { integrations: [], us_files: [], cli: [] },
    optional_integrations: [],
    inputs: [],
    optional_inputs: [],
  };
  if (!rp) {
    return { ...empty, ready: false, error: `${kind} "${slug}" not found` };
  }
  const raw = await fs.readFile(rp, 'utf-8');
  const fm = matter(raw).data as any;
  const req = (fm?.requires ?? {}) as any;

  const store = await loadIntegrations();

  // Integrations
  const missingInts: MissingIntegration[] = [];
  for (const p of (Array.isArray(req.integrations) ? req.integrations : [])) {
    if (!isConnected(store, p)) {
      missingInts.push({
        kind: 'integration',
        provider: p,
        label: INTEGRATION_LABELS[p] ?? p,
        hint: `Open sidebar → Integrations → ${INTEGRATION_LABELS[p] ?? p}, paste your key.`,
      });
    }
  }

  // Optional integrations — surfaced but don't block
  const optInts: MissingIntegration[] = [];
  for (const p of (Array.isArray(req.optional_integrations) ? req.optional_integrations : [])) {
    if (!isConnected(store, p)) {
      optInts.push({
        kind: 'integration',
        provider: p,
        label: INTEGRATION_LABELS[p] ?? p,
        hint: `Optional. Connect via sidebar → Integrations → ${INTEGRATION_LABELS[p] ?? p} to unlock ${slug}'s extra capabilities.`,
      });
    }
  }

  // us/* files
  const missingFiles: MissingFile[] = [];
  for (const rel of (Array.isArray(req.us_files) ? req.us_files : [])) {
    const r = await fileExistsAndFilled(String(rel));
    if (!r.exists || r.isSeed) {
      missingFiles.push({
        kind: 'us_file',
        path: String(rel),
        hint: r.exists
          ? 'File exists but looks like the seed template — paste your real content.'
          : 'File is missing — create it with your content.',
        exists: r.exists,
        isSeed: r.isSeed,
      });
    }
  }

  // CLI tools
  const missingCli: MissingCli[] = [];
  for (const name of (Array.isArray(req.cli) ? req.cli : [])) {
    const ok = await cliAvailable(String(name));
    if (!ok) missingCli.push({ kind: 'cli', name: String(name), install: cliInstallHint(String(name)) });
  }

  // Inputs (not a readiness gate — these are per-run parameters the UI
  // should render as a form). Split into required + optional.
  const inputsSrc: any[] = Array.isArray(fm?.inputs) ? fm.inputs : [];
  const inputs: PreflightInput[] = [];
  const optInputs: PreflightInput[] = [];
  for (const i of inputsSrc) {
    const def: PreflightInput = {
      name: String(i?.name ?? ''),
      required: i?.required === true,
      description: typeof i?.description === 'string' ? i.description : undefined,
      enum: Array.isArray(i?.enum) ? i.enum.map(String) : undefined,
      default: i?.default,
    };
    if (!def.name) continue;
    (def.required ? inputs : optInputs).push(def);
  }

  const ready = missingInts.length === 0 && missingFiles.length === 0 && missingCli.length === 0;
  return {
    ready,
    missing: { integrations: missingInts, us_files: missingFiles, cli: missingCli },
    optional_integrations: optInts,
    inputs,
    optional_inputs: optInputs,
  };
}
