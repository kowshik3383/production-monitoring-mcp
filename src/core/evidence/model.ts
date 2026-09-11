/**
 * Multi-Dimensional Evidence & Confidence Scoring Engine
 * Replaces naive linear formulas with orthogonal evidence dimensions,
 * explicit proof basis, and transparent caveats.
 */

export interface CodeEvidence {
  fileMatch: boolean;
  lineModified: boolean;
  lineInContext: boolean;
  matchedFile: string;
  matchedLine?: number;
  hunkHeader?: string;
  dimensionScore: number; // 0.0 to 1.0
}

export interface RuntimeEvidence {
  errorCount: number;
  affectedUsers: number;
  isUnresolved: boolean;
  hasStackTrace: boolean;
  dimensionScore: number; // 0.0 to 1.0
}

export interface TemporalEvidence {
  minutesBetweenDeployAndError: number;
  isPostDeploy: boolean;
  edgeSpikeCorrelated: boolean;
  dimensionScore: number; // 0.0 to 1.0
}

export type ConfidenceLevel =
  | "HIGH_CONFIDENCE"
  | "LIKELY_CAUSE"
  | "POSSIBLE_CAUSE"
  | "INSUFFICIENT_DATA";

export type IncidentVerdict =
  | "HIGH_CONFIDENCE_REGRESSION"
  | "LIKELY_REGRESSION"
  | "POSSIBLE_CAUSE"
  | "INSUFFICIENT_DATA";

export interface CandidateRootCause {
  file: string;
  line?: number;
  functionName?: string;
  commitSha?: string;
  commitAuthor?: string;
  commitMessage?: string;
  errorTitle: string;
  errorId: string;
}

export interface StructuredConfidence {
  score: number; // 0.0 to 1.0 (e.g. 0.94)
  percentage: number; // 0 to 100 (e.g. 94)
  level: ConfidenceLevel;
  basis: string[];
  caveats: string[];
}

export interface IncidentEvaluation {
  verdict: IncidentVerdict;
  confidence: StructuredConfidence;
  candidate?: CandidateRootCause;
  evidence: {
    code: CodeEvidence;
    runtime: RuntimeEvidence;
    temporal: TemporalEvidence;
  };
  recommendation: string;
}

export function evaluateIncidentEvidence(params: {
  code: {
    fileMatch: boolean;
    lineModified: boolean;
    lineInContext: boolean;
    matchedFile: string;
    matchedLine?: number;
    hunkHeader?: string;
  };
  runtime: {
    errorCount: number;
    affectedUsers: number;
    isUnresolved: boolean;
    hasStackTrace: boolean;
  };
  temporal: {
    minutesBetweenDeployAndError: number;
    isPostDeploy: boolean;
    edgeSpikeCorrelated: boolean;
  };
  candidateMeta?: {
    functionName?: string;
    commitSha?: string;
    commitAuthor?: string;
    commitMessage?: string;
    errorTitle: string;
    errorId: string;
  };
}): IncidentEvaluation {
  const basis: string[] = [];
  const caveats: string[] = [];

  // 1. Code Evidence Dimension
  let codeScore = 0;
  if (params.code.fileMatch) {
    codeScore += 0.5;
    basis.push(`Stack trace file matches modified file: '${params.code.matchedFile}'`);

    if (params.code.lineModified) {
      codeScore += 0.5;
      basis.push(
        `Stack trace line ${params.code.matchedLine} was directly added/modified in this commit diff`
      );
    } else if (params.code.lineInContext) {
      codeScore += 0.25;
      basis.push(
        `Stack trace line ${params.code.matchedLine} is in the immediate context of commit modifications`
      );
      caveats.push("Line is within the diff hunk context, but not newly added");
    } else {
      caveats.push("File was modified, but stack line number falls outside modified hunks");
    }
  } else {
    caveats.push("No direct file match between Sentry stacktrace and Git commit diff");
  }

  // 2. Runtime Evidence Dimension
  let runtimeScore = 0;
  if (params.runtime.isUnresolved) runtimeScore += 0.3;
  if (params.runtime.hasStackTrace) runtimeScore += 0.3;
  if (params.runtime.errorCount > 50) runtimeScore += 0.2;
  else if (params.runtime.errorCount > 0) runtimeScore += 0.1;
  if (params.runtime.affectedUsers > 10) runtimeScore += 0.2;

  if (params.runtime.errorCount > 0) {
    basis.push(
      `Active runtime error: ${params.runtime.errorCount} occurrences affecting ${params.runtime.affectedUsers} users`
    );
  }

  // 3. Temporal Evidence Dimension
  let temporalScore = 0;
  if (params.temporal.isPostDeploy) {
    if (params.temporal.minutesBetweenDeployAndError <= 15) {
      temporalScore += 0.6;
      basis.push(
        `Error first appeared ${params.temporal.minutesBetweenDeployAndError}m after deployment`
      );
    } else if (params.temporal.minutesBetweenDeployAndError <= 60) {
      temporalScore += 0.4;
      basis.push(
        `Error first appeared ${params.temporal.minutesBetweenDeployAndError}m after deployment`
      );
    } else {
      temporalScore += 0.2;
    }
    caveats.push("Temporal correlation supports causation but does not prove it");
  } else {
    caveats.push("Error was already active before this deployment");
  }

  if (params.temporal.edgeSpikeCorrelated) {
    temporalScore += 0.4;
    basis.push("Edge 5xx error rate spiked immediately following deployment window");
  }

  // Weighted Multi-Dimensional Synthesis
  // Code evidence is primary (50%), Temporal is secondary (30%), Runtime is tertiary (20%)
  const compositeScore = Math.min(
    1.0,
    codeScore * 0.5 + temporalScore * 0.3 + runtimeScore * 0.2
  );

  let level: ConfidenceLevel = "INSUFFICIENT_DATA";
  let verdict: IncidentVerdict = "INSUFFICIENT_DATA";
  let recommendation = "Monitor logs and inspect Sentry issue breadcrumbs.";

  if (compositeScore >= 0.85 && params.code.lineModified && params.temporal.isPostDeploy) {
    level = "HIGH_CONFIDENCE";
    verdict = "HIGH_CONFIDENCE_REGRESSION";
    recommendation = `Roll back deployment ${params.candidateMeta?.commitSha?.slice(0, 7) || ""} or revert commits modifying ${params.code.matchedFile}.`;
  } else if (compositeScore >= 0.65 && params.code.fileMatch) {
    level = "LIKELY_CAUSE";
    verdict = "LIKELY_REGRESSION";
    recommendation = `Investigate recent changes to ${params.code.matchedFile}; consider hotfix or partial rollback.`;
  } else if (compositeScore >= 0.4) {
    level = "POSSIBLE_CAUSE";
    verdict = "POSSIBLE_CAUSE";
    recommendation = "Multiple potential factors detected. Cross-reference runtime logs with telemetry.";
  } else {
    level = "INSUFFICIENT_DATA";
    verdict = "INSUFFICIENT_DATA";
    recommendation = "Insufficient correlation between deployment diffs and error stack traces.";
  }

  const candidate: CandidateRootCause | undefined = params.candidateMeta
    ? {
        file: params.code.matchedFile,
        line: params.code.matchedLine,
        functionName: params.candidateMeta.functionName,
        commitSha: params.candidateMeta.commitSha,
        commitAuthor: params.candidateMeta.commitAuthor,
        commitMessage: params.candidateMeta.commitMessage,
        errorTitle: params.candidateMeta.errorTitle,
        errorId: params.candidateMeta.errorId,
      }
    : undefined;

  return {
    verdict,
    confidence: {
      score: Number(compositeScore.toFixed(2)),
      percentage: Math.round(compositeScore * 100),
      level,
      basis,
      caveats,
    },
    candidate,
    evidence: {
      code: { ...params.code, dimensionScore: Number(codeScore.toFixed(2)) },
      runtime: { ...params.runtime, dimensionScore: Number(runtimeScore.toFixed(2)) },
      temporal: { ...params.temporal, dimensionScore: Number(temporalScore.toFixed(2)) },
    },
    recommendation,
  };
}
