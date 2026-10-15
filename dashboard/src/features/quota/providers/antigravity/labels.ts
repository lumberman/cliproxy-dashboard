/**
 * Antigravity label translation shared by the quota body and the ledger.
 * Provider labels are English strings; known ones map to locale keys, others pass through.
 */

import type { TFunction } from 'i18next';
import type { AntigravityQuotaSubscription } from '@/types';
import type { QuotaLabel } from '../../quotaLabel';

export const ANTIGRAVITY_GROUP_LABEL_KEYS = new Map<string, string>([
  ['gemini models', 'group_gemini_models'],
  ['claude and gpt models', 'group_claude_gpt_models'],
]);

export const ANTIGRAVITY_BUCKET_LABEL_KEYS = new Map<string, string>([
  ['weekly limit', 'weekly_limit'],
  ['daily limit', 'daily_limit'],
  ['5 hour limit', 'five_hour_limit'],
  ['5-hour limit', 'five_hour_limit'],
  ['five hour limit', 'five_hour_limit'],
  ['monthly limit', 'monthly_limit'],
]);

const normalizeAntigravityQuotaText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

export const translateAntigravityQuotaLabel = (
  value: string,
  keys: Map<string, string>,
  t: TFunction
): string => {
  const key = keys.get(normalizeAntigravityQuotaText(value));
  return key ? t(`antigravity_quota.${key}`) : value;
};

/** Plan label as data: a locale key for known plans, provider text otherwise. */
export const resolveAntigravityPlanLabel = (
  subscription: AntigravityQuotaSubscription | null | undefined
): QuotaLabel | null => {
  if (!subscription) return null;
  if (subscription.plan === 'free') return { key: 'antigravity_subscription.plan_free' };
  if (subscription.plan === 'pro') return { key: 'antigravity_subscription.plan_pro' };
  if (subscription.plan === 'ultra') return { key: 'antigravity_subscription.plan_ultra' };
  if (subscription.plan === 'ultra-lite') {
    return { key: 'antigravity_subscription.plan_ultra_lite' };
  }
  const text = subscription.tierName || subscription.tierId;
  if (text) return { text };
  return subscription.plan === 'unknown' ? { key: 'antigravity_subscription.plan_unknown' } : null;
};
