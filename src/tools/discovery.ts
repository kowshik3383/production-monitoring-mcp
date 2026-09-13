import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ToolContext } from "./context.js";
import { getProviderStatus } from "../config.js";
import { safeJsonStringify } from "../utils/sanitizer.js";

export function registerDiscoveryTools(server: McpServer, ctx: ToolContext): void {
  const { sentry, github, vercel, betterstack, cloudflare, cache } = ctx;

  // Tool: Check Observability Status & Configuration
  server.tool(
    "get_observability_status",
    "Inspect the status of connected production monitoring providers (Sentry, GitHub, Vercel, Better Stack, Cloudflare) and list any missing credentials.",
    {},
    async () => {
      try {
        const status = getProviderStatus();
        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify({
                message: "Production Observability Status",
                providers: status,
                instructions:
                  "To enable any unconfigured provider, run 'npx production-monitoring-mcp init' or set the corresponding environment variables.",
              }),
            },
          ],
        };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: String(error?.message || error) }] };
      }
    }
  );

  // Tool: Get Production Health (One-Glance System Pulse)
  server.tool(
    "get_production_health",
    "Single-call operational pulse across all connected services (Uptime, Sentry error spikes, latest Vercel deploy, Cloudflare 5xx). Returns lean status signals rather than verbose raw logs.",
    {
      project: z.string().optional().describe("Optional project/service name to check"),
    },
    async ({ project }) => {
      try {
        return await cache.getOrFetch(`health_pulse_${project || "all"}`, async () => {
          const signals: Array<{ service: string; status: "HEALTHY" | "WARN" | "CRITICAL"; reason: string }> = [];
          let totalScore = 100;

          // 1. Check Uptime
          if (betterstack.isConfigured()) {
            try {
              const monitors = await betterstack.getMonitors();
              const down = monitors.filter((m) => m.status === "down");
              if (down.length > 0) {
                signals.push({
                  service: "Uptime",
                  status: "CRITICAL",
                  reason: `${down.length} monitor(s) currently DOWN: ${down.map((d) => d.name).join(", ")}`,
                });
                totalScore -= 40;
              } else {
                signals.push({ service: "Uptime", status: "HEALTHY", reason: `All ${monitors.length} monitor(s) UP` });
              }
            } catch {}
          }

          // 2. Check Sentry Errors
          if (sentry.isConfigured()) {
            try {
              const errors = await sentry.getRecentErrors({ project, statsPeriod: "1h", limit: 5 });
              const totalCount = errors.reduce((acc, e) => acc + e.count, 0);
              if (totalCount > 50) {
                signals.push({
                  service: "Errors (Sentry)",
                  status: "CRITICAL",
                  reason: `Error spike: ${totalCount} errors in past hour. Top issue: '${errors[0]?.title}'`,
                });
                totalScore -= 30;
              } else if (totalCount > 5) {
                signals.push({
                  service: "Errors (Sentry)",
                  status: "WARN",
                  reason: `${totalCount} errors in past hour`,
                });
                totalScore -= 10;
              } else {
                signals.push({ service: "Errors (Sentry)", status: "HEALTHY", reason: "Zero to low error volume past hour" });
              }
            } catch {}
          }

          // 3. Check Vercel Deployment
          let latestDeployInfo = "none";
          if (vercel.isConfigured()) {
            try {
              const deploys = await vercel.getDeployments({ projectId: project, target: "production", limit: 1 });
              if (deploys.length > 0) {
                const d = deploys[0];
                const minutesAgo = Math.max(0, Math.round((Date.now() - new Date(d.createdAt).getTime()) / 60000));
                latestDeployInfo = `${d.id} (${d.commitSha?.slice(0, 7) || "no sha"}) deployed ${minutesAgo}m ago [${d.state}]`;
                if (d.state === "ERROR") {
                  signals.push({ service: "Deployment (Vercel)", status: "CRITICAL", reason: `Latest deployment failed: ${d.id}` });
                  totalScore -= 30;
                } else {
                  signals.push({ service: "Deployment (Vercel)", status: "HEALTHY", reason: `Latest deployment ${d.state} (${minutesAgo}m ago)` });
                }
              }
            } catch {}
          }

          // 4. Check Cloudflare
          if (cloudflare.isConfigured()) {
            try {
              const analytics = await cloudflare.getHttpAnalytics({ sinceMinutesAgo: 60 });
              const errorRate = parseFloat(analytics.errorRate5xx);
              if (errorRate > 3.0) {
                signals.push({ service: "Edge (Cloudflare)", status: "CRITICAL", reason: `High 5xx rate: ${analytics.errorRate5xx} (${analytics.statusCodes["5xx"]} requests)` });
                totalScore -= 30;
              } else if (errorRate > 0.5) {
                signals.push({ service: "Edge (Cloudflare)", status: "WARN", reason: `Elevated 5xx rate: ${analytics.errorRate5xx}` });
                totalScore -= 10;
              } else {
                signals.push({ service: "Edge (Cloudflare)", status: "HEALTHY", reason: `Normal edge traffic (${analytics.totalRequests} req, 5xx: ${analytics.errorRate5xx})` });
              }
            } catch {}
          }

          const score = Math.max(0, totalScore);
          const overallStatus = score >= 85 ? "HEALTHY" : score >= 50 ? "DEGRADED" : "OUTAGE";

          return {
            content: [
              {
                type: "text",
                text: safeJsonStringify({
                  overallStatus,
                  healthScore: score,
                  summary: overallStatus === "HEALTHY" ? "All production signals operational." : "Degraded operational signals detected.",
                  signals,
                  latestDeployment: latestDeployInfo,
                  suggestedAction: overallStatus !== "HEALTHY" ? "Run correlate_incident(service_or_project) or explain_incident() to triage." : "System healthy. No immediate action required.",
                }),
              },
            ],
          };
        }, 30_000);
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to compute production health: ${err.message}` }],
        };
      }
    }
  );

  // Tool: Get Recent Errors (Sentry)
  server.tool(
    "get_recent_errors",
    "Fetch recent production errors from Sentry for a project or service, including frequency counts, first/last seen timestamps, and affected user counts.",
    {
      project: z.string().optional().describe("Sentry project slug (falls back to SENTRY_PROJECT env)"),
      timeframe: z.string().optional().describe("Stats period e.g. '1h', '24h', '7d' (default: '24h')"),
      query: z.string().optional().describe("Filter query e.g. 'is:unresolved', 'level:error'"),
      limit: z.number().optional().describe("Max issues to return (default: 15)"),
    },
    async ({ project, timeframe, query, limit }) => {
      try {
        const errors = await sentry.getRecentErrors({
          project,
          statsPeriod: timeframe,
          query,
          limit,
        });

        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify({ count: errors.length, errors }),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch Sentry errors: ${err.message}` }],
        };
      }
    }
  );

  // Tool: Get Recent Deployments (Vercel / GitHub)
  const deploymentsSchema = {
    project: z.string().optional().describe("Project slug or ID"),
    environment: z.enum(["production", "preview"]).optional().describe("Target environment (default: production)"),
    limit: z.number().optional().describe("Max deployments to retrieve (default: 5)"),
  };

  const handleGetDeployments = async ({ project, environment, limit }: { project?: string; environment?: "production" | "preview"; limit?: number }) => {
    try {
      if (vercel.isConfigured()) {
        const deployments = await vercel.getDeployments({
          projectId: project,
          target: environment,
          limit,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: safeJsonStringify({ provider: "vercel", count: deployments.length, deployments }),
            },
          ],
        };
      } else if (github.isConfigured()) {
        const deployments = await github.getDeployments({
          environment,
          limit,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: safeJsonStringify({ provider: "github", count: deployments.length, deployments }),
            },
          ],
        };
      } else {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "Neither Vercel nor GitHub is configured. Run 'npx production-monitoring-mcp init' or set VERCEL_TOKEN / GITHUB_TOKEN.",
            },
          ],
        };
      }
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Failed to fetch deployments: ${err.message}` }],
      };
    }
  };

  server.tool(
    "get_recent_deployments",
    "Fetch recent production deployments from Vercel (or GitHub) with deployment state, commit SHA, branch, and timestamp.",
    deploymentsSchema,
    handleGetDeployments
  );

  server.tool(
    "get_deployments",
    "Alias for get_recent_deployments.",
    deploymentsSchema,
    handleGetDeployments
  );

  // Tool: Check Uptime (Better Stack)
  server.tool(
    "check_uptime",
    "Query Better Stack Uptime monitors to check availability, status (up/down), and recent downtime incidents.",
    {},
    async () => {
      try {
        const [monitors, incidents] = await Promise.all([
          betterstack.getMonitors(),
          betterstack.getIncidents(),
        ]);
        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify({
                summary: {
                  totalMonitors: monitors.length,
                  monitorsDown: monitors.filter((m) => m.status === "down").length,
                  activeIncidents: incidents.filter((i: any) => !i.resolvedAt).length,
                },
                monitors,
                recentIncidents: incidents.slice(0, 5),
              }),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to check uptime: ${err.message}` }],
        };
      }
    }
  );
}
