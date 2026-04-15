import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import cron from 'node-cron';
import { getVaultRoot, type Config } from './paths.js';
import { runAgent } from './agent.js';
import { runPlaybook } from './playbooks.js';

interface TriggerSpec {
  name: string;
  schedule?: string;
  webhook?: boolean;
  playbook: string;
  enabled: boolean;
  body: string;
}

const scheduled: Map<string, cron.ScheduledTask> = new Map();

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
      specs.push({
        name: fm.name ?? path.basename(f, '.md'),
        schedule: fm.schedule,
        webhook: fm.webhook === true,
        playbook: fm.playbook,
        enabled: fm.enabled !== false,
        body: m.content.trim(),
      });
    }
    return specs;
  } catch {
    return [];
  }
}

export async function fireTrigger(name: string, config: Config, input: Record<string, unknown> = {}) {
  const specs = await listTriggers();
  const spec = specs.find((t) => t.name === name);
  if (!spec) throw new Error(`trigger not found: ${name}`);
  if (!spec.enabled) throw new Error(`trigger disabled: ${name}`);
  if (spec.playbook) return runPlaybook(spec.playbook, input, config);
  return runAgent({ agent: 'researcher', task: spec.body, config });
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
