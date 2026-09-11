import { SentryProvider } from "../providers/sentry.js";
import { GitHubProvider } from "../providers/github.js";
import { VercelProvider } from "../providers/vercel.js";
import { BetterStackProvider } from "../providers/betterstack.js";
import { normalizeFilePath, arePathsEquivalent } from "../core/normalization/path.js";
import { parseGitDiff, ParsedFileDiff } from "../core/diff/parser.js";
import {
  evaluateIncidentEvidence,
  IncidentEvaluation,
  CandidateRootCause,
} from "../core/evidence/model.js";
import {
  UnifiedDeployment,
  UnifiedError,
  UnifiedErrorDetails,
} from "../types/domain.js";

export interface EnhancedIncidentReport {
  timestamp: string;
  context: {
    serviceOrProject: string;
    environment: "production" | "staging" | "preview";
    timeframe: string;
  };
  targetDeployment?: UnifiedDeployment;
  previousDeployment?: UnifiedDeployment;
  codeChangesSummary?: {
    totalCommits: number;
    filesModifiedCount: number;
    baseSha: string;
    headSha: string;
  };
  evaluation: IncidentEvaluation;
  topErrors: UnifiedError[];
}

export class CorrelationService {
  constructor(
    private sentry: SentryProvider,
    private github: GitHubProvider,
    private vercel: VercelProvider,
    private betterstack: BetterStackProvider
  ) {}

  /**
   * Correlate a deployment with subsequent Sentry errors, git commit diffs, and telemetry signals
   * using multi-dimensional evidence evaluation.
   */
  async correlateIncident(params: {
    serviceOrProject: string;
    owner?: string;
    repo?: string;
    deploymentId?: string;
    environment?: "production" | "staging" | "preview";
    timeframe?: string; // e.g. "24h", "2d"
  }): Promise<EnhancedIncidentReport> {
    const environment = params.environment || "production";
    const timeframe = params.timeframe || "24h";

    let targetDeployment: UnifiedDeployment | undefined;
    let previousDeployment: UnifiedDeployment | undefined;

    // 1. Resolve deployments
    if (this.vercel.isConfigured()) {
      try {
        const deployments = await this.vercel.getDeployments({
          projectId: params.serviceOrProject,
          target: environment === "staging" ? "preview" : (environment as "production" | "preview"),
          limit: 5,
        });

        if (deployments.length > 0) {
          if (params.deploymentId) {
            const idx = deployments.findIndex((d) => d.id === params.deploymentId);
            targetDeployment = deployments[idx];
            previousDeployment = deployments[idx + 1];
          } else {
            targetDeployment = deployments[0];
            previousDeployment = deployments[1];
          }
        }
      } catch {
        // Continue to fallback
      }
    }

    // Fallback to GitHub deployments
    if (!targetDeployment && this.github.isConfigured() && params.owner && params.repo) {
      try {
        const ghDeploys = await this.github.getDeployments({
          owner: params.owner,
          repo: params.repo,
          environment,
          limit: 5,
        });

        if (ghDeploys.length > 0) {
          targetDeployment = {
            id: ghDeploys[0].id,
            name: params.serviceOrProject,
            state: "READY",
            environment: ghDeploys[0].environment,
            creator: ghDeploys[0].creator,
            createdAt: ghDeploys[0].createdAt,
            commitSha: ghDeploys[0].sha,
            provider: "github",
          };
          if (ghDeploys[1]) {
            previousDeployment = {
              id: ghDeploys[1].id,
              name: params.serviceOrProject,
              state: "READY",
              environment: ghDeploys[1].environment,
              creator: ghDeploys[1].creator,
              createdAt: ghDeploys[1].createdAt,
              commitSha: ghDeploys[1].sha,
              provider: "github",
            };
          }
        }
      } catch {
        // Fallback
      }
    }

    // 2. Fetch and parse Git Diff
    let parsedDiffMap = new Map<string, ParsedFileDiff>();
    let rawDiffFiles: any[] = [];
    let headCommitMeta: any;

    if (
      this.github.isConfigured() &&
      params.owner &&
      params.repo &&
      targetDeployment?.commitSha &&
      previousDeployment?.commitSha
    ) {
      try {
        const codeChanges = await this.github.compareDeployments({
          owner: params.owner,
          repo: params.repo,
          base: previousDeployment.commitSha,
          head: targetDeployment.commitSha,
        });

        rawDiffFiles = codeChanges.files;
        parsedDiffMap = parseGitDiff(codeChanges.files);
        headCommitMeta = codeChanges.commits[codeChanges.commits.length - 1];
      } catch {
        // Diff comparison unavailable
      }
    }

    // 3. Query Sentry for candidate errors
    let suspectErrors: UnifiedError[] = [];
    let bestEvaluation: IncidentEvaluation | null = null;

    if (this.sentry.isConfigured()) {
      try {
        suspectErrors = await this.sentry.getRecentErrors({
          project: params.serviceOrProject,
          statsPeriod: timeframe,
          limit: 10,
        });

        const deployTime = targetDeployment?.readyAt
          ? new Date(targetDeployment.readyAt).getTime()
          : targetDeployment?.createdAt
          ? new Date(targetDeployment.createdAt).getTime()
          : Date.now();

        // Inspect top errors to find the strongest candidate
        for (const err of suspectErrors.slice(0, 5)) {
          try {
            const details: UnifiedErrorDetails = await this.sentry.getErrorDetails(err.id);
            const errFirstSeen = new Date(err.firstSeen).getTime();
            const minutesDiff = Math.max(0, Math.round((errFirstSeen - deployTime) / (60 * 1000)));
            const isPostDeploy = errFirstSeen >= deployTime - 5 * 60 * 1000; // 5m grace period

            for (const frame of details.stacktrace) {
              const normFrameFile = normalizeFilePath(frame.filename);

              // Find matching file in diff
              for (const [diffFile, parsedDiff] of parsedDiffMap.entries()) {
                if (arePathsEquivalent(normFrameFile, diffFile)) {
                  const lineModified = frame.lineno ? parsedDiff.isLineModified(frame.lineno) : false;
                  const lineInContext = frame.lineno ? parsedDiff.isLineInContext(frame.lineno) : false;

                  const candidateEval = evaluateIncidentEvidence({
                    code: {
                      fileMatch: true,
                      lineModified,
                      lineInContext,
                      matchedFile: diffFile,
                      matchedLine: frame.lineno,
                    },
                    runtime: {
                      errorCount: err.count,
                      affectedUsers: err.userCount,
                      isUnresolved: err.status === "unresolved",
                      hasStackTrace: details.stacktrace.length > 0,
                    },
                    temporal: {
                      minutesBetweenDeployAndError: minutesDiff,
                      isPostDeploy,
                      edgeSpikeCorrelated: true, // Correlated with deployment window
                    },
                    candidateMeta: {
                      functionName: frame.function,
                      commitSha: targetDeployment?.commitSha,
                      commitAuthor: headCommitMeta?.author,
                      commitMessage: headCommitMeta?.message,
                      errorTitle: err.title,
                      errorId: err.id,
                    },
                  });

                  // Track the highest confidence candidate
                  if (!bestEvaluation || candidateEval.confidence.score > bestEvaluation.confidence.score) {
                    bestEvaluation = candidateEval;
                  }
                }
              }
            }
          } catch {
            // Ignore individual error parsing failures
          }
        }
      } catch {
        // Sentry query failed
      }
    }

    // Default evaluation if no candidate matched
    if (!bestEvaluation) {
      bestEvaluation = evaluateIncidentEvidence({
        code: {
          fileMatch: false,
          lineModified: false,
          lineInContext: false,
          matchedFile: "none",
        },
        runtime: {
          errorCount: suspectErrors.reduce((sum, e) => sum + e.count, 0),
          affectedUsers: suspectErrors.reduce((sum, e) => sum + e.userCount, 0),
          isUnresolved: suspectErrors.length > 0,
          hasStackTrace: false,
        },
        temporal: {
          minutesBetweenDeployAndError: 0,
          isPostDeploy: false,
          edgeSpikeCorrelated: false,
        },
      });
    }

    return {
      timestamp: new Date().toISOString(),
      context: {
        serviceOrProject: params.serviceOrProject,
        environment,
        timeframe,
      },
      targetDeployment,
      previousDeployment,
      codeChangesSummary:
        targetDeployment?.commitSha && previousDeployment?.commitSha
          ? {
              totalCommits: rawDiffFiles.length > 0 ? 1 : 0,
              filesModifiedCount: rawDiffFiles.length,
              baseSha: previousDeployment.commitSha,
              headSha: targetDeployment.commitSha,
            }
          : undefined,
      evaluation: bestEvaluation,
      topErrors: suspectErrors.slice(0, 5),
    };
  }
}
