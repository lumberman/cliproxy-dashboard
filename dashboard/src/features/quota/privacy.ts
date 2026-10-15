/** Mask account identities without changing the identifiers sent to the server. */
const MASK = '•••';
const EMAIL_PATTERN = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+)((?:\.[A-Za-z0-9-]+)+)/g;
const PROVIDER_PREFIX = /^(?:claude|codex|antigravity|gemini|kimi|xai|devin|meta|vertex)-/i;

export function maskEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, (_match, local: string, host: string, rest: string) => {
    const prefix = local.match(PROVIDER_PREFIX)?.[0] ?? '';
    const account = local.slice(prefix.length);
    const extension = rest.toLowerCase().endsWith('.json') ? rest.slice(-5) : '';
    const domain = `${host}${extension ? rest.slice(0, -5) : rest}`.split('.');
    const topLevel = domain.pop();
    const maskedDomain = domain.map((part) => `${part[0]}${MASK}`).join('.');
    return `${prefix}${account[0]}${MASK}@${maskedDomain}.${topLevel}${extension}`;
  });
}

export function displayIdentity(text: string, hideEmails: boolean): string {
  return hideEmails ? maskEmails(text) : text;
}
