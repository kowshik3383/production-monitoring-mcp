import { describe, it, expect } from 'vitest';
import { parseGitDiff, ParsedFileDiff } from '../src/core/diff/parser.js';

describe('Git Unified Diff Parser', () => {
  const samplePatch = [
    "@@ -10,6 +10,8 @@ function calculateTotals() {",
    "   const subtotal = 100;",
    "+  const taxRate = 0.08;",
    "+  const tax = subtotal * taxRate;",
    "   return subtotal;",
    " }",
    "\\ No newline at end of file"
  ].join("\n");

  it('correctly parses added, removed, and context lines from a hunk', () => {
    const diff = new ParsedFileDiff('src/services/billing.ts', samplePatch, 'modified');

    expect(diff.filename).toBe('src/services/billing.ts');
    expect(diff.status).toBe('modified');
    expect(diff.hunks.length).toBe(1);

    // Line 11 and 12 are added lines (+ taxRate and + tax)
    expect(diff.isLineModified(11)).toBe(true);
    expect(diff.isLineModified(12)).toBe(true);
    expect(diff.isLineModified(10)).toBe(false);

    // Context line
    expect(diff.isLineInContext(10)).toBe(true);
  });

  it('safely skips \\ No newline at end of file without throwing or corrupting line offsets', () => {
    const diff = new ParsedFileDiff('test.ts', samplePatch);
    expect(diff.addedLinesSet.has(11)).toBe(true);
    expect(diff.addedLinesSet.has(12)).toBe(true);
  });

  it('detects proximity to modified lines', () => {
    const diff = new ParsedFileDiff('test.ts', samplePatch);
    expect(diff.isLineNearModification(14, 2)).toBe(true);
    expect(diff.isLineNearModification(50, 2)).toBe(false);
  });

  it('parses multiple files and statuses using parseGitDiff', () => {
    const files = [
      { filename: 'src/a.ts', patch: samplePatch, status: 'modified' },
      { filename: 'src/b.ts', status: 'added' },
    ];
    const map = parseGitDiff(files);

    expect(map.has('src/a.ts')).toBe(true);
    expect(map.get('src/b.ts')?.status).toBe('added');
  });
});
