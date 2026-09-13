import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ToolContext } from "./context.js";
import { safeJsonStringify } from "../utils/sanitizer.js";

export function registerInvestigationTools(server: McpServer, ctx: ToolContext): void {
  const { sentry, github, vercel, betterstack, cloudflare, cache } = ctx;

  // Tool: Get Error Details (Sentry) - with optional token compaction
  server.tool(
    "get_error_details",
    "Fetch deep technical details for a specific Sentry issue including parsed in-app stack trace frames, code context, tags, and breadcrumbs.",
    {
      issue_id: z.string().describe("Sentry issue ID"),
      compact: z.boolean().optional().describe("If true, returns only in-app stack frames and the 5 most recent breadcrumbs to conserve LLM tokens"),
    },
    async ({ issue_id, compact }) => {
      try {
        const details = await sentry.getErrorDetails(issue_id);
        let result = details;

        if (compact) {
          result = {
            ...details,
            stacktrace: details.stacktrace.filter((f) => f.inApp),
            breadcrumbs: details.breadcrumbs ? details.breadcrumbs.slice(-5) : undefined,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(result),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch error details: ${err.message}` }],
        };
      }
    }
  );

  // Tool: Get Deployment Logs (Vercel)
  server.tool(
    "get_deployment_logs",
    "Fetch runtime and build logs for a specific Vercel deployment to diagnose deployment failures.",
    {
      deployment_id: z.string().describe("Vercel deployment ID"),
      limit: z.number().optional().describe("Max log lines (default: 50)"),
    },
    async ({ deployment_id, limit }) => {
      try {
        const logs = await vercel.getDeploymentLogs(deployment_id, limit || 50);
        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify({ deployment_id, count: logs.length, logs }),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch deployment logs: ${err.message}` }],
        };
      }
    }
  );

  // Tool: Compare Deployments (GitHub) - Cached
  server.tool(
    "compare_deployments",
    "Compare two deployments or commit SHAs via GitHub to see all commits, authors, and exact files changed.",
    {
      base_sha: z.string().describe("Previous/base commit SHA or tag"),
      head_sha: z.string().describe("Target/head commit SHA or tag"),
      owner: z.string().optional().describe("GitHub owner/org (falls back to GITHUB_OWNER)"),
      repo: z.string().optional().describe("GitHub repo name (falls back to GITHUB_REPO)"),
    },
    async ({ base_sha, head_sha, owner, repo }) => {
      try {
        const cacheKey = `compare_${owner || "default"}_${repo || "default"}_${base_sha}_${head_sha}`;
        const diff = await cache.getOrFetch(cacheKey, async () => {
          return await github.compareDeployments({
            base: base_sha,
            head: head_sha,
            owner,
            repo,
          });
        }, 120_000);

        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(diff),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to compare deployments: ${err.message}` }],
        };
      }
    }
  );

  // Tool: Get Commit Details (GitHub)
  server.tool(
    "get_commit_details",
    "Inspect a specific GitHub commit's message, author, stats, and modified files with diff snippets.",
    {
      sha: z.string().describe("Commit SHA"),
      owner: z.string().optional().describe("GitHub owner/org"),
      repo: z.string().optional().describe("GitHub repo name"),
    },
    async ({ sha, owner, repo }) => {
      try {
        const commit = await github.getCommitDetails({ ref: sha, owner, repo });
        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(commit),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch commit details: ${err.message}` }],
        };
      }
    }
  );

  // Tool: Analyze Logs (Better Stack Logs / Logtail)
  server.tool(
    "analyze_logs",
    "Query structured application logs from Better Stack Logs to investigate log anomalies, errors, and traces.",
    {
      query: z.string().optional().describe("Log search query filter"),
      from: z.string().optional().describe("Start timestamp (ISO 8601)"),
      to: z.string().optional().describe("End timestamp (ISO 8601)"),
      limit: z.number().optional().describe("Max log entries to retrieve (default: 50)"),
    },
    async ({ query, from, to, limit }) => {
      try {
        const logs = await betterstack.queryLogs({ query, from, to, limit });
        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify({ count: logs.length, logs }),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to analyze logs: ${err.message}` }],
        };
      }
    }
  );

  // Tool: Analyze API Latency & HTTP Status Codes (Cloudflare) - Cached
  server.tool(
    "analyze_api_latency",
    "Analyze edge HTTP traffic, status codes (2xx, 4xx, 5xx), and error rates from Cloudflare Analytics.",
    {
      zone_id: z.string().optional().describe("Cloudflare Zone ID (falls back to CLOUDFLARE_ZONE_ID)"),
      timeframe_minutes: z.number().optional().describe("Window in minutes (default: 60)"),
    },
    async ({ zone_id, timeframe_minutes }) => {
      try {
        const cacheKey = `cf_analytics_${zone_id || "default"}_${timeframe_minutes || 60}`;
        const analytics = await cache.getOrFetch(cacheKey, async () => {
          return await cloudflare.getHttpAnalytics({
            zoneId: zone_id,
            sinceMinutesAgo: timeframe_minutes,
          });
        }, 60_000);

        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(analytics),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch Cloudflare analytics: ${err.message}` }],
        };
      }
    }
  );
}
