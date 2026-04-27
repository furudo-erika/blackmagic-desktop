'use client';

/**
 * <ExportPDFButton /> — small, reusable wrapper around the
 * window.bmBridge.exportPDF IPC. Drop it into any page header / detail
 * panel that wants a "save this report as a PDF" action.
 *
 * Behaviour:
 *   - Feature-detects the Electron preload bridge after mount. If absent
 *     (pure-web / next dev outside Electron), the button silently hides
 *     itself — no broken click handlers.
 *   - Loading state ("Exporting…" + spinner) while printToPDF is in flight.
 *   - Error surfaces under the button as a small flame Panel, matching the
 *     /geo reference implementation. The whole error block is `print:hidden`
 *     so it never leaks into the artifact if a user happens to print while
 *     an error is on screen.
 *
 * Was extracted from /geo's inline implementation in 0.5.46 so /runs,
 * /chat, /team/<slug>, and /context can all share the same code path
 * (and any future page just drops in this one line).
 */

import { useEffect, useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button, Panel } from './ui/primitives';

export function ExportPDFButton({
  filename,
  sectionTitle,
  className,
  variant = 'secondary',
  label = 'Export PDF',
}: {
  filename: string;
  sectionTitle?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  label?: string;
}) {
  const [canExport, setCanExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.bmBridge?.exportPDF === 'function') {
      setCanExport(true);
    }
  }, []);

  if (!canExport) return null;

  async function onClick() {
    if (typeof window === 'undefined' || typeof window.bmBridge?.exportPDF !== 'function') return;
    setExporting(true);
    setError(null);
    try {
      const res = await window.bmBridge.exportPDF({ filename, sectionTitle });
      if (!res.ok) setError(res.error || 'Export failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <span className={'inline-flex flex-col items-stretch gap-1 print:hidden ' + (className ?? '')}>
      <Button variant={variant} onClick={onClick} disabled={exporting}>
        {exporting ? (
          <Loader2 className="w-3 h-3 mr-1 inline animate-spin" />
        ) : (
          <FileDown className="w-3 h-3 mr-1 inline" />
        )}
        {exporting ? 'Exporting…' : label}
      </Button>
      {error && (
        <Panel className="p-2 border-flame/40 print:hidden">
          <div className="text-[11px] font-semibold text-flame">Export PDF failed: {error}</div>
        </Panel>
      )}
    </span>
  );
}
