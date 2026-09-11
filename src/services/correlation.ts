import { SentryProvider } from "../providers/sentry.js";
import { GitHubProvider } from "../providers/github.js";
import { VercelProvider } from "../providers/vercel.js";
import { BetterStackProvider } from "../providers/betterstack.js";
import {
  IncidentCorrelationReport,
  UnifiedDeployment,
  UnifiedError,
  UnifiedErrorDetails,
} from "../types/domain.js";

export class CorrelationService {
  constructor(
    private sentry: SentryProvider,
    private github: GitHubProvider,
    private vercel: VercelProvider,
    private betterstack: BetterStackProvider
  ) {}

  /**
   * Automatically correlate a deployment with subsequent Sentry errors, git commit diffs, and logs.
   */
  async correlateIncident(params: {
    serviceOrProject: string;
    owner?: string;
    repo?: string;
    deploymentId?: string;
    timeframe?: string; // e.g. "24h", "2d"
  }): Promise<IncidentCorrelationReport> {
    let targetDeployment: UnifiedDeployment | undefined;
    let previousDeployment: UnifiedDeployment | undefined;

    // 1. Resolve deployments
    if (this.vercel.isConfigured()) {
      try {
        const deployments = await this.vercel.getDeployments({
          projectId: params.serviceOrProject,
          target: "production",
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
      } catch (err) {
        // Fallback or continue if Vercel error
      }
    }

    // Fallback to GitHub deployments if Vercel not configured or returned nothing
    if (!targetDeployment && this.github.isConfigured() && params.owner && params.repo) {
      try {
        const ghDeploys = await this.github.getDeployments({
          owner: params.owner,
          repo: params.repo,
          environment: "production",
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
      } catch (err) {
        // GitHub deploy fetch failed
      }
    }

    // 2. Fetch Git Diff if commits are available
    let codeChanges;
    const changedFileNames = new Set<string>();

    if (
      this.github.isConfigured() &&
      params.owner &&
      params.repo &&
      targetDeployment?.commitSha &&
      previousDeployment?.commitSha
    ) {
      try {
        codeChanges = await this.github.compareDeployments({
          owner: params.owner,
          repo: params.repo,
          base: previousDeployment.commitSha,
          head: targetDeployment.commitSha,
        });

        for (const f of codeChanges.files) {
          changedFileNames.add(f.filename.toLowerCase());
          const basename = f.filename.split("/").pop()?.toLowerCase();
          if (basename) changedFileNames.add(basename);
        }
      } catch (err) {
        // Diff failed or commits not found
      }
    }

    // 3. Query Sentry for recent errors
    let suspectErrors: UnifiedError[] = [];
    const matchedFiles = new Set<string>();
    let likelyRootCause = "";

    if (this.sentry.isConfigured()) {
      try {
        suspectErrors = await this.sentry.getRecentErrors({
          project: params.serviceOrProject,
          statsPeriod: params.timeframe || "24h",
          limit: 10,
        });

        // Deep-inspect stack traces of top errors to correlate with changed files
        for (const err of suspectErrors.slice(0, 5)) {
          try {
            const details: UnifiedErrorDetails = await this.sentry.getErrorDetails(err.id);
            for (const frame of details.stacktrace) {
              const frameFile = frame.filename.toLowerCase();
              const frameBasename = frameFile.split("/").pop()?.split("\\").pop() || "";

              if (changedFileNames.has(frameFile) || changedFileNames.has(frameBasename)) {
                matchedFiles.add(frame.filename);
                likelyRootCause = `Error "${err.title}" originates from ${frame.filename}:${frame.lineno || "unknown"}, which was modified in commit ${targetDeployment?.commitSha?.slice(0, 7) || "latest deployment"}.`;
              }
            }
          } catch (e) {
            // Ignore single error detail failure
          }
        }
      } catch (err) {
        // Sentry fetch failed
      }
    }

    const matchingFilesArray = Array.from(matchedFiles);

    // 4. Construct synthesized executive summary
    let summary = `Incident Triage Report for ${params.serviceOrProject}\n`;
    if (targetDeployment) {
      summary += `• Target Deployment: ${targetDeployment.id} (${targetDeployment.commitSha?.slice(0, 7) || "no sha"}) deployed at ${targetDeployment.createdAt}\n`;
    }
    if (codeChanges) {
      summary += `• Code Changes: ${codeChanges.totalCommits} commits, ${codeChanges.files.length} files modified between ${codeChanges.baseSha.slice(0, 7)} and ${codeChanges.headSha.slice(0, 7)}\n`;
    }
    summary += `• Sentry Unresolved Errors: ${suspectErrors.length} found in timeframe (${params.timeframe || "24h"})\n`;
    if (matchingFilesArray.length > 0) {
      summary += `• CRITICAL REGRESSION CORRELATION: Offending files present in both Git diff and error stacktraces: ${matchingFilesArray.join(", ")}\n`;
    }

    return {
      timestamp: new Date().toISOString(),
      serviceOrProject: params.serviceOrProject,
      targetDeployment,
      previousDeployment,
      codeChanges,
      suspectErrors,
      matchingFilesBetweenDiffAndStackTrace: matchingFilesArray,
      summary,
      likelyRootCause: likelyRootCause || (suspectErrors.length > 0 ? "Multiple unresolved errors detected, but no direct stacktrace file match with git diff." : "No critical error correlation found."),
      recommendedAction: matchingFilesArray.length > 0
        ? `Roll back deployment ${targetDeployment?.id || ""} or revert offending commits in ${matchingFilesArray[0]}.`
        : "Investigate Sentry error details and runtime logs around deployment timestamp.",
    };
  }
}
