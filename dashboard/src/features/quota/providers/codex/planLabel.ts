/** Codex plan label as data, shared by the quota body and the ledger. */

import { PREMIUM_CODEX_PLAN_TYPES, normalizePlanType } from '@/utils/quota';
import type { QuotaLabel } from '../../quotaLabel';

export const resolveCodexPlanLabel = (planType?: string | null): QuotaLabel | null => {
  const normalized = normalizePlanType(planType);
  if (!normalized) return null;
  if (normalized === 'self_serve_business_prolite') {
    return { key: 'codex_quota.plan_business_premium' };
  }
  if (normalized === 'pro') return { key: 'codex_quota.plan_pro' };
  if (PREMIUM_CODEX_PLAN_TYPES.has(normalized)) return { key: 'codex_quota.plan_prolite' };
  if (normalized === 'plus') return { key: 'codex_quota.plan_plus' };
  if (normalized === 'team') return { key: 'codex_quota.plan_team' };
  if (normalized === 'free') return { key: 'codex_quota.plan_free' };
  return { text: planType || normalized };
};
