/**
 * Ledger view: credentials as horizontal rows, grouped by provider.
 *
 * A row shows the account plan, each quota window with a thin meter and its reset time,
 * and a refresh action. Row details open the full provider card (reset credits, balances,
 * Claude reset grants), so no provider capability exists only in the card grid.
 */

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronDown, IconRefreshCw } from '@/components/ui/icons';
import {
  getAuthFileIcon,
  getThemeSurfaceIconBackground,
  getTypeLabel,
  isThemeSurfaceIconProvider,
} from '@/features/authFiles/constants';
import { useNow } from '@/hooks/useNow';
import type { ResolvedTheme } from '@/types';
import { buildResetDisplay, formatKimiResetHint, resolveQuotaErrorMessage } from '@/utils/quota';
import { getQuotaCacheKey, getQuotaDisplayName } from '@/utils/quota/identity';
import { buildLedgerRow, type LedgerWindow } from '../ledgerModel';
import { isQuotaRefreshDisabled, resolveEntryProviderType, type QuotaFileEntry } from '../logic';
import { displayIdentity } from '../privacy';
import { QUOTA_ADAPTERS, type QuotaCardState } from '../providers';
import { resolveQuotaLabel } from '../quotaLabel';
import { LedgerMeter } from './LedgerMeter';
import { QuotaCard } from './QuotaCard';
import styles from './QuotaLedger.module.scss';

export interface QuotaLedgerProps {
  entries: QuotaFileEntry[];
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined;
  resolvedTheme: ResolvedTheme;
  /** Actions are allowed at all (connected, list loaded). A disabled file is checked per row. */
  canUseActions: boolean;
  resettingQuotaName: string | null;
  hideEmails: boolean;
  /** Show a heading when the provider changes; off when sorting mixes providers. */
  grouped: boolean;
  /** Credential count per provider, for the group headings. */
  counts: Record<string, number>;
  onRefresh: (entry: QuotaFileEntry) => void;
  onReset: (entry: QuotaFileEntry) => void;
}

function LedgerRow({
  entry,
  quota,
  resolvedTheme,
  canUseActions,
  resetting,
  hideEmails,
  onRefresh,
  onReset,
}: {
  entry: QuotaFileEntry;
  quota: QuotaCardState | undefined;
  resolvedTheme: ResolvedTheme;
  canUseActions: boolean;
  resetting: boolean;
  hideEmails: boolean;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const adapter = QUOTA_ADAPTERS[entry.type];
  const file = entry.file;
  const status = quota?.status ?? 'idle';
  const loading = status === 'loading';
  const canRefresh = canUseActions && !file.disabled;
  const model = buildLedgerRow(entry.type, quota);
  const providerType = resolveEntryProviderType(entry);
  const typeLabel = getTypeLabel(t, providerType);
  const iconSrc = getAuthFileIcon(providerType, resolvedTheme);
  const name = displayIdentity(getQuotaDisplayName(file), hideEmails);
  const locale = i18n.resolvedLanguage;

  const renderWindow = (window: LedgerWindow) => {
    const label = resolveQuotaLabel(t, window.label);
    const absolute =
      window.resetLabel ??
      (window.resetAtMs === null && window.resetHint
        ? formatKimiResetHint(t, window.resetHint)
        : null);
    const reset = buildResetDisplay(absolute, window.resetAtMs, now, locale);
    const value = window.remaining === null ? '--' : `${window.remaining}%`;
    return (
      <div key={window.key} className={styles.window}>
        <div className={styles.windowHead}>
          <span className={styles.windowLabel} title={label}>
            {label}
          </span>
          <span className={styles.windowValue}>{value}</span>
        </div>
        <LedgerMeter
          remaining={window.remaining}
          label={t('quota_management.ledger_window_aria', { label, percent: window.remaining })}
        />
        <div className={styles.windowReset}>
          {reset
            ? `${reset.relative ? `${reset.relative} · ` : ''}${reset.absolute}`
            : t('quota_management.ledger_reset_unknown')}
        </div>
      </div>
    );
  };

  return (
    <li className={styles.row}>
      <div className={styles.identity}>
        <span
          className={styles.iconWrap}
          title={typeLabel}
          style={
            isThemeSurfaceIconProvider(providerType)
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
        <div className={styles.identityText}>
          <span className={styles.name} title={name}>
            {name}
          </span>
          {model?.plan && (
            <span className={styles.plan} data-tier={model.plan.tier}>
              {resolveQuotaLabel(t, model.plan.label)}
            </span>
          )}
        </div>
      </div>

      <div className={styles.windows}>
        {status === 'idle' ? (
          <button type="button" className={styles.idle} onClick={onRefresh} disabled={!canRefresh}>
            {t(`${adapter.i18nPrefix}.idle`)}
          </button>
        ) : loading ? (
          <div className={styles.message} role="status" aria-busy="true">
            {t(`${adapter.i18nPrefix}.loading`)}
          </div>
        ) : status === 'error' ? (
          <div className={`${styles.message} ${styles.error}`} role="alert">
            {t(`${adapter.i18nPrefix}.load_failed`, {
              message: displayIdentity(
                resolveQuotaErrorMessage(
                  t,
                  quota?.errorStatus,
                  quota?.error || t('common.unknown_error')
                ),
                hideEmails
              ),
            })}
          </div>
        ) : model && model.windows.length > 0 ? (
          model.windows.map(renderWindow)
        ) : (
          <div className={styles.message}>{t('quota_management.ledger_no_windows')}</div>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          onClick={onRefresh}
          disabled={isQuotaRefreshDisabled(canRefresh, loading, resetting)}
          title={t('auth_files.quota_refresh_hint')}
        >
          <IconRefreshCw
            size={13}
            aria-hidden="true"
            className={loading ? styles.spinning : undefined}
          />
          {t('auth_files.quota_refresh_single')}
        </button>
        <button
          type="button"
          className={styles.action}
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t('quota_management.ledger_details_hide') : t('quota_management.ledger_details')}
          <IconChevronDown
            size={13}
            aria-hidden="true"
            className={open ? styles.chevronOpen : undefined}
          />
        </button>
      </div>

      {open && (
        <div id={detailsId} className={styles.details}>
          <QuotaCard
            entry={entry}
            quota={quota}
            resolvedTheme={resolvedTheme}
            canRefresh={canRefresh}
            resetting={resetting}
            hideEmails={hideEmails}
            onRefresh={onRefresh}
            onReset={onReset}
          />
        </div>
      )}
    </li>
  );
}

export function QuotaLedger(props: QuotaLedgerProps) {
  const { entries, quotaFor, resolvedTheme, canUseActions, resettingQuotaName } = props;
  const { hideEmails, grouped, counts, onRefresh, onReset } = props;
  const { t } = useTranslation();

  // Consecutive credentials of one provider share a group.
  const groups: { type: QuotaFileEntry['type']; items: QuotaFileEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (grouped && last && last.type === entry.type) last.items.push(entry);
    else if (!grouped && last) last.items.push(entry);
    else groups.push({ type: entry.type, items: [entry] });
  }

  return (
    <div className={styles.ledger} aria-label={t('quota_management.ledger_label')} role="region">
      {groups.map((group, index) => (
        <section key={`${group.type}:${index}`} className={styles.group}>
          {grouped && (
            <h2 className={styles.groupTitle}>
              {getTypeLabel(t, group.type)}
              <span className={styles.groupCount}>{counts[group.type] ?? group.items.length}</span>
            </h2>
          )}
          <ul className={styles.rows}>
            {group.items.map((entry) => (
              <LedgerRow
                key={`${entry.type}:${getQuotaCacheKey(entry.file)}`}
                entry={entry}
                quota={quotaFor(entry)}
                resolvedTheme={resolvedTheme}
                canUseActions={canUseActions}
                resetting={resettingQuotaName === getQuotaCacheKey(entry.file)}
                hideEmails={hideEmails}
                onRefresh={() => onRefresh(entry)}
                onReset={() => onReset(entry)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
