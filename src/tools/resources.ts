import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolContext } from "./context.js";
import { getProviderStatus } from "../config.js";
import { safeJsonStringify } from "../utils/sanitizer.js";

export function registerResources(server: McpServer, ctx: ToolContext): void {
  const { sentry, betterstack, vercel, cloudflare, cache } = ctx;

  // Resource: observability://status (Connection status of all providers)
  server.resource(
    "observability_status",
    "observability://status",
    async (uri) => {
      const status = getProviderStatus();
      return {
        contents: [
          {
            uri: uri.href,
            text: safeJsonStringify({
              resource: "observability://status",
              timestamp: new Date().toISOString(),
              providers: status,
            }),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // Resource: observability://pulse (Live system operational health badge)
  server.resource(
    "observability_pulse",
    "observability://pulse",
    async (uri) => {
      const pulseData = await cache.getOrFetch("resource_pulse", async () => {
        let uptimeOk = true;
        let downCount = 0;
        if (betterstack.isConfigured()) {
          try {
            const monitors = await betterstack.getMonitors();
            downCount = monitors.filter((m) => m.status === "down").length;
            if (downCount > 0) uptimeOk = false;
          } catch {}
        }

        let sentryErrors = 0;
        if (sentry.isConfigured()) {
          try {
            const errors = await sentry.getRecentErrors({ statsPeriod: "1h", limit: 5 });
            sentryErrors = errors.reduce((acc, e) => acc + e.count, 0);
          } catch {}
        }

        return {
          operational: uptimeOk && sentryErrors < 20,
          timestamp: new Date().toISOString(),
          uptime: { monitorsDown: downCount },
          errorsLastHour: sentryErrors,
        };
      }, 30_000);

      return {
        contents: [
          {
            uri: uri.href,
            text: safeJsonStringify(pulseData),
            mimeType: "application/json",
          },
        ],
      };
    }
  );
}
