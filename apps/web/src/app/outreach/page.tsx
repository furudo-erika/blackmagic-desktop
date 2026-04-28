'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Send, Mail, Pencil, Check, X, Search } from 'lucide-react';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  EmptyState,
  Button,
} from '../../components/ui/primitives';
import { Composer } from '../../components/composer';
import { toast } from '../../components/ui/toast';

type DraftRow = {
  id: string;
  path: string;
  channel: string;
  to: string;
  subject?: string;
  body: string;
  tool: string;
  status: string;
  created_at?: string;
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  sent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  rejected: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
};

export default function OutreachPage() {
  const qc = useQueryClient();
  const drafts = useQuery({
    queryKey: ['drafts'],
    queryFn: async () => (await api.listDrafts()).drafts as DraftRow[],
    refetchInterval: 10_000,
  });
  const settings = useQuery({
    queryKey: ['drafts-settings'],
    queryFn: api.getDraftsSettings,
  });
  const setAutoSend = useMutation({
    mutationFn: (auto_send: boolean) => api.setDraftsSettings({ auto_send }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drafts-settings'] }),
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editSubject, setEditSubject] = useState('');

  const approve = useMutation({
    mutationFn: (d: DraftRow) => api.approveDraft(d.id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['drafts'] });
      if (r.ok) {
        toast.success(r.messageId ? `sent · ${r.messageId}` : r.note ?? 'approved');
      } else {
        toast.error(r.error ?? r.note ?? 'failed');
      }
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const reject = useMutation({
    mutationFn: (d: DraftRow) => api.rejectDraft(d.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drafts'] });
      toast.success('rejected');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const saveEdit = useMutation({
    mutationFn: async (d: DraftRow) => {
      const fm = {
        kind: 'draft',
        channel: d.channel,
        to: d.to,
        subject: editSubject,
        tool: d.tool,
        status: d.status,
        created_at: d.created_at,
      };
      const yaml = Object.entries(fm)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`)
        .join('\n');
      const content = `---\n${yaml}\n---\n\n${editBody}\n`;
      await api.writeFile(d.path, content);
    },
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['drafts'] });
    },
  });

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'sent' | 'approved' | 'rejected'>('all');

  const all = Array.isArray(drafts.data) ? drafts.data : [];
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        d.to.toLowerCase().includes(q) ||
        (d.subject ?? '').toLowerCase().includes(q) ||
        d.body.toLowerCase().includes(q) ||
        d.channel.toLowerCase().includes(q) ||
        (d.tool ?? '').toLowerCase().includes(q)
      );
    });
  }, [all, query, statusFilter]);

  const counts = useMemo(() => {
    const c = { all: all.length, pending: 0, sent: 0, approved: 0, rejected: 0 } as Record<string, number>;
    for (const d of all) c[d.status] = (c[d.status] ?? 0) + 1;
    return c;
  }, [all]);

  return (
    <PageShell>
      <PageHeader
        title="Outreach Drafts"
        subtitle="Drafts the agent wrote, waiting for your approve/reject. Approving sends via the configured tool; rejecting marks discarded."
        icon={Send}
      />
      <PageBody maxWidth="2xl">
        {/* Auto-send toggle — when on, draft_create writes the file and
            immediately fires approveDraft(). Skill frontmatter can still
            override per-skill via `auto: true/false`. */}
        <Panel className="mb-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink dark:text-[#F5F1EA]">Auto-send drafts</div>
            <div className="text-[11px] text-muted dark:text-[#8C837C] mt-0.5">
              Skip the approval gate. New drafts fire immediately through
              your configured email provider (Amazon SES preferred).
              Skills that set <code className="font-mono text-[10px]">auto: true</code>
              {' '}already bypass the gate regardless.
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={settings.data?.auto_send === true}
              disabled={settings.isLoading || setAutoSend.isPending}
              onChange={(e) => setAutoSend.mutate(e.target.checked)}
              className="accent-flame w-4 h-4"
            />
            <span className="text-sm text-ink dark:text-[#E6E0D8]">
              {settings.data?.auto_send ? 'On' : 'Off'}
            </span>
          </label>
        </Panel>

        {drafts.isLoading && <div className="text-sm text-muted dark:text-[#8C837C]">loading…</div>}
        {drafts.error && <div className="text-sm text-flame">{(drafts.error as Error).message}</div>}

        {/* Search + status filter. Skipped when there are zero drafts
            so the empty-state isn't crowded by controls that can't
            filter anything. */}
        {all.length > 0 && (
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted dark:text-[#8C837C] pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search to, subject, body, channel, tool…"
                className="w-full h-8 pl-8 pr-2 rounded-md border border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F] text-[12px] text-ink dark:text-[#E6E0D8] placeholder:text-muted dark:placeholder:text-[#6B625C]"
              />
            </div>
            <div className="flex items-center gap-1 text-[11px] font-mono">
              {(['all', 'pending', 'sent', 'approved', 'rejected'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={
                    'px-2 py-1 rounded-md border transition-colors ' +
                    (statusFilter === s
                      ? 'border-flame text-flame bg-flame/10'
                      : 'border-line dark:border-[#2A241D] text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]')
                  }
                >
                  {s} {counts[s] ?? 0}
                </button>
              ))}
            </div>
          </div>
        )}

        {!drafts.isLoading && !drafts.error && all.length === 0 && (
          <EmptyState
            icon={Mail}
            title="No drafts yet."
            hint="Ask the chat agent to draft an email or LinkedIn DM, or enroll a contact in a sequence. Drafts land here for approve/reject."
          />
        )}
        {!drafts.isLoading && !drafts.error && all.length > 0 && items.length === 0 && (
          <div className="text-sm text-muted dark:text-[#8C837C] px-1">
            No drafts match. Clear the filter or search to see all {all.length}.
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-3">
            {items.map((d) => {
              const isEditing = editing === d.path;
              const badge = STATUS_BADGE[d.status] ?? STATUS_BADGE.pending;
              const canApprove = d.status === 'pending' || d.status === 'approved';
              const canEdit = d.status === 'pending';
              return (
                <Panel key={d.path}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${badge}`}>
                          {d.status}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-muted dark:text-[#8C837C] font-mono">
                          {d.channel} · via {d.tool || '(no tool)'}
                        </span>
                      </div>
                      {isEditing ? (
                        <input
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          className="mt-2 w-full h-8 px-2 rounded-md border border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F] text-sm font-semibold text-ink dark:text-[#F5F1EA]"
                        />
                      ) : (
                        <div className="text-sm font-semibold text-ink dark:text-[#F5F1EA] mt-1 truncate">
                          {d.subject || '(no subject)'}
                        </div>
                      )}
                      <div className="text-[11px] text-muted dark:text-[#8C837C] font-mono truncate">
                        to: {d.to}
                        {d.created_at && <> · {new Date(d.created_at).toLocaleString()}</>}
                      </div>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="mt-3">
                      <Composer
                        value={editBody}
                        onChange={setEditBody}
                        onSubmit={() => saveEdit.mutate(d)}
                        agents={[]}
                        submitLabel="Save"
                        placeholder="Edit draft body…"
                        showKeyboardHints={false}
                      />
                    </div>
                  ) : (
                    <pre className="mt-3 text-[12px] whitespace-pre-wrap text-ink/80 dark:text-[#E6E0D8]/80 leading-relaxed font-sans">
                      {d.body}
                    </pre>
                  )}

                  <div className="mt-3 pt-3 border-t border-line dark:border-[#2A241D] flex items-center gap-2 flex-wrap">
                    {isEditing ? (
                      <>
                        <Button variant="primary" onClick={() => saveEdit.mutate(d)} disabled={saveEdit.isPending}>
                          <Check className="w-3 h-3" /> Save
                        </Button>
                        <Button variant="secondary" onClick={() => setEditing(null)}>
                          <X className="w-3 h-3" /> Cancel
                        </Button>
                      </>
                    ) : canApprove || canEdit ? (
                      <>
                        {canApprove && (
                          <Button
                            variant="primary"
                            disabled={approve.isPending}
                            onClick={() => approve.mutate(d)}
                          >
                            <Send className="w-3 h-3" />
                            {approve.isPending ? 'Sending…' : d.status === 'approved' ? 'Retry send' : 'Approve & send'}
                          </Button>
                        )}
                        {canEdit && (
                          <>
                            <Button
                              variant="secondary"
                              disabled={reject.isPending}
                              onClick={() => reject.mutate(d)}
                            >
                              Reject
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setEditing(d.path);
                                setEditBody(d.body);
                                setEditSubject(d.subject ?? '');
                              }}
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </Button>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-muted dark:text-[#8C837C]">
                        {d.status === 'sent' ? 'Sent draft is read-only.' : 'No actions available.'}
                      </span>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </PageBody>
    </PageShell>
  );
}
