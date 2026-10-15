import { describe, expect, test } from 'bun:test';
import { displayIdentity, maskEmails } from '@/features/quota/privacy';

describe('quota privacy masking', () => {
  test('masks the email inside an auth file name and keeps the rest', () => {
    expect(maskEmails('claude-tom@example.com.json')).toBe('claude-t•••@e•••.com.json');
    expect(maskEmails('codex-ada.lovelace+x@mail.dev')).toBe('codex-a•••@m•••.dev');
  });

  test('never leaves the local part or the domain name readable', () => {
    const masked = maskEmails('claude-tom@example.com.json');
    expect(masked).not.toContain('tom');
    expect(masked).not.toContain('example');
  });

  test('masks every email in a composed display name', () => {
    expect(maskEmails('plugin.json · bob@corp.io')).toBe('plugin.json · b•••@c•••.io');
  });

  test('leaves names without an email untouched', () => {
    expect(maskEmails('codex-team-seat.json')).toBe('codex-team-seat.json');
    expect(maskEmails('')).toBe('');
  });

  test('displayIdentity masks only while privacy is on', () => {
    expect(displayIdentity('a@b.co', true)).toBe('a•••@b•••.co');
    expect(displayIdentity('a@b.co', false)).toBe('a@b.co');
  });
});

test('masks every private domain label and keeps the provider prefix', () => {
  expect(maskEmails('claude-taylor@staff.example.com.json')).toBe('claude-t•••@s•••.e•••.com.json');
});
