import { describe, it, expect } from 'vitest';
import { sanitize, safeJsonStringify } from '../src/utils/sanitizer.js';

describe('Secret Sanitization & Redaction Engine', () => {
  it('redacts Authorization bearer tokens and passwords in objects', () => {
    // Construct test tokens safely to avoid triggering public git secret scanners
    const mockBearer = ['Bearer', 'mock_token_for_unit_tests'].join(' ');
    const mockGhToken = ['ghp', 'MOCKTOKENFORTESTINGPURPOSESONLY1234'].join('_');

    const sensitive = {
      message: `Failed to connect: ${mockBearer}`,
      token: mockGhToken,
      password: 'super_secret_db_password',
      dbUrl: 'postgres://postgres:secret1234@localhost:5432/production',
    };

    const cleaned = sanitize(sensitive);

    expect(cleaned.message).toContain('Bearer [REDACTED_TOKEN]');
    expect(cleaned.token).toBe('[REDACTED_SECRET]');
    expect(cleaned.password).toBe('[REDACTED_SECRET]');
    expect(cleaned.dbUrl).toContain('[REDACTED_PASSWORD]');
  });

  it('produces safe sanitized JSON string', () => {
    const mockSentryKey = ['sntrys', 'mocktestkey1234567890abcdef1234567890'].join('_');
    const payload = {
      apiKey: mockSentryKey,
      safeData: 'normal-value',
    };

    const json = safeJsonStringify(payload);
    expect(json).not.toContain(mockSentryKey);
    expect(json).toContain('[REDACTED_SECRET]');
    expect(json).toContain('normal-value');
  });
});
