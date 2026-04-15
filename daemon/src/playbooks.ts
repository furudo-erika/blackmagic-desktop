import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { getVaultRoot, type Config } from './paths.js';
import { runAgent } from './agent.js';

interface PlaybookSpec {
  name: string;
  agent: string;
  inputs: Array<{ name: string; required?: boolean }>;
  body: string;
}

export async function loadPlaybook(name: string): Promise<PlaybookSpec> {
  const p = path.join(getVaultRoot(), 'playbooks', `${name}.md`);
  const raw = await fs.readFile(p, 'utf-8');
  const m = matter(raw);
  const fm = m.data as any;
  return {
    name: fm.name ?? name,
    agent: fm.agent ?? 'researcher',
    inputs: Array.isArray(fm.inputs) ? fm.inputs : [],
    body: m.content.trim(),
  };
}

export async function listPlaybooks(): Promise<PlaybookSpec[]> {
  const dir = path.join(getVaultRoot(), 'playbooks');
  try {
    const entries = await fs.readdir(dir);
    const out: PlaybookSpec[] = [];
    for (const f of entries) {
      if (!f.endsWith('.md')) continue;
      out.push(await loadPlaybook(path.basename(f, '.md')));
    }
    return out;
  } catch {
    return [];
  }
}

export async function runPlaybook(name: string, inputs: Record<string, unknown>, config: Config) {
  const spec = await loadPlaybook(name);
  for (const i of spec.inputs) {
    if (i.required && !(i.name in inputs)) throw new Error(`missing input: ${i.name}`);
  }
  let task = spec.body;
  for (const [k, v] of Object.entries(inputs)) {
    task = task.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v ?? ''));
  }
  return runAgent({ agent: spec.agent, task, config });
}
