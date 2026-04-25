'use client';

/**
 * UpgradeBanner — fixed top banner that appears when main.cjs detects a
 * newer version on R2 than the running app. Distribution is brew-only, so
 * we just paste the brew upgrade command the user needs to run.
 */

import { Check, Copy, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type UpgradePayload = {
  currentVersion: string;
  latestVersion: string;
  brewCommand: string;
};

const DISMISS_KEY = 'bm-upgrade-dismissed-for';

export function UpgradeBanner() {
  const [payload, setPayload] = useState<UpgradePayload | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const bridge = window.bmBridge;
    if (!bridge?.onUpdateAvailable) return;
    const unsubscribe = bridge.onUpdateAvailable((p: UpgradePayload) => {
      if (!p?.latestVersion) return;
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed === p.latestVersion) return;
      setPayload(p);
    });
    return unsubscribe;
  }, []);

  if (!payload) return null;

  const copy = () => {
    navigator.clipboard.writeText(payload.brewCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, payload.latestVersion);
    setPayload(null);
  };

  return (
    <div className="w-full bg-[#1f1a16] text-white border-b border-[rgba(255,255,255,0.08)]">
      <div className="flex items-center gap-3 px-4 py-2 text-[12.5px] max-w-[1280px] mx-auto">
        <span className="font-medium">
          Update available — {payload.currentVersion} →{' '}
          <span className="text-flame">{payload.latestVersion}</span>
        </span>
        <button
          type="button"
          onClick={copy}
          className="font-mono bg-black/40 hover:bg-black/60 border border-white/10 rounded-md px-2 py-1 flex items-center gap-2"
        >
          <span className="text-white/70">$</span>
          <span>{payload.brewCommand}</span>
          <span className="text-white/70 text-[10.5px] uppercase tracking-wide flex items-center gap-1 pl-1 border-l border-white/10">
            {copied ? (
              <>
                <Check className="w-3 h-3" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" /> Copy
              </>
            )}
          </span>
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss until next release"
          className="shrink-0 cursor-pointer rounded-md p-2 -m-1 text-white/60 hover:text-white hover:bg-white/15"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
