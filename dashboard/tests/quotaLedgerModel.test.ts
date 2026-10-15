/**
 * Ledger model: per-provider window reading and the aggregate over credentials.
 * The recurring rule: a percent the payload does not state is null, never 0.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildLedgerRow,
  meterTone,
  metricRatio,
  metricScale,
  soonestReset,
  summarizeProvider,
  type LedgerRowModel,
  type LedgerWindow,
} from '@/features/quota/ledgerModel';

const win = (key: string, remaining: number | null, extra: Partial<LedgerWindow> = {}) => ({
  key,
  label: { text: key },
  remaining,
  resetAtMs: null,
  resetLabel: null,
  resetHint: null,
  periodHours: null,
  ...extra,
});

const row = (...windows: LedgerWindow[]): LedgerRowModel => ({ plan: null, windows });

describe('buildLedgerRow', () => {
  test('returns null until a credential has loaded successfully', () => {
    expect(buildLedgerRow('claude', undefined)).toBeNull();
    expect(buildLedgerRow('claude', { status: 'idle', windows: [] })).toBeNull();
    expect(buildLedgerRow('claude', { status: 'loading', windows: [] })).toBeNull();
    expect(buildLedgerRow('claude', { status: 'error', windows: [] })).toBeNull();
  });

  test('claude: converts used to remaining and keeps unknown as null', () => {
    const model = buildLedgerRow('claude', {
      status: 'success',
      planType: 'max',
      windows: [
        {
          id: 'five_hour',
          label: '5-hour limit',
          usedPercent: 20,
          resetLabel: '08-02 18:00',
          resetAtMs: 5,
          periodHours: 5,
        },
        { id: 'seven_day', label: '7-day limit', usedPercent: null, resetLabel: '' },
        { id: 'over', label: 'Over', usedPercent: 140, resetLabel: '' },
      ],
    });
    expect(model?.plan?.label).toEqual({ key: 'claude_quota.max' });
    expect(model?.windows.map((w) => w.remaining)).toEqual([80, null, 0]);
    expect(model?.windows[0]).toMatchObject({
      key: 'five_hour',
      label: { text: '5-hour limit' },
      resetAtMs: 5,
      resetLabel: '08-02 18:00',
      periodHours: 5,
    });
  });

  test('codex: keeps the i18n label key with its params and resolves the plan tier', () => {
    const model = buildLedgerRow('codex', {
      status: 'success',
      planType: 'pro',
      windows: [
        {
          id: 'weekly',
          label: 'Weekly',
          labelKey: 'codex_quota.weekly',
          labelParams: { n: 1 },
          usedPercent: 83,
          resetLabel: '',
        },
      ],
    });
    expect(model?.plan).toEqual({ label: { key: 'codex_quota.plan_pro' }, tier: 'elite' });
    expect(model?.windows[0].label).toEqual({ key: 'codex_quota.weekly', params: { n: 1 } });
    expect(model?.windows[0].remaining).toBe(17);
  });

  test('devin: a missing remaining percent is not 0', () => {
    const model = buildLedgerRow('devin', {
      status: 'success',
      plan: 'Teams',
      windows: [
        { id: 'daily', remainingPercent: null, resetAtMs: null, periodHours: 24 },
        { id: 'weekly', remainingPercent: 64, resetAtMs: 9, periodHours: 168 },
      ],
    });
    expect(model?.plan?.label).toEqual({ text: 'Teams' });
    expect(model?.windows.map((w) => w.remaining)).toEqual([null, 64]);
    expect(model?.windows[0].label).toEqual({ key: 'devin_quota.daily' });
  });

  test('kimi: derives remaining from counts; no limit and no usage is unknown', () => {
    const model = buildLedgerRow('kimi', {
      status: 'success',
      rows: [
        { id: 'a', label: 'Weekly', used: 50, limit: 200, resetHint: ' in 3d ' },
        { id: 'b', labelKey: 'kimi_quota.monthly', used: 0, limit: 0 },
        { id: 'c', label: 'Burst', used: 4, limit: 0 },
        { id: 'd', label: 'Spent', used: 300, limit: 200 },
      ],
    });
    expect(model?.windows.map((w) => w.remaining)).toEqual([75, null, 0, 0]);
    expect(model?.windows[0].resetHint).toBe('in 3d');
    expect(model?.windows[1].label).toEqual({ key: 'kimi_quota.monthly', params: undefined });
  });

  test('antigravity: flattens group buckets and reads the remaining fraction', () => {
    const model = buildLedgerRow('antigravity', {
      status: 'success',
      subscription: { plan: 'ultra', tierName: null, tierId: null },
      groups: [
        {
          id: 'g1',
          label: 'Gemini models',
          buckets: [
            {
              id: 'b1',
              label: 'Weekly limit',
              remainingFraction: 0.424,
              resetTime: '2026-08-02T18:00:00Z',
            },
            { id: 'b2', label: 'Daily limit', remainingFraction: Number.NaN },
          ],
        },
        {
          id: 'g2',
          label: 'Other',
          buckets: [{ id: 'b1', label: 'Weekly limit', remainingFraction: 1 }],
        },
      ],
    });
    expect(model?.plan?.tier).toBe('premium');
    expect(model?.windows.map((w) => w.key)).toEqual(['g1/b1', 'g1/b2', 'g2/b1']);
    expect(model?.windows.map((w) => w.remaining)).toEqual([42, null, 100]);
    expect(model?.windows[0].resetAtMs).toBe(Date.parse('2026-08-02T18:00:00Z'));
  });

  test('meta: labels windows from their duration and converts reset seconds', () => {
    const model = buildLedgerRow('meta', {
      status: 'success',
      data: {
        planName: 'Pro',
        windows: [
          { id: 'window', usedPercent: 10, resetAt: 1_000, durationMinutes: 300 },
          { id: 'weekly', usedPercent: null },
        ],
      },
    });
    expect(model?.windows[0].label).toEqual({
      key: 'meta_quota.window_duration_hours',
      params: { hours: 5 },
    });
    expect(model?.windows[0]).toMatchObject({
      remaining: 90,
      resetAtMs: 1_000_000,
      periodHours: 5,
    });
    expect(model?.windows[1]).toMatchObject({
      label: { key: 'meta_quota.weekly' },
      remaining: null,
      periodHours: 168,
    });
  });

  test('xai: weekly and monthly are separate limits; paid-health reports none', () => {
    const base = {
      periodType: 'weekly',
      productUsage: [],
      usagePercent: 30,
      resetAtMs: 77,
      periodHours: 168,
      monthlyLimitCents: 15_000,
      usedCents: 3_000,
      usedPercent: 20,
      billingPeriodEnd: '2026-09-01T00:00:00Z',
    };
    const model = buildLedgerRow('xai', {
      status: 'success',
      billing: { mode: 'billing', ...base },
    });
    expect(model?.windows.map((w) => [w.key, w.remaining])).toEqual([
      ['weekly', 70],
      ['monthly', 80],
    ]);
    expect(model?.windows[0].resetAtMs).toBe(77);

    const paid = buildLedgerRow('xai', { status: 'success', billing: { mode: 'paid-health' } });
    expect(paid?.windows).toEqual([]);
  });
});

describe('summarizeProvider', () => {
  test('sums known remaining percents out of 100 per reporting credential', () => {
    const summary = summarizeProvider('claude', [
      row(win('weekly', 50)),
      row(win('weekly', 100)),
      null,
    ]);
    expect(summary.credentialCount).toBe(3);
    expect(summary.loadedCount).toBe(2);
    const metric = summary.primary!;
    expect(metric).toMatchObject({ key: 'weekly', sum: 150, known: 2, total: 3 });
    expect(metric.perCredential).toEqual([50, 100, null]);
    expect(metricScale(metric)).toBe(200);
    expect(metricRatio(metric)).toBe(0.75);
  });

  test('an unknown percent adds nothing and is not counted as an account at 0', () => {
    const metric = summarizeProvider('codex', [
      row(win('weekly', 40)),
      row(win('weekly', null)),
    ]).primary!;
    expect(metric.sum).toBe(40);
    expect(metric.known).toBe(1);
    expect(metric.perCredential).toEqual([40, null]);
    expect(metricRatio(metric)).toBe(0.4);
  });

  test('a genuine 0 stays a known value', () => {
    const metric = summarizeProvider('codex', [
      row(win('weekly', 0)),
      row(win('weekly', 100)),
    ]).primary!;
    expect(metric).toMatchObject({ sum: 100, known: 2 });
    expect(metricRatio(metric)).toBe(0.5);
  });

  test('with nothing known the sum and ratio are null and the scale is every credential', () => {
    const metric = summarizeProvider('xai', [
      row(win('weekly', null)),
      row(win('weekly', null)),
    ]).primary!;
    expect(metric.sum).toBeNull();
    expect(metricRatio(metric)).toBeNull();
    expect(metricScale(metric)).toBe(200);

    const unloaded = summarizeProvider('xai', [null, null, null]);
    expect(unloaded.primary).toBeNull();
    expect(unloaded.others).toEqual([]);
    expect(unloaded.loadedCount).toBe(0);
  });

  test('primary is the limit most credentials report, then the longest, then the first seen', () => {
    const coverage = summarizeProvider('claude', [
      row(win('five_hour', 10, { periodHours: 5 }), win('weekly', 90, { periodHours: 168 })),
      row(win('five_hour', 20, { periodHours: 5 })),
      row(win('five_hour', 30, { periodHours: 5 })),
    ]);
    expect(coverage.primary?.key).toBe('five_hour');
    expect(coverage.others.map((m) => m.key)).toEqual(['weekly']);

    const longest = summarizeProvider('claude', [
      row(win('five_hour', 10, { periodHours: 5 }), win('weekly', 90, { periodHours: 168 })),
    ]);
    expect(longest.primary?.key).toBe('weekly');

    const firstSeen = summarizeProvider('claude', [
      row(win('fable', 10, { periodHours: 168 }), win('limit', 90, { periodHours: 168 })),
    ]);
    expect(firstSeen.primary?.key).toBe('fable');
    expect(firstSeen.others.map((m) => m.key)).toEqual(['limit']);
  });

  test('a credential reporting a limit twice counts once, first value wins', () => {
    const metric = summarizeProvider('codex', [row(win('weekly', 10), win('weekly', 90))]).primary!;
    expect(metric).toMatchObject({ sum: 10, known: 1 });
  });
});

describe('soonestReset and meterTone', () => {
  test('soonestReset ignores unknown and past instants', () => {
    expect(soonestReset([null, 50, 300, 200], 100)).toBe(200);
    expect(soonestReset([null, 50], 100)).toBeNull();
    expect(soonestReset([], 100)).toBeNull();
  });

  test('meterTone matches the card meter bands and treats unknown separately', () => {
    expect(meterTone(null)).toBe('unknown');
    expect(meterTone(100)).toBe('good');
    expect(meterTone(70)).toBe('good');
    expect(meterTone(69)).toBe('low');
    expect(meterTone(30)).toBe('low');
    expect(meterTone(29)).toBe('empty');
    expect(meterTone(0)).toBe('empty');
  });
});

describe('Provider identity across credentials', () => {
  test('keeps Antigravity model groups in the displayed limit names', () => {
    const model = buildLedgerRow('antigravity', {
      status: 'success',
      groups: [
        {
          id: 'gemini',
          label: 'Gemini',
          buckets: [{ id: 'weekly', label: 'Weekly limit', remainingFraction: 0.5 }],
        },
        {
          id: 'claude',
          label: 'Claude / GPT',
          buckets: [{ id: 'weekly', label: 'Weekly limit', remainingFraction: 0.7 }],
        },
      ],
    });
    expect(model?.windows.map((w) => w.label)).toEqual([
      { text: 'Gemini: Weekly limit' },
      { text: 'Claude / GPT: Weekly limit' },
    ]);
  });

  test('combines a Codex named limit across different upstream list positions', () => {
    const first = buildLedgerRow('codex', {
      status: 'success',
      windows: [
        {
          id: 'spark-weekly-0',
          labelKey: 'codex_quota.additional_secondary_window',
          labelParams: { name: 'Spark' },
          usedPercent: 20,
          periodHours: 168,
        },
      ],
    });
    const second = buildLedgerRow('codex', {
      status: 'success',
      windows: [
        {
          id: 'spark-weekly-2',
          labelKey: 'codex_quota.additional_secondary_window',
          labelParams: { name: 'Spark' },
          usedPercent: 30,
          periodHours: 168,
        },
      ],
    });
    const summary = summarizeProvider('codex', [first, second]);
    expect(summary.primary?.sum).toBe(150);
    expect(summary.primary?.known).toBe(2);
    expect(summary.others).toHaveLength(0);
  });
});
