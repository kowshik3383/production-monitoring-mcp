import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolContext } from "./context.js";
import { registerDiscoveryTools } from "./discovery.js";
import { registerInvestigationTools } from "./investigation.js";
import { registerIntelligenceTools } from "./intelligence.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

export function registerAll(server: McpServer, ctx: ToolContext): void {
  registerDiscoveryTools(server, ctx);
  registerInvestigationTools(server, ctx);
  registerIntelligenceTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server, ctx);
}

export * from "./context.js";
