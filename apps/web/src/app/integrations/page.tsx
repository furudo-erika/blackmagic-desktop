'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Integration, type IntegrationProvider } from '../../lib/api';

type ProviderDef = {
  provider: IntegrationProvider;
  name: string;
  description: string;
  oauth: boolean;
  endpointField?: boolean;
};

type Group = {
  label: string;
  providers: ProviderDef[];
};

const GROUPS: Group[] = [
  {
    label: 'CRM',
    providers: [
      {
        provider: 'hubspot',
        name: 'HubSpot',
        description: 'Sync contacts, companies, deals. Write enrichment back.',
        oauth: true,
      },
      {
        provider: 'attio',
        name: 'Attio',
        description: 'Two-way sync with Attio objects and lists.',
        oauth: false,
        endpointField: true,
      },
      {
        provider: 'salesforce',
        name: 'Salesforce',
        description: 'Pull accounts, contacts, opportunities. Push updates to records.',
        oauth: true,
      },
    ],
  },
  {
    label: 'Sales engagement',
    providers: [
      {
        provider: 'gong',
        name: 'Gong',
        description: 'Ingest call recordings and transcripts for research.',
        oauth: false,
      },
      {
        provider: 'unipile',
        name: 'Unipile',
        description: 'LinkedIn and multi-channel messaging via Unipile API.',
        oauth: false,
        endpointField: true,
      },
    ],
  },
  {
    label: 'Messaging',
    providers: [
      {
        provider: 'slack',
        name: 'Slack',
        description: 'Post agent updates and receive slash commands in your workspace.',
        oauth: true,
      },
      {
        provider: 'gmail',
        name: 'Gmail',
        description: 'Send first-touch emails and read replies from an authorized inbox.',
        oauth: true,
      },
    ],
  },
];

export default function IntegrationsPage() {
  const query = useQuery({
    queryKey: ['integrations'],
    queryFn: api.listIntegrations,
    retry: false,
  });

  const missing = query.error instanceof ApiError && query.error.status === 404;
  const disabled = missing || query.isLoading || !!query.error;

  const byProvider = new Map<IntegrationProvider, Integration>();
  for (const i of query.data?.integrations ?? []) byProvider.set(i.provider, i);

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line">
        <h1 className="text-lg font-semibold">Integrations</h1>
        <p className="text-xs text-muted">Connect external systems so agents can read and write real data.</p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl mx-auto">
          {missing && (
            <div className="mb-6 px-4 py-3 rounded-lg border border-line bg-flame-soft text-sm text-ink">
              Daemon endpoint not yet wired. Cards render read-only until the daemon exposes
              <code className="font-mono text-xs mx-1">/api/integrations</code>.
            </div>
          )}
          {query.error && !missing && (
            <div className="mb-6 px-4 py-3 rounded-lg border border-line bg-white text-sm text-muted">
              Failed to load integrations: {(query.error as Error).message}
            </div>
          )}

          {GROUPS.map((group) => (
            <section key={group.label} className="mb-8">
              <h2 className="text-[11px] uppercase tracking-wider text-muted font-mono mb-3">{group.label}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {group.providers.map((def) => (
                  <IntegrationCard
                    key={def.provider}
                    def={def}
                    integration={byProvider.get(def.provider)}
                    disabled={disabled}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({
  def,
  integration,
  disabled,
}: {
  def: ProviderDef;
  integration?: Integration;
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [token, setToken] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const connected = integration?.status === 'connected';

  const saveMut = useMutation({
    mutationFn: (creds: Record<string, string>) => api.saveIntegrationToken(def.provider, creds),
    onSuccess: () => {
      setShowForm(false);
      setToken('');
      setEndpoint('');
      qc.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const disconnectMut = useMutation({
    mutationFn: () => api.disconnectIntegration(def.provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const oauthMut = useMutation({
    mutationFn: () => api.oauthStart(def.provider),
    onSuccess: (data) => {
      if (window.bmBridge?.openExternal) window.bmBridge.openExternal(data.browserUrl);
    },
  });

  function save() {
    const trimmed = token.trim();
    if (!trimmed) return;
    const creds: Record<string, string> = { token: trimmed };
    if (def.endpointField && endpoint.trim()) creds.endpoint = endpoint.trim();
    saveMut.mutate(creds);
  }

  return (
    <div className="bg-white rounded-xl border border-line p-5 flex flex-col gap-3">
      <div>
        <div className="text-[15px] font-semibold text-ink">{def.name}</div>
        <p className="text-xs text-muted mt-0.5">{def.description}</p>
      </div>

      <div className="text-xs">
        {connected ? (
          <span className="text-flame font-medium">
            Connected{integration?.connectedAs ? ` as ${integration.connectedAs}` : ''}
          </span>
        ) : (
          <span className="text-muted">Not connected</span>
        )}
      </div>

      {!showForm && (
        <div className="flex items-center gap-3 mt-auto">
          {connected ? (
            <button
              onClick={() => disconnectMut.mutate()}
              disabled={disabled || disconnectMut.isPending}
              className="h-8 px-3 rounded-md border border-line text-xs font-medium text-flame hover:bg-flame-soft disabled:opacity-40"
            >
              {disconnectMut.isPending ? 'Disconnecting…' : 'Disconnect'}
            </button>
          ) : def.oauth ? (
            <>
              <button
                onClick={() => oauthMut.mutate()}
                disabled={disabled || oauthMut.isPending}
                className="h-8 px-3 rounded-md bg-flame text-white text-xs font-medium hover:opacity-90 disabled:opacity-40"
              >
                {oauthMut.isPending ? 'Opening…' : 'Connect with OAuth'}
              </button>
              <button
                onClick={() => setShowForm(true)}
                disabled={disabled}
                className="text-xs text-muted hover:text-ink disabled:opacity-40"
              >
                Paste token
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              disabled={disabled}
              className="h-8 px-3 rounded-md bg-flame text-white text-xs font-medium hover:opacity-90 disabled:opacity-40"
            >
              Connect
            </button>
          )}
        </div>
      )}

      {showForm && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            rows={3}
            placeholder="Paste API token"
            className="resize-none bg-cream border border-line rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-flame"
          />
          {def.endpointField && (
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="Endpoint URL (optional)"
              className="bg-cream border border-line rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-flame"
            />
          )}
          {saveMut.error && (
            <div className="text-xs text-flame">{(saveMut.error as Error).message}</div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={disabled || saveMut.isPending || !token.trim()}
              className="h-8 px-3 rounded-md bg-flame text-white text-xs font-medium hover:opacity-90 disabled:opacity-40"
            >
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setToken('');
                setEndpoint('');
              }}
              className="h-8 px-3 rounded-md border border-line text-xs text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
