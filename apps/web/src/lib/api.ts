import { getBridge } from './bridge';

export type IntegrationProvider =
  | 'hubspot'
  | 'attio'
  | 'salesforce'
  | 'gong'
  | 'unipile'
  | 'slack'
  | 'gmail';

export type Integration = {
  provider: IntegrationProvider;
  status: 'connected' | 'disconnected';
  connectedAs?: string | null;
  connectedAt?: string | null;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { daemonPort, daemonToken } = getBridge();
  if (!daemonPort) throw new Error('daemon not connected');
  const res = await fetch(`http://127.0.0.1:${daemonPort}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${daemonToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, `${res.status} ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () =>
    request<{
      ok: boolean;
      version: string;
      vaultPath: string;
      model: string;
      zennConfigured: boolean;
      engine?: 'codex-cli' | 'builtin';
      localToken?: string;
    }>('/api/health'),
  setApiKey: (key: string) =>
    request<{ ok: true }>('/api/config/api-key', { method: 'POST', body: JSON.stringify({ key }) }),
  authStart: () => request<{ browserUrl: string; state: string }>('/api/auth/start'),
  tools: () => request<{ tools: Array<{ name: string; description: string; source: string }> }>('/api/tools'),
  vaultTree: () => request<{ tree: Array<{ path: string; type: 'file' | 'dir' }> }>('/api/vault/tree'),
  readFile: (p: string) =>
    request<{ content: string; frontmatter: Record<string, unknown>; body: string }>(
      `/api/vault/file?path=${encodeURIComponent(p)}`,
    ),
  writeFile: (path: string, content: string) =>
    request<{ ok: true }>('/api/vault/file', { method: 'PUT', body: JSON.stringify({ path, content }) }),
  backlinks: (p: string) =>
    request<{ backlinks: string[] }>(`/api/vault/backlinks?path=${encodeURIComponent(p)}`),
  integrationKeys: () =>
    request<{
      apify_api_key: boolean;
      enrichlayer_api_key: boolean;
      hubspot_api_key: boolean;
      apollo_api_key: boolean;
      attio_api_key: boolean;
      slack_webhook_url: boolean;
      resend_api_key: boolean;
      from_email: boolean;
      linkedin_cookie: boolean;
    }>('/api/config/integration-keys'),
  setIntegrationKeys: (body: {
    apify_api_key?: string;
    enrichlayer_api_key?: string;
    hubspot_api_key?: string;
    apollo_api_key?: string;
    attio_api_key?: string;
    slack_webhook_url?: string;
    resend_api_key?: string;
    from_email?: string;
    linkedin_cookie?: string;
  }) =>
    request<{ ok: true }>('/api/config/integration-keys', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  chat: (
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    agent?: string,
    threadId?: string,
  ) =>
    request<{ role: 'assistant'; content: string; runId: string; costCents: number; tokensIn: number; tokensOut: number }>(
      '/api/chat',
      { method: 'POST', body: JSON.stringify({ messages, agent, threadId }) },
    ),

  /** Streaming chat.  Invokes onEvent for every SSE frame the daemon emits. */
  chatStream: async (
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    opts: {
      agent?: string;
      threadId?: string;
      onEvent: (ev: { type: string; data: any }) => void;
      signal?: AbortSignal;
    },
  ) => {
    const { daemonPort, daemonToken } = getBridge();
    if (!daemonPort) throw new Error('daemon not connected');
    const res = await fetch(`http://127.0.0.1:${daemonPort}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${daemonToken}`,
      },
      body: JSON.stringify({ messages, agent: opts.agent, threadId: opts.threadId }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new ApiError(res.status, `${res.status} ${text.slice(0, 300)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        let event = 'message';
        const dataLines: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) event = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
        }
        if (!dataLines.length) continue;
        try {
          opts.onEvent({ type: event, data: JSON.parse(dataLines.join('\n')) });
        } catch {}
      }
    }
  },
  listChats: () =>
    request<{ threads: Array<{ threadId: string; agent: string; updatedAt: string; preview: string; count: number }> }>(
      '/api/chats',
    ),
  getChat: (id: string) =>
    request<{ threadId: string; agent: string; updatedAt: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }>(
      `/api/chats/${encodeURIComponent(id)}`,
    ),
  deleteChat: (id: string) =>
    request<{ ok: true }>(`/api/chats/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  runAgent: (agent: string, task: string) =>
    request<{ runId: string; final: string; tokensIn: number; tokensOut: number; costCents: number }>(
      '/api/agent/run',
      { method: 'POST', body: JSON.stringify({ agent, task }) },
    ),
  listRuns: () =>
    request<{ runs: Array<{ runId: string; agent: string; model: string; preview?: string; tokensIn: number; tokensOut: number; costCents: number; toolCalls: number; turns: number }> }>(
      '/api/agent/runs',
    ),
  getRun: (id: string) =>
    request<{
      meta: any;
      prompt: string;
      final: string;
      toolCalls: any[];
      threadId?: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    }>(`/api/agent/runs/${encodeURIComponent(id)}`),
  listIntegrations: () => request<{ integrations: Integration[] }>('/api/integrations'),
  saveIntegrationToken: (provider: IntegrationProvider, credentials: Record<string, string>) =>
    request<{ ok: true }>(`/api/integrations/${provider}`, {
      method: 'PUT',
      body: JSON.stringify({ credentials }),
    }),
  disconnectIntegration: (provider: IntegrationProvider) =>
    request<{ ok: true }>(`/api/integrations/${provider}`, { method: 'DELETE' }),
  oauthStart: (provider: IntegrationProvider) =>
    request<{ browserUrl: string }>(`/api/integrations/${provider}/oauth/start`),
  ontology: () =>
    request<{ nodes: OntologyNode[]; edges: OntologyEdge[] }>('/api/ontology'),

  // Drafts
  listDrafts: () =>
    request<{ drafts: Array<{ id: string; path: string; channel: string; to: string; subject?: string; body: string; tool: string; status: string; created_at?: string }> }>(
      '/api/drafts',
    ),
  approveDraft: (id: string) =>
    request<{ ok: boolean; messageId?: string; note?: string; error?: string }>(
      `/api/drafts/${encodeURIComponent(id)}/approve`,
      { method: 'POST' },
    ),
  rejectDraft: (id: string) =>
    request<{ ok: boolean }>(`/api/drafts/${encodeURIComponent(id)}/reject`, { method: 'POST' }),

  // Triggers
  listTriggers: () =>
    request<{ triggers: Array<{ name: string; schedule?: string; webhook?: boolean; playbook: string; enabled: boolean; body: string }> }>(
      '/api/triggers',
    ),
  fireTrigger: (name: string, input: Record<string, unknown> = {}) =>
    request<{ runId?: string; final?: string; error?: string }>(
      `/api/triggers/${encodeURIComponent(name)}/fire`,
      { method: 'POST', body: JSON.stringify({ input }) },
    ),
  reloadTriggers: () =>
    request<{ ok: true }>('/api/triggers/reload', { method: 'POST' }),
  installTriggerPresets: () =>
    request<{ created: string[]; existing: string[] }>(
      '/api/triggers/install-presets',
      { method: 'POST' },
    ),
  listPlaybooks: () =>
    request<{ playbooks: Array<{ name: string; group?: string; agent: string; inputs?: Array<{ name: string; required?: boolean }> }> }>(
      '/api/playbooks',
    ),
  runPlaybook: (name: string, inputs: Record<string, unknown>) =>
    request<{ runId: string; final: string; tokensIn: number; tokensOut: number; costCents: number }>(
      `/api/playbooks/${encodeURIComponent(name)}/run`,
      { method: 'POST', body: JSON.stringify({ inputs }) },
    ),
  onboardingState: () =>
    request<{ needsOnboarding: boolean; claudeDefault: boolean; hasSelfCompany: boolean }>(
      '/api/onboarding',
    ),
  completeOnboarding: (body: { domain: string; what_you_sell?: string; icp?: string; tone?: string }) =>
    request<{ ok: true }>('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  seedDemo: () =>
    request<{ ok: true; written: number; demo: string }>('/api/onboarding/demo', {
      method: 'POST',
    }),

  // Sequences (multi-touch drip).
  listSequences: () =>
    request<{
      sequences: Array<{
        path: string;
        name: string;
        description?: string;
        touches: Array<{ day: number; channel?: string; playbook?: string; prompt?: string }>;
        body: string;
        enrolled: { active: number; complete: number; total: number };
      }>;
      enrollments: Array<{
        contactPath: string;
        sequencePath: string;
        step: number;
        enrolledAt: string;
        status: 'active' | 'complete' | 'stopped';
      }>;
    }>('/api/sequences'),
  enrollInSequence: (contact_path: string, sequence_path: string) =>
    request<{ ok: true; contactPath: string; sequencePath: string; touches: number }>(
      '/api/sequences/enroll',
      { method: 'POST', body: JSON.stringify({ contact_path, sequence_path }) },
    ),
  stopEnrollment: (contact_path: string) =>
    request<{ ok: true }>('/api/sequences/stop', {
      method: 'POST',
      body: JSON.stringify({ contact_path }),
    }),
  walkSequences: () =>
    request<{
      enrollments: number;
      fired: number;
      failed: number;
      failures: Array<{
        contactPath: string;
        sequencePath: string;
        step: number;
        day: number;
        kind: 'playbook' | 'agent';
        target: string;
        error: string;
      }>;
    }>('/api/sequences/walk', { method: 'POST' }),

  // Projects (multi-vault). See daemon/src/projects.ts.
  listProjects: () =>
    request<ProjectsRegistry>('/api/projects'),
  addProject: (name: string, path?: string) =>
    request<ProjectsRegistry & { created: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, path }),
    }),
  activateProject: (id: string) =>
    request<ProjectsRegistry>('/api/projects/activate', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
  deleteProject: (id: string) =>
    request<ProjectsRegistry>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export type Project = { id: string; name: string; path: string };
export type ProjectsRegistry = { active: string; projects: Project[] };

export type OntologyNode = {
  id: string;
  kind: 'company' | 'contact' | 'deal' | 'draft' | 'agent' | 'playbook' | 'trigger' | 'memory' | 'knowledge' | 'other';
  label: string;
  path: string;
  mtime: number;
  size: number;
};

export type OntologyEdge = {
  source: string;
  target: string;
  label?: string;
};
