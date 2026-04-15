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
  chat: (
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    agent?: string,
    threadId?: string,
  ) =>
    request<{ role: 'assistant'; content: string; runId: string; costCents: number; tokensIn: number; tokensOut: number }>(
      '/api/chat',
      { method: 'POST', body: JSON.stringify({ messages, agent, threadId }) },
    ),
  listChats: () =>
    request<{ threads: Array<{ threadId: string; agent: string; updatedAt: string; preview: string; count: number }> }>(
      '/api/chats',
    ),
  getChat: (id: string) =>
    request<{ threadId: string; agent: string; updatedAt: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }>(
      `/api/chats/${encodeURIComponent(id)}`,
    ),
  runAgent: (agent: string, task: string) =>
    request<{ runId: string; final: string; tokensIn: number; tokensOut: number; costCents: number }>(
      '/api/agent/run',
      { method: 'POST', body: JSON.stringify({ agent, task }) },
    ),
  listRuns: () =>
    request<{ runs: Array<{ runId: string; agent: string; model: string; tokensIn: number; tokensOut: number; costCents: number; toolCalls: number; turns: number }> }>(
      '/api/agent/runs',
    ),
  getRun: (id: string) =>
    request<{ meta: any; prompt: string; final: string; toolCalls: any[] }>(`/api/agent/runs/${encodeURIComponent(id)}`),
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
  onboardingState: () =>
    request<{ needsOnboarding: boolean; claudeDefault: boolean; hasSelfCompany: boolean }>(
      '/api/onboarding',
    ),
  completeOnboarding: (body: { domain: string; what_you_sell?: string; icp?: string; tone?: string }) =>
    request<{ ok: true }>('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

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
