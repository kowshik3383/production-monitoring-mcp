import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { config, getProviderStatus } from "./config.js";
import { SentryProvider } from "./providers/sentry.js";
import { GitHubProvider } from "./providers/github.js";
import { VercelProvider } from "./providers/vercel.js";
import { BetterStackProvider } from "./providers/betterstack.js";
import { CloudflareProvider } from "./providers/cloudflare.js";
import { CorrelationService } from "./services/correlation.js";
import { safeJsonStringify } from "./utils/sanitizer.js";

export async function startMcpServer(): Promise<void> {
  // Initialize Provider Clients
  const sentry = new SentryProvider();
  const github = new GitHubProvider();
  const vercel = new VercelProvider();
  const betterstack = new BetterStackProvider();
  const cloudflare = new CloudflareProvider();
  const correlation = new CorrelationService(sentry, github, vercel, betterstack);

  // Initialize MCP Server
  const server = new McpServer({
    name: "production-monitoring-mcp",
    version: "1.0.0",
  });

  // Tool: Check Observability Status & Configuration
  server.tool(
    "get_observability_status",
    "Inspect the status of connected production monitoring providers (Sentry, GitHub, Vercel, Better Stack, Cloudflare) and list any missing credentials.",
    {},
    async () => {
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

  // Tool: Get Error Details (Sentry)
  server.tool(
    "get_error_details",
    "Fetch deep technical details for a specific Sentry issue including parsed in-app stack trace frames, code context, tags, and breadcrumbs.",
    {
      issue_id: z.string().describe("Sentry issue ID"),
    },
    async ({ issue_id }) => {
      try {
        const details = await sentry.getErrorDetails(issue_id);
        return {
          content: [
            {
              type: "text",
              text: safeJsonStringify(details),
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

  // Tool: Find Regressions (Sentry)
  server.tool(
    "find_regression",
    "Find errors in Sentry that have regressed or were first introduced in a specific release or timeframe.",
    {
      project: z.string().optional().describe("Sentry project slug"),
      timeframe: z.string().optional().describe("Time window e.g. '24h', '7d'"),
      release: z.string().optional().describe("Release tag/version"),
    },
    async ({ project, timeframe, release }) => {
      try {
        const regressions = await sentry.findRegressions({ project, timeframe, release });
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

  // Tool: Get Deployments (Vercel / GitHub)
  server.tool(
    "get_deployments",
    "Fetch recent deployments from Vercel (or GitHub) with deployment state, commit SHA, branch, and timestamp.",
    {
      project: z.string().optional().describe("Project slug or ID"),
      environment: z.enum(["production", "preview"]).optional().describe("Target environment (default: production)"),
      limit: z.number().optional().describe("Max deployments to retrieve (default: 5)"),
    },
    async ({ project, environment, limit }) => {
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
                type: "text",
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
                type: "text",
                text: safeJsonStringify({ provider: "github", count: deployments.length, deployments }),
              },
            ],
          };
        } else {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Neither Vercel nor GitHub is configured. Run 'npx production-monitoring-mcp init' or set VERCEL_TOKEN / GITHUB_TOKEN.",
              },
            ],
          };
        }
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch deployments: ${err.message}` }],
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

  // Tool: Compare Deployments (GitHub)
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
        const diff = await github.compareDeployments({
          base: base_sha,
          head: head_sha,
          owner,
          repo,
        });
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

  // Tool: Analyze API Latency & HTTP Status Codes (Cloudflare)
  server.tool(
    "analyze_api_latency",
    "Analyze edge HTTP traffic, status codes (2xx, 4xx, 5xx), and error rates from Cloudflare Analytics.",
    {
      zone_id: z.string().optional().describe("Cloudflare Zone ID (falls back to CLOUDFLARE_ZONE_ID)"),
      timeframe_minutes: z.number().optional().describe("Window in minutes (default: 60)"),
    },
    async ({ zone_id, timeframe_minutes }) => {
      try {
        const analytics = await cloudflare.getHttpAnalytics({
          zoneId: zone_id,
          sinceMinutesAgo: timeframe_minutes,
        });
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

  // Tool: Correlate Incident (Multi-System Triage)
  server.tool(
    "correlate_incident",
    "Run automated triage correlating deployment timestamps, git diffs, and Sentry stacktraces to find the root cause.",
    {
      service_or_project: z.string().describe("Project name / Sentry project / Vercel project"),
      owner: z.string().optional().describe("GitHub owner or organization"),
      repo: z.string().optional().describe("GitHub repo name"),
      deployment_id: z.string().optional().describe("Specific deployment ID to triage"),
      timeframe: z.string().optional().describe("Timeframe to evaluate e.g. '24h', '2d'"),
    },
    async ({ service_or_project, owner, repo, deployment_id, timeframe }) => {
      try {
        const report = await correlation.correlateIncident({
          serviceOrProject: service_or_project,
          owner,
          repo,
          deploymentId: deployment_id,
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
      timeframe: z.string().optional().describe("Timeframe to evaluate e.g. '24h', '2d'"),
    },
    async ({ service_or_project, owner, repo, deployment_id, timeframe }) => {
      try {
        const report = await correlation.correlateIncident({
          serviceOrProject: service_or_project,
          owner,
          repo,
          deploymentId: deployment_id,
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

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Stdio hygiene: ONLY write to stderr, never stdout!
  console.error("🛰️ Production Monitoring MCP Server running on stdio transport.");
}
