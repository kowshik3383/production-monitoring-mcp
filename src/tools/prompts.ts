import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ToolContext } from "./context.js";

export function registerPrompts(server: McpServer, ctx: ToolContext): void {
  // Prompt: triage-incident
  server.prompt(
    "triage-incident",
    "Systematic incident investigation workflow connecting deployments, Sentry stack traces, and edge signals",
    {
      service_or_project: z.string().describe("Service or project name to triage"),
      timeframe: z.string().optional().describe("Investigation window (e.g. '2h', '24h')"),
    },
    async ({ service_or_project, timeframe }) => {
      const tf = timeframe || "24h";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Investigate active production incidents for "${service_or_project}" over the past ${tf}.

Please follow this structured triage workflow:
1. Run \`get_production_health(project="${service_or_project}")\` to check operational signals.
2. Run \`get_recent_errors(project="${service_or_project}", timeframe="${tf}")\` to identify error spikes.
3. Run \`correlate_incident(service_or_project="${service_or_project}", timeframe="${tf}")\` to cross-reference Git diffs and stack traces.
4. Output your analysis using the \`explain_incident\` format with Suspected Root Cause, Evidence Chain, Confidence, and Recommended Action.`,
            },
          },
        ],
      };
    }
  );

  // Prompt: investigate-regression
  server.prompt(
    "investigate-regression",
    "Identify regressions introduced in a specific release or recent deployment",
    {
      project: z.string().describe("Project or service slug"),
      release: z.string().optional().describe("Target release version or commit SHA"),
    },
    async ({ project, release }) => {
      const relInfo = release ? ` for release "${release}"` : " in recent deployments";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Check for newly introduced regressions in project "${project}"${relInfo}.

Workflow:
1. Run \`find_regression(project="${project}"${release ? `, release="${release}"` : ""})\`.
2. Inspect the offending stack traces using \`get_error_details\`.
3. Highlight whether any bugs represent newly introduced failures vs resurfaced known issues.`,
            },
          },
        ],
      };
    }
  );
}
