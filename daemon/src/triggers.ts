import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import matter from 'gray-matter';
import cron from 'node-cron';
import { getVaultRoot, type Config } from './paths.js';
import { runAgent } from './agent.js';
import { runPlaybook } from './playbooks.js';

interface TriggerSpec {
  name: string;
  schedule?: string;
  webhook?: boolean;
  playbook?: string;
  agent?: string;
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  enabled: boolean;
  body: string;
}

const scheduled: Map<string, cron.ScheduledTask> = new Map();

// 30-minute timeout for shell triggers. After that the child is killed and
// the run is marked failed. Keep the rest of the pipeline moving.
const SHELL_TIMEOUT_MS = 30 * 60 * 1000;

// Cap captured stdout at 50KB in the run log. Tail logs remain on disk at
// wherever the child redirects them; this cap just keeps the md readable.
const OUTPUT_CAP_BYTES = 50 * 1024;

async function listTriggers(): Promise<TriggerSpec[]> {
  const dir = path.join(getVaultRoot(), 'triggers');
  try {
    const entries = await fs.readdir(dir);
    const specs: TriggerSpec[] = [];
    for (const f of entries) {
      if (!f.endsWith('.md')) continue;
      const raw = await fs.readFile(path.join(dir, f), 'utf-8');
      const m = matter(raw);
      const fm = m.data as any;
      // Accept either `schedule:` (original) or `cron:` (friendlier alias).
      const schedule = typeof fm.schedule === 'string'
        ? fm.schedule
        : typeof fm.cron === 'string' ? fm.cron : undefined;
      // `skill:` is the user-facing alias for `playbook:` — same filesystem
      // (skills live in playbooks/ for now), same runner. Trigger files
      // emitted by the trigger_create tool use `skill:`; legacy presets
      // use `playbook:`. Accept either.
      const playbookOrSkill = typeof fm.playbook === 'string'
        ? fm.playbook
        : typeof fm.skill === 'string' ? fm.skill : undefined;
      specs.push({
        name: fm.name ?? path.basename(f, '.md'),
        schedule,
        webhook: fm.webhook === true,
        playbook: playbookOrSkill,
        agent: typeof fm.agent === 'string' ? fm.agent : undefined,
        shell: typeof fm.shell === 'string' ? fm.shell : undefined,
        cwd: typeof fm.cwd === 'string' ? fm.cwd : undefined,
        env: fm.env && typeof fm.env === 'object' ? fm.env as Record<string, string> : undefined,
        enabled: fm.enabled !== false,
        body: m.content.trim(),
      });
    }
    return specs;
  } catch {
    return [];
  }
}

/**
 * Run a shell command and capture stdout/stderr into a run log md file under
 * `<vault>/runs/`. Returns the exit code and the relative path to the log so
 * callers (the UI, webhook, cron) can point users at it.
 *
 * Design notes:
 *   - process.env is merged with the trigger's `env` block, so users can pipe
 *     secrets in via trigger frontmatter without touching code. The shell's
 *     own env (including any http_proxy from the user's profile) is
 *     inherited — we don't scrub it.
 *   - stdout is captured but truncated to OUTPUT_CAP_BYTES in the log so the
 *     markdown stays usable. The full stream is not persisted elsewhere; if
 *     the caller needs every byte they should `tee` inside the shell command.
 *   - Non-zero exit codes leave the log frontmatter `exit: <code>` so the
 *     triggers UI can show a failed badge.
 */
async function runShellTrigger(spec: TriggerSpec): Promise<{
  ok: boolean;
  exit: number | null;
  log: string;
  stdoutBytes: number;
  stderrBytes: number;
  durationMs: number;
}> {
  if (!spec.shell) throw new Error(`shell trigger missing shell: ${spec.name}`);

  const vaultRoot = getVaultRoot();
  const runsDir = path.join(vaultRoot, 'runs');
  await fs.mkdir(runsDir, { recursive: true });

  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const logRel = path.posix.join('runs', `shell-${spec.name}-${stamp}.md`);
  const logAbs = path.join(vaultRoot, logRel);

  const cwd = spec.cwd && path.isAbsolute(spec.cwd) ? spec.cwd : vaultRoot;
  // The daemon runs inside the Electron app, which launches with a minimal
  // PATH (no /opt/homebrew/bin, no /usr/local/bin, no user shell rc). That
  // breaks any trigger that shells out to `python3` or `node` installed via
  // Homebrew or nvm — they fail with ModuleNotFoundError or
  // `env: node: No such file or directory`. Prepend the common developer
  // bin dirs so `/usr/bin/env python3` finds Homebrew's python (with user
  // site-packages) and `/usr/bin/env node` finds nvm/homebrew node.
  const EXTRA_PATH = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
  ].join(':');
  const basePath = process.env.PATH ?? '';
  const augmentedPath = basePath ? `${EXTRA_PATH}:${basePath}` : EXTRA_PATH;
  const mergedEnv = {
    ...process.env,
    PATH: augmentedPath,
    ...(spec.env ?? {}),
  } as NodeJS.ProcessEnv;

  // Use `sh -c` so users can write full command strings (pipes, flags, etc.)
  // in the trigger md without having to JSON-quote an argv array.
  const child = spawn('sh', ['-c', spec.shell], {
    cwd,
    env: mergedEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  child.stdout.on('data', (buf: Buffer) => {
    stdoutBytes += buf.length;
    stdoutChunks.push(buf);
  });
  child.stderr.on('data', (buf: Buffer) => {
    stderrBytes += buf.length;
    stderrChunks.push(buf);
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, SHELL_TIMEOUT_MS);

  const exitCode: number | null = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code));
    child.on('error', () => resolve(null));
  });
  clearTimeout(timer);

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  const stdoutFull = Buffer.concat(stdoutChunks).toString('utf-8');
  const stderrFull = Buffer.concat(stderrChunks).toString('utf-8');
  const stdoutTrunc = stdoutFull.length > OUTPUT_CAP_BYTES
    ? stdoutFull.slice(0, OUTPUT_CAP_BYTES) + `\n\n... [truncated ${stdoutFull.length - OUTPUT_CAP_BYTES} bytes]`
    : stdoutFull;
  const stderrTrunc = stderrFull.length > OUTPUT_CAP_BYTES
    ? stderrFull.slice(0, OUTPUT_CAP_BYTES) + `\n\n... [truncated ${stderrFull.length - OUTPUT_CAP_BYTES} bytes]`
    : stderrFull;

  const ok = exitCode === 0 && !timedOut;

  // Escape quotes in cmd for YAML frontmatter. Cmd can contain anything.
  const yamlString = (s: string) => JSON.stringify(s);
  const parts: string[] = [];
  parts.push('---');
  parts.push(`kind: shell-run`);
  parts.push(`trigger: ${spec.name}`);
  parts.push(`exit: ${exitCode === null ? 'null' : exitCode}`);
  parts.push(`ok: ${ok}`);
  parts.push(`timed_out: ${timedOut}`);
  parts.push(`started_at: ${startedAt.toISOString()}`);
  parts.push(`finished_at: ${finishedAt.toISOString()}`);
  parts.push(`duration_ms: ${durationMs}`);
  parts.push(`cwd: ${yamlString(cwd)}`);
  parts.push(`cmd: ${yamlString(spec.shell)}`);
  parts.push('---');
  parts.push('');
  parts.push(`# shell run: ${spec.name}`);
  parts.push('');
  parts.push(`exit code: **${exitCode === null ? 'killed' : exitCode}**${timedOut ? ' (timed out after 30m)' : ''}`);
  parts.push(`duration: ${(durationMs / 1000).toFixed(1)}s`);
  parts.push(`cwd: \`${cwd}\``);
  parts.push(`cmd: \`${spec.shell}\``);
  parts.push('');
  parts.push('## stdout');
  parts.push('');
  parts.push('```');
  parts.push(stdoutTrunc || '(empty)');
  parts.push('```');
  if (stderrFull.length > 0) {
    parts.push('');
    parts.push('## stderr');
    parts.push('');
    parts.push('```');
    parts.push(stderrTrunc);
    parts.push('```');
  }
  parts.push('');

  await fs.writeFile(logAbs, parts.join('\n'), 'utf-8');

  return { ok, exit: exitCode, log: logRel, stdoutBytes, stderrBytes, durationMs };
}

export async function fireTrigger(name: string, config: Config, input: Record<string, unknown> = {}) {
  const specs = await listTriggers();
  const spec = specs.find((t) => t.name === name);
  if (!spec) throw new Error(`trigger not found: ${name}`);
  if (!spec.enabled) throw new Error(`trigger disabled: ${name}`);
  // Shell triggers win over playbook ones — they're complete pipelines and
  // have no reason to go through the agent.
  if (spec.shell) {
    console.log(`[triggers] shell run ${name}: ${spec.shell}`);
    const result = await runShellTrigger(spec);
    console.log(`[triggers] shell done ${name}: exit=${result.exit} log=${result.log}`);
    return result;
  }
  if (spec.playbook) return runPlaybook(spec.playbook, input, config);
  return runAgent({ agent: spec.agent ?? 'researcher', task: spec.body, config });
}

export async function loadCronTriggers(config: Config) {
  for (const t of scheduled.values()) t.stop();
  scheduled.clear();
  const specs = await listTriggers();
  for (const spec of specs) {
    if (!spec.schedule || !spec.enabled) continue;
    if (!cron.validate(spec.schedule)) {
      console.warn(`[triggers] invalid cron for ${spec.name}: ${spec.schedule}`);
      continue;
    }
    const task = cron.schedule(spec.schedule, () => {
      console.log(`[triggers] firing ${spec.name} (cron)`);
      fireTrigger(spec.name, config).catch((err) =>
        console.error(`[triggers] ${spec.name} failed:`, err),
      );
    });
    scheduled.set(spec.name, task);
    console.log(`[triggers] scheduled ${spec.name} @ ${spec.schedule}`);
  }
}

export async function triggerList() {
  return listTriggers();
}

// Scan runs/ for the most recent shell-run log per trigger name. The UI uses
// this so users see "last run: 3h ago · exit 0" without having to click Fire
// now in the current session (runs persist across daemon restarts).
export async function lastShellRuns(): Promise<Record<string, { log: string; exit: number | null; finishedAt: string | null }>> {
  const runsDir = path.join(getVaultRoot(), 'runs');
  const out: Record<string, { log: string; exit: number | null; finishedAt: string | null; _mtime: number }> = {};
  let entries: string[] = [];
  try {
    entries = await fs.readdir(runsDir);
  } catch {
    return {};
  }
  for (const f of entries) {
    if (!f.startsWith('shell-') || !f.endsWith('.md')) continue;
    const abs = path.join(runsDir, f);
    let st: Awaited<ReturnType<typeof fs.stat>>;
    try {
      st = await fs.stat(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    let raw = '';
    try {
      raw = await fs.readFile(abs, 'utf-8');
    } catch {
      continue;
    }
    const m = matter(raw);
    const fm = m.data as any;
    const name = typeof fm.trigger === 'string' ? fm.trigger : null;
    if (!name) continue;
    const mtime = st.mtimeMs;
    const prev = out[name];
    if (prev && prev._mtime >= mtime) continue;
    const exit = typeof fm.exit === 'number' ? fm.exit : fm.exit === null ? null : null;
    const finishedAt = typeof fm.finished_at === 'string' ? fm.finished_at : null;
    out[name] = {
      log: path.posix.join('runs', f),
      exit,
      finishedAt,
      _mtime: mtime,
    };
  }
  const result: Record<string, { log: string; exit: number | null; finishedAt: string | null }> = {};
  for (const [k, v] of Object.entries(out)) {
    result[k] = { log: v.log, exit: v.exit, finishedAt: v.finishedAt };
  }
  return result;
}
