'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Repeat, Play, Users, CheckCircle2, Square } from 'lucide-react';

export default function SequencesPage() {
  const qc = useQueryClient();
  const seqs = useQuery({ queryKey: ['sequences'], queryFn: api.listSequences });
  const contacts = useQuery({
    queryKey: ['contacts-for-enroll'],
    queryFn: async () => {
      const tree = await api.vaultTree();
      return tree.tree.filter((f) => f.type === 'file' && f.path.startsWith('contacts/') && f.path.endsWith('.md'));
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

  const walk = useMutation({
    mutationFn: () => api.walkSequences(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sequences'] }),
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

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-line dark:border-[#2A241D] flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Repeat className="w-4 h-4 text-flame" /> Sequences
          </h1>
          <p className="text-xs text-muted">
            Multi-touch drip outreach. Enroll a contact and the daily walker fires each touch when its day offset elapses.
          </p>
        </div>
        <button
          onClick={() => walk.mutate()}
          disabled={walk.isPending}
          className="h-8 px-3 rounded-md border border-line dark:border-[#2A241D] text-[12px] hover:bg-cream-light dark:hover:bg-[#17140F] flex items-center gap-1.5"
        >
          <Play className="w-3 h-3" /> {walk.isPending ? 'walking…' : 'Run walker now'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {seqs.isLoading && <div className="text-sm text-muted">loading…</div>}
        {seqs.error && <div className="text-sm text-flame">{(seqs.error as Error).message}</div>}

        <div className="space-y-4 max-w-3xl">
          {seqs.data?.sequences.map((s) => {
            const enrolled = enrollmentsBySeq.get(s.path) ?? [];
            return (
              <div
                key={s.path}
                className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink dark:text-[#F5F1EA]">{s.name}</div>
                    {s.description && (
                      <p className="mt-1 text-[12px] text-muted dark:text-[#8C837C]">{s.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-[11px] font-mono text-muted">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {s.enrolled.active} active
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {s.enrolled.complete} complete
                      </span>
                      <span>{s.touches.length} touches</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setEnrollFor(enrollFor === s.path ? null : s.path)}
                    className="h-8 px-3 rounded-md bg-flame text-white text-[12px] font-medium hover:opacity-90 shrink-0"
                  >
                    Enroll contact
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.touches.map((t, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-mono px-2 py-0.5 rounded border border-line dark:border-[#2A241D] text-muted"
                    >
                      day {t.day} · {t.channel ?? (t.playbook ? `pb:${t.playbook}` : 'email')}
                    </span>
                  ))}
                </div>

                {enrollFor === s.path && (
                  <div className="mt-3 pt-3 border-t border-line dark:border-[#2A241D] flex items-center gap-2">
                    <select
                      value={picked}
                      onChange={(e) => setPicked(e.target.value)}
                      className="flex-1 h-8 px-2 rounded-md border border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F] text-[12px]"
                    >
                      <option value="">— pick a contact —</option>
                      {contacts.data?.map((c) => (
                        <option key={c.path} value={c.path}>
                          {c.path.replace(/^contacts\//, '').replace(/\.md$/, '')}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!picked || enroll.isPending}
                      onClick={() => enroll.mutate({ contact: picked, sequence: s.path })}
                      className="h-8 px-3 rounded-md bg-ink text-white text-[12px] font-medium disabled:opacity-40 hover:opacity-90"
                    >
                      {enroll.isPending ? 'enrolling…' : 'Enroll'}
                    </button>
                  </div>
                )}

                {enrolled.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-line dark:border-[#2A241D] space-y-1">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Enrolled</div>
                    {enrolled.map((e) => (
                      <div
                        key={e.contactPath}
                        className="flex items-center justify-between text-[12px] py-1"
                      >
                        <span className="font-mono text-muted truncate">
                          {e.contactPath.replace(/^contacts\//, '')}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-muted">
                            step {e.step}/{s.touches.length} · {e.status}
                          </span>
                          {e.status === 'active' && (
                            <button
                              onClick={() => stop.mutate(e.contactPath)}
                              className="p-1 rounded hover:bg-cream-light dark:hover:bg-[#17140F] text-muted hover:text-flame"
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
              </div>
            );
          })}
          {seqs.data && seqs.data.sequences.length === 0 && (
            <div className="text-sm text-muted">
              No sequences yet. Seed sequences are created in <code>sequences/</code> on first daemon run.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
