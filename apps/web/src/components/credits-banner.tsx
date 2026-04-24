'use client';

/**
 * CreditsBanner — fixed top banner surfacing plan / credit state to the
 * user. Branches on `subscriptionStatus` + `creditsRemaining` into four
 * mutually-exclusive cases:
 *
 *   1. payment failed        — `subscriptionStatus === 'past_due'`
 *      Show an urgent banner + deep link to Stripe Customer Portal so
 *      the user can update the card. Takes precedence over every other
 *      state (even a running allowance) because access will be yanked
 *      at the next dunning step.
 *   2. active sub, exhausted — sub active AND `creditsRemaining === 0`
 *      Soft nudge: "you've used this month's Pro credits, resets {X},
 *      top up to keep going." Lets the user hit Top Up without thinking
 *      they need to upgrade the plan.
 *   3. no sub, exhausted     — no sub AND `creditsRemaining === 0`
 *      Original "out of credits" banner → billing page.
 *   4. everything else       — nothing to show.
 */

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CreditCard, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';

type BannerKind = 'past_due' | 'sub_exhausted' | 'out_of_credits' | null;

export function CreditsBanner() {
  const plan = useQuery({
    queryKey: ['bm-plan'],
    queryFn: api.plan,
    refetchInterval: 60_000,
    retry: false,
  });
  const [dismissed, setDismissed] = useState<BannerKind>(null);

  const data = plan.data;
  const kind: BannerKind = resolveBannerKind(data);

  if (!kind) return null;
  if (dismissed === kind) return null;

  function openBilling() {
    const url = 'https://blackmagic.engineering/dashboard/billing';
    if (typeof window !== 'undefined' && window.bmBridge?.openExternal) {
      window.bmBridge.openExternal(url);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener');
    }
  }

  const copy = bannerCopy(kind, data);
  const accent = kind === 'past_due' ? 'bg-amber-600' : 'bg-flame';

  return (
    <div className={`w-full ${accent} text-white border-b border-black/10`}>
      <div className="flex items-center gap-3 px-4 py-2 text-[12.5px] max-w-[1280px] mx-auto">
        {kind === 'past_due' ? (
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <CreditCard className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="font-medium">{copy.message}</span>
        <button
          type="button"
          onClick={openBilling}
          className="font-semibold bg-white text-[#1a1a1a] rounded-md px-2.5 py-1 hover:bg-white/90"
        >
          {copy.cta}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setDismissed(kind)}
          aria-label="Dismiss"
          className="text-white/70 hover:text-white p-1 rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function resolveBannerKind(
  data:
    | {
        creditsRemaining: number;
        subscriptionStatus?: 'active' | 'trialing' | 'past_due' | 'canceled' | null;
      }
    | null
    | undefined,
): BannerKind {
  if (!data) return null;
  if (data.subscriptionStatus === 'past_due') return 'past_due';
  if (data.creditsRemaining > 0) return null;
  const hasActiveSub =
    data.subscriptionStatus === 'active' ||
    data.subscriptionStatus === 'trialing';
  return hasActiveSub ? 'sub_exhausted' : 'out_of_credits';
}

function bannerCopy(
  kind: Exclude<BannerKind, null>,
  data:
    | {
        plan?: 'free' | 'starter' | 'pro' | 'team' | 'enterprise';
        resetAt?: string | null;
      }
    | null
    | undefined,
): { message: string; cta: string } {
  if (kind === 'past_due') {
    return {
      message:
        'Payment failed. Update your card before the next retry or access will pause.',
      cta: 'Update card',
    };
  }
  if (kind === 'sub_exhausted') {
    const planName = data?.plan
      ? data.plan.charAt(0).toUpperCase() + data.plan.slice(1)
      : 'this month';
    const reset = formatReset(data?.resetAt);
    return {
      message: `You've used your ${planName} credits${reset ? `. Resets ${reset}` : ''}. Top up to keep going without waiting.`,
      cta: 'Top up',
    };
  }
  return {
    message:
      "You're out of credits. Agent runs and chat requests that hit the cloud will fail until you top up.",
    cta: 'Top up',
  };
}

function formatReset(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const now = Date.now();
  const diffMs = d.getTime() - now;
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'soon';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
