import { afterEach, describe, expect, test } from 'bun:test';
import { getInitialLanguage } from '@/utils/language';

const g = globalThis as { window?: unknown; localStorage?: unknown };
const original = { window: g.window, localStorage: g.localStorage };

const installStorage = (entries: Record<string, string>) => {
  g.window = {};
  g.localStorage = { getItem: (key: string) => entries[key] ?? null };
};

afterEach(() => {
  for (const key of ['window', 'localStorage'] as const) {
    if (original[key] === undefined) delete g[key];
    else g[key] = original[key];
  }
});

describe('initial language', () => {
  test('is English when nothing is saved', () => {
    installStorage({});
    expect(getInitialLanguage()).toBe('en');
  });

  test('keeps a saved language', () => {
    installStorage({
      'cli-proxy-language': JSON.stringify({ state: { language: 'ru' }, version: 0 }),
    });
    expect(getInitialLanguage()).toBe('ru');
  });

  test('ignores a saved language that is not supported', () => {
    installStorage({ 'cli-proxy-language': JSON.stringify({ state: { language: 'xx' } }) });
    expect(getInitialLanguage()).toBe('en');
  });
});
