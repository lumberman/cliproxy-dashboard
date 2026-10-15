/**
 * Aggregate strip above the quota list: one card per provider.
 *
 * Each card reads one limit across all of that provider's credentials: the sum of the
 * remaining percents out of 100 per credential that reported one. A limit nobody has
 * reported yet shows `--`, never 0.
 */

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronDown } from '@/components/ui/icons';
import {
  getAuthFileIcon,
  getThemeSurfaceIconBackground,
  getTypeLabel,
  isThemeSurfaceIconProvider,
} from '@/features/authFiles/constants';
import { useNow } from '@/hooks/useNow';
import type { ResolvedTheme } from '@/types';
import { buildResetDisplay } from '@/utils/quota';
import {
  metricScale,
  soonestReset,
  type LedgerMetric,
  type LedgerProviderSummary,
} from '../ledgerModel';
import { resolveQuotaLabel } from '../quotaLabel';
import { LedgerMeter } from './LedgerMeter';
import styles from './QuotaProviderSummary.module.scss';

export interface QuotaProviderSummaryProps {
  summaries: LedgerProviderSummary[];
  resolvedTheme: ResolvedTheme;
}

const sumText = (metric: LedgerMetric) => (metric.sum === null ? '--' : `${metric.sum}%`);

function SummaryCard({
  summary,
  resolvedTheme,
}: {
  summary: LedgerProviderSummary;
  resolvedTheme: ResolvedTheme;
}) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const { provider, primary, others } = summary;
  const typeLabel = getTypeLabel(t, provider);
  const iconSrc = getAuthFileIcon(provider, resolvedTheme);
  const nextReset = primary ? soonestReset(primary.resets, now) : null;
  const resetDisplay =
    nextReset === null ? null : buildResetDisplay(null, nextReset, now, i18n.resolvedLanguage);

  return (
    <li className={styles.card}>
      <div className={styles.head}>
        <span
          className={styles.iconWrap}
          style={
            isThemeSurfaceIconProvider(provider)
              ? { background: getThemeSurfaceIconBackground(resolvedTheme) }
              : undefined
          }
        >
          {iconSrc ? (
            <img src={iconSrc} alt="" className={styles.icon} />
          ) : (
            <span className={styles.iconFallback}>{typeLabel.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className={styles.name}>{typeLabel}</span>
        <span className={styles.count}>
          {t('quota_management.meta_credentials', { count: summary.credentialCount })}
        </span>
      </div>

      {primary ? (
        <>
          <div className={styles.limit}>{resolveQuotaLabel(t, primary.label)}</div>
          <div className={styles.value}>
            <span className={styles.sum}>{sumText(primary)}</span>
            <span className={styles.scale}>
              {t('quota_management.summary_of', { total: metricScale(primary) })}
            </span>
          </div>
          <div
            className={styles.segments}
            role="group"
            aria-label={`${resolveQuotaLabel(t, primary.label)}: ${sumText(primary)} ${t('quota_management.summary_of', { total: metricScale(primary) })}`}
          >
            {primary.perCredential.map((remaining, index) => (
              <LedgerMeter
                key={index}
                remaining={remaining}
                label={resolveQuotaLabel(t, primary.label)}
              />
            ))}
          </div>
          <div className={styles.foot}>
            <span>
              {resetDisplay
                ? `${resetDisplay.relative ? `${resetDisplay.relative} · ` : ''}${resetDisplay.absolute}`
                : ''}
            </span>
            {primary.known < primary.total && (
              <span className={styles.partial}>
                {t('quota_management.summary_partial', {
                  known: primary.known,
                  total: primary.total,
                })}
              </span>
            )}
          </div>
          {others.length > 0 && (
            <>
              <button
                type="button"
                className={styles.toggle}
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded
                  ? t('quota_management.summary_less')
                  : t('quota_management.summary_more', { count: others.length })}
                <IconChevronDown
                  size={13}
                  aria-hidden="true"
                  className={expanded ? styles.chevronOpen : undefined}
                />
              </button>
              <ul id={listId} className={styles.others} hidden={!expanded}>
                {others.map((metric) => (
                  <li key={metric.key} className={styles.other}>
                    <span className={styles.otherLabel}>{resolveQuotaLabel(t, metric.label)}</span>
                    <span className={styles.otherValue}>
                      {sumText(metric)}
                      <span className={styles.otherScale}>
                        {' '}
                        {t('quota_management.summary_of', { total: metricScale(metric) })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <div className={styles.value}>
            <span className={styles.sum}>--</span>
            <span className={styles.scale}>
              {t('quota_management.summary_of', { total: summary.credentialCount * 100 })}
            </span>
          </div>
          <div className={styles.foot}>
            <span className={styles.partial}>{t('quota_management.summary_none_loaded')}</span>
          </div>
        </>
      )}
    </li>
  );
}

export function QuotaProviderSummary({ summaries, resolvedTheme }: QuotaProviderSummaryProps) {
  const { t } = useTranslation();
  if (summaries.length === 0) return null;
  return (
    <section aria-label={t('quota_management.summary_label')}>
      <ul className={styles.strip}>
        {summaries.map((summary) => (
          <SummaryCard key={summary.provider} summary={summary} resolvedTheme={resolvedTheme} />
        ))}
      </ul>
    </section>
  );
}
