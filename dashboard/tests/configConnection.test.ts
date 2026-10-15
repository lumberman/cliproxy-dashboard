import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { configApi } from '../src/services/api/config';
import { apiClient } from '../src/services/api/client';

let request: ReturnType<typeof spyOn> | undefined;
afterEach(() => request?.mockRestore());

describe('Management connection response', () => {
  test('rejects an HTML fallback page', async () => {
    request = spyOn(apiClient, 'get').mockResolvedValue('<!doctype html><html></html>');
    await expect(configApi.getConfig()).rejects.toThrow('JSON management configuration');
  });

  test('accepts a JSON management configuration', async () => {
    request = spyOn(apiClient, 'get').mockResolvedValue({
      'config-version': 8,
      server: { port: 8317 },
    });
    const config = await configApi.getConfig();
    expect(config.raw).toEqual({ 'config-version': 8, server: { port: 8317 } });
  });
});
