'use client';

/**
 * CreditsBanner — fixed top banner shown when the signed-in user is out of
 * BlackMagic credits. Runs and chat requests that hit the cloud proxy
 * return 402 in that state, so we give the user a heads-up and a single
 * click to top up instead of surfacing a cryptic server error.
 */

import { useQuery } from '@tanstack/react-query';
import { CreditCard, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';

export function CreditsBanner() {
  const plan = useQuery({
    queryKey: ['bm-plan'],
    queryFn: api.plan,
    refetchInterval: 60_000,
    retry: false,
  });
  const [dismissed, setDismissed] = useState(false);
  const remaining = plan.data?.creditsRemaining ?? null;
  if (remaining === null) return null;
  if (remaining > 0) return null;
  if (dismissed) return null;

  function openBilling() {
    const url = 'https://blackmagic.engineering/dashboard/billing';
    if (typeof window !== 'undefined' && window.bmBridge?.openExternal) {
      window.bmBridge.openExternal(url);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener');
    }
  }

  return (
    <div className="w-full bg-flame text-white border-b border-flame/60">
      <div className="flex items-center gap-3 px-4 py-2 text-[12.5px] max-w-[1280px] mx-auto">
        <CreditCard className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">
          You're out of credits. Agent runs and chat requests that hit the
          cloud will fail until you top up.
        </span>
        <button
          type="button"
          onClick={openBilling}
          className="font-semibold bg-white text-flame rounded-md px-2.5 py-1 hover:bg-white/90"
        >
          Top up
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="text-white/70 hover:text-white p-1 rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
