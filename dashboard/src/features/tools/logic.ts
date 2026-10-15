import type { ApiCallRequest } from '@/services/api/apiCall';

export const REQUEST_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export type RequestValidationCode =
  | 'invalid_method'
  | 'invalid_url'
  | 'invalid_headers'
  | 'invalid_proxy'
  | 'token_credential'
  | 'invalid_count'
  | 'invalid_queue';

export class RequestValidationError extends Error {
  constructor(public readonly code: RequestValidationCode) {
    super(code);
    this.name = 'RequestValidationError';
  }
}

export interface RequestInput {
  method: string;
  url: string;
  authIndex: string;
  proxyUrl: string;
  headers: string;
  body: string;
}

const isAbsoluteUrl = (value: string, protocols: string[]): boolean => {
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return false;
  if (Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) {
    return false;
  }
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
};

export function buildRequestPayload(input: RequestInput): ApiCallRequest {
  const method = input.method.trim().toUpperCase();
  if (!REQUEST_METHODS.includes(method)) throw new RequestValidationError('invalid_method');
  const url = input.url.trim();
  if (!isAbsoluteUrl(url, ['http:', 'https:'])) throw new RequestValidationError('invalid_url');

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.headers);
  } catch {
    throw new RequestValidationError('invalid_headers');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RequestValidationError('invalid_headers');
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  const headerEntries: [string, string][] = [];
  for (const [name, value] of entries) {
    if (
      !/^[!#$%&'*+.^_`|~\dA-Za-z-]+$/.test(name) ||
      typeof value !== 'string' ||
      Array.from(value).some((char) => {
        const code = char.charCodeAt(0);
        return (code < 32 && code !== 9) || code === 127;
      })
    ) {
      throw new RequestValidationError('invalid_headers');
    }
    headerEntries.push([name, value]);
  }
  const authIndex = input.authIndex.trim();
  if (
    !authIndex &&
    (headerEntries.some(([, value]) => value.includes('$TOKEN$')) || input.body.includes('$TOKEN$'))
  ) {
    throw new RequestValidationError('token_credential');
  }
  const proxyUrl = input.proxyUrl.trim();
  if (
    proxyUrl &&
    !['direct', 'none'].includes(proxyUrl.toLowerCase()) &&
    !isAbsoluteUrl(proxyUrl, ['http:', 'https:', 'socks5:', 'socks5h:'])
  ) {
    throw new RequestValidationError('invalid_proxy');
  }
  return {
    method,
    url,
    header: Object.fromEntries(headerEntries),
    ...(authIndex ? { authIndex } : {}),
    ...(proxyUrl ? { proxy_url: proxyUrl } : {}),
    ...(input.body ? { data: input.body } : {}),
  };
}

export function parseQueueCount(value: string): number {
  const trimmed = value.trim();
  const count = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(count) || count <= 0) {
    throw new RequestValidationError('invalid_count');
  }
  return count;
}

export function parseUsageQueue(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new RequestValidationError('invalid_queue');
  return [...value];
}
