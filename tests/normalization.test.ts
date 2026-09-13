import { describe, it, expect } from 'vitest';
import { normalizeFilePath, arePathsEquivalent, normalizeStackFrame } from '../src/core/normalization/path.js';
import { ErrorStackFrame } from '../src/types/domain.js';

describe('Path & Stack-Frame Normalization', () => {
  it('normalizes webpack bundler paths to relative repo paths', () => {
    expect(normalizeFilePath('webpack://app/src/services/checkout.ts')).toBe('src/services/checkout.ts');
    expect(normalizeFilePath('webpack:///src/utils/billing.ts')).toBe('src/utils/billing.ts');
  });

  it('normalizes container and serverless environment paths', () => {
    expect(normalizeFilePath('/var/task/src/services/checkout.ts')).toBe('src/services/checkout.ts');
    expect(normalizeFilePath('/app/src/services/checkout.ts')).toBe('src/services/checkout.ts');
    expect(normalizeFilePath('/usr/src/app/src/index.ts')).toBe('src/index.ts');
  });

  it('normalizes Windows backslashes to forward slashes', () => {
    expect(normalizeFilePath('src\\services\\checkout.ts')).toBe('src/services/checkout.ts');
  });

  it('strips Next.js chunk and server build prefixes', () => {
    expect(normalizeFilePath('_next/static/chunks/app/checkout.js')).toBe('app/checkout.js');
    expect(normalizeFilePath('.next/server/pages/api/checkout.js')).toBe('pages/api/checkout.js');
    expect(normalizeFilePath('dist/services/checkout.js')).toBe('services/checkout.js');
  });

  it('correctly identifies equivalent file paths despite extensions and directory prefixes', () => {
    expect(arePathsEquivalent('src/services/checkout.ts', 'services/checkout.js')).toBe(true);
    expect(arePathsEquivalent('webpack://app/src/services/checkout.ts', 'src/services/checkout.ts')).toBe(true);
    expect(arePathsEquivalent('src/components/Checkout.tsx', 'src/components/Checkout.jsx')).toBe(true);
    expect(arePathsEquivalent('src/services/checkout.ts', 'src/services/users.ts')).toBe(false);
  });

  it('normalizes stack frames and cleans bundler function artifacts', () => {
    const rawFrame: ErrorStackFrame = {
      filename: 'webpack://app/src/services/checkout.ts',
      function: 'async Object.calculateTax [as processOrder]',
      lineno: 142,
      colno: 12,
      inApp: true,
      context: ['const tax = rate * total;'],
    };

    const normalized = normalizeStackFrame(rawFrame);
    expect(normalized.normalizedPath).toBe('src/services/checkout.ts');
    expect(normalized.functionName).toBe('calculateTax');
    expect(normalized.lineno).toBe(142);
    expect(normalized.inApp).toBe(true);
  });
});
