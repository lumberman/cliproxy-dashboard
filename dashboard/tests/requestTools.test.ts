import { describe, expect, test } from 'bun:test';
import {
  buildRequestPayload,
  parseQueueCount,
  parseUsageQueue,
  RequestValidationError,
} from '../src/features/tools/logic';

const input = {
  method: 'GET',
  url: 'https://example.test/v1/models',
  authIndex: '',
  proxyUrl: '',
  headers: '{}',
  body: '',
};

function errorCode(overrides: Partial<typeof input>) {
  try {
    buildRequestPayload({ ...input, ...overrides });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return error.code;
    throw error;
  }
  throw new Error('Expected a validation error');
}

describe('Request tools payload', () => {
  test('omits optional fields and normalizes the method', () => {
    expect(buildRequestPayload({ ...input, method: ' get ', url: ` ${input.url} ` })).toEqual({
      method: 'GET',
      url: input.url,
      header: {},
    });
  });

  test('preserves the raw body and server token placeholder', () => {
    expect(
      buildRequestPayload({
        ...input,
        method: 'POST',
        authIndex: 'credential-id',
        proxyUrl: ' direct ',
        headers: '{"Authorization":"Bearer $TOKEN$","Host":"upstream.test"}',
        body: '  {"token":"$TOKEN$"}\n',
      })
    ).toEqual({
      method: 'POST',
      url: input.url,
      authIndex: 'credential-id',
      proxy_url: 'direct',
      header: { Authorization: 'Bearer $TOKEN$', Host: 'upstream.test' },
      data: '  {"token":"$TOKEN$"}\n',
    });
  });

  test('requires an absolute HTTP or HTTPS URL', () => {
    for (const url of [
      '',
      '/models',
      'https:example.test',
      'file:///tmp/test',
      'ftp://example.test',
      'https://exa\nmple.test',
    ]) {
      expect(errorCode({ url })).toBe('invalid_url');
    }
  });

  test('rejects unsupported methods', () => {
    expect(errorCode({ method: 'GET\nPOST' })).toBe('invalid_method');
  });

  test('requires a JSON header object with string values', () => {
    for (const headers of ['{', '[]', 'null', 'true', '{"x":3}', '{"x":null}']) {
      expect(errorCode({ headers })).toBe('invalid_headers');
    }
  });

  test('rejects invalid HTTP header names and line breaks', () => {
    for (const headers of [
      '{"bad name":"value"}',
      '{"x":"one\\r\\ntwo"}',
      '{"x":"one\\u0001two"}',
    ]) {
      expect(errorCode({ headers })).toBe('invalid_headers');
    }
  });

  test('preserves a header named __proto__ as data', () => {
    const payload = buildRequestPayload({ ...input, headers: '{"__proto__":"value"}' });
    expect(Object.hasOwn(payload.header ?? {}, '__proto__')).toBe(true);
    expect(JSON.stringify(payload.header)).toBe('{"__proto__":"value"}');
  });

  test('requires a credential for a token placeholder in headers or the body', () => {
    expect(errorCode({ headers: '{"Authorization":"Bearer $TOKEN$"}' })).toBe('token_credential');
    expect(errorCode({ body: '$TOKEN$' })).toBe('token_credential');
  });

  test('accepts supported proxies and rejects invalid proxies', () => {
    for (const proxyUrl of [
      'none',
      'direct',
      'DIRECT',
      'https://proxy.test:443',
      'socks5://localhost:1080',
      'socks5h://localhost:1080',
    ]) {
      expect(buildRequestPayload({ ...input, proxyUrl }).proxy_url).toBe(proxyUrl);
    }
    for (const proxyUrl of ['localhost:8080', 'ftp://proxy.test', 'http://']) {
      expect(errorCode({ proxyUrl })).toBe('invalid_proxy');
    }
  });
});

describe('Usage queue contract', () => {
  test('accepts a positive integer count', () => {
    expect(parseQueueCount(' 12 ')).toBe(12);
    for (const value of ['', '0', '-1', '1.2', '1e2', '9007199254740992']) {
      expect(() => parseQueueCount(value)).toThrow(RequestValidationError);
    }
  });

  test('preserves queue records including strings and JSON primitives', () => {
    const records: unknown[] = [
      { model: 'test-model' },
      'non-JSON record',
      null,
      12,
      true,
      ['value'],
    ];
    expect(parseUsageQueue(records)).toEqual(records);
    expect(parseUsageQueue([])).toEqual([]);
  });

  test('rejects an unexpected envelope without treating it as an empty queue', () => {
    for (const value of [{ records: [] }, null, '[]']) {
      expect(() => parseUsageQueue(value)).toThrow(RequestValidationError);
    }
  });
});
