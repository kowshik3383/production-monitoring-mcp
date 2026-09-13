import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { SentryProvider } from "./providers/sentry.js";
import { GitHubProvider } from "./providers/github.js";
import { VercelProvider } from "./providers/vercel.js";
import { BetterStackProvider } from "./providers/betterstack.js";
import { CloudflareProvider } from "./providers/cloudflare.js";
import { CorrelationService } from "./services/correlation.js";
import { MemoryCache } from "./utils/cache.js";
import { registerAll, ToolContext } from "./tools/index.js";

export async function startMcpServer(): Promise<void> {
  // Initialize Provider Clients
  const sentry = new SentryProvider();
  const github = new GitHubProvider();
  const vercel = new VercelProvider();
  const betterstack = new BetterStackProvider();
  const cloudflare = new CloudflareProvider();
  const correlation = new CorrelationService(sentry, github, vercel, betterstack, cloudflare);
  const cache = new MemoryCache<any>();

  const ctx: ToolContext = {
    sentry,
    github,
    vercel,
    betterstack,
    cloudflare,
    correlation,
    cache,
  };

  // Initialize MCP Server
  const server = new McpServer({
    name: "production-monitoring-mcp",
    version: "1.0.0",
  });

  // Register all modular tools, resources, and prompt templates
  registerAll(server, ctx);

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Stdio hygiene: ONLY write to stderr, never stdout!
  console.error("🛰️ Production Monitoring MCP Server running on stdio transport.");
}
