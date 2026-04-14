import { getBridge } from './bridge';

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
    throw new Error(`${res.status} ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () =>
    request<{ ok: boolean; version: string; vaultPath: string; model: string; zennConfigured: boolean; localToken?: string }>(
      '/api/health',
    ),
  setApiKey: (key: string) =>
    request<{ ok: true }>('/api/config/api-key', { method: 'POST', body: JSON.stringify({ key }) }),
  tools: () => request<{ tools: Array<{ name: string; description: string; source: string }> }>('/api/tools'),
  vaultTree: () => request<{ tree: Array<{ path: string; type: 'file' | 'dir' }> }>('/api/vault/tree'),
  readFile: (p: string) =>
    request<{ content: string; frontmatter: Record<string, unknown>; body: string }>(
      `/api/vault/file?path=${encodeURIComponent(p)}`,
    ),
  writeFile: (path: string, content: string) =>
    request<{ ok: true }>('/api/vault/file', { method: 'PUT', body: JSON.stringify({ path, content }) }),
  chat: (messages: Array<{ role: string; content: string }>, agent?: string) =>
    request<{ role: 'assistant'; content: string; runId: string; costCents: number }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, agent }),
    }),
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
};
