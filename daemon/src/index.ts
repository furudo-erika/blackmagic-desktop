import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { loadConfig, getVaultRoot, homeVault } from './paths.js';
import {
  initProjectsRegistry,
  getRegistry,
  addProject,
  activateProject,
  deleteProject,
} from './projects.js';
import { ensureVault, readVaultFile, writeVaultFile, walkTree, installPresetTriggers } from './vault.js';
import { findBacklinks } from './wikilinks.js';
import { BUILTIN_TOOLS, allTools } from './tools.js';
import { runAgent } from './agent.js';
import { listPlaybooks, runPlaybook } from './playbooks.js';
import { triggerList, fireTrigger, loadCronTriggers } from './triggers.js';
import { listSequences, listEnrollments, enrollContact, stopEnrollment } from './sequences.js';
import { startSequenceCron, walkSequencesOnce } from './sequence-cron.js';
import { listDrafts, approveDraft, rejectDraft } from './drafts.js';
import { mcpServerList, McpRegistry } from './mcp.js';
import { buildOntology } from './ontology.js';
import { pushTriggers, pushDrafts } from './sync.js';
import { runCodex, codexAvailable, CodexNotInstalled } from './codex.js';
import { seedAcmeDemo } from './us-demo.js';
import {
  PROVIDERS,
  listIntegrations,
  saveIntegration,
  deleteIntegration,
  oauthStartUrl,
  type IntegrationProvider,
} from './integrations.js';

const LOCAL_TOKEN = process.env.BM_LOCAL_TOKEN ?? crypto.randomBytes(24).toString('base64url');

// Pending OAuth states are persisted to disk so a daemon restart between
// "click sign in" and "browser hits callback" doesn't invalidate the
// handshake. Entries expire after 10 minutes.
const OAUTH_TTL_MS = 10 * 60 * 1000;
const pendingOAuthStates = new Map<string, number>();

function oauthStatesPath() {
  return path.join(
    process.env.BM_VAULT_PATH ?? path.join(require('node:os').homedir(), 'BlackMagic'),
    '.bm',
    'oauth-states.json',
  );
}

async function loadOAuthStates() {
  try {
    const raw = await fs.readFile(oauthStatesPath(), 'utf-8');
    const obj = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    for (const [k, t] of Object.entries(obj)) {
      if (now - t < OAUTH_TTL_MS) pendingOAuthStates.set(k, t);
    }
  } catch {
    // no file yet — fine
  }
}

async function saveOAuthStates() {
  try {
    await fs.mkdir(path.dirname(oauthStatesPath()), { recursive: true });
    await fs.writeFile(
      oauthStatesPath(),
      JSON.stringify(Object.fromEntries(pendingOAuthStates)),
      'utf-8',
    );
  } catch (err) {
    console.error('[oauth] could not persist states:', err);
  }
}

function issueOAuthState(): string {
  const s = crypto.randomBytes(16).toString('base64url');
  pendingOAuthStates.set(s, Date.now());
  saveOAuthStates().catch(() => {});
  return s;
}

function consumeOAuthState(s: string): boolean {
  const t = pendingOAuthStates.get(s);
  if (!t) {
    console.warn(`[oauth] state not found: ${s.slice(0, 8)}… (have ${pendingOAuthStates.size} pending)`);
    return false;
  }
  pendingOAuthStates.delete(s);
  saveOAuthStates().catch(() => {});
  const fresh = Date.now() - t < OAUTH_TTL_MS;
  if (!fresh) console.warn(`[oauth] state expired: ${s.slice(0, 8)}…`);
  return fresh;
}

async function pickPort(preferred?: number): Promise<number> {
  if (preferred) return preferred;
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (typeof addr === 'object' && addr) {
        const p = addr.port;
        srv.close(() => res(p));
      } else {
        srv.close(() => rej(new Error('no port')));
      }
    });
  });
}

async function main() {
  // Initialise project registry first so getVaultRoot() reflects the active
  // project before anything else reads it.
  await initProjectsRegistry();
  const config = loadConfig();
  await ensureVault();
  await loadOAuthStates();
  await McpRegistry.start().catch((err) => console.error('[mcp] registry start failed:', err));

  const shutdown = (sig: string) => {
    console.log(`[daemon] ${sig} received, shutting down`);
    try { McpRegistry.stop(); } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  const app = new Hono();
  app.use('*', cors({ origin: (o) => o ?? '*', credentials: false }));

  // Local auth middleware. Webhooks + /auth/callback use their own auth.
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/health' || c.req.path === '/api/auth/start') return next();
    const auth = c.req.header('authorization') ?? '';
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== LOCAL_TOKEN) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    return next();
  });

  // OAuth-like handshake: renderer calls /api/auth/start to mint a state and
  // get the browser URL to open. User signs in on blackmagic.run and gets
  // redirected to /auth/callback?token=ck_...&state=... — callback persists
  // the key to config.toml and shows a success page.
  app.get('/api/auth/start', (c) => {
    const state = issueOAuthState();
    const billingUrl = (config.billing_url ?? 'https://blackmagic.run').replace(/\/+$/, '');
    // blackmagic-ai already has /auth/cli that handles login + authorize +
    // redirect-to-callback. We embed our state into the callback URL so the
    // site echoes it back untouched.
    const callback = `http://127.0.0.1:${port}/auth/callback?state=${encodeURIComponent(state)}`;
    const browserUrl = `${billingUrl}/auth/cli?callback=${encodeURIComponent(callback)}`;
    return c.json({ browserUrl, state });
  });

  function callbackPage(title: string, body: string, ok: boolean) {
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;background:#FBFAF8;color:#1A1614;padding:48px 32px;display:flex;flex-direction:column;align-items:center;gap:16px}
  h1{font-size:22px;margin:0}
  p{color:#605A57;font-size:14px;max-width:420px;text-align:center}
  .accent{color:${ok ? '#37322F' : '#E8523A'};font-size:40px}
</style></head><body>
<div class="accent">${ok ? '◉' : '◉'}</div>
<h1>${title}</h1>
<p>${body}</p>
</body></html>`;
  }

  app.get('/auth/callback', async (c) => {
    const token = (c.req.query('token') ?? '').trim();
    const state = (c.req.query('state') ?? '').trim();
    console.log(
      `[oauth] /auth/callback hit  state=${state.slice(0, 8)}…  token=${token ? token.slice(0, 8) + '…' : '(missing)'}`,
    );
    if (!token.startsWith('ck_') || token.length < 10) {
      return c.html(callbackPage('Invalid key', 'The key returned by blackmagic.run was malformed.', false), 400);
    }
    if (!consumeOAuthState(state)) {
      return c.html(
        callbackPage(
          'Expired or unknown state',
          'This sign-in link was minted by a different daemon session. Close this tab, return to the app, and click "Sign in" again.',
          false,
        ),
        400,
      );
    }
    const cfgDir = path.join(getVaultRoot(), '.bm');
    await fs.mkdir(cfgDir, { recursive: true });
    const cfgPath = path.join(cfgDir, 'config.toml');
    let existing = '';
    try { existing = await fs.readFile(cfgPath, 'utf-8'); } catch {}
    const lines = existing.split('\n').filter((l) => !l.match(/^\s*zenn_api_key\s*=/));
    lines.push(`zenn_api_key = "${token.replace(/"/g, '\\"')}"`);
    await fs.writeFile(cfgPath, lines.join('\n').trim() + '\n', 'utf-8');
    config.zenn_api_key = token;

    // Belt-and-suspenders: 302 the browser back to the public site's
    // "signed in" page. The user's browser tab ends up on blackmagic.run,
    // not on 127.0.0.1 — less jarring, zero security cost (the key is
    // already in config.toml before we redirect).
    const billing = (config.billing_url ?? 'https://blackmagic.run').replace(/\/+$/, '');
    return c.redirect(`${billing}/auth/cli/done`, 302);
  });

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      version: '0.1.0',
      vaultPath: getVaultRoot(),
      model: config.default_model,
      zennConfigured: Boolean(config.zenn_api_key),
      engine: codexReady ? 'codex-cli' : 'builtin',
      localToken: LOCAL_TOKEN,
    }),
  );

  app.post('/api/config/api-key', async (c) => {
    const body = await c.req.json<{ key?: string }>();
    const key = (body.key ?? '').trim();
    if (!key.startsWith('ck_') || key.length < 10) {
      return c.json({ error: 'invalid api key format' }, 400);
    }
    const cfgDir = path.join(getVaultRoot(), '.bm');
    await fs.mkdir(cfgDir, { recursive: true });
    const cfgPath = path.join(cfgDir, 'config.toml');
    let existing = '';
    try { existing = await fs.readFile(cfgPath, 'utf-8'); } catch {}
    const lines = existing.split('\n').filter((l) => !l.match(/^\s*zenn_api_key\s*=/));
    lines.push(`zenn_api_key = "${key.replace(/"/g, '\\"')}"`);
    await fs.writeFile(cfgPath, lines.join('\n').trim() + '\n', 'utf-8');
    config.zenn_api_key = key;
    return c.json({ ok: true });
  });

  // Update per-integration API keys (apify, enrichlayer). Writes into
  // ~/BlackMagic/.bm/config.toml so the daemon picks them up on reload and
  // surfaces them via ctx.config to the builtin tools.
  const INTEGRATION_KEYS = ['apify_api_key', 'enrichlayer_api_key'] as const;
  type IntegrationKey = (typeof INTEGRATION_KEYS)[number];
  app.get('/api/config/integration-keys', (c) =>
    c.json({
      apify_api_key: Boolean(config.apify_api_key),
      enrichlayer_api_key: Boolean(config.enrichlayer_api_key),
    }),
  );
  app.post('/api/config/integration-keys', async (c) => {
    const body = await c.req.json<Partial<Record<IntegrationKey, string>>>();
    const cfgDir = path.join(getVaultRoot(), '.bm');
    await fs.mkdir(cfgDir, { recursive: true });
    const cfgPath = path.join(cfgDir, 'config.toml');
    let existing = '';
    try { existing = await fs.readFile(cfgPath, 'utf-8'); } catch {}
    let lines = existing.split('\n');
    for (const k of INTEGRATION_KEYS) {
      const val = body[k];
      if (val === undefined) continue;
      lines = lines.filter((l) => !new RegExp(`^\\s*${k}\\s*=`).test(l));
      if (val) {
        lines.push(`${k} = "${String(val).replace(/"/g, '\\"')}"`);
        (config as any)[k] = val;
      } else {
        (config as any)[k] = undefined;
      }
    }
    await fs.writeFile(cfgPath, lines.join('\n').trim() + '\n', 'utf-8');
    return c.json({ ok: true });
  });

  app.get('/api/tools', async (c) => {
    const mcpServers = await mcpServerList();
    const mcpTools = allTools().filter((t) => t.name.includes('.'));
    return c.json({
      tools: [
        ...BUILTIN_TOOLS.map((t) => ({ name: t.name, description: t.description, source: 'builtin' })),
        ...mcpTools.map((t) => ({ name: t.name, description: t.description, source: 'mcp' })),
      ],
      servers: mcpServers,
    });
  });

  app.get('/api/ontology', async (c) => c.json(await buildOntology()));

  // Integrations CRUD. Credentials stay in ~/BlackMagic/.bm/integrations.json
  // and never leave the machine.
  app.get('/api/integrations', async (c) =>
    c.json({ integrations: await listIntegrations() }),
  );
  app.put('/api/integrations/:provider', async (c) => {
    const provider = c.req.param('provider') as IntegrationProvider;
    if (!PROVIDERS.includes(provider)) return c.json({ error: 'unknown provider' }, 400);
    const body = await c.req.json<{ credentials?: Record<string, string> }>().catch(() => ({} as any));
    if (
      !body.credentials ||
      Object.values(body.credentials).filter((v) => typeof v === 'string' && v.trim()).length === 0
    ) {
      return c.json({ error: 'credentials required' }, 400);
    }
    await saveIntegration(provider, body.credentials);
    return c.json({ ok: true });
  });
  app.delete('/api/integrations/:provider', async (c) => {
    const provider = c.req.param('provider') as IntegrationProvider;
    if (!PROVIDERS.includes(provider)) return c.json({ error: 'unknown provider' }, 400);
    await deleteIntegration(provider);
    return c.json({ ok: true });
  });
  app.get('/api/integrations/:provider/oauth/start', async (c) => {
    const provider = c.req.param('provider') as IntegrationProvider;
    if (!PROVIDERS.includes(provider)) return c.json({ error: 'unknown provider' }, 400);
    const billing = (config.billing_url ?? 'https://blackmagic.run');
    return c.json(oauthStartUrl(provider, port, LOCAL_TOKEN, billing));
  });
  // Browser-facing OAuth callback — bounce from blackmagic.run returns here.
  app.get('/integrations/:provider/callback', async (c) => {
    const provider = c.req.param('provider') as IntegrationProvider;
    const token = c.req.query('token');
    if (token !== LOCAL_TOKEN) return c.html('<h1>Bad token</h1>', 400);
    if (!PROVIDERS.includes(provider)) return c.html('<h1>Unknown provider</h1>', 400);
    const access = c.req.query('access_token') ?? c.req.query('token_access') ?? '';
    const email = c.req.query('email') ?? undefined;
    const workspace = c.req.query('workspace') ?? undefined;
    if (!access) {
      return c.html('<h1>Missing access_token</h1><p>The OAuth provider did not return a token.</p>', 400);
    }
    const creds: Record<string, string> = { access_token: access };
    if (email) creds.email = email;
    if (workspace) creds.workspace = workspace;
    await saveIntegration(provider, creds);
    return c.html(
      `<!doctype html><html><body style="font-family:-apple-system,sans-serif;padding:48px;text-align:center;background:#FBFAF8"><h1 style="color:#37322F">${provider} connected</h1><p style="color:#605A57">You can close this tab and return to Black Magic.</p></body></html>`,
    );
  });

  // Onboarding state: considered complete once CLAUDE.md has been
  // user-customised (default seed marker is absent).
  app.get('/api/onboarding', async (c) => {
    const claudePath = path.join(getVaultRoot(), 'CLAUDE.md');
    let claude = '';
    try { claude = await fs.readFile(claudePath, 'utf-8'); } catch {}
    const isDefault = claude.includes('_One paragraph: what you sell, to whom._');
    const hasSelfCompany = await fs.access(path.join(getVaultRoot(), 'me.md')).then(() => true).catch(() => false);
    return c.json({ needsOnboarding: isDefault && !hasSelfCompany, claudeDefault: isDefault, hasSelfCompany });
  });

  app.post('/api/onboarding/demo', async (c) => {
    const { written } = await seedAcmeDemo(getVaultRoot());
    return c.json({ ok: true, written, demo: 'acme-cloud' });
  });

  app.post('/api/onboarding/complete', async (c) => {
    const body = await c.req.json<{ domain: string; what_you_sell?: string; icp?: string; tone?: string }>();
    if (!body.domain) return c.json({ error: 'domain required' }, 400);

    // Kick off researcher agent to enrich the user's own company.
    runAgent({
      agent: 'researcher',
      task: `Enrich the user's own company at ${body.domain} and save to me.md (not companies/). Focus: what we sell, target customer, tone. Use enrich_company + web_search.`,
      config,
    }).catch((err) => console.error('[onboarding] enrich failed:', err));

    // Write the user-supplied CLAUDE.md right away so the first chat has
    // some context even before the agent run finishes.
    const claude = [
      '# Black Magic — Your CLAUDE.md',
      '',
      '## Our Company',
      '',
      body.what_you_sell ?? `We operate at ${body.domain}.`,
      '',
      '## ICP',
      '',
      body.icp ?? '- (to be filled in by the onboarding enrichment)',
      '',
      '## Tone',
      '',
      body.tone ?? '- Concise, specific, no marketing jargon',
      '- Forbidden words: "unlock", "revolutionize", "streamline", "leverage", "unleash"',
      '',
      '## Sources of Truth',
      '',
      '- Companies: `companies/`',
      '- Contacts: `contacts/<company-slug>/`',
      '- Deals: `deals/` (open/closed-won/closed-lost)',
      '- About us: `me.md`',
      '',
    ].join('\n');
    await fs.writeFile(path.join(getVaultRoot(), 'CLAUDE.md'), claude, 'utf-8');
    return c.json({ ok: true });
  });

  app.get('/api/playbooks', async (c) => c.json({ playbooks: await listPlaybooks() }));
  app.post('/api/playbooks/:name/run', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json<{ inputs?: Record<string, unknown> }>().catch(() => ({} as any));
    try {
      const result = await runPlaybook(name, body.inputs ?? {}, config);
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/triggers', async (c) => {
    const triggers = await triggerList();
    pushTriggers(config).catch(() => {});
    return c.json({ triggers });
  });
  app.post('/api/triggers/:name/fire', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json<{ input?: Record<string, unknown> }>().catch(() => ({} as any));
    try {
      const result = await fireTrigger(name, config, body.input ?? {});
      pushDrafts(config).catch(() => {});
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  app.post('/api/triggers/reload', async (c) => {
    await loadCronTriggers(config);
    pushTriggers(config).catch(() => {});
    return c.json({ ok: true });
  });

  // Install the brand-monitor preset trigger bundle. Idempotent — files
  // that already exist (including user-disabled ones) are left alone.
  // After writing, we reload the cron scheduler so newly-installed
  // triggers start firing without a daemon restart.
  app.post('/api/triggers/install-presets', async (c) => {
    try {
      const result = await installPresetTriggers();
      await loadCronTriggers(config);
      pushTriggers(config).catch(() => {});
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Sequences — multi-touch drip outreach. The list endpoint joins each
  // sequence with the count of currently-enrolled contacts so the UI can
  // render one row per sequence.
  app.get('/api/sequences', async (c) => {
    const [sequences, enrollments] = await Promise.all([listSequences(), listEnrollments()]);
    const counts = new Map<string, { active: number; complete: number; total: number }>();
    for (const e of enrollments) {
      const b = counts.get(e.sequencePath) ?? { active: 0, complete: 0, total: 0 };
      if (e.status === 'active') b.active += 1;
      if (e.status === 'complete') b.complete += 1;
      b.total += 1;
      counts.set(e.sequencePath, b);
    }
    return c.json({
      sequences: sequences.map((s) => ({
        ...s,
        enrolled: counts.get(s.path) ?? { active: 0, complete: 0, total: 0 },
      })),
      enrollments,
    });
  });
  app.post('/api/sequences/enroll', async (c) => {
    const body = await c.req.json<{ contact_path?: string; sequence_path?: string }>().catch(() => ({} as any));
    if (!body.contact_path || !body.sequence_path) {
      return c.json({ error: 'contact_path and sequence_path required' }, 400);
    }
    try {
      return c.json(await enrollContact(body.contact_path, body.sequence_path));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  app.post('/api/sequences/stop', async (c) => {
    const body = await c.req.json<{ contact_path?: string }>().catch(() => ({} as any));
    if (!body.contact_path) return c.json({ error: 'contact_path required' }, 400);
    try {
      return c.json(await stopEnrollment(body.contact_path));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  // Manual kick for the daily walker — handy for testing.
  app.post('/api/sequences/walk', async (c) => {
    try {
      return c.json(await walkSequencesOnce(config));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/drafts', async (c) => {
    const drafts = await listDrafts();
    pushDrafts(config).catch(() => {});
    return c.json({ drafts });
  });
  app.post('/api/drafts/:id/approve', async (c) => {
    try {
      const r = await approveDraft(c.req.param('id'));
      pushDrafts(config).catch(() => {});
      return c.json(r);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  app.post('/api/drafts/:id/reject', async (c) => {
    try {
      const r = await rejectDraft(c.req.param('id'));
      pushDrafts(config).catch(() => {});
      return c.json(r);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Unauthenticated webhook receiver. Uses ?token=<local-token> in URL since
  // external systems can't attach Authorization headers easily.
  app.post('/webhook/:name', async (c) => {
    const token = c.req.query('token');
    if (token !== LOCAL_TOKEN) return c.json({ error: 'unauthorized' }, 401);
    const name = c.req.param('name');
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await fireTrigger(name, config, body ?? {});
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/vault/tree', async (c) => {
    const tree = await walkTree('.');
    return c.json({ tree });
  });

  app.get('/api/vault/file', async (c) => {
    const p = c.req.query('path');
    if (!p) return c.json({ error: 'path required' }, 400);
    try {
      const out = await readVaultFile(p);
      return c.json(out);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  });

  app.get('/api/vault/backlinks', async (c) => {
    const p = c.req.query('path');
    if (!p) return c.json({ error: 'path required' }, 400);
    const backlinks = await findBacklinks(getVaultRoot(), p);
    return c.json({ backlinks });
  });

  app.put('/api/vault/file', async (c) => {
    const body = await c.req.json<{ path: string; content: string }>();
    await writeVaultFile(body.path, body.content);
    return c.json({ ok: true });
  });

  app.post('/api/agent/run', async (c) => {
    const body = await c.req.json<{ agent: string; task: string }>();
    try {
      const result = await runAgent({
        agent: body.agent,
        task: body.task,
        config,
      });
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/agent/runs', async (c) => {
    const runsDir = path.join(getVaultRoot(), 'runs');
    try {
      const entries = await fs.readdir(runsDir, { withFileTypes: true });
      const runs = await Promise.all(
        entries
          .filter((e) => e.isDirectory())
          .map(async (e) => {
            try {
              const meta = JSON.parse(
                await fs.readFile(path.join(runsDir, e.name, 'meta.json'), 'utf-8'),
              );
              return meta;
            } catch {
              return { runId: e.name };
            }
          }),
      );
      runs.sort((a, b) => (a.runId < b.runId ? 1 : -1));
      return c.json({ runs });
    } catch {
      return c.json({ runs: [] });
    }
  });

  app.get('/api/agent/runs/:id', async (c) => {
    const id = c.req.param('id');
    const runDir = path.join(getVaultRoot(), 'runs', id);
    try {
      const [meta, prompt, finalMd, toolCalls] = await Promise.all([
        fs.readFile(path.join(runDir, 'meta.json'), 'utf-8').then(JSON.parse).catch(() => null),
        fs.readFile(path.join(runDir, 'prompt.md'), 'utf-8').catch(() => ''),
        fs.readFile(path.join(runDir, 'final.md'), 'utf-8').catch(() => ''),
        fs.readFile(path.join(runDir, 'tool-calls.jsonl'), 'utf-8')
          .then((s) => s.split('\n').filter(Boolean).map((l) => JSON.parse(l)))
          .catch(() => []),
      ]);
      return c.json({ meta, prompt, final: finalMd, toolCalls });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  });

  // Probe once on startup so /api/health can advertise which engine is live.
  const codexReady = await codexAvailable();
  console.log(`[daemon] codex ${codexReady ? 'available' : 'not installed — will use builtin Responses loop'}`);

  app.post('/api/chat', async (c) => {
    const body = await c.req.json<{
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      agent?: string;
      threadId?: string;
    }>();
    if (!body.messages || body.messages.length === 0) {
      return c.json({ error: 'no messages' }, 400);
    }
    const last = body.messages[body.messages.length - 1]!;
    if (last.role !== 'user') return c.json({ error: 'last message must be user' }, 400);
    const history = body.messages.slice(0, -1).filter((m) => m.role === 'user' || m.role === 'assistant');

    // Path B: Codex CLI, streamed.  The daemon converts codex's JSONL
    // event stream (--json flag) into SSE frames the renderer can consume
    // incrementally.  Billing happens server-side in /api/v1/responses.
    if (codexReady) {
      const runId = `codex-${Date.now()}`;
      const runDir = path.join(getVaultRoot(), 'runs', runId);
      await fs.mkdir(runDir, { recursive: true });

      const encoder = new TextEncoder();
      let finalText = '';
      let exitCode = 0;
      let stdoutAccum = '';
      let stderrAccum = '';

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };
          send('meta', { runId });

          // Parse codex JSONL events as they arrive, forward meaningful
          // ones downstream.  Keep a rolling buffer for partial lines.
          let buf = '';
          const onStdout = (chunk: string) => {
            stdoutAccum += chunk;
            buf += chunk;
            let nl: number;
            while ((nl = buf.indexOf('\n')) !== -1) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line) continue;
              let ev: any;
              try { ev = JSON.parse(line); } catch { continue; }

              const t = ev.type;
              const it = ev.item ?? {};
              const itType = it.type as string | undefined;
              if (t === 'item.completed' && itType === 'agent_message') {
                const text = String(it.text ?? '');
                // Emit the whole message (codex doesn't stream per-token in
                // this version). Treat it as a single delta so the UI just
                // appends.
                if (text) {
                  const delta = text.slice(finalText.length);
                  finalText = text;
                  send('text', { delta });
                }
              } else if (t === 'item.completed' && itType === 'reasoning') {
                const summary = String(it.text ?? '').trim();
                if (summary) send('reasoning', { text: summary });
              } else if (t === 'item.completed' && (itType === 'command_execution' || itType?.startsWith('command'))) {
                send('tool', {
                  name: 'shell',
                  args: it.command ?? '',
                  output: String(it.aggregated_output ?? '').slice(0, 2000),
                });
              } else if ((t === 'item.started' || t === 'item.updated') && itType) {
                if (itType.startsWith('command')) {
                  send('tool_pending', { name: 'shell', args: it.command ?? '' });
                } else if (itType === 'reasoning') {
                  send('reasoning_pending', {});
                }
              } else if (t === 'turn.completed' && ev.usage) {
                send('usage', ev.usage);
              } else if (t === 'error') {
                send('error', { message: ev.message ?? 'error' });
              } else if (t === 'turn.failed') {
                send('error', { message: ev.error?.message ?? 'turn failed' });
              }
            }
          };
          const onStderr = (chunk: string) => { stderrAccum += chunk; };

          try {
            const result = await runCodex(last.content, { config, history, onStdout, onStderr });
            exitCode = result.exitCode;
            if (!finalText && exitCode !== 0) {
              send('error', { message: stderrAccum.trim() || 'codex exited non-zero' });
            }
          } catch (err) {
            if (err instanceof CodexNotInstalled) {
              send('error', { message: 'codex binary not found' });
            } else {
              send('error', { message: err instanceof Error ? err.message : String(err) });
            }
          }

          // Persist run
          try {
            await fs.writeFile(path.join(runDir, 'stdout.log'), stdoutAccum, 'utf-8');
            await fs.writeFile(path.join(runDir, 'stderr.log'), stderrAccum, 'utf-8');
            await fs.writeFile(
              path.join(runDir, 'meta.json'),
              JSON.stringify({ runId, agent: 'codex', engine: 'codex-cli', exitCode }, null, 2),
              'utf-8',
            );
            if (body.threadId) {
              const tp = path.join(getVaultRoot(), 'chats', `${body.threadId}.json`);
              await fs.mkdir(path.dirname(tp), { recursive: true });
              await fs.writeFile(
                tp,
                JSON.stringify(
                  {
                    threadId: body.threadId,
                    agent: 'codex',
                    updatedAt: new Date().toISOString(),
                    messages: [...body.messages, { role: 'assistant', content: finalText }],
                  },
                  null,
                  2,
                ),
                'utf-8',
              );
            }
          } catch {}

          send('done', { runId, final: finalText, exitCode });
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Fallback: our own Responses API loop.
    try {
      const result = await runAgent({
        agent: body.agent ?? 'researcher',
        task: last.content,
        history,
        config,
      });
      // Persist full thread so /runs and a future history UI can show it.
      if (body.threadId) {
        const threadPath = path.join(getVaultRoot(), 'chats', `${body.threadId}.json`);
        await fs.mkdir(path.dirname(threadPath), { recursive: true });
        await fs.writeFile(
          threadPath,
          JSON.stringify(
            {
              threadId: body.threadId,
              agent: body.agent ?? 'researcher',
              updatedAt: new Date().toISOString(),
              messages: [...body.messages, { role: 'assistant', content: result.final }],
            },
            null,
            2,
          ),
          'utf-8',
        );
      }
      return c.json({
        role: 'assistant',
        content: result.final,
        runId: result.runId,
        costCents: result.costCents,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // List + read chat threads.
  app.get('/api/chats', async (c) => {
    const dir = path.join(getVaultRoot(), 'chats');
    try {
      const entries = await fs.readdir(dir);
      const threads = await Promise.all(
        entries
          .filter((f) => f.endsWith('.json'))
          .map(async (f) => {
            try {
              const j = JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8'));
              const first = j.messages?.find((m: any) => m.role === 'user')?.content ?? '';
              return {
                threadId: j.threadId,
                agent: j.agent,
                updatedAt: j.updatedAt,
                preview: String(first).slice(0, 80),
                count: j.messages?.length ?? 0,
              };
            } catch {
              return null;
            }
          }),
      );
      const out = threads.filter(Boolean).sort((a: any, b: any) => (a.updatedAt < b.updatedAt ? 1 : -1));
      return c.json({ threads: out });
    } catch {
      return c.json({ threads: [] });
    }
  });
  app.get('/api/chats/:id', async (c) => {
    const p = path.join(getVaultRoot(), 'chats', `${c.req.param('id')}.json`);
    try {
      return c.json(JSON.parse(await fs.readFile(p, 'utf-8')));
    } catch {
      return c.json({ error: 'not found' }, 404);
    }
  });
  app.delete('/api/chats/:id', async (c) => {
    const id = c.req.param('id');
    // Basic path-safety — id should be a flat filename, no slashes / dots.
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return c.json({ error: 'bad id' }, 400);
    const p = path.join(getVaultRoot(), 'chats', `${id}.json`);
    try {
      await fs.unlink(p);
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: true }); // idempotent
    }
  });

  // ---- Projects (multi-vault) -----------------------------------------
  // The registry at <homeVault>/.bm/projects.json is the source of truth.
  // Activating flips VAULT_ROOT in-memory; all path-joining uses
  // getVaultRoot() so subsequent requests land in the new vault without a
  // daemon restart. Long-running crons re-read the root on each tick.
  app.get('/api/projects', async (c) => {
    try {
      const reg = await getRegistry();
      return c.json(reg);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/projects', async (c) => {
    try {
      const body = await c.req.json<{ name?: string; path?: string }>();
      const name = (body.name ?? '').trim();
      if (!name) return c.json({ error: 'name is required' }, 400);
      const { reg, project } = await addProject(name, body.path?.trim() || undefined);
      return c.json({ ...reg, created: project });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/projects/activate', async (c) => {
    try {
      const body = await c.req.json<{ id?: string }>();
      if (!body.id) return c.json({ error: 'id is required' }, 400);
      const reg = await activateProject(body.id);
      // Re-seed the newly-active vault so expected folders exist.
      await ensureVault().catch(() => {});
      return c.json(reg);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.delete('/api/projects/:id', async (c) => {
    try {
      const reg = await deleteProject(c.req.param('id'));
      return c.json(reg);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // Serve the packaged static UI at `/` when present. In dev the Next.js
  // server handles that on :3000 and we skip this branch.
  const webRoot = process.env.BM_WEB_ROOT;
  if (webRoot && fsSync.existsSync(webRoot)) {
    app.use('/*', serveStatic({ root: webRoot }));
    console.log(`[daemon] serving UI from ${webRoot}`);
  }

  const port = await pickPort(config.daemon_port);
  serve({ fetch: app.fetch, hostname: '127.0.0.1', port });

  // Write discovery file — Electron main reads this to pass port + token to
  // the renderer. Kept at the home vault (NOT the active project's vault) so
  // Electron has a stable location to look even after the user switches
  // projects.
  const discoveryPath = path.join(homeVault(), '.bm', 'daemon.json');
  await fs.mkdir(path.dirname(discoveryPath), { recursive: true });
  await fs.writeFile(
    discoveryPath,
    JSON.stringify({ port, token: LOCAL_TOKEN, pid: process.pid, startedAt: new Date().toISOString() }, null, 2),
    'utf-8',
  );

  console.log(`[daemon] http://127.0.0.1:${port}  token=${LOCAL_TOKEN.slice(0, 6)}…`);
  console.log(`[daemon] vault ${getVaultRoot()}`);
  console.log(`[daemon] model ${config.default_model}  zenn=${config.zenn_api_key ? 'set' : 'MISSING'}`);

  await loadCronTriggers(config).catch((err) => console.error('[triggers] load failed:', err));
  startSequenceCron(config);
  pushTriggers(config).catch(() => {});
  pushDrafts(config).catch(() => {});
}

main().catch((err) => {
  console.error('[daemon] fatal:', err);
  process.exit(1);
});
