import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ToolContext } from "./context.js";
import { safeJsonStringify } from "../utils/sanitizer.js";

export function registerIntelligenceTools(server: McpServer, ctx: ToolContext): void {
  const { sentry, correlation } = ctx;

  // Tool: Find Regressions (Sentry)
  server.tool(
    "find_regression",
    "Find errors in Sentry that have regressed or were first introduced in a specific release or timeframe.",
    {
      project: z.string().optional().describe("Sentry project slug"),
      timeframe: z.string().optional().describe("Time window e.g. '24h', '7d'"),
      release: z.string().optional().describe("Release tag/version"),
      environment: z.string().optional().describe("Environment e.g. 'production', 'staging'"),
    },
    async ({ project, timeframe, release, environment }) => {
      try {
        const regressions = await sentry.findRegressions({ project, timeframe, release, environment });
        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify({ count: regressions.length, regressions }),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to search regressions: ${err.message}` }],
        };
      }
    }
  );

  // Tool: Correlate Incident (Multi-System Triage)
  server.tool(
    "correlate_incident",
    "Run automated triage correlating deployment timestamps, git diffs, edge 5xx telemetry, and Sentry stacktraces to find the root cause.",
    {
      service_or_project: z.string().describe("Project name / Sentry project / Vercel project"),
      owner: z.string().optional().describe("GitHub owner or organization"),
      repo: z.string().optional().describe("GitHub repo name"),
      deployment_id: z.string().optional().describe("Specific deployment ID to triage"),
      environment: z.enum(["production", "staging", "preview"]).optional().describe("Environment filter (default: production)"),
      timeframe: z.string().optional().describe("Timeframe to evaluate e.g. '24h', '2d'"),
    },
    async ({ service_or_project, owner, repo, deployment_id, environment, timeframe }) => {
      try {
        const report = await correlation.correlateIncident({
          serviceOrProject: service_or_project,
          owner,
          repo,
          deploymentId: deployment_id,
          environment,
          timeframe,
        });
        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(report),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to correlate incident: ${err.message}` }],
        };
      }
    }
  );

  // Tool: Explain Incident (Human-Readable Executive Summary)
  server.tool(
    "explain_incident",
    "Generates a human-readable executive briefing of an incident with root cause, evidence chain, confidence, and recommended action.",
    {
      service_or_project: z.string().describe("Project name / Sentry project / Vercel project"),
      owner: z.string().optional().describe("GitHub owner or organization"),
      repo: z.string().optional().describe("GitHub repo name"),
      deployment_id: z.string().optional().describe("Specific deployment ID to triage"),
      environment: z.enum(["production", "staging", "preview"]).optional().describe("Environment filter (default: production)"),
      timeframe: z.string().optional().describe("Timeframe to evaluate e.g. '24h', '2d'"),
    },
    async ({ service_or_project, owner, repo, deployment_id, environment, timeframe }) => {
      try {
        const report = await correlation.correlateIncident({
          serviceOrProject: service_or_project,
          owner,
          repo,
          deploymentId: deployment_id,
          environment,
          timeframe,
        });

        const ev = report.evaluation;
        const cand = ev.candidate;

        let briefing = `# 🛰️ Incident Triage Briefing: ${service_or_project}\n\n`;
        briefing += `**Verdict:** \`${ev.verdict}\` (${ev.confidence.percentage}% Confidence — ${ev.confidence.level})\n\n`;

        if (cand) {
          briefing += `### 🎯 Suspected Root Cause\n`;
          briefing += `• **Offending File:** \`${cand.file}${cand.line ? `:${cand.line}` : ""}\`\n`;
          if (cand.commitSha) briefing += `• **Introduced in Commit:** \`${cand.commitSha.slice(0, 7)}\`\n`;
          if (cand.commitAuthor) briefing += `• **Author:** ${cand.commitAuthor}\n`;
          if (cand.commitMessage) briefing += `• **Commit Message:** "${cand.commitMessage.split("\n")[0]}"\n`;
          briefing += `• **Sentry Error:** ${cand.errorTitle}\n\n`;
        } else {
          briefing += `### ℹ️ Root Cause Analysis\nNo definitive single commit or code file matched the error stacktrace.\n\n`;
        }

        briefing += `### 🔍 Evidence Chain\n`;
        for (const item of ev.confidence.basis) {
          briefing += `• ${item}\n`;
        }
        if (ev.confidence.basis.length === 0) {
          briefing += `• No strong evidence matches found.\n`;
        }

        if (ev.confidence.caveats.length > 0) {
          briefing += `\n### ⚠️ Caveats\n`;
          for (const c of ev.confidence.caveats) {
            briefing += `• ${c}\n`;
          }
        }

        briefing += `\n### 🛠️ Recommended Action\n${ev.recommendation}\n`;

        return {
          content: [
            {
              type: "text",
              text: briefing,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to explain incident: ${err.message}` }],
        };
      }
    }
  );
}
