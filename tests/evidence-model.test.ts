import { describe, it, expect } from 'vitest';
import { evaluateIncidentEvidence } from '../src/core/evidence/model.js';

describe('Multi-Dimensional Evidence Model', () => {
  it('returns HIGH_CONFIDENCE_REGRESSION when file matches, line is modified, and error is post-deploy', () => {
    const result = evaluateIncidentEvidence({
      code: {
        fileMatch: true,
        lineModified: true,
        lineInContext: false,
        matchedFile: 'src/services/checkout.ts',
        matchedLine: 142,
      },
      runtime: {
        errorCount: 150,
        affectedUsers: 45,
        isUnresolved: true,
        hasStackTrace: true,
      },
      temporal: {
        minutesBetweenDeployAndError: 5,
        isPostDeploy: true,
        edgeSpikeCorrelated: true,
      },
      candidateMeta: {
        functionName: 'processOrder',
        commitSha: '3c9e21f',
        commitAuthor: 'developer',
        errorTitle: 'TypeError: Cannot read properties of undefined',
        errorId: '12345',
      },
    });

    expect(result.verdict).toBe('HIGH_CONFIDENCE_REGRESSION');
    expect(result.confidence.level).toBe('HIGH_CONFIDENCE');
    expect(result.confidence.percentage).toBeGreaterThanOrEqual(85);
    expect(result.candidate?.file).toBe('src/services/checkout.ts');
    expect(result.candidate?.line).toBe(142);
    expect(result.confidence.basis.length).toBeGreaterThan(0);
  });

  it('downgrades to LIKELY_REGRESSION when file is modified but line is outside modified hunks', () => {
    const result = evaluateIncidentEvidence({
      code: {
        fileMatch: true,
        lineModified: false,
        lineInContext: false,
        matchedFile: 'src/services/checkout.ts',
        matchedLine: 999,
      },
      runtime: {
        errorCount: 80,
        affectedUsers: 20,
        isUnresolved: true,
        hasStackTrace: true,
      },
      temporal: {
        minutesBetweenDeployAndError: 10,
        isPostDeploy: true,
        edgeSpikeCorrelated: false,
      },
    });

    expect(result.verdict).toBe('LIKELY_REGRESSION');
    expect(result.confidence.caveats).toContain('File was modified, but stack line number falls outside modified hunks');
  });

  it('returns INSUFFICIENT_DATA when no code or temporal correlation exists', () => {
    const result = evaluateIncidentEvidence({
      code: {
        fileMatch: false,
        lineModified: false,
        lineInContext: false,
        matchedFile: 'none',
      },
      runtime: {
        errorCount: 2,
        affectedUsers: 1,
        isUnresolved: false,
        hasStackTrace: false,
      },
      temporal: {
        minutesBetweenDeployAndError: 0,
        isPostDeploy: false,
        edgeSpikeCorrelated: false,
      },
    });

    expect(result.verdict).toBe('INSUFFICIENT_DATA');
    expect(result.confidence.level).toBe('INSUFFICIENT_DATA');
  });
});
