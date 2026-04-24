// E2E lead pipeline — deterministic scoring + rules-based routing, wired to
// both the local md context and every connected CRM.
//
// Shape of the pipeline: `enrich → score → route → sync`.
//   • enrich: delegated to existing tools (enrich_company, apollo_*, etc.)
//   • score:  reads us/market/icp.md frontmatter rubric, applies weighted
//             criteria to a company/contact record, writes icp_score +
//             icp_reasons to the context file. No LLM in the loop — same
//             inputs produce the same score on every run.
//   • route:  reads us/team/routing.md (owners table + rule stack), picks
//             the first matching owner, writes assignee frontmatter to the
//             context file. Falls back to the default owner if no rule fires.
//   • sync:   pushes the final record to every CRM the user has connected
//             (HubSpot, Attio, Salesforce, Pipedrive). Missing creds skip
//             that target silently — the context write is always authoritative.
//
// Everything here is provider-agnostic. Tool handlers in tools.ts call into
// these functions; the same functions back the /api/pipeline/run HTTP route
// so UI buttons can trigger E2E without a chat turn.

import matter from 'gray-matter';
import { readContextFile, writeContextFile } from './context.js';

export interface CompanyLike {
  domain: string;
  name?: string;
  industry?: string;
  employee_count?: number;
  revenue?: number | string;
  hq?: string;
  tech_stack?: string[];
  tags?: string[];
  // Free-form bag for custom fields the rubric can key on.
  [k: string]: unknown;
}

export interface ScoreResult {
  score: number;           // 0..100
  reasons: string[];       // evidence lines
  matches: Array<{ criterion: string; weight: number; hit: boolean; detail?: string }>;
  rubricVersion: string;   // us/market/icp.md frontmatter revision — so we can tell stale scores from fresh
}

export interface RouteResult {
  assignee: { type: 'user' | 'team'; id: string; name?: string } | null;
  rule: string;            // human-readable explanation
  crmOwnerIds?: Partial<Record<'hubspot' | 'salesforce' | 'pipedrive' | 'attio', string>>;
}

// ───────────────────────────────────────────────────────────────────────────
// Scoring rubric — parsed from us/market/icp.md frontmatter.
// The user maintains a `rubric:` block like:
//
//   ---
//   kind: us.market.icp
//   revision: 3
//   rubric:
//     - id: employee_fit
//       weight: 25
//       when: { field: employee_count, between: [50, 2000] }
//     - id: industry_fit
//       weight: 20
//       when: { field: industry, in: [SaaS, Fintech, Devtools] }
//     - id: tech_signal
//       weight: 15
//       when: { field: tech_stack, any_of: [nextjs, vercel, typescript] }
//     - id: us_market
//       weight: 10
//       when: { field: hq, contains: US }
//   fallback_score: 0  # if the rubric is empty / missing, score 0
//   ---
//
// Each rule has an `id`, a `weight` (adds to score on hit), and a `when`
// predicate. Predicates are dead simple — see evalWhen below. This is
// deliberately not a DSL; the point is that a non-programmer PM can edit
// the md file and see scores change.
// ───────────────────────────────────────────────────────────────────────────

export interface RubricRule {
  id: string;
  weight: number;
  when: Record<string, unknown>;
  why?: string;   // optional human explanation appended to reasons on hit
}

export interface Rubric {
  revision: string;
  rules: RubricRule[];
  fallbackScore: number;
}

function getField(record: Record<string, unknown>, field: string): unknown {
  // Supports dotted paths ("frontmatter.industry") but the common case is flat.
  const parts = field.split('.');
  let v: any = record;
  for (const p of parts) {
    if (v == null) return undefined;
    v = v[p];
  }
  return v;
}

function asLowerStrings(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).toLowerCase());
  if (typeof v === 'string') return [v.toLowerCase()];
  if (typeof v === 'number' || typeof v === 'boolean') return [String(v).toLowerCase()];
  return [];
}

export function evalWhen(when: Record<string, unknown>, record: Record<string, unknown>): { hit: boolean; detail?: string } {
  const field = String(when.field ?? '');
  if (!field) return { hit: false, detail: 'missing field' };
  const v = getField(record, field);
  if (v == null || v === '') return { hit: false, detail: `${field} is empty` };

  if (when.equals !== undefined) {
    const hit = String(v).toLowerCase() === String(when.equals).toLowerCase();
    return { hit, detail: `${field}=${String(v)}` };
  }
  if (when.contains !== undefined) {
    const needle = String(when.contains).toLowerCase();
    const hay = String(v).toLowerCase();
    return { hit: hay.includes(needle), detail: `${field} contains "${needle}"` };
  }
  if (when.in !== undefined && Array.isArray(when.in)) {
    const needles = (when.in as unknown[]).map((x) => String(x).toLowerCase());
    const hit = asLowerStrings(v).some((s) => needles.includes(s));
    return { hit, detail: `${field}=${String(v)}` };
  }
  if (when.any_of !== undefined && Array.isArray(when.any_of)) {
    const needles = (when.any_of as unknown[]).map((x) => String(x).toLowerCase());
    const fieldVals = asLowerStrings(v);
    const hits = fieldVals.filter((s) => needles.some((n) => s.includes(n)));
    return { hit: hits.length > 0, detail: hits.length ? `matched ${hits.join(',')}` : undefined };
  }
  if (when.between !== undefined && Array.isArray(when.between) && when.between.length === 2) {
    const n = Number(v);
    const bounds = (when.between as unknown[]).map((x) => Number(x));
    const lo = bounds[0]!;
    const hi = bounds[1]!;
    if (!Number.isFinite(n) || !Number.isFinite(lo) || !Number.isFinite(hi)) return { hit: false, detail: 'non-numeric' };
    return { hit: n >= lo && n <= hi, detail: `${field}=${n}` };
  }
  if (when.gte !== undefined) {
    const n = Number(v);
    const t = Number(when.gte);
    return { hit: Number.isFinite(n) && Number.isFinite(t) && n >= t, detail: `${field}=${n}` };
  }
  if (when.lte !== undefined) {
    const n = Number(v);
    const t = Number(when.lte);
    return { hit: Number.isFinite(n) && Number.isFinite(t) && n <= t, detail: `${field}=${n}` };
  }
  return { hit: false, detail: 'unknown predicate' };
}

export async function loadRubric(): Promise<Rubric> {
  try {
    const f = await readContextFile('us/market/icp.md');
    const fm = f.frontmatter ?? {};
    const rawRules = Array.isArray((fm as any).rubric) ? (fm as any).rubric : [];
    const rules: RubricRule[] = rawRules
      .filter((r: any) => r && typeof r === 'object' && r.id && r.when)
      .map((r: any) => ({
        id: String(r.id),
        weight: Number(r.weight ?? 10),
        when: r.when as Record<string, unknown>,
        why: typeof r.why === 'string' ? r.why : undefined,
      }));
    const revision = String((fm as any).revision ?? '0');
    const fallbackScore = Number((fm as any).fallback_score ?? 0);
    return { revision, rules, fallbackScore };
  } catch {
    return { revision: '0', rules: [], fallbackScore: 0 };
  }
}

export function applyRubric(record: Record<string, unknown>, rubric: Rubric): ScoreResult {
  if (rubric.rules.length === 0) {
    return {
      score: rubric.fallbackScore,
      reasons: ['no rubric configured — edit us/market/icp.md to add weighted rules'],
      matches: [],
      rubricVersion: rubric.revision,
    };
  }
  const matches: ScoreResult['matches'] = [];
  let sumWeight = 0;
  let sumHit = 0;
  const reasons: string[] = [];
  for (const rule of rubric.rules) {
    const { hit, detail } = evalWhen(rule.when, record);
    matches.push({ criterion: rule.id, weight: rule.weight, hit, detail });
    sumWeight += Math.max(0, rule.weight);
    if (hit) {
      sumHit += Math.max(0, rule.weight);
      const line = rule.why ? `${rule.id} (+${rule.weight}): ${rule.why}` : `${rule.id} (+${rule.weight}) — ${detail ?? 'hit'}`;
      reasons.push(line);
    }
  }
  const score = sumWeight > 0 ? Math.round((sumHit / sumWeight) * 100) : rubric.fallbackScore;
  return { score, reasons, matches, rubricVersion: rubric.revision };
}

// ───────────────────────────────────────────────────────────────────────────
// Routing — us/team/routing.md frontmatter.
//
//   ---
//   kind: us.team.routing
//   default:
//     owner: { id: unassigned, name: Unassigned }
//   rules:
//     - match: { field: icp_score, gte: 80 }
//       owner: { id: ae-senior, name: "Jane Doe (AE Senior)", hubspot_owner_id: "123", salesforce_owner_id: "005XX..." }
//     - match: { field: hq, contains: EMEA }
//       owner: { id: emea-team, type: team, name: "EMEA AE team" }
//   ---
// ───────────────────────────────────────────────────────────────────────────

export interface RoutingRule {
  match: Record<string, unknown>;
  owner: {
    id: string;
    name?: string;
    type?: 'user' | 'team';
    hubspot_owner_id?: string;
    salesforce_owner_id?: string;
    pipedrive_owner_id?: string;
    attio_workspace_member_id?: string;
  };
}

export interface RoutingConfig {
  default: RoutingRule['owner'] | null;
  rules: RoutingRule[];
}

export async function loadRouting(): Promise<RoutingConfig> {
  try {
    const f = await readContextFile('us/team/routing.md');
    const fm = (f.frontmatter ?? {}) as any;
    const defaultOwner = fm.default?.owner ?? null;
    const rawRules = Array.isArray(fm.rules) ? fm.rules : [];
    const rules: RoutingRule[] = rawRules
      .filter((r: any) => r && r.match && r.owner)
      .map((r: any) => ({
        match: r.match as Record<string, unknown>,
        owner: {
          id: String(r.owner.id ?? 'unassigned'),
          name: typeof r.owner.name === 'string' ? r.owner.name : undefined,
          type: r.owner.type === 'team' ? 'team' : 'user',
          hubspot_owner_id: r.owner.hubspot_owner_id,
          salesforce_owner_id: r.owner.salesforce_owner_id,
          pipedrive_owner_id: r.owner.pipedrive_owner_id,
          attio_workspace_member_id: r.owner.attio_workspace_member_id,
        },
      }));
    return { default: defaultOwner, rules };
  } catch {
    return { default: null, rules: [] };
  }
}

export function applyRouting(record: Record<string, unknown>, routing: RoutingConfig): RouteResult {
  for (const r of routing.rules) {
    const { hit, detail } = evalWhen(r.match, record);
    if (hit) {
      return {
        assignee: { type: r.owner.type ?? 'user', id: r.owner.id, name: r.owner.name },
        rule: `matched ${JSON.stringify(r.match)} — ${detail ?? 'hit'}`,
        crmOwnerIds: {
          hubspot: r.owner.hubspot_owner_id,
          salesforce: r.owner.salesforce_owner_id,
          pipedrive: r.owner.pipedrive_owner_id,
          attio: r.owner.attio_workspace_member_id,
        },
      };
    }
  }
  if (routing.default) {
    return {
      assignee: { type: routing.default.type ?? 'user', id: routing.default.id, name: routing.default.name },
      rule: 'no rule matched — fell back to default',
      crmOwnerIds: {
        hubspot: routing.default.hubspot_owner_id,
        salesforce: routing.default.salesforce_owner_id,
        pipedrive: routing.default.pipedrive_owner_id,
        attio: routing.default.attio_workspace_member_id,
      },
    };
  }
  return { assignee: null, rule: 'no rules matched and no default configured' };
}

// ───────────────────────────────────────────────────────────────────────────
// Context write — stamps frontmatter onto companies/<slug>.md (or contacts/…).
// If the file doesn't exist yet we create it with a minimal stub, because the
// normal flow is "enrich_company wrote nothing" → we still want a record.
// ───────────────────────────────────────────────────────────────────────────

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unnamed';
}

export async function stampContext(
  path: string,
  patch: Record<string, unknown>,
  bodyAppend?: string,
): Promise<void> {
  let current = '';
  try {
    const f = await readContextFile(path);
    current = f.content ?? '';
  } catch {
    current = '';
  }
  const parsed = current ? matter(current) : { data: {} as Record<string, unknown>, content: '' };
  const data = { ...(parsed.data as Record<string, unknown>), ...patch };
  const body = bodyAppend ? ((parsed.content ?? '').trimEnd() + '\n\n' + bodyAppend + '\n') : (parsed.content ?? '');
  const next = matter.stringify(body, data);
  await writeContextFile(path, next);
}
