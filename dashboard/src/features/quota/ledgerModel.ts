/**
 * Ledger model: one credential's quota windows, and the per-provider aggregate over them.
 *
 * Pure and React-free. Every provider state is read on its own terms and reduced to
 * the same shape: a labelled window with the REMAINING percent (0..100, integer) and its
 * reset instant. A percent the payload does not state is null, never 0: an unknown window
 * must not drag an aggregate down or colour a meter as exhausted.
 */

import { parseIsoToMs, resolvePlanTier, type CodexPlanTier } from '@/utils/quota';
import type { QuotaLabel } from './quotaLabel';
import { resolveAntigravityPlanLabel } from './providers/antigravity/labels';
import { resolveCodexPlanLabel } from './providers/codex/planLabel';
import type { QuotaProviderType } from './providers/types';

export interface LedgerWindow {
  /** Stable id of the same limit across credentials of one provider. */
  key: string;
  label: QuotaLabel;
  /** Remaining percent 0..100, null when the payload does not state it. */
  remaining: number | null;
  resetAtMs: number | null;
  /** Reset text the provider baked at fetch time, when it cannot be rebuilt from the instant. */
  resetLabel: string | null;
  /** Relative reset hint from Kimi, used only when there is no instant. */
  resetHint: string | null;
  periodHours: number | null;
}

export interface LedgerPlan {
  label: QuotaLabel;
  tier: CodexPlanTier;
}

export interface LedgerRowModel {
  plan: LedgerPlan | null;
  windows: LedgerWindow[];
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Remaining percent from a percent-used figure; null stays null. */
const remainingFromUsed = (used: unknown): number | null =>
  isNumber(used) ? Math.round(clampPercent(100 - used)) : null;

const remainingFromPercent = (remaining: unknown): number | null =>
  isNumber(remaining) ? Math.round(clampPercent(remaining)) : null;

const msOrNull = (value: unknown): number | null => (isNumber(value) ? value : null);

const hoursOrNull = (value: unknown): number | null =>
  isNumber(value) && value > 0 ? value : null;

const makeWindow = (
  window: Partial<LedgerWindow> & Pick<LedgerWindow, 'key' | 'label'>
): LedgerWindow => ({
  remaining: null,
  resetAtMs: null,
  resetLabel: null,
  resetHint: null,
  periodHours: null,
  ...window,
});

interface UsedWindowLike {
  id?: string;
  label?: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  usedPercent?: number | null;
  resetLabel?: string;
  resetAtMs?: number | null;
  periodHours?: number | null;
}

const usedWindowLabel = (window: UsedWindowLike): QuotaLabel =>
  window.labelKey
    ? { key: window.labelKey, params: window.labelParams }
    : { text: window.label ?? window.id ?? '' };

const fromUsedWindows = (windows: UsedWindowLike[]): LedgerWindow[] =>
  windows.map((window, index) =>
    makeWindow({
      key:
        window.labelKey?.startsWith('codex_quota.additional_') && window.labelParams?.name
          ? `${window.labelKey}:${String(window.labelParams.name).trim().toLowerCase()}:${window.periodHours ?? ''}`
          : window.id || `window-${index}`,
      label: usedWindowLabel(window),
      remaining: remainingFromUsed(window.usedPercent),
      resetAtMs: msOrNull(window.resetAtMs),
      resetLabel: window.resetLabel?.trim() || null,
      periodHours: hoursOrNull(window.periodHours),
    })
  );

const xaiWindows = (billing: Record<string, unknown> | null | undefined): LedgerWindow[] => {
  if (!billing || billing.mode === 'paid-health') return [];
  const out: LedgerWindow[] = [];
  const weekly = billing.periodType === 'weekly';
  const productUsage = Array.isArray(billing.productUsage) ? billing.productUsage : [];
  const hasWeeklyData =
    weekly &&
    (isNumber(billing.usagePercent) || Boolean(billing.periodEnd) || productUsage.length > 0);
  if (hasWeeklyData) {
    out.push(
      makeWindow({
        key: 'weekly',
        label: { key: 'xai_quota.weekly_limit' },
        remaining: remainingFromUsed(billing.usagePercent),
        resetAtMs: msOrNull(billing.resetAtMs),
        periodHours: hoursOrNull(billing.periodHours),
      })
    );
  }
  // A zero/zero monthly cap next to a weekly limit is the weekly plan's placeholder, not a quota.
  const hasMonthlyData =
    (billing.monthlyLimitCents !== null && billing.monthlyLimitCents !== undefined) ||
    (billing.usedCents !== null && billing.usedCents !== undefined) ||
    Boolean(billing.billingPeriodEnd);
  if (
    hasMonthlyData &&
    !(hasWeeklyData && billing.monthlyLimitCents === 0 && billing.usedCents === 0)
  ) {
    out.push(
      makeWindow({
        key: 'monthly',
        label: { key: 'xai_quota.monthly_credits' },
        remaining: remainingFromUsed(billing.usedPercent),
        resetAtMs: parseIsoToMs(billing.billingPeriodEnd),
      })
    );
  }
  return out;
};

interface BucketLike {
  id?: string;
  label?: string;
  remainingFraction?: number | null;
  resetTime?: string;
  resetAtMs?: number | null;
  periodHours?: number | null;
}

const bucketWindows = (
  groups: { id?: string; label?: string; buckets?: BucketLike[] }[]
): LedgerWindow[] =>
  groups.flatMap((group, groupIndex) =>
    (group.buckets ?? []).map((bucket, bucketIndex) =>
      makeWindow({
        key: `${group.id ?? groupIndex}/${bucket.id ?? bucketIndex}`,
        label: { text: [group.label, bucket.label].filter(Boolean).join(': ') },
        remaining: isNumber(bucket.remainingFraction)
          ? Math.round(clampPercent(bucket.remainingFraction * 100))
          : null,
        resetAtMs: msOrNull(bucket.resetAtMs) ?? parseIsoToMs(bucket.resetTime),
        periodHours: hoursOrNull(bucket.periodHours),
      })
    )
  );

/**
 * Plan and windows for one loaded credential, or null when nothing has loaded.
 * `quota` is the provider state as stored; its shape is read per provider.
 */
export function buildLedgerRow(provider: QuotaProviderType, quota: unknown): LedgerRowModel | null {
  const state = quota as { status?: string } | undefined;
  if (!state || state.status !== 'success') return null;

  if (provider === 'claude') {
    const q = quota as { windows?: UsedWindowLike[]; planType?: string | null };
    return {
      plan: q.planType ? { label: { key: `claude_quota.${q.planType}` }, tier: 'plain' } : null,
      windows: fromUsedWindows(q.windows ?? []),
    };
  }

  if (provider === 'codex') {
    const q = quota as { windows?: UsedWindowLike[]; planType?: string | null };
    const label = resolveCodexPlanLabel(q.planType);
    return {
      plan: label ? { label, tier: resolvePlanTier(q.planType) } : null,
      windows: fromUsedWindows(q.windows ?? []),
    };
  }

  if (provider === 'devin') {
    const q = quota as {
      plan?: string | null;
      windows?: {
        id: string;
        remainingPercent: number | null;
        resetAtMs: number | null;
        periodHours: number;
      }[];
    };
    return {
      plan: q.plan ? { label: { text: q.plan }, tier: 'plain' } : null,
      windows: (q.windows ?? []).map((window) =>
        makeWindow({
          key: window.id,
          label: { key: `devin_quota.${window.id}` },
          remaining: remainingFromPercent(window.remainingPercent),
          resetAtMs: msOrNull(window.resetAtMs),
          periodHours: hoursOrNull(window.periodHours),
        })
      ),
    };
  }

  if (provider === 'kimi') {
    const q = quota as {
      rows?: {
        id: string;
        label?: string;
        labelKey?: string;
        labelParams?: Record<string, string | number>;
        used: number;
        limit: number;
        resetHint?: string;
        resetAtMs?: number | null;
        periodHours?: number | null;
      }[];
    };
    return {
      plan: null,
      windows: (q.rows ?? []).map((row) => {
        const remaining =
          row.limit > 0
            ? Math.round(clampPercent(((row.limit - row.used) / row.limit) * 100))
            : row.used > 0
              ? 0
              : null;
        return makeWindow({
          key: row.id,
          label: usedWindowLabel(row),
          remaining,
          resetAtMs: msOrNull(row.resetAtMs),
          resetHint: row.resetHint?.trim() || null,
          periodHours: hoursOrNull(row.periodHours),
        });
      }),
    };
  }

  if (provider === 'xai') {
    const q = quota as {
      billing?: (Record<string, unknown> & { planLabel?: string; planTier?: CodexPlanTier }) | null;
    };
    const billing = q.billing;
    const tier =
      billing?.planTier === 'elite' || billing?.planTier === 'premium' ? billing.planTier : 'plain';
    return {
      plan: billing?.planLabel ? { label: { text: billing.planLabel }, tier } : null,
      windows: xaiWindows(billing),
    };
  }

  if (provider === 'antigravity') {
    const q = quota as {
      groups?: { id?: string; label?: string; buckets?: BucketLike[] }[];
      subscription?: Parameters<typeof resolveAntigravityPlanLabel>[0];
    };
    const label = resolveAntigravityPlanLabel(q.subscription);
    const plan = q.subscription?.plan;
    return {
      plan: label
        ? { label, tier: plan === 'ultra' || plan === 'ultra-lite' ? 'premium' : 'plain' }
        : null,
      windows: bucketWindows(q.groups ?? []),
    };
  }

  if (provider === 'plugin') {
    const q = quota as {
      groups?: { id?: string; label?: string; buckets?: BucketLike[] }[];
      subscription?: {
        plan?: string | null;
        tierName?: string | null;
        tierId?: string | null;
      } | null;
    };
    const planText = q.subscription?.tierName || q.subscription?.plan || q.subscription?.tierId;
    return {
      plan: planText ? { label: { text: planText }, tier: 'plain' } : null,
      windows: bucketWindows(q.groups ?? []),
    };
  }

  // meta
  const q = quota as {
    data?: {
      planName?: string;
      windows?: {
        id: 'window' | 'weekly';
        usedPercent: number | null;
        resetAt?: number;
        durationMinutes?: number;
      }[];
    };
  };
  return {
    plan: q.data?.planName ? { label: { text: q.data.planName }, tier: 'plain' } : null,
    windows: (q.data?.windows ?? []).map((window) => {
      const minutes = window.durationMinutes;
      const label: QuotaLabel =
        window.id === 'window' && minutes
          ? minutes % 60 === 0
            ? { key: 'meta_quota.window_duration_hours', params: { hours: minutes / 60 } }
            : { key: 'meta_quota.window_duration', params: { minutes } }
          : { key: `meta_quota.${window.id}` };
      return makeWindow({
        key: window.id,
        label,
        remaining: remainingFromUsed(window.usedPercent),
        resetAtMs: isNumber(window.resetAt) ? window.resetAt * 1000 : null,
        // The upstream weekly bucket carries no duration; its scope defines seven days.
        periodHours: window.id === 'weekly' ? 168 : hoursOrNull(minutes ? minutes / 60 : null),
      });
    }),
  };
}

/* --------------------------------------------------------------- aggregate */

export interface LedgerMetric {
  key: string;
  label: QuotaLabel;
  /** Sum of the known remaining percents; null when no credential reports one. */
  sum: number | null;
  /** Credentials with a known remaining percent for this limit. */
  known: number;
  /** Credentials in the provider, loaded or not. */
  total: number;
  /** Per credential, in order: remaining percent, null when unknown. */
  perCredential: (number | null)[];
  /** Per credential, in order: reset instant, null when unknown. */
  resets: (number | null)[];
  periodHours: number | null;
}

export interface LedgerProviderSummary {
  provider: QuotaProviderType;
  credentialCount: number;
  loadedCount: number;
  /** The limit shown first; null when no credential has reported a window. */
  primary: LedgerMetric | null;
  /** Every other limit, in first-seen order. */
  others: LedgerMetric[];
}

/** The scale an aggregate is read against: 100 for each credential that reported a value. */
export const metricScale = (metric: LedgerMetric): number =>
  (metric.known > 0 ? metric.known : metric.total) * 100;

/** Percent of the scale, null while no credential reports a value. */
export const metricRatio = (metric: LedgerMetric): number | null =>
  metric.sum === null || metric.known === 0 ? null : metric.sum / (metric.known * 100);

/**
 * Aggregate one provider's credentials. `rows` holds one entry per credential in display
 * order; null means the credential has not loaded, so it contributes nothing but its count.
 *
 * Windows are grouped by their provider key. The primary limit is the one most credentials
 * report; ties go to the longer window, then to the first seen.
 */
export function summarizeProvider(
  provider: QuotaProviderType,
  rows: readonly (LedgerRowModel | null)[]
): LedgerProviderSummary {
  const total = rows.length;
  const order: string[] = [];
  const byKey = new Map<string, LedgerMetric>();

  rows.forEach((row, index) => {
    row?.windows.forEach((window) => {
      let metric = byKey.get(window.key);
      if (!metric) {
        metric = {
          key: window.key,
          label: window.label,
          sum: null,
          known: 0,
          total,
          perCredential: new Array<number | null>(total).fill(null),
          resets: new Array<number | null>(total).fill(null),
          periodHours: null,
        };
        byKey.set(window.key, metric);
        order.push(window.key);
      }
      // Two windows with one key on a single credential: the first one wins.
      if (metric.perCredential[index] !== null || metric.resets[index] !== null) return;
      if (window.remaining !== null) {
        metric.perCredential[index] = window.remaining;
        metric.sum = (metric.sum ?? 0) + window.remaining;
        metric.known += 1;
      }
      metric.resets[index] = window.resetAtMs;
      if (window.periodHours !== null) {
        metric.periodHours = Math.max(metric.periodHours ?? 0, window.periodHours);
      }
    });
  });

  const metrics = order.map((key) => byKey.get(key) as LedgerMetric);
  let primary: LedgerMetric | null = null;
  for (const metric of metrics) {
    if (
      primary === null ||
      metric.known > primary.known ||
      (metric.known === primary.known && (metric.periodHours ?? 0) > (primary.periodHours ?? 0))
    ) {
      primary = metric;
    }
  }

  return {
    provider,
    credentialCount: total,
    loadedCount: rows.filter((row) => row !== null).length,
    primary,
    others: metrics.filter((metric) => metric !== primary),
  };
}

/** The soonest reset still ahead of `nowMs`, or null. */
export function soonestReset(resets: readonly (number | null)[], nowMs: number): number | null {
  let best: number | null = null;
  for (const at of resets) {
    if (at !== null && at > nowMs && (best === null || at < best)) best = at;
  }
  return best;
}

export type MeterTone = 'good' | 'low' | 'empty' | 'unknown';

/** Same bands as QuotaMeter: 70+ good, 30+ low, below that empty. */
export function meterTone(remaining: number | null): MeterTone {
  if (remaining === null) return 'unknown';
  if (remaining >= 70) return 'good';
  if (remaining >= 30) return 'low';
  return 'empty';
}
