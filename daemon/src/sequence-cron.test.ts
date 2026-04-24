import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { walkSequencesOnce } from './sequence-cron.js';
import { loadPlaybook } from './playbooks.js';
import { getContextRoot, setContextRoot, type Config } from './paths.js';
import type { Enrollment, Sequence, Touch } from './sequences.js';

const CONFIG: Config = {
  context_path: '/tmp/blackmagic-sequence-tests',
  default_model: 'gpt-5.3-codex',
  zenn_base_url: 'https://example.invalid/api/v1',
};

function makeEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    contactPath: 'contacts/jane.md',
    sequencePath: 'sequences/cold-outbound-5-touch.md',
    step: 0,
    enrolledAt: '2026-04-14T00:00:00.000Z',
    status: 'active',
    ...overrides,
  };
}

function makeSequence(touches: Touch[]): Sequence {
  return {
    path: 'sequences/cold-outbound-5-touch.md',
    name: 'cold-outbound-5-touch',
    touches,
    body: '',
  };
}

async function runWalk(options: {
  enrollment?: Enrollment;
  sequence: Sequence;
  runPlaybook?: () => Promise<unknown>;
  runAgent?: () => Promise<unknown>;
  now?: Date;
}) {
  const advances: Array<{ contactPath: string; nextStep: number; status: Enrollment['status'] }> = [];
  const playbookCalls: string[] = [];
  let agentCalls = 0;

  const result = await walkSequencesOnce(CONFIG, options.now ?? new Date('2026-04-17T00:00:00.000Z'), {
    listEnrollments: async () => [options.enrollment ?? makeEnrollment()],
    readSequence: async () => options.sequence,
    advanceEnrollment: async (contactPath, nextStep, status) => {
      advances.push({ contactPath, nextStep, status });
    },
    runPlaybook: async (name) => {
      playbookCalls.push(name);
      return (options.runPlaybook ? await options.runPlaybook() : {}) as any;
    },
    runAgent: async () => {
      agentCalls += 1;
      return (options.runAgent ? await options.runAgent() : {}) as any;
    },
    logInfo: () => {},
    logError: () => {},
  });

  return { result, advances, playbookCalls, agentCalls };
}

test('walkSequencesOnce advances after a successful playbook touch', async () => {
  const { result, advances, playbookCalls, agentCalls } = await runWalk({
    sequence: makeSequence([
      { day: 0, playbook: 'draft-outbound', channel: 'email' },
      { day: 4, prompt: 'Follow up with {{contact_path}}' },
    ]),
  });

  assert.equal(result.fired, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(playbookCalls, ['draft-outbound']);
  assert.equal(agentCalls, 0);
  assert.deepEqual(advances, [
    { contactPath: 'contacts/jane.md', nextStep: 1, status: 'active' },
  ]);
});

test('walkSequencesOnce leaves step unchanged when a playbook touch fails', async () => {
  const { result, advances, playbookCalls } = await runWalk({
    sequence: makeSequence([{ day: 0, playbook: 'outbound-draft', channel: 'email' }]),
    runPlaybook: async () => {
      throw new Error('playbook missing');
    },
  });

  assert.equal(result.fired, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(playbookCalls, ['outbound-draft']);
  assert.deepEqual(advances, []);
  assert.deepEqual(result.failures, [
    {
      contactPath: 'contacts/jane.md',
      sequencePath: 'sequences/cold-outbound-5-touch.md',
      step: 0,
      day: 0,
      kind: 'playbook',
      target: 'outbound-draft',
      error: 'playbook missing',
    },
  ]);
});

test('walkSequencesOnce leaves step unchanged when an agent touch fails', async () => {
  const { result, advances, agentCalls } = await runWalk({
    sequence: makeSequence([{ day: 0, prompt: 'Email {{contact_path}}', channel: 'email' }]),
    runAgent: async () => {
      throw new Error('agent unavailable');
    },
  });

  assert.equal(result.fired, 0);
  assert.equal(result.failed, 1);
  assert.equal(agentCalls, 1);
  assert.deepEqual(advances, []);
  assert.deepEqual(result.failures, [
    {
      contactPath: 'contacts/jane.md',
      sequencePath: 'sequences/cold-outbound-5-touch.md',
      step: 0,
      day: 0,
      kind: 'agent',
      target: 'email',
      error: 'agent unavailable',
    },
  ]);
});

test('walkSequencesOnce stops at the first failed overdue touch', async () => {
  let call = 0;
  const { result, advances, agentCalls } = await runWalk({
    sequence: makeSequence([
      { day: 0, prompt: 'Touch 1 {{contact_path}}', channel: 'email' },
      { day: 1, prompt: 'Touch 2 {{contact_path}}', channel: 'email' },
      { day: 2, prompt: 'Touch 3 {{contact_path}}', channel: 'email' },
    ]),
    runAgent: async () => {
      call += 1;
      if (call === 2) throw new Error('second touch failed');
      return {};
    },
  });

  assert.equal(agentCalls, 2);
  assert.equal(result.fired, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(advances, [
    { contactPath: 'contacts/jane.md', nextStep: 1, status: 'active' },
  ]);
  assert.deepEqual(result.failures, [
    {
      contactPath: 'contacts/jane.md',
      sequencePath: 'sequences/cold-outbound-5-touch.md',
      step: 1,
      day: 1,
      kind: 'agent',
      target: 'email',
      error: 'second touch failed',
    },
  ]);
});

test('walkSequencesOnce marks the enrollment complete after the last successful touch', async () => {
  const { result, advances } = await runWalk({
    sequence: makeSequence([{ day: 0, prompt: 'Final touch {{contact_path}}', channel: 'email' }]),
  });

  assert.equal(result.fired, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(advances, [
    { contactPath: 'contacts/jane.md', nextStep: 1, status: 'complete' },
  ]);
});

test('loadPlaybook resolves the legacy outbound-draft alias', async (t) => {
  const previousContext = getContextRoot();
  const tempContext = await fs.mkdtemp(path.join(os.tmpdir(), 'bm-playbook-alias-'));
  await fs.mkdir(path.join(tempContext, 'playbooks'), { recursive: true });
  await fs.writeFile(
    path.join(tempContext, 'playbooks', 'draft-outbound.md'),
    `---
kind: playbook
name: draft-outbound
agent: sdr
inputs: []
---

Draft the email.
`,
    'utf-8',
  );

  setContextRoot(tempContext);
  t.after(async () => {
    setContextRoot(previousContext);
    await fs.rm(tempContext, { recursive: true, force: true });
  });

  const spec = await loadPlaybook('outbound-draft');
  assert.equal(spec.name, 'draft-outbound');
  assert.equal(spec.agent, 'sdr');
  assert.equal(spec.body, 'Draft the email.');
});
