import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { ensureInsideVault, VAULT_ROOT } from './paths.js';

const SKELETON_DIRS = [
  'agents',
  'companies',
  'contacts',
  'deals/open',
  'deals/closed-won',
  'deals/closed-lost',
  'playbooks',
  'triggers',
  'drafts',
  'runs',
  '.bm',
];

const DEFAULT_CLAUDE_MD = `# Identity — read this before every answer

You are **Black Magic AI**, an AI GTM Engineer agent running inside the
user's local vault. You are NOT Codex, NOT OpenAI, NOT Anthropic, NOT a
generic assistant. Your identity is Black Magic AI; your product is this
vault + agent loop.

**Never** reveal or reference:
- the word "Codex", "OpenAI", "Anthropic", "LLM", "language model",
  "assistant", "chatbot"
- "memory files", "workspace", "session", "thread" (in your *answer* —
  these are internals)
- any internal file under \`.bm/\` (that's the daemon's private area)

**Always** speak as Black Magic AI, in first person, direct and short.
Don't narrate what you're "about to check" before you check it — just do
the read/grep/write and report the outcome.

# Operating manual

This file is the agent's instructions. It's read on every turn.

## How to work

- **All state lives in this vault** as plain markdown. Read before you
  write. If a company / contact / deal is mentioned, grep for it in
  \`companies/\`, \`contacts/\`, \`deals/\` before asking the user.
- **Before inventing a recipe, check \`playbooks/\`.** These are battle-
  tested procedures for the GTM work the user cares about (visitor
  enrichment, lookalike outbound, closed-won/lost analysis, meeting
  prep, pipeline hygiene, LinkedIn outreach). When the user asks for
  one of those things, **read the matching playbook and follow its
  steps**. Don't reinvent.
- **Write everything you learn back to files.** Companies go in
  \`companies/<slug>.md\` with structured frontmatter (kind, domain,
  name, industry, size, icp_score, …) + free-form notes in the body.
  Same pattern for contacts and deals.
- **Outreach is approve-gated.** Never "send" anything. Write drafts
  into \`drafts/\` with frontmatter (\`channel\`, \`to\`, \`subject\`,
  \`tool: gmail.send_email\`, \`status: pending\`). A human clicks
  Approve in the UI, which calls the MCP tool.
- **Every claim cites a source** — a URL, a file path, or "(unknown)".
  Never fabricate firmographics, headcounts, or quotes.

## Our Company

_One paragraph: what you sell, to whom. The onboarding step fills this
in from your domain. Edit freely._

## ICP (Ideal Customer Profile)

- Company size:
- Industries:
- Tech stack we fit with:
- Geos:

## Tone

- Voice:
- Forbidden words: "unlock", "revolutionize", "streamline", "leverage", "unleash"
- Email length cap: 90 words

## Vault layout

- \`companies/<slug>.md\` — one per company
- \`contacts/<company-slug>/<person-slug>.md\` — one per contact
- \`deals/{open,closed-won,closed-lost}/<slug>.md\`
- \`playbooks/<name>.md\` — named procedures (list them with \`ls playbooks/\`)
- \`drafts/<ts>-<slug>.md\` — outbound drafts, human-approved before send
- \`me.md\` — about us
`;

const DEFAULT_AGENTS: Record<string, string> = {
  'researcher.md': `---
kind: agent
name: researcher
model: gpt-5.3-codex
tools:
  - read_file
  - write_file
  - edit_file
  - list_dir
  - grep
  - web_fetch
  - web_search
  - pdl_enrich
temperature: 0.2
---

You are the research agent. Given a company domain, produce a
companies/<slug>.md with rich frontmatter (name, domain, industry,
size, revenue, hq, icp_score, icp_reasons, enriched_at) and a 150-word
body covering what they do, recent news, and best-guess buying committee.

Use \`pdl_enrich\` first for firmographics, then \`web_search\` for news.
Never fabricate fields — write \`null\` if unknown.
`,
  'sdr.md': `---
kind: agent
name: sdr
model: gpt-5.3-codex
tools:
  - read_file
  - write_file
  - list_dir
  - grep
  - draft_create
temperature: 0.4
---

You are the SDR agent. Given a contact and their company file, draft
outbound emails into drafts/. Each draft references one concrete
signal from the company file. Max 90 words. No forbidden words from
CLAUDE.md. You NEVER send; you only call draft_create.
`,
  'ae.md': `---
kind: agent
name: ae
model: gpt-5.3-codex
tools:
  - read_file
  - write_file
  - edit_file
  - list_dir
  - grep
temperature: 0.3
---

You are the AE agent. You manage deals/. Given a deal file, analyze
stage health, identify stalls, and propose the next step. Edit the
deal's frontmatter (next_step, health) and append a dated note to
the body.
`,
};

const DEFAULT_PLAYBOOKS: Record<string, string> = {
  // === Building blocks ===
  'enrich-company.md': `---
kind: playbook
name: enrich-company
group: building-blocks
agent: researcher
inputs: [{ name: domain, required: true }]
---

Enrich the company at \`{{domain}}\`. Produce a full
\`companies/<slug>.md\` with frontmatter (domain, name, industry, size,
revenue, hq, icp_score, icp_reasons, enriched_at) and a 150-word body
covering what they do, recent news, and best-guess buying committee.
Use pdl_enrich first, then web_search for news.
`,
  'qualify-icp.md': `---
kind: playbook
name: qualify-icp
group: building-blocks
agent: researcher
inputs: [{ name: domain, required: true }]
---

Read the company file for \`{{domain}}\` (call enrich-company first if
missing). Compare against ICP in CLAUDE.md. Update frontmatter with
\`icp_score\` (0-100) and \`icp_reasons\` (list of evidence lines).
`,
  'draft-outbound.md': `---
kind: playbook
name: draft-outbound
group: building-blocks
agent: sdr
inputs: [{ name: contact_path, required: true }]
---

Draft a first-touch email to the contact in \`{{contact_path}}\`.
Reference one concrete signal from the company file. Max 90 words.
No forbidden words from CLAUDE.md. Output via draft_create.
`,

  // === High-intent visitor (Swan visitor ID) ===
  'visitor-deanonymize.md': `---
kind: playbook
name: visitor-deanonymize
group: high-intent-visitor
agent: researcher
inputs: [{ name: ip, required: false }, { name: session_id, required: false }]
---

Resolve the company behind visitor \`{{ip}}\` / session \`{{session_id}}\`.
Reject consumer ISPs. Output JSON: { company, domain, size, confidence, personas }.
Save to \`companies/<slug>.md\` (create if missing).
`,
  'visitor-qualify-icp.md': `---
kind: playbook
name: visitor-qualify-icp
group: high-intent-visitor
agent: researcher
inputs: [{ name: domain, required: true }]
---

Qualify {{domain}} against ICP. For each criterion in CLAUDE.md, mark
PASS/FAIL/UNKNOWN with evidence. Output verdict TIER-1/TIER-2/DISQUALIFY
and write it to the company file's frontmatter.
`,
  'visitor-research-account.md': `---
kind: playbook
name: visitor-research-account
group: high-intent-visitor
agent: researcher
inputs: [{ name: domain, required: true }]
---

Build a one-page account brief for {{domain}}: what they do, recent
news (90d), hiring signals, tech stack, timing signals, likely champion
and blocker by role. Append as a dated note in the company file.
`,
  'visitor-route-rep.md': `---
kind: playbook
name: visitor-route-rep
group: high-intent-visitor
agent: ae
inputs: [{ name: domain, required: true }]
---

Decide the owning rep for {{domain}} by territory/segment. Append a
Slack-style handoff note to the company file: <= 60 words the rep can
scan in 10 seconds.
`,
  'visitor-launch-outreach.md': `---
kind: playbook
name: visitor-launch-outreach
group: high-intent-visitor
agent: sdr
inputs: [{ name: contact_path, required: true }, { name: pages_viewed, required: false }]
---

Draft a 3-touch sequence for the contact at {{contact_path}}. Reference
the pages viewed ({{pages_viewed}}) in touch 1. Output three draft files
via draft_create (email, linkedin_dm, email-bump).
`,

  // === Deal closed-won / lookalike outbound ===
  'won-analyze.md': `---
kind: playbook
name: won-analyze
group: deal-won
agent: ae
inputs: [{ name: deal_path, required: true }]
---

Analyze the Closed-Won deal at {{deal_path}}. Write a post-mortem
to the deal file: why-we-won (buyer's words), champion emergence,
competitors beaten, time-to-value, reusable quotes.
`,
  'won-lookalikes.md': `---
kind: playbook
name: won-lookalikes
group: deal-won
agent: researcher
inputs: [{ name: reference_company, required: true }]
---

Find 25 companies that look like {{reference_company}} (industry,
size, tech, stage, growth). For each: write a companies/<slug>.md
stub with pdl_enrich + a 'lookalike_of: {{reference_company}}' field.
`,
  'won-buying-committee.md': `---
kind: playbook
name: won-buying-committee
group: deal-won
agent: researcher
inputs: [{ name: domain, required: true }]
---

For {{domain}}, identify 3-7 people on the buying committee. Write
each as contacts/<slug>/<person>.md with role + posture
(champion|user|buyer|blocker|legal) + one line on what makes them say yes.
`,
  'won-craft-messaging.md': `---
kind: playbook
name: won-craft-messaging
group: deal-won
agent: sdr
inputs: [{ name: reference_customer, required: true }]
---

Write outbound variants anchored on the {{reference_customer}} outcome.
Three versions (champion / economic buyer / user) into drafts/.
`,
  'won-multichannel-campaign.md': `---
kind: playbook
name: won-multichannel-campaign
group: deal-won
agent: ae
inputs: [{ name: cohort_size, required: false }]
---

Design a 2-week multi-channel play for the lookalike cohort
({{cohort_size}} accounts). Write the plan as a markdown file under
runs/latest/plan.md: channel mix, cadence by persona, success metrics,
kill criteria.
`,

  // === Closed-lost ===
  'lost-pull-history.md': `---
kind: playbook
name: lost-pull-history
group: deal-lost
agent: ae
inputs: [{ name: deal_path, required: true }]
---

Assemble the full narrative of lost deal {{deal_path}}: timeline,
stage velocity, stall points. Write a 3-sentence "what happened" to
the deal file.
`,
  'lost-analyze-reasons.md': `---
kind: playbook
name: lost-analyze-reasons
group: deal-lost
agent: ae
inputs: [{ name: deal_path, required: true }]
---

Compare the stated loss reason to the last 20 losses (grep deals/closed-lost).
Decide pattern vs outlier. Gut-check the stated reason. Propose the single
biggest action to reduce this loss class.
`,
  'lost-competitor-intel.md': `---
kind: playbook
name: lost-competitor-intel
group: deal-lost
agent: researcher
inputs: [{ name: deal_path, required: true }]
---

Extract competitor intel from {{deal_path}}. Update
knowledge/battlecard.md with: what they claimed, what won them the
deal, new positioning moves. Quote where possible.
`,
  'lost-process-improvements.md': `---
kind: playbook
name: lost-process-improvements
group: deal-lost
agent: ae
inputs: [{ name: deal_path, required: true }]
---

Name up to 3 process changes from {{deal_path}} that would have changed
the outcome. For each: owner, effort (S/M/L), expected win-rate impact,
how to measure within 90 days.
`,
  'lost-share-insights.md': `---
kind: playbook
name: lost-share-insights
group: deal-lost
agent: ae
inputs: [{ name: deal_path, required: true }]
---

Draft a 120-180 word Slack-style post for the team summarizing
{{deal_path}}. Lead with the single most important sentence. No blame.
Write to drafts/<ts>-loss-review.md.
`,

  // === Meeting preps ===
  'meeting-pull-records.md': `---
kind: playbook
name: meeting-pull-records
group: meeting-prep
agent: researcher
inputs: [{ name: attendee_email, required: true }]
---

Pull everything we know about {{attendee_email}} and their company.
Update contacts/ and companies/ files. Flag red flags or prior tickets.
`,
  'meeting-research-news.md': `---
kind: playbook
name: meeting-research-news
group: meeting-prep
agent: researcher
inputs: [{ name: domain, required: true }]
---

Find 3-5 meeting-relevant events for {{domain}} (60d). For each: one
line why-it-matters + a conversational opener that isn't cringe.
Append to company file as "News for meeting (ts)".
`,
  'meeting-engagement-history.md': `---
kind: playbook
name: meeting-engagement-history
group: meeting-prep
agent: researcher
inputs: [{ name: contact_path, required: true }]
---

Summarize {{contact_path}}'s engagement trajectory. Append to contact
file: themes they've returned to, warming/cooling, what they probably
want out of the meeting.
`,
  'meeting-talking-points.md': `---
kind: playbook
name: meeting-talking-points
group: meeting-prep
agent: sdr
inputs: [{ name: meeting_subject, required: true }, { name: duration_min, required: false }]
---

Generate talking points for {{meeting_subject}}: time-boxed agenda,
3 discovery questions tied to hypotheses, 2 proof points, 2 objections
+ answers, single next-step to propose.
`,
  'meeting-pre-call-brief.md': `---
kind: playbook
name: meeting-pre-call-brief
group: meeting-prep
agent: sdr
inputs: [{ name: meeting_subject, required: true }]
---

Write a <=150-word pre-call brief for {{meeting_subject}}: TL;DR, who's
in the room + posture, freshest signals, hypothesis to test, trap to
avoid. Output as drafts/<ts>-brief-<slug>.md.
`,

  // === Pipeline health ===
  'pipeline-scan-stale.md': `---
kind: playbook
name: pipeline-scan-stale
group: pipeline-health
agent: ae
inputs: [{ name: days, required: false }]
---

Scan deals/open/ for deals with no activity in >{{days}} days
(default 7). For each, append a "⚠ stale" dated note to the deal
file with severity (low/medium/critical).
`,
  'pipeline-missing-next-steps.md': `---
kind: playbook
name: pipeline-missing-next-steps
group: pipeline-health
agent: ae
inputs: []
---

Find deals in proposal+ stages with no scheduled next step in 14
days. For each, append a "no-next-step" marker and suggest a concrete
next action.
`,
  'pipeline-at-risk.md': `---
kind: playbook
name: pipeline-at-risk
group: pipeline-health
agent: ae
inputs: []
---

Flag at-risk late-stage deals: close-date pushed twice+, champion
silent, stakeholder added late, competitor resurfacing. Update deal
frontmatter health: red. Sort outputs by ARR at risk.
`,
  'pipeline-recovery-actions.md': `---
kind: playbook
name: pipeline-recovery-actions
group: pipeline-health
agent: ae
inputs: [{ name: deal_path, required: true }]
---

Propose ONE recovery action for {{deal_path}}, doable in 5 days.
Specify action, owner, channel, timing, expected outcome, kill
criterion. Append as a "Recovery (ts)" note.
`,
  'pipeline-notify-owners.md': `---
kind: playbook
name: pipeline-notify-owners
group: pipeline-health
agent: ae
inputs: []
---

For each rep with stale/at-risk deals, draft a Slack-style DM at
drafts/<ts>-notify-<rep>.md. Lead with the single most important
deal. Max 3 per DM. No preamble.
`,

  // === LinkedIn intent ===
  'li-detect-engagement.md': `---
kind: playbook
name: li-detect-engagement
group: linkedin-intent
agent: researcher
inputs: [{ name: type, required: true }, { name: prospect, required: true }, { name: content, required: false }]
---

Score the LinkedIn engagement ({{type}} on {{content}} by {{prospect}})
0-100. Decide: outreach now / later / no. If outreach: hook + channel.
Append to the contact file as "LI signal (ts)".
`,
  'li-enrich-profile.md': `---
kind: playbook
name: li-enrich-profile
group: linkedin-intent
agent: researcher
inputs: [{ name: linkedin_url, required: true }]
---

Enrich {{linkedin_url}} using enrich_person. Write/update
contacts/<company>/<person>.md with role, reporting line, recent
themes, likely KPIs, best outreach angle.
`,
  'li-company-context.md': `---
kind: playbook
name: li-company-context
group: linkedin-intent
agent: researcher
inputs: [{ name: domain, required: true }]
---

Pull company-level context for {{domain}} relevant to LinkedIn
outreach. Update the company file with the current priority at the
prospect's level.
`,
  'li-draft-message.md': `---
kind: playbook
name: li-draft-message
group: linkedin-intent
agent: sdr
inputs: [{ name: contact_path, required: true }, { name: content, required: true }]
---

Draft a <=60 word LinkedIn DM to {{contact_path}} referencing
engagement on {{content}}. Hypothesis-based. No hashtags. Output via
draft_create(channel=linkedin_dm).
`,
  'li-send-request.md': `---
kind: playbook
name: li-send-request
group: linkedin-intent
agent: sdr
inputs: [{ name: contact_path, required: true }]
---

If not yet connected, draft a connection-request note (<=300 char)
referencing their recent post. Queue via draft_create(channel=
linkedin_connect). Log intent to the contact file.
`,
};

export async function ensureVault(): Promise<{ created: boolean }> {
  let created = false;
  await fs.mkdir(VAULT_ROOT, { recursive: true });
  for (const dir of SKELETON_DIRS) {
    await fs.mkdir(path.join(VAULT_ROOT, dir), { recursive: true });
  }

  const claudePath = path.join(VAULT_ROOT, 'CLAUDE.md');
  if (!fsSync.existsSync(claudePath)) {
    await fs.writeFile(claudePath, DEFAULT_CLAUDE_MD, 'utf-8');
    created = true;
  }

  for (const [name, body] of Object.entries(DEFAULT_AGENTS)) {
    const p = path.join(VAULT_ROOT, 'agents', name);
    if (!fsSync.existsSync(p)) await fs.writeFile(p, body, 'utf-8');
  }

  for (const [name, body] of Object.entries(DEFAULT_PLAYBOOKS)) {
    const p = path.join(VAULT_ROOT, 'playbooks', name);
    if (!fsSync.existsSync(p)) await fs.writeFile(p, body, 'utf-8');
  }

  const mcpPath = path.join(VAULT_ROOT, '.bm', 'mcp.json');
  if (!fsSync.existsSync(mcpPath)) {
    await fs.writeFile(mcpPath, JSON.stringify({ servers: {} }, null, 2), 'utf-8');
  }

  return { created };
}

export async function readVaultFile(relPath: string) {
  const abs = ensureInsideVault(relPath);
  const raw = await fs.readFile(abs, 'utf-8');
  const parsed = matter(raw);
  return { content: raw, frontmatter: parsed.data, body: parsed.content };
}

export async function writeVaultFile(relPath: string, content: string) {
  const abs = ensureInsideVault(relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf-8');
}

export async function editVaultFile(relPath: string, oldStr: string, newStr: string) {
  const abs = ensureInsideVault(relPath);
  const raw = await fs.readFile(abs, 'utf-8');
  if (!raw.includes(oldStr)) throw new Error(`old_str not found in ${relPath}`);
  const count = raw.split(oldStr).length - 1;
  if (count > 1) throw new Error(`old_str ambiguous (${count} matches) in ${relPath}`);
  await fs.writeFile(abs, raw.replace(oldStr, newStr), 'utf-8');
}

export async function renameVaultFile(oldPath: string, newPath: string) {
  const oldAbs = ensureInsideVault(oldPath);
  const newAbs = ensureInsideVault(newPath);
  await fs.mkdir(path.dirname(newAbs), { recursive: true });
  await fs.rename(oldAbs, newAbs);
}

export async function listDir(relPath = '.') {
  const abs = ensureInsideVault(relPath);
  const entries = await fs.readdir(abs, { withFileTypes: true });
  return entries.map((e) => ({
    name: e.name,
    type: e.isDirectory() ? 'dir' : 'file',
    path: path.posix.join(relPath, e.name),
  }));
}

export async function walkTree(relPath = '.'): Promise<Array<{ path: string; type: 'file' | 'dir' }>> {
  const out: Array<{ path: string; type: 'file' | 'dir' }> = [];
  async function go(rel: string) {
    const abs = ensureInsideVault(rel);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const e of entries) {
      const childRel = path.posix.join(rel, e.name);
      if (e.name === '.bm' || e.name === 'node_modules' || e.name.startsWith('.DS_Store')) continue;
      if (e.isDirectory()) {
        out.push({ path: childRel, type: 'dir' });
        await go(childRel);
      } else {
        out.push({ path: childRel, type: 'file' });
      }
    }
  }
  await go(relPath);
  return out;
}

export async function grepVault(pattern: string, relPath = '.') {
  const re = new RegExp(pattern, 'i');
  const hits: Array<{ path: string; line: number; text: string }> = [];
  const files = (await walkTree(relPath)).filter((f) => f.type === 'file');
  for (const f of files) {
    if (!/\.(md|txt|json|toml|yaml|yml)$/i.test(f.path)) continue;
    const abs = ensureInsideVault(f.path);
    const txt = await fs.readFile(abs, 'utf-8');
    const lines = txt.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i]!)) {
        hits.push({ path: f.path, line: i + 1, text: lines[i]!.slice(0, 200) });
      }
    }
  }
  return hits;
}

export function slugFromDomain(domain: string): string {
  return domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\./g, '-');
}
