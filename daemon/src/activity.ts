// Entity activity feed + agent assignment.
//
// Every vault entity (company / contact / deal) carries:
//   - an `assignee` frontmatter field — who owns the next action on it
//   - an append-only activity log at signals/activity/<entity-path>.jsonl
//
// The log mirrors the Multica "issue activity" pattern: each line is one
// event (assign / status_change / comment / agent_run), authored by a
// member or an agent. When a human comment mentions an agent (@slug) the
// daemon enqueues a run scoped to that entity. Assigning an entity to an
// agent also enqueues a run.
//
// Runs triggered this way carry `entity_ref` in meta.json so the UI can
// filter the live card + run history per entity.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { ensureInsideVault, getVaultRoot } from './paths.js';

export type ActorType = 'member' | 'agent' | 'system';
export interface Actor {
  type: ActorType;
  id: string;          // agent slug, user id, or 'system'
  name?: string;       // display name
}

export type ActivityKind =
  | 'comment'
  | 'assign'
  | 'unassign'
  | 'status_change'
  | 'agent_run_started'
  | 'agent_run_finished'
  | 'agent_run_failed';

export interface ActivityEntry {
  id: string;             // ulid-ish
  ts: string;             // ISO
  kind: ActivityKind;
  author: Actor;
  content?: string;       // comment body, change summary, etc.
  mentions?: string[];    // agent slugs parsed from content
  parent_id?: string;     // for replies
  // Structured payload for non-comment entries.
  data?: Record<string, unknown>;
}

export interface Assignee {
  type: 'agent' | 'member' | null;
  id: string | null;
  name?: string;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function activityPathFor(entityPath: string): string {
  // Keep the sidecar adjacent but segregated: signals/activity/<entity>.jsonl
  // with directory structure mirroring entityPath up to the last segment.
  const rel = entityPath.replace(/\.md$/, '');
  return path.join(getVaultRoot(), 'signals', 'activity', `${rel}.jsonl`);
}

// ---------------------------------------------------------------------------
// Entity frontmatter (assignee + mentions) — read + write helpers
// ---------------------------------------------------------------------------

async function readEntityFrontmatter(entityPath: string): Promise<{ fm: Record<string, unknown>; body: string; raw: string }> {
  const abs = ensureInsideVault(entityPath);
  const raw = await fs.readFile(abs, 'utf-8');
  const parsed = matter(raw);
  return { fm: (parsed.data ?? {}) as Record<string, unknown>, body: parsed.content, raw };
}

async function writeEntityFrontmatter(entityPath: string, fm: Record<string, unknown>, body: string): Promise<void> {
  const abs = ensureInsideVault(entityPath);
  const out = matter.stringify(body, fm);
  await fs.writeFile(abs, out, 'utf-8');
}

// ---------------------------------------------------------------------------
// Activity log reads + writes
// ---------------------------------------------------------------------------

function newId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${t}-${r}`;
}

export async function listActivity(entityPath: string): Promise<ActivityEntry[]> {
  const p = activityPathFor(entityPath);
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim());
    const out: ActivityEntry[] = [];
    for (const line of lines) {
      try { out.push(JSON.parse(line)); } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

export async function appendActivity(entityPath: string, entry: Omit<ActivityEntry, 'id' | 'ts'> & Partial<Pick<ActivityEntry, 'id' | 'ts'>>): Promise<ActivityEntry> {
  const full: ActivityEntry = {
    id: entry.id ?? newId(),
    ts: entry.ts ?? new Date().toISOString(),
    ...entry,
  };
  const p = activityPathFor(entityPath);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.appendFile(p, JSON.stringify(full) + '\n', 'utf-8');
  return full;
}

// ---------------------------------------------------------------------------
// Assignee ops
// ---------------------------------------------------------------------------

function readAssigneeFromFm(fm: Record<string, unknown>): Assignee {
  const a = fm.assignee as any;
  if (!a || typeof a !== 'object') return { type: null, id: null };
  const type = a.type === 'agent' || a.type === 'member' ? a.type : null;
  const id = typeof a.id === 'string' ? a.id : null;
  if (!type || !id) return { type: null, id: null };
  return { type, id, name: typeof a.name === 'string' ? a.name : undefined };
}

export async function getAssignee(entityPath: string): Promise<Assignee> {
  const { fm } = await readEntityFrontmatter(entityPath);
  return readAssigneeFromFm(fm);
}

export async function setAssignee(entityPath: string, next: Assignee, actor: Actor): Promise<{ assignee: Assignee; previous: Assignee }> {
  const { fm, body } = await readEntityFrontmatter(entityPath);
  const previous = readAssigneeFromFm(fm);
  if (next.type && next.id) {
    fm.assignee = { type: next.type, id: next.id, ...(next.name ? { name: next.name } : {}) };
  } else {
    delete fm.assignee;
  }
  await writeEntityFrontmatter(entityPath, fm, body);
  const kind: ActivityKind = next.type && next.id ? 'assign' : 'unassign';
  const label = next.name || next.id || '';
  await appendActivity(entityPath, {
    kind,
    author: actor,
    content: kind === 'assign'
      ? `assigned to ${label}`
      : `unassigned${previous.name ? ` from ${previous.name}` : ''}`,
    data: { previous, next },
  });
  return { assignee: next, previous };
}

// ---------------------------------------------------------------------------
// Comments (human or agent)
// ---------------------------------------------------------------------------

const MENTION_RE = /@([a-z0-9][a-z0-9-]{1,40})/gi;

export function extractMentions(body: string): string[] {
  const out = new Set<string>();
  body.replace(MENTION_RE, (_, slug) => { out.add(String(slug).toLowerCase()); return _; });
  return Array.from(out);
}

export async function postComment(entityPath: string, input: {
  body: string;
  author: Actor;
  parent_id?: string;
  inherited_mentions?: string[];
}): Promise<ActivityEntry> {
  const mentions = extractMentions(input.body);
  // Mention inheritance: if replying in a thread and the user didn't
  // @-mention anyone explicitly, inherit the parent thread's mentions so
  // the agent that was brought into the thread stays looped in without
  // needing a repeat @ on every reply.
  const effective = mentions.length > 0
    ? mentions
    : (input.inherited_mentions ?? []);
  return appendActivity(entityPath, {
    kind: 'comment',
    author: input.author,
    content: input.body,
    mentions: effective,
    parent_id: input.parent_id,
  });
}

// Derive the set of mentions that should be inherited by a reply in the
// thread rooted at `parent_id`. Walks up parent links and unions their
// mentions. For short threads this is fine; if a thread grows big we can
// cache at the root.
export async function inheritedMentionsFor(entityPath: string, parent_id: string | undefined): Promise<string[]> {
  if (!parent_id) return [];
  const log = await listActivity(entityPath);
  const byId = new Map(log.map((e) => [e.id, e]));
  const acc = new Set<string>();
  let cur: string | undefined = parent_id;
  const guard = new Set<string>();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    const e = byId.get(cur);
    if (!e) break;
    for (const m of e.mentions ?? []) acc.add(m);
    cur = e.parent_id;
  }
  return Array.from(acc);
}

// ---------------------------------------------------------------------------
// Agent run lifecycle events — written by the agent runner.
// ---------------------------------------------------------------------------

export async function recordRunStart(entityPath: string, runId: string, agentSlug: string): Promise<void> {
  await appendActivity(entityPath, {
    kind: 'agent_run_started',
    author: { type: 'agent', id: agentSlug, name: agentSlug },
    content: `run started`,
    data: { runId, agent: agentSlug },
  });
}

export async function recordRunFinish(entityPath: string, runId: string, agentSlug: string, ok: boolean, summary?: string): Promise<void> {
  await appendActivity(entityPath, {
    kind: ok ? 'agent_run_finished' : 'agent_run_failed',
    author: { type: 'agent', id: agentSlug, name: agentSlug },
    content: summary ?? (ok ? 'run finished' : 'run failed'),
    data: { runId, agent: agentSlug, ok },
  });
}

// ---------------------------------------------------------------------------
// Runs filtered by entity_ref.
// Each agent run writes meta.json; we stamp entity_ref at enqueue time.
// ---------------------------------------------------------------------------

export async function listRunsForEntity(entityPath: string): Promise<any[]> {
  const runsDir = path.join(getVaultRoot(), 'runs');
  if (!fsSync.existsSync(runsDir)) return [];
  const dirs = await fs.readdir(runsDir);
  const out: any[] = [];
  for (const d of dirs) {
    try {
      const meta = JSON.parse(await fs.readFile(path.join(runsDir, d, 'meta.json'), 'utf-8'));
      if (meta?.entity_ref === entityPath) out.push(meta);
    } catch {}
  }
  // Most recent first by runId prefix timestamp.
  out.sort((a, b) => (b.runId ?? '').localeCompare(a.runId ?? ''));
  return out;
}
