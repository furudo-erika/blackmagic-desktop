import { getBridge } from './bridge';

export type IntegrationProvider =
  | 'hubspot'
  | 'attio'
  | 'salesforce'
  | 'pipedrive'
  | 'gong'
  | 'unipile'
  | 'slack'
  | 'gmail'
  | 'feishu'
  | 'metabase'
  | 'supabase'
  | 'calcom'
  | 'discord'
  | 'telegram'
  | 'notion'
  | 'linear'
  | 'github'
  | 'stripe'
  | 'apify'
  | 'amazon_ses'
  | 'gsc'
  | 'google_analytics'
  | 'ghost'
  | 'wordpress'
  | 'rb2b'
  | 'google_calendar'
  | 'x';

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
  changelog: () =>
    request<{ content: string }>('/api/changelog'),
  health: () =>
    request<{
      ok: boolean;
      version: string;
      contextPath: string;
      model: string;
      zennConfigured: boolean;
      engine?: 'codex-cli' | 'builtin';
      localToken?: string;
    }>('/api/health'),
  // Plan / credits balance. Returns null when the user isn't signed
  // in (daemon 401s without a zenn_api_key) — the sidebar pill and
  // out-of-credits banner both handle null by hiding themselves, so
  // we don't want the 401 to surface as a thrown error that pollutes
  // the devtools console on every route change.
  // Plan shape mirrors /api/v1/plan on the web side (see
  // blackmagic-web/src/app/api/v1/plan/route.ts). `subscriptionStatus`
  // and `cancelAtPeriodEnd` are surfaced so the CreditsBanner can
  // branch on "sub active but allowance used up" vs "payment failed"
  // vs "no subscription, out of credits" — they were null until
  // 0.5.26 web landed. Older web builds without those fields return
  // undefined here, which the banner treats as the legacy
  // no-subscription shape.
  plan: async (): Promise<{
    plan: 'free' | 'starter' | 'pro' | 'team' | 'enterprise';
    creditsIncluded: number;
    creditsUsed: number;
    creditsRemaining: number;
    resetAt: string | null;
    subscriptionStatus?: 'active' | 'trialing' | 'past_due' | 'canceled' | null;
    cancelAtPeriodEnd?: boolean;
  } | null> => {
    try {
      return await request<{
        plan: 'free' | 'starter' | 'pro' | 'team' | 'enterprise';
        creditsIncluded: number;
        creditsUsed: number;
        creditsRemaining: number;
        resetAt: string | null;
        subscriptionStatus?: 'active' | 'trialing' | 'past_due' | 'canceled' | null;
        cancelAtPeriodEnd?: boolean;
      }>('/api/plan');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
  setApiKey: (key: string) =>
    request<{ ok: true }>('/api/config/api-key', { method: 'POST', body: JSON.stringify({ key }) }),
  authStart: () => request<{ browserUrl: string; state: string }>('/api/auth/start'),
  tools: () => request<{ tools: Array<{ name: string; description: string; source: string }> }>('/api/tools'),
  contextTree: () => request<{ tree: Array<{ path: string; type: 'file' | 'dir' }> }>('/api/context/tree'),
  readFile: (p: string) =>
    request<{ content: string; frontmatter: Record<string, unknown>; body: string }>(
      `/api/context/file?path=${encodeURIComponent(p)}`,
    ),
  writeFile: (path: string, content: string) =>
    request<{ ok: true }>('/api/context/file', { method: 'PUT', body: JSON.stringify({ path, content }) }),
  backlinks: (p: string) =>
    request<{ backlinks: string[] }>(`/api/context/backlinks?path=${encodeURIComponent(p)}`),
  listBackups: (p: string) =>
    request<{ backups: Array<{ name: string; path: string }> }>(
      `/api/context/backups?path=${encodeURIComponent(p)}`,
    ),
  integrationKeys: () =>
    request<{
      apify_api_key: boolean;
      hubspot_api_key: boolean;
      apollo_api_key: boolean;
      attio_api_key: boolean;
      feishu_app_id: boolean;
      feishu_app_secret: boolean;
      feishu_webhook_url: boolean;
      metabase_site_url: boolean;
      metabase_api_key: boolean;
      supabase_url: boolean;
      supabase_service_role_key: boolean;
      slack_webhook_url: boolean;
      resend_api_key: boolean;
      from_email: boolean;
      linkedin_cookie: boolean;
    }>('/api/config/integration-keys'),
  setIntegrationKeys: (body: {
    apify_api_key?: string;
    hubspot_api_key?: string;
    apollo_api_key?: string;
    attio_api_key?: string;
    feishu_app_id?: string;
    feishu_app_secret?: string;
    feishu_webhook_url?: string;
    metabase_site_url?: string;
    metabase_api_key?: string;
    supabase_url?: string;
    supabase_service_role_key?: string;
    slack_webhook_url?: string;
    resend_api_key?: string;
    from_email?: string;
    linkedin_cookie?: string;
  }) =>
    request<{ ok: true }>('/api/config/integration-keys', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getNotificationSettings: () =>
    request<{
      enabled: boolean;
      events: {
        agent_started: boolean;
        agent_completed: boolean;
        trigger_fired: boolean;
        trigger_completed: boolean;
      };
    }>('/api/config/notifications'),
  setNotificationSettings: (body: {
    enabled?: boolean;
    events?: Partial<{
      agent_started: boolean;
      agent_completed: boolean;
      trigger_fired: boolean;
      trigger_completed: boolean;
    }>;
  }) =>
    request<{
      enabled: boolean;
      events: {
        agent_started: boolean;
        agent_completed: boolean;
        trigger_fired: boolean;
        trigger_completed: boolean;
      };
    }>('/api/config/notifications', {
      method: 'PUT',
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
    request<{ threads: Array<{ threadId: string; agent: string; updatedAt: string; preview: string; count: number; starred?: boolean }> }>(
      '/api/chats',
    ),
  getChat: (id: string) =>
    request<{ threadId: string; agent: string; updatedAt: string; starred?: boolean; messages: Array<{ role: 'user' | 'assistant'; content: string }> }>(
      `/api/chats/${encodeURIComponent(id)}`,
    ),
  deleteChat: (id: string) =>
    request<{ ok: true }>(`/api/chats/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setChatStarred: (id: string, starred: boolean) =>
    request<{ ok: true; starred: boolean }>(`/api/chats/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ starred }),
    }),
  // fire-and-forget: endpoint returns as soon as the run dir + prompt are
  // persisted. The full run completes in the background; the UI picks
  // up progress via the `/api/agent/runs` poll.
  runAgent: (agent: string, task: string, opts?: { force?: boolean }) =>
    request<{ runId: string; runDir: string }>(
      '/api/agent/run',
      { method: 'POST', body: JSON.stringify({ agent, task, force: opts?.force }) },
    ),
  listRuns: () =>
    request<{ runs: Array<{ runId: string; agent: string; model: string; preview?: string; tokensIn: number; tokensOut: number; costCents: number; toolCalls: number; turns: number; done?: boolean; status?: 'running' | 'completed' | 'failed' | 'blocked' | 'canceled' }> }>(
      '/api/agent/runs',
    ),
  stopRun: (id: string) =>
    request<{ ok: true; alreadyDone?: boolean }>(
      `/api/agent/runs/${encodeURIComponent(id)}/stop`,
      { method: 'POST' },
    ),
  preflight: (kind: 'agent' | 'skill', slug: string) =>
    request<{
      ready: boolean;
      missing: {
        integrations: Array<{ kind: 'integration'; provider: string; label: string; hint: string }>;
        us_files: Array<{ kind: 'us_file'; path: string; hint: string; exists: boolean; isSeed: boolean }>;
        cli: Array<{ kind: 'cli'; name: string; install: string }>;
      };
      optional_integrations: Array<{ kind: 'integration'; provider: string; label: string; hint: string }>;
      inputs: Array<{ name: string; required: boolean; description?: string; enum?: string[]; default?: unknown }>;
      optional_inputs: Array<{ name: string; required: boolean; description?: string; enum?: string[]; default?: unknown }>;
      error?: string;
    }>(`/api/preflight/${kind}/${encodeURIComponent(slug)}`),
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

  // Starter prompts — project-aware click-to-send suggestions. Returns
  // { global, byAgent, slots }. `global` is ~6 cross-agent picks for
  // the Home page when no agent is selected; `byAgent[slug]` is the
  // per-agent list used when the composer pill is set OR on an agent
  // page. `slots` is returned for debugging only.
  getStarters: (agent?: string) =>
    request<{
      slots: Record<string, string | undefined>;
      global: Array<{ agent: string; prompt: string; template: string }>;
      byAgent: Record<string, Array<{ agent: string; prompt: string; template: string }>>;
    }>(`/api/starters${agent ? `?agent=${encodeURIComponent(agent)}` : ''}`),

  // Drafts
  listDrafts: () =>
    request<{ drafts: Array<{ id: string; path: string; channel: string; to: string; subject?: string; body: string; tool: string; status: string; created_at?: string }> }>(
      '/api/drafts',
    ),
  approveDraft: (id: string) =>
    request<{ ok: boolean; messageId?: string; provider?: string; note?: string; error?: string }>(
      `/api/drafts/${encodeURIComponent(id)}/approve`,
      { method: 'POST' },
    ),
  rejectDraft: (id: string) =>
    request<{ ok: boolean }>(`/api/drafts/${encodeURIComponent(id)}/reject`, { method: 'POST' }),
  getDraftsSettings: () =>
    request<{ auto_send: boolean }>('/api/drafts/settings'),
  setDraftsSettings: (body: { auto_send: boolean }) =>
    request<{ auto_send: boolean }>('/api/drafts/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  // Triggers
  listTriggers: () =>
    request<{
      triggers: Array<{
        name: string;
        schedule?: string;
        webhook?: boolean;
        playbook?: string;
        agent?: string;
        shell?: string;
        enabled: boolean;
        body: string;
      }>;
      lastRuns?: Record<string, { log: string; exit: number | null; finishedAt: string | null }>;
    }>('/api/triggers'),
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

  // Projects (multi-context). See daemon/src/projects.ts.
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

  // --- GEO (Generative Engine Optimization) ---
  geoConfig: () => request<GeoConfig>('/api/geo/config'),
  geoSaveConfig: (cfg: GeoConfig) =>
    request<{ ok: true }>('/api/geo/config', { method: 'PUT', body: JSON.stringify(cfg) }),
  geoPrompts: () => request<{ prompts: GeoPrompt[] }>('/api/geo/prompts'),
  geoAddPrompt: (body: { text: string; tags?: string[]; country_code?: string }) =>
    request<{ ok: true; prompt: GeoPrompt }>('/api/geo/prompts', { method: 'POST', body: JSON.stringify(body) }),
  geoDeletePrompt: (id: string) =>
    request<{ ok: boolean }>(`/api/geo/prompts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  geoRun: (body: { date?: string; models?: GeoModel[]; concurrency?: number } = {}) =>
    request<GeoRunSummary>('/api/geo/run', { method: 'POST', body: JSON.stringify(body) }),
  geoRuns: () => request<{ runs: GeoRunSummary[] }>('/api/geo/runs'),
  geoRunProgress: () =>
    request<{ progress: GeoRunProgress | null }>('/api/geo/run/progress'),
  geoReportBrands: (q: { start_date?: string; end_date?: string; model?: GeoModel } = {}) =>
    request<{ rows: GeoBrandRow[] }>(`/api/geo/reports/brands?${qs(q)}`),
  geoReportDomains: (q: { start_date?: string; end_date?: string; model?: GeoModel; limit?: number } = {}) =>
    request<{ rows: GeoDomainRow[] }>(`/api/geo/reports/domains?${qs(q)}`),
  geoGapSources: (q: { start_date?: string; end_date?: string; model?: GeoModel; limit?: number } = {}) =>
    request<{ rows: GeoGapRow[] }>(`/api/geo/reports/gap-sources?${qs(q)}`),
  geoSovTrend: (q: { brand_id: string; start_date?: string; end_date?: string; model?: GeoModel }) =>
    request<{ points: Array<{ date: string; sov: number; mentions: number }> }>(`/api/geo/reports/sov-trend?${qs(q)}`),
  geoDelta: (q: { start_date?: string; end_date?: string; model?: GeoModel } = {}) =>
    request<GeoDeltaReport>(`/api/geo/reports/delta?${qs(q)}`),
  geoSovTrendOverlay: (q: { brand_id: string; start_date?: string; end_date?: string; model?: GeoModel }) =>
    request<GeoTrendOverlay>(`/api/geo/reports/sov-trend-overlay?${qs(q)}`),

  // --- Entity activity / assignee / runs ---
  entityActivity: (entityPath: string) =>
    request<{ entries: EntityActivityEntry[] }>(`/api/entity/activity?path=${encodeURIComponent(entityPath)}`),
  entityComment: (body: { path: string; body: string; parent_id?: string; author?: EntityActor }) =>
    request<{ ok: true; entry: EntityActivityEntry }>('/api/entity/activity', { method: 'POST', body: JSON.stringify(body) }),
  entityAssignee: (entityPath: string) =>
    request<{ assignee: EntityAssignee }>(`/api/entity/assignee?path=${encodeURIComponent(entityPath)}`),
  entitySetAssignee: (body: { path: string; assignee: EntityAssignee; actor?: EntityActor }) =>
    request<{ ok: true; assignee: EntityAssignee; previous: EntityAssignee }>('/api/entity/assignee', { method: 'PUT', body: JSON.stringify(body) }),
  entityRuns: (entityPath: string) =>
    request<{ runs: Array<{ runId: string; agent: string; tokensIn: number; tokensOut: number; costCents: number; toolCalls: number; turns: number; preview?: string }> }>(`/api/entity/runs?path=${encodeURIComponent(entityPath)}`),

  // --- Lead pipeline (enrich → score → route → multi-CRM sync) ---
  pipelineRubric: () =>
    request<{
      rubric: {
        revision: string;
        rules: Array<{ id: string; weight: number; when: Record<string, unknown>; why?: string }>;
        fallbackScore: number;
      };
      routing: {
        default: { id: string; name?: string; type?: string } | null;
        rules: Array<{ match: Record<string, unknown>; owner: { id: string; name?: string; type?: string } }>;
      };
    }>('/api/pipeline/rubric'),
  pipelineScore: (record: Record<string, unknown>) =>
    request<{ ok: true; data: { score: number; reasons: string[]; matches: Array<{ criterion: string; weight: number; hit: boolean; detail?: string }>; rubricVersion: string } }>(
      '/api/pipeline/score',
      { method: 'POST', body: JSON.stringify({ record }) },
    ),
  pipelineRun: (body: { domain: string; name?: string; record?: Record<string, unknown>; sync?: Record<string, boolean> }) =>
    request<{
      ok: true;
      data: {
        domain: string;
        score: { score: number; reasons: string[]; rubricVersion: string };
        route: { assignee: { id: string; name?: string } | null; rule: string };
        targets: Record<string, { ok: boolean; skipped?: boolean; error?: string; data?: any }>;
      };
    }>('/api/pipeline/run', { method: 'POST', body: JSON.stringify(body) }),
};

export type EntityActor = { type: 'member' | 'agent' | 'system'; id: string; name?: string };
export type EntityAssignee = { type: 'agent' | 'member' | null; id: string | null; name?: string };
export type EntityActivityEntry = {
  id: string;
  ts: string;
  kind:
    | 'comment'
    | 'assign'
    | 'unassign'
    | 'status_change'
    | 'agent_run_started'
    | 'agent_run_finished'
    | 'agent_run_failed';
  author: EntityActor;
  content?: string;
  mentions?: string[];
  parent_id?: string;
  data?: Record<string, unknown>;
};

function qs(obj: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  return p.toString();
}

export type GeoModel = 'chatgpt' | 'perplexity' | 'google_ai_overview';
export type GeoBrand = { id: string; name: string; aliases?: string[]; domains?: string[]; is_us?: boolean };
export type GeoConfig = { brands: GeoBrand[]; models: GeoModel[] };
export type GeoPrompt = { id: string; text: string; tags?: string[]; country_code?: string; created_at: string };
export type GeoBrandRow = {
  brand_id: string;
  name: string;
  sov: number;
  mention_count: number;
  prompt_coverage: number;
  avg_position_char: number | null;
  citation_count: number;
};
export type GeoDomainRow = { domain: string; citation_count: number; prompt_count: number; models: GeoModel[] };
export type GeoGapRow = GeoDomainRow & { cited_for_brands: string[] };
export type GeoBrandDeltaRow = GeoBrandRow & { sov_prev: number; sov_delta: number; mention_delta: number };
export type GeoDomainDeltaRow = GeoDomainRow & { prev_citation_count: number; delta: number; status: 'new' | 'lost' | 'up' | 'down' | 'flat' };
export type GeoDeltaReport = {
  window: { start: string; end: string; days: number };
  prev_window: { start: string; end: string };
  brands: GeoBrandDeltaRow[];
  domains_top_up: GeoDomainDeltaRow[];
  domains_top_down: GeoDomainDeltaRow[];
  domains_new: GeoDomainDeltaRow[];
  domains_lost: GeoDomainDeltaRow[];
  movers: {
    brand_sov_up: GeoBrandDeltaRow | null;
    brand_sov_down: GeoBrandDeltaRow | null;
    new_domain: GeoDomainDeltaRow | null;
    lost_domain: GeoDomainDeltaRow | null;
  };
};
export type GeoTrendOverlay = {
  current: Array<{ day_index: number; date: string; sov: number; mentions: number }>;
  prior: Array<{ day_index: number; date: string; sov: number; mentions: number }>;
  window: { start: string; end: string; days: number };
  prev_window: { start: string; end: string };
};
export type GeoRunSummary = {
  date: string;
  models: GeoModel[];
  prompts_total: number;
  runs_total: number;
  runs_ok: number;
  runs_error: number;
  errors: Array<{ prompt_id: string; model: GeoModel; error: string }>;
  duration_ms: number;
};

export type GeoRunProgress = {
  started_at: string;
  date: string;
  total: number;
  done: number;
  current: { model: GeoModel; prompt_id: string } | null;
  ok: number;
  error: number;
  running: boolean;
  finished_at?: string;
};

export type Project = { id: string; name: string; path: string; logo_url?: string };
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
