import { describe, expect, test } from 'bun:test';
import en from '@/i18n/locales/en.json';
import ko from '@/i18n/locales/ko.json';
import ru from '@/i18n/locales/ru.json';
import vi from '@/i18n/locales/vi.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

const LEDGER_KEYS = [
  'view_label',
  'view_ledger',
  'view_cards',
  'privacy_show_emails',
  'privacy_hide_emails',
  'summary_label',
  'summary_of',
  'summary_partial',
  'summary_less',
  'summary_more',
  'summary_none_loaded',
  'ledger_label',
  'ledger_details',
  'ledger_details_hide',
  'ledger_no_windows',
  'ledger_reset_unknown',
  'ledger_window_aria',
] as const;

const locales = { en, ko, ru, vi, 'zh-CN': zhCN, 'zh-TW': zhTW };
const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe('quota ledger locale keys', () => {
  for (const [name, locale] of Object.entries(locales)) {
    test(`${name} defines every key with the same placeholders as English`, () => {
      const section = locale.quota_management as Record<string, string>;
      for (const key of LEDGER_KEYS) {
        expect(typeof section[key]).toBe('string');
        expect(section[key].length).toBeGreaterThan(0);
        expect(placeholders(section[key])).toEqual(
          placeholders((en.quota_management as Record<string, string>)[key])
        );
      }
    });
  }

  test('every locale names the product CLI Proxy Console', () => {
    for (const locale of Object.values(locales)) {
      expect(locale.title.login).toBe('CLI Proxy Console');
      expect(locale.splash.title).toBe('CLI Proxy Console');
    }
  });
});
