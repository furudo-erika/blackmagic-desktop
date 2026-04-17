'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Send, Mail, Pencil, Check, X } from 'lucide-react';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  EmptyState,
  Button,
} from '../../components/ui/primitives';

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

  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [flash, setFlash] = useState<{ path: string; text: string; kind: 'ok' | 'err' } | null>(null);

  const approve = useMutation({
    mutationFn: (d: DraftRow) => api.approveDraft(d.id),
    onSuccess: (r, d) => {
      qc.invalidateQueries({ queryKey: ['drafts'] });
      setFlash({
        path: d.path,
        text: r.ok ? (r.messageId ? `sent · ${r.messageId}` : r.note ?? 'approved') : r.error ?? r.note ?? 'failed',
        kind: r.ok ? 'ok' : 'err',
      });
    },
    onError: (err, d) => setFlash({ path: d.path, text: (err as Error).message, kind: 'err' }),
  });

  const reject = useMutation({
    mutationFn: (d: DraftRow) => api.rejectDraft(d.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drafts'] }),
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

  const items = drafts.data ?? [];

  return (
    <PageShell>
      <PageHeader
        title="Outreach Drafts"
        subtitle="Drafts the agent wrote, waiting for your approve/reject. Approving sends via the configured tool; rejecting marks discarded."
        icon={Send}
      />
      <PageBody maxWidth="2xl">
        {drafts.isLoading && <div className="text-sm text-muted dark:text-[#8C837C]">loading…</div>}
        {drafts.error && <div className="text-sm text-flame">{(drafts.error as Error).message}</div>}

        {!drafts.isLoading && !drafts.error && items.length === 0 && (
          <EmptyState
            icon={Mail}
            title="No drafts yet."
            hint="Ask the chat agent to draft an email or LinkedIn DM, or enroll a contact in a sequence. Drafts land here for approve/reject."
          />
        )}

        {items.length > 0 && (
          <div className="space-y-3">
            {items.map((d) => {
              const isEditing = editing === d.path;
              const badge = STATUS_BADGE[d.status] ?? STATUS_BADGE.pending;
              const isPending = d.status === 'pending' || d.status === 'approved';
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
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={Math.min(20, Math.max(6, editBody.split('\n').length + 1))}
                      className="mt-3 w-full p-2 rounded-md border border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F] text-[12px] text-ink dark:text-[#E6E0D8] font-mono leading-relaxed"
                    />
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
                    ) : (
                      <>
                        <Button
                          variant="primary"
                          disabled={!isPending || approve.isPending}
                          onClick={() => approve.mutate(d)}
                        >
                          <Send className="w-3 h-3" />
                          {approve.isPending ? 'Sending…' : d.status === 'approved' ? 'Retry send' : 'Approve & send'}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={!isPending || reject.isPending}
                          onClick={() => reject.mutate(d)}
                        >
                          Reject
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={!isPending}
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
                    {flash?.path === d.path && (
                      <span
                        className={`ml-auto text-[11px] font-mono ${
                          flash.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-flame'
                        }`}
                      >
                        {flash.text}
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
