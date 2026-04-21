'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Integration, type IntegrationProvider } from '../../lib/api';
import { Plug } from 'lucide-react';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  Button,
} from '../../components/ui/primitives';

type ProviderDef = {
  provider: IntegrationProvider;
  name: string;
  description: string;
  oauth: boolean;
  endpointField?: boolean;
  brandColor: string;
  /** Glyph shown in the brand tile — usually the first letter of the
   *  brand name. Short forms like "SF" or CJK glyphs work too. */
  brandGlyph: string;
};

/**
 * Square brand tile — colored background + short initial glyph. A
 * lightweight stand-in for real brand SVGs that keeps bundle size
 * flat and still gives each card visual identity instead of the old
 * name-only header.
 */
function BrandTile({ color, glyph }: { color: string; glyph: string }) {
  return (
    <div
      aria-hidden
      className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 text-white font-semibold text-[13px] tracking-tight"
      style={{ background: color }}
    >
      {glyph}
    </div>
  );
}

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
        brandColor: '#FF7A59',
        brandGlyph: 'H',
      },
      {
        provider: 'attio',
        name: 'Attio',
        description: 'Two-way sync with Attio objects and lists.',
        oauth: false,
        endpointField: true,
        brandColor: '#1F2937',
        brandGlyph: 'A',
      },
      {
        provider: 'salesforce',
        name: 'Salesforce',
        description: 'Pull accounts, contacts, opportunities. Push updates to records.',
        oauth: true,
        brandColor: '#00A1E0',
        brandGlyph: 'SF',
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
        brandColor: '#8017D8',
        brandGlyph: 'G',
      },
      {
        provider: 'unipile',
        name: 'Unipile',
        description: 'LinkedIn and multi-channel messaging via Unipile API.',
        oauth: false,
        endpointField: true,
        brandColor: '#0066FF',
        brandGlyph: 'U',
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
        brandColor: '#611F69',
        brandGlyph: 'S',
      },
      {
        provider: 'gmail',
        name: 'Gmail',
        description: 'Send first-touch emails and read replies from an authorized inbox.',
        oauth: true,
        brandColor: '#EA4335',
        brandGlyph: 'M',
      },
      {
        provider: 'feishu',
        name: 'Feishu',
        description: 'Post notifications, send DMs/group messages, and read Bitable rows via custom bot or tenant token.',
        oauth: false,
        brandColor: '#3370FF',
        brandGlyph: '飞',
      },
    ],
  },
  {
    label: 'Data',
    providers: [
      {
        provider: 'metabase',
        name: 'Metabase',
        description: 'Run saved questions and ad-hoc SQL against your Metabase instance.',
        oauth: false,
        endpointField: true,
        brandColor: '#509EE3',
        brandGlyph: 'MB',
      },
      {
        provider: 'supabase',
        name: 'Supabase',
        description: 'Read/write Postgres rows and call RPC functions via service_role key.',
        oauth: false,
        endpointField: true,
        brandColor: '#3ECF8E',
        brandGlyph: 'S',
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
    <PageShell>
      <PageHeader
        title="Integrations"
        subtitle="Connect external systems so agents can read and write real data — CRMs, messaging, sales tools."
        icon={Plug}
      />
      <PageBody maxWidth="5xl">
        {missing && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-line dark:border-[#2A241D] bg-flame-soft text-sm text-ink dark:text-[#E6E0D8]">
            Daemon endpoint not yet wired. Cards render read-only until the daemon exposes
            <code className="font-mono text-xs mx-1">/api/integrations</code>.
          </div>
        )}
        {query.error && !missing && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] text-sm text-muted dark:text-[#8C837C]">
            Failed to load integrations: {(query.error as Error).message}
          </div>
        )}

        {GROUPS.map((group) => (
          <section key={group.label} className="mb-8">
            <h2 className="text-[11px] uppercase tracking-wider text-muted dark:text-[#8C837C] font-mono mb-3">
              {group.label}
            </h2>
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
      </PageBody>
    </PageShell>
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
    <Panel className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <BrandTile color={def.brandColor} glyph={def.brandGlyph} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink dark:text-[#F5F1EA]">{def.name}</div>
          <p className="text-xs text-muted dark:text-[#8C837C] mt-0.5">{def.description}</p>
        </div>
      </div>

      <div className="text-xs">
        {connected ? (
          <span className="text-flame font-medium">
            Connected{integration?.connectedAs ? ` as ${integration.connectedAs}` : ''}
          </span>
        ) : (
          <span className="text-muted dark:text-[#8C837C]">Not connected</span>
        )}
      </div>

      {!showForm && (
        <div className="flex items-center gap-3 mt-auto">
          {connected ? (
            <Button
              variant="danger"
              onClick={() => disconnectMut.mutate()}
              disabled={disabled || disconnectMut.isPending}
            >
              {disconnectMut.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          ) : def.oauth ? (
            <>
              <Button
                variant="primary"
                onClick={() => oauthMut.mutate()}
                disabled={disabled || oauthMut.isPending}
              >
                {oauthMut.isPending ? 'Opening…' : 'Connect with OAuth'}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(true)} disabled={disabled}>
                Paste token
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setShowForm(true)} disabled={disabled}>
              Connect
            </Button>
          )}
        </div>
      )}

      {showForm && (
        <div className="flex flex-col gap-2 border-t border-line dark:border-[#2A241D] pt-3">
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            rows={3}
            placeholder="Paste API token"
            className="resize-none bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-2 text-xs font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
          />
          {def.endpointField && (
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="Endpoint URL (optional)"
              className="bg-cream dark:bg-[#0F0D0A] border border-line dark:border-[#2A241D] rounded-md px-3 py-2 text-xs font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
            />
          )}
          {saveMut.error && (
            <div className="text-xs text-flame">{(saveMut.error as Error).message}</div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={save}
              disabled={disabled || saveMut.isPending || !token.trim()}
            >
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setToken('');
                setEndpoint('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
