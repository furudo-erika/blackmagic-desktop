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
};

/**
 * Brand logo paths from Simple Icons (simpleicons.org, MIT licensed).
 * Each entry is an SVG `d` string rendered in white on the brand's
 * colored background tile. We prefer the canonical brand mark over
 * initials so each card is actually identifiable at a glance.
 */
const BRAND_PATHS: Record<IntegrationProvider, string> = {
  hubspot:
    'M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.194v.067a2.196 2.196 0 001.252 1.973l.013.005v2.852a6.212 6.212 0 00-2.969 1.31l.012-.01-7.842-6.105A2.516 2.516 0 104.042 4.52l-.015-.008 7.714 6.005a6.228 6.228 0 00-1.042 3.468c0 1.368.442 2.633 1.19 3.66l-.012-.017-2.348 2.352A2.004 2.004 0 008.904 20a2.004 2.004 0 00-.625 1.46v.005c0 .525.202 1.003.533 1.36l-.001-.002A1.988 1.988 0 0010.276 23.4c.52 0 .993-.201 1.346-.528l-.001.001.017-.017 2.318-2.322A6.23 6.23 0 1018.164 7.93zm-4.097 9.336a3.195 3.195 0 110-6.39 3.195 3.195 0 010 6.39z',
  attio:
    'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4.5a7.5 7.5 0 110 15 7.5 7.5 0 010-15zm0 3a4.5 4.5 0 100 9 4.5 4.5 0 000-9z',
  salesforce:
    'M10.006 5.415a4.195 4.195 0 013.045-1.306c1.56 0 2.954.9 3.69 2.205.63-.3 1.35-.45 2.1-.45 2.85 0 5.159 2.34 5.159 5.22 0 2.88-2.31 5.22-5.16 5.22-.345 0-.69-.033-1.02-.1-.84 1.5-2.43 2.52-4.26 2.52-.78 0-1.5-.18-2.16-.48a4.732 4.732 0 01-4.395 2.925c-2.55 0-4.695-2.355-4.695-4.92 0-.345.045-.69.105-1.02-1.44-.75-2.4-2.25-2.4-3.975 0-2.475 2.025-4.5 4.5-4.5.72 0 1.395.165 2.01.465a5.05 5.05 0 013.48-1.805z',
  gong:
    'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 3.6a8.4 8.4 0 110 16.8 8.4 8.4 0 010-16.8zm0 2.4a6 6 0 100 12 6 6 0 000-12zm0 2.4a3.6 3.6 0 110 7.2 3.6 3.6 0 010-7.2z',
  unipile:
    'M3 3v11.25a6.75 6.75 0 0013.5 0V3h-3v11.25a3.75 3.75 0 01-7.5 0V3H3zm15 0v18h3V3h-3z',
  slack:
    'M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.522 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.835a2.528 2.528 0 012.522-2.522h6.312zm10.122 2.522a2.528 2.528 0 012.522-2.522A2.528 2.528 0 0124 8.835a2.528 2.528 0 01-2.522 2.521h-2.522V8.835zm-1.268 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.313zM15.165 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z',
  gmail:
    'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-.904.732-1.636 1.636-1.636h.819L12 10.731l9.545-6.91h.82c.903 0 1.635.732 1.635 1.636z',
  feishu:
    'M11.02 17.284a15.48 15.48 0 01-5.203 1.884c-.64.11-1.29.176-1.947.176-.78 0-1.547-.088-2.283-.264a6.86 6.86 0 01-1.147-.382l-.44-.198.44-.22c1.745-.874 3.31-1.856 4.73-2.962a25.91 25.91 0 001.947-1.642c.485-.44.95-.903 1.392-1.386l.264-.287.22.287a12.75 12.75 0 001.945 1.856c.617.462 1.256.88 1.924 1.254l.44.22-.44.22c-.38.198-.79.374-1.213.528l-.22.066-.088.044-.132.044-.132.022-.22.06-.22.066c-.038.012-.08.022-.12.033l-.22.066zm6.88-4.95c.374-.374.725-.77 1.054-1.188 1.28-1.58 2.272-3.395 2.95-5.369L22.61 4a9.78 9.78 0 00-1.036-.77c-.46-.308-.946-.572-1.452-.814l-.32-.132-.088.374a19.155 19.155 0 01-1.783 4.532 22.88 22.88 0 01-2.464 3.66l-.286.308.374.264a18.54 18.54 0 001.76 1.034l.352.176.242-.308zM12 2.4c-2.51 0-4.95.512-7.217 1.518l-.34.154.286.22c.816.66 1.588 1.364 2.33 2.112.725.726 1.41 1.496 2.067 2.288l.22.263.22-.263a14.98 14.98 0 012.31-2.266 15.06 15.06 0 012.266-1.58l.33-.198-.33-.198a12.43 12.43 0 00-1.342-.748A8.28 8.28 0 0012 2.4zm11.297 9.152L23.188 12a11.39 11.39 0 00-1.1-4.686l-.154-.33-.198.33a20.105 20.105 0 01-2.618 3.396 20.51 20.51 0 01-3.22 2.706l-.287.198.198.287c.88 1.232 1.856 2.398 2.948 3.44l.22.22.22-.242a11.55 11.55 0 003.11-5.767z',
  metabase:
    'M2.699 15.068a1.35 1.35 0 11-.002 2.701 1.35 1.35 0 01.002-2.701zm5.396-.125a1.35 1.35 0 11-.002 2.702 1.35 1.35 0 01.002-2.702zm5.31 0a1.35 1.35 0 11-.001 2.702 1.35 1.35 0 01.002-2.702zm5.31 0a1.35 1.35 0 11-.002 2.702 1.35 1.35 0 01.002-2.702zm-10.62-8.1a1.35 1.35 0 11-.001 2.7 1.35 1.35 0 01.002-2.7zm5.31 0a1.35 1.35 0 11-.001 2.7 1.35 1.35 0 01.002-2.7zm5.31 0a1.35 1.35 0 11-.001 2.7 1.35 1.35 0 01.002-2.7zm0-6.843a1.35 1.35 0 110 2.7 1.35 1.35 0 010-2.7zm-5.31 0a1.35 1.35 0 110 2.7 1.35 1.35 0 010-2.7zm-5.31 0a1.35 1.35 0 110 2.7 1.35 1.35 0 010-2.7zm-5.395 8.1a1.35 1.35 0 11-.001 2.7 1.35 1.35 0 01.002-2.7zm0-6.843a1.35 1.35 0 110 2.7 1.35 1.35 0 010-2.7zm18.9 13.686a1.35 1.35 0 11-.002 2.702 1.35 1.35 0 01.002-2.702z',
  supabase:
    'M11.9 1.375c-.4 0-.7.2-.9.5L.6 14.575c-.4.5-.4 1.2 0 1.7.2.3.5.4.8.4H9.9v6.4c0 .4.3.8.8.8.3 0 .5-.2.7-.4l10.4-12.7c.4-.5.4-1.2 0-1.7-.2-.3-.5-.4-.8-.4H14.1v-6.4c0-.4-.3-.8-.8-.8h-1.4z',
};

function BrandLogo({ provider, color }: { provider: IntegrationProvider; color: string }) {
  const d = BRAND_PATHS[provider];
  return (
    <div
      aria-hidden
      className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
      style={{ background: color }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="#ffffff" aria-hidden>
        <path d={d} />
      </svg>
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
      },
      {
        provider: 'attio',
        name: 'Attio',
        description: 'Two-way sync with Attio objects and lists.',
        oauth: false,
        endpointField: true,
        brandColor: '#1F2937',
      },
      {
        provider: 'salesforce',
        name: 'Salesforce',
        description: 'Pull accounts, contacts, opportunities. Push updates to records.',
        oauth: true,
        brandColor: '#00A1E0',
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
      },
      {
        provider: 'unipile',
        name: 'Unipile',
        description: 'LinkedIn and multi-channel messaging via Unipile API.',
        oauth: false,
        endpointField: true,
        brandColor: '#0066FF',
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
      },
      {
        provider: 'gmail',
        name: 'Gmail',
        description: 'Send first-touch emails and read replies from an authorized inbox.',
        oauth: true,
        brandColor: '#EA4335',
      },
      {
        provider: 'feishu',
        name: 'Feishu',
        description: 'Post notifications, send DMs/group messages, and read Bitable rows via custom bot or tenant token.',
        oauth: false,
        brandColor: '#3370FF',
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
      },
      {
        provider: 'supabase',
        name: 'Supabase',
        description: 'Read/write Postgres rows and call RPC functions via service_role key.',
        oauth: false,
        endpointField: true,
        brandColor: '#3ECF8E',
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
        <BrandLogo provider={def.provider} color={def.brandColor} />
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
