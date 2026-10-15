/**
 * Ledger and summary rendered as static markup. Browser interactions are not covered here;
 * these checks pin what the user reads: masked names, `--` for unknown, aggregate figures.
 */

import { beforeAll, describe, expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import type { QuotaLedgerProps } from '@/features/quota/components/QuotaLedger';
import { QUOTA_CLASS_KEYS } from '@/features/quota/types';
import { QuotaProviderSummary } from '@/features/quota/components/QuotaProviderSummary';
import { buildLedgerRow, summarizeProvider } from '@/features/quota/ledgerModel';
import type { QuotaFileEntry } from '@/features/quota/logic';
import type { QuotaCardState } from '@/features/quota/providers';
import type { ClaudeQuotaState } from '@/types';

// Bun does not compile Sass modules. Keep the production class contract intact.
mock.module('../src/features/quota/components/QuotaBody.module.scss', () => ({
  default: Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])),
}));
const { QuotaLedger } = await import('@/features/quota/components/QuotaLedger');

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const entry = (name: string): QuotaFileEntry => ({
  file: { name, type: 'claude' },
  type: 'claude',
});

const claudeQuota = (used: number | null): ClaudeQuotaState => ({
  status: 'success',
  planType: 'max',
  windows: [{ id: 'seven_day', label: '7-day limit', usedPercent: used, resetLabel: '' }],
});

const render = (
  props: Partial<QuotaLedgerProps> & Pick<QuotaLedgerProps, 'entries' | 'quotaFor'>
) =>
  renderToStaticMarkup(
    createElement(QuotaLedger, {
      resolvedTheme: 'dark',
      canUseActions: true,
      resettingQuotaName: null,
      hideEmails: true,
      grouped: true,
      counts: { claude: props.entries.length },
      onRefresh: () => {},
      onReset: () => {},
      ...props,
    })
  );

describe('QuotaLedger markup', () => {
  const entries = [entry('claude-tom@example.com.json'), entry('claude-ann@corp.dev.json')];
  const quotas: Record<string, QuotaCardState | undefined> = {
    [entries[0].file.name]: claudeQuota(25),
    [entries[1].file.name]: claudeQuota(null),
  };
  const quotaFor = (item: QuotaFileEntry) => quotas[item.file.name];

  test('masks credential names by default and shows them when privacy is off', () => {
    const masked = render({ entries, quotaFor });
    expect(masked).toContain('claude-t•••@e•••.com.json');
    expect(masked).not.toContain('tom@example.com');

    const shown = render({ entries, quotaFor, hideEmails: false });
    expect(shown).toContain('claude-tom@example.com.json');
  });

  test('shows the plan, the window label and the remaining percent from the data', () => {
    const markup = render({ entries, quotaFor });
    expect(markup).toContain('7-day limit');
    expect(markup).toContain('75%');
    expect(markup).toContain('role="meter"');
    expect(markup).toContain('aria-valuenow="75"');
  });

  test('an unknown window reads -- and has no meter instead of an empty or red one', () => {
    const markup = render({ entries: [entries[1]], quotaFor });
    expect(markup).toContain('>--<');
    expect(markup).not.toContain('role="meter"');
    expect(markup).not.toContain('>0%<');
  });

  test('masks provider error text while privacy is on', () => {
    const markup = render({
      entries: [entries[0]],
      quotaFor: () => ({ status: 'error', error: 'Quota unavailable for tom@example.com' }),
    });
    expect(markup).not.toContain('tom@example.com');
    expect(markup).toContain('t•••@e•••.com');
  });

  test('an unloaded credential offers to load instead of showing zeros', () => {
    const markup = render({ entries: [entry('claude-new.json')], quotaFor: () => undefined });
    expect(markup).toContain('Click here to refresh quota');
    expect(markup).not.toContain('role="meter"');
  });

  test('groups under a provider heading with its credential count', () => {
    const markup = render({ entries, quotaFor, counts: { claude: 5 } });
    expect(markup).toMatch(/<h2[^>]*>Claude<span[^>]*>5<\/span><\/h2>/);
  });

  test('omits group headings when the order mixes providers', () => {
    expect(render({ entries, quotaFor, grouped: false })).not.toContain('<h2');
  });

  const refreshButton = (markup: string) =>
    markup.match(/<button[^>]*title="Refresh quota only for this credential"[^>]*>/)?.[0] ?? '';

  test('refresh is disabled while actions are unavailable and for a disabled file', () => {
    const blocked = render({ entries: [entries[0]], quotaFor, canUseActions: false });
    expect(refreshButton(blocked)).toContain('disabled=""');

    const disabledFile: QuotaFileEntry = {
      file: { name: 'claude-off.json', type: 'claude', disabled: true },
      type: 'claude',
    };
    const off = render({ entries: [disabledFile], quotaFor: () => claudeQuota(10) });
    expect(refreshButton(off)).toContain('disabled=""');
  });

  test('refresh is enabled for a normal credential', () => {
    const markup = render({ entries: [entries[0]], quotaFor });
    expect(refreshButton(markup)).not.toBe('');
    expect(refreshButton(markup)).not.toContain('disabled=""');
  });

  test('details control is collapsed by default and names what it controls', () => {
    const markup = render({ entries: [entries[0]], quotaFor });
    expect(markup).toMatch(/aria-expanded="false" aria-controls="[^"]+"/);
  });
});

describe('QuotaProviderSummary markup', () => {
  const summaryFor = (rows: (ClaudeQuotaState | null)[]) =>
    summarizeProvider(
      'claude',
      rows.map((quota) => buildLedgerRow('claude', quota))
    );
  const render = (summaries: ReturnType<typeof summaryFor>[]) =>
    renderToStaticMarkup(createElement(QuotaProviderSummary, { summaries, resolvedTheme: 'dark' }));

  test('shows the aggregate sum out of 100 per reporting credential', () => {
    const markup = render([summaryFor([claudeQuota(50), claudeQuota(0), null])]);
    expect(markup).toContain('150%');
    expect(markup).toContain('of 200%');
    expect(markup).toContain('3 credentials');
    expect(markup).toContain('2 of 3 reporting');
    expect(markup).toContain('7-day limit');
  });

  test('shows -- over the full scale while nothing has loaded, never 0%', () => {
    const markup = render([summaryFor([null, null])]);
    expect(markup).toContain('--');
    expect(markup).toContain('of 200%');
    expect(markup).toContain('No quota loaded yet');
    expect(markup).not.toContain('>0%<');
  });

  test('shows -- when credentials loaded but none states a percent', () => {
    const markup = render([summaryFor([claudeQuota(null)])]);
    expect(markup).toContain('--');
    expect(markup).toContain('of 100%');
  });

  test('renders nothing without providers', () => {
    expect(render([])).toBe('');
  });
});
