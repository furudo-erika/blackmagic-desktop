import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { loadConfig, VAULT_ROOT } from './paths.js';
import { ensureVault, readVaultFile, writeVaultFile, walkTree } from './vault.js';
import { BUILTIN_TOOLS } from './tools.js';
import { runAgent } from './agent.js';
import { listPlaybooks, runPlaybook } from './playbooks.js';
import { triggerList, fireTrigger, loadCronTriggers } from './triggers.js';
import { listDrafts, approveDraft, rejectDraft } from './drafts.js';
import { mcpServerList } from './mcp.js';

const LOCAL_TOKEN = process.env.BM_LOCAL_TOKEN ?? crypto.randomBytes(24).toString('base64url');

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
  const config = loadConfig();
  await ensureVault();

  const app = new Hono();
  app.use('*', cors({ origin: (o) => o ?? '*', credentials: false }));

  // Local auth middleware. Webhooks authenticate via ?token=... (checked inline).
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/health') return next();
    const auth = c.req.header('authorization') ?? '';
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== LOCAL_TOKEN) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    return next();
  });

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      version: '0.1.0',
      vaultPath: VAULT_ROOT,
      model: config.default_model,
      zennConfigured: Boolean(config.zenn_api_key),
      localToken: LOCAL_TOKEN,
    }),
  );

  app.post('/api/config/api-key', async (c) => {
    const body = await c.req.json<{ key?: string }>();
    const key = (body.key ?? '').trim();
    if (!key.startsWith('ck_') || key.length < 10) {
      return c.json({ error: 'invalid api key format' }, 400);
    }
    const cfgDir = path.join(VAULT_ROOT, '.bm');
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

  app.get('/api/tools', async (c) => {
    const mcp = await mcpServerList();
    return c.json({
      tools: [
        ...BUILTIN_TOOLS.map((t) => ({ name: t.name, description: t.description, source: 'builtin' })),
        ...mcp.map((s) => ({ name: s.name, description: `MCP: ${s.command} ${s.args.join(' ')}`, source: 'mcp' })),
      ],
    });
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

  app.get('/api/triggers', async (c) => c.json({ triggers: await triggerList() }));
  app.post('/api/triggers/:name/fire', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json<{ input?: Record<string, unknown> }>().catch(() => ({} as any));
    try {
      const result = await fireTrigger(name, config, body.input ?? {});
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  app.post('/api/triggers/reload', async (c) => {
    await loadCronTriggers(config);
    return c.json({ ok: true });
  });

  app.get('/api/drafts', async (c) => c.json({ drafts: await listDrafts() }));
  app.post('/api/drafts/:id/approve', async (c) => {
    try {
      const r = await approveDraft(c.req.param('id'));
      return c.json(r);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  app.post('/api/drafts/:id/reject', async (c) => {
    try {
      const r = await rejectDraft(c.req.param('id'));
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
    const runsDir = path.join(VAULT_ROOT, 'runs');
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
    const runDir = path.join(VAULT_ROOT, 'runs', id);
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

  app.post('/api/chat', async (c) => {
    const body = await c.req.json<{ messages: Array<{ role: string; content: string }>; agent?: string }>();
    const lastUser = [...body.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return c.json({ error: 'no user message' }, 400);
    try {
      const result = await runAgent({
        agent: body.agent ?? 'researcher',
        task: lastUser.content,
        config,
      });
      return c.json({ role: 'assistant', content: result.final, runId: result.runId, costCents: result.costCents });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
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

  // Write discovery file — Electron main reads this to pass port + token to the renderer.
  const discoveryPath = path.join(VAULT_ROOT, '.bm', 'daemon.json');
  await fs.mkdir(path.dirname(discoveryPath), { recursive: true });
  await fs.writeFile(
    discoveryPath,
    JSON.stringify({ port, token: LOCAL_TOKEN, pid: process.pid, startedAt: new Date().toISOString() }, null, 2),
    'utf-8',
  );

  console.log(`[daemon] http://127.0.0.1:${port}  token=${LOCAL_TOKEN.slice(0, 6)}…`);
  console.log(`[daemon] vault ${VAULT_ROOT}`);
  console.log(`[daemon] model ${config.default_model}  zenn=${config.zenn_api_key ? 'set' : 'MISSING'}`);

  await loadCronTriggers(config).catch((err) => console.error('[triggers] load failed:', err));
}

main().catch((err) => {
  console.error('[daemon] fatal:', err);
  process.exit(1);
});
