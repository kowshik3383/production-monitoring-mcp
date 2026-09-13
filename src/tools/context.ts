import { SentryProvider } from "../providers/sentry.js";
import { GitHubProvider } from "../providers/github.js";
import { VercelProvider } from "../providers/vercel.js";
import { BetterStackProvider } from "../providers/betterstack.js";
import { CloudflareProvider } from "../providers/cloudflare.js";
import { CorrelationService } from "../services/correlation.js";
import { MemoryCache } from "../utils/cache.js";

export interface ToolContext {
 sentry: SentryProvider;
 github: GitHubProvider;
 vercel: VercelProvider;
 betterstack: BetterStackProvider;
 cloudflare: CloudflareProvider;
 correlation: CorrelationService;
 cache: MemoryCache<any>;
}
