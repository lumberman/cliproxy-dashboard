/**
 * Thin remaining-quota meter for the ledger and its summary.
 * An unknown value renders an empty track with no meter role: unknown is not zero.
 */

import { meterTone, type MeterTone } from '../ledgerModel';
import styles from './LedgerMeter.module.scss';

const TONE_CLASS: Record<MeterTone, string> = {
  good: styles.toneGood,
  low: styles.toneLow,
  empty: styles.toneEmpty,
  unknown: '',
};

export interface LedgerMeterProps {
  /** Remaining percent 0..100, null when unknown. */
  remaining: number | null;
  /** Accessible name; required for a known value so the meter has a name. */
  label: string;
}

export function LedgerMeter({ remaining, label }: LedgerMeterProps) {
  const known = remaining !== null;
  return (
    <div
      className={styles.track}
      role={known ? 'meter' : undefined}
      aria-label={known ? label : undefined}
      aria-valuemin={known ? 0 : undefined}
      aria-valuemax={known ? 100 : undefined}
      aria-valuenow={known ? remaining : undefined}
    >
      {known && (
        <div
          className={`${styles.fill} ${TONE_CLASS[meterTone(remaining)]}`}
          style={{ width: `${remaining}%` }}
        />
      )}
    </div>
  );
}
