/**
 * A label that is either an i18n key (resolved at render) or text taken as-is from provider data.
 * Keeping the choice as data lets the ledger model stay free of `t` and React.
 */

import type { TFunction } from 'i18next';

export type QuotaLabel =
  { key: string; params?: Record<string, string | number> } | { text: string };

export const resolveQuotaLabel = (t: TFunction, label: QuotaLabel): string =>
  'key' in label ? String(t(label.key, label.params ?? {})) : label.text;
