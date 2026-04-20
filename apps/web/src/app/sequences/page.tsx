'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Repeat, Play, Users, CheckCircle2, Square } from 'lucide-react';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  EmptyState,
  Button,
} from '../../components/ui/primitives';

export default function SequencesPage() {
  const qc = useQueryClient();
  const seqs = useQuery({ queryKey: ['sequences'], queryFn: api.listSequences });
  const contacts = useQuery({
    queryKey: ['contacts-for-enroll'],
    queryFn: async () => {
      const tree = await api.vaultTree();
      return tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('contacts/') && f.path.endsWith('.md'),
      );
    },
  });

  const [enrollFor, setEnrollFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<string>('');

  const enroll = useMutation({
    mutationFn: ({ contact, sequence }: { contact: string; sequence: string }) =>
      api.enrollInSequence(contact, sequence),
    onSuccess: () => {
      setEnrollFor(null);
      setPicked('');
      qc.invalidateQueries({ queryKey: ['sequences'] });
    },
  });

  const stop = useMutation({
    mutationFn: (contact: string) => api.stopEnrollment(contact),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sequences'] }),
  });

  const [walkMsg, setWalkMsg] = useState<string | null>(null);
  const walk = useMutation({
    mutationFn: () => api.walkSequences(),
    onSuccess: (r) => {
      setWalkMsg(
        `${new Date().toLocaleTimeString()} · walked ${r.enrollments} enrollment${r.enrollments === 1 ? '' : 's'} · ${r.fired} fired · ${r.failed} failed`,
      );
      qc.invalidateQueries({ queryKey: ['sequences'] });
    },
    onError: (e: Error) => setWalkMsg(`error: ${e.message}`),
  });

  const enrollmentsBySeq = useMemo(() => {
    const m = new Map<string, { contactPath: string; step: number; enrolledAt: string; status: string }[]>();
    for (const e of seqs.data?.enrollments ?? []) {
      const arr = m.get(e.sequencePath) ?? [];
      arr.push(e);
      m.set(e.sequencePath, arr);
    }
    return m;
  }, [seqs.data]);

  const list = seqs.data?.sequences ?? [];

  return (
    <PageShell>
      <PageHeader
        title="Sequences"
        subtitle="Multi-touch drips that walk a contact through scheduled outreach over days or weeks."
        icon={Repeat}
        trailing={
          <div className="flex items-center gap-2">
            {walkMsg && (
              <span className={'text-[11px] font-mono ' + (walkMsg.startsWith('error') ? 'text-flame' : 'text-muted dark:text-[#8C837C]')}>
                {walkMsg}
              </span>
            )}
            <Button
              variant="secondary"
              onClick={() => walk.mutate()}
              disabled={walk.isPending}
            >
              <Play className="w-3 h-3" /> {walk.isPending ? 'Walking…' : 'Run walker now'}
            </Button>
          </div>
        }
      />
      <PageBody maxWidth="3xl">
        {seqs.isLoading && <div className="text-sm text-muted dark:text-[#8C837C]">loading…</div>}
        {seqs.error && <div className="text-sm text-flame">{(seqs.error as Error).message}</div>}

        {seqs.data && list.length === 0 && (
          <EmptyState
            icon={Repeat}
            title="No sequences yet."
            hint="Seed sequences are created under sequences/ on first daemon run. Drop a .md file there to define one."
          />
        )}

        <div className="space-y-4">
          {list.map((s) => {
            const enrolled = enrollmentsBySeq.get(s.path) ?? [];
            const isEnrolling = enrollFor === s.path;
            return (
              <Panel key={s.path}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink dark:text-[#F5F1EA]">{s.name}</div>
                    {s.description && (
                      <p className="mt-1 text-[12px] text-muted dark:text-[#8C837C]">{s.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-[11px] font-mono text-muted dark:text-[#8C837C]">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {s.enrolled.active} active
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {s.enrolled.complete} complete
                      </span>
                      <span>{s.touches.length} touches</span>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => setEnrollFor(isEnrolling ? null : s.path)}
                  >
                    Enroll contact
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.touches.map((t, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-mono px-2 py-0.5 rounded border border-line dark:border-[#2A241D] text-muted dark:text-[#8C837C]"
                    >
                      day {t.day} · {t.channel ?? (t.playbook ? `pb:${t.playbook}` : 'email')}
                    </span>
                  ))}
                </div>

                {isEnrolling && (
                  <div className="mt-3 pt-3 border-t border-line dark:border-[#2A241D] flex items-center gap-2">
                    <select
                      value={picked}
                      onChange={(e) => setPicked(e.target.value)}
                      className="flex-1 h-8 px-2 rounded-md border border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F] text-[12px] text-ink dark:text-[#E6E0D8]"
                    >
                      <option value="">— pick a contact —</option>
                      {contacts.data?.map((c) => (
                        <option key={c.path} value={c.path}>
                          {c.path.replace(/^contacts\//, '').replace(/\.md$/, '')}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="primary"
                      disabled={!picked || enroll.isPending}
                      onClick={() => enroll.mutate({ contact: picked, sequence: s.path })}
                    >
                      {enroll.isPending ? 'Enrolling…' : 'Enroll'}
                    </Button>
                  </div>
                )}

                {enrolled.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-line dark:border-[#2A241D] space-y-1">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C]">
                      Enrolled
                    </div>
                    {enrolled.map((e) => (
                      <div
                        key={e.contactPath}
                        className="flex items-center justify-between text-[12px] py-1"
                      >
                        <span className="font-mono text-muted dark:text-[#8C837C] truncate">
                          {e.contactPath.replace(/^contacts\//, '')}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-muted dark:text-[#8C837C]">
                            step {e.step}/{s.touches.length} · {e.status}
                          </span>
                          {e.status === 'active' && (
                            <button
                              onClick={() => stop.mutate(e.contactPath)}
                              className="p-1 rounded hover:bg-cream-light dark:hover:bg-[#17140F] text-muted hover:text-flame transition-colors"
                              aria-label="Stop"
                            >
                              <Square className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      </PageBody>
    </PageShell>
  );
}
