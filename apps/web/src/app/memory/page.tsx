'use client';

/**
 * /memory — notes the agents read at the start of every run.
 *
 * Persists to `MEMORY.md` at the vault root via the existing
 * `readFile` / `writeFile` daemon endpoints. Whatever you type here
 * gets injected into agent context (alongside `us/CLAUDE.md`) — think
 * of it as the per-project sticky note.
 */

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, Check, Save } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { PageShell, PageHeader, PageBody, Button } from '../../components/ui/primitives';
import { Composer } from '../../components/composer';

const MEMORY_PATH = 'MEMORY.md';

export default function MemoryPage() {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const file = useQuery({
    queryKey: ['memory-file'],
    queryFn: () => api.readFile(MEMORY_PATH).catch((e) => {
      // 404 just means no MEMORY.md yet — start with an empty buffer.
      if (e instanceof ApiError && e.status === 404) return { content: '', frontmatter: {}, body: '' };
      throw e;
    }),
  });

  useEffect(() => {
    if (file.data && !dirty) setText(file.data.content ?? '');
  }, [file.data, dirty]);

  const save = useMutation({
    mutationFn: () => api.writeFile(MEMORY_PATH, text),
    onSuccess: () => {
      setDirty(false);
      setSavedAt(Date.now());
      qc.invalidateQueries({ queryKey: ['memory-file'] });
    },
  });

  return (
    <PageShell>
      <PageHeader
        title="Memory"
        subtitle="Notes and context every agent reads at the start of every run. Anything project-wide that doesn't fit a single file lives here."
        icon={Brain}
        trailing={
          <div className="flex items-center gap-2">
            {dirty ? (
              <span className="text-[11px] text-flame">unsaved</span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted dark:text-[#8C837C]">
                <Check className="w-3 h-3" /> saved
              </span>
            ) : null}
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              disabled={save.isPending || !dirty}
            >
              <Save className="w-3 h-3" />
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        }
      />
      <PageBody maxWidth="3xl">
        <Composer
          value={text}
          onChange={(v) => { setText(v); setDirty(true); }}
          onSubmit={() => save.mutate()}
          agents={[]}
          submitLabel="Save"
          placeholder={`Add notes the agents should remember across every run.\n\nExamples:\n- "We never email contacts on weekends"\n- "Always check us/market/icp.md before scoring leads"\n- "Use the casual brand voice — drop the corporate-speak"`}
          showKeyboardHints={false}
        />
        <p className="mt-3 text-[11px] text-muted dark:text-[#8C837C]">
          Stored at <code className="font-mono">{MEMORY_PATH}</code> in your vault — version-control it
          alongside the rest of your project.
        </p>
      </PageBody>
    </PageShell>
  );
}
