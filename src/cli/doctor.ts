import { config, getProviderStatus } from "../config.js";
import { getConfigFilePath } from "../config/store.js";
import { SentryProvider } from "../providers/sentry.js";
import { GitHubProvider } from "../providers/github.js";
import { VercelProvider } from "../providers/vercel.js";
import { BetterStackProvider } from "../providers/betterstack.js";
import { CloudflareProvider } from "../providers/cloudflare.js";

export async function runDoctor(): Promise<void> {
  console.log("=================================================");
  console.log(" 🛰️  Production Monitoring MCP - Doctor Check");
  console.log("=================================================");
  console.log(` Config Store: ${getConfigFilePath()}\n`);

  const status = getProviderStatus();

  // 1. Sentry
  if (status.sentry.configured) {
    const sentry = new SentryProvider();
    try {
      const errors = await sentry.getRecentErrors({ limit: 1 });
      console.log(`✅ Sentry: CONNECTED`);
      console.log(`   Org: ${config.sentry.org} | Retrieved live error metrics.`);
    } catch (err: any) {
      console.log(`❌ Sentry: FAILED - ${err.message}`);
    }
  } else {
    console.log(`⚪ Sentry: SKIPPED (Missing: ${status.sentry.missing.join(", ")})`);
  }

  // 2. GitHub
  if (status.github.configured) {
    const gh = new GitHubProvider();
    try {
      if (config.github.owner && config.github.repo) {
        await gh.getDeployments({ limit: 1 });
        console.log(`✅ GitHub: CONNECTED`);
        console.log(`   Repo: ${config.github.owner}/${config.github.repo}`);
      } else {
        console.log(`✅ GitHub: TOKEN DETECTED (Set GITHUB_OWNER & GITHUB_REPO to enable repo tools)`);
      }
    } catch (err: any) {
      console.log(`❌ GitHub: FAILED - ${err.message}`);
    }
  } else {
    console.log(`⚪ GitHub: SKIPPED (Missing: GITHUB_TOKEN)`);
  }

  // 3. Vercel
  if (status.vercel.configured) {
    const vercel = new VercelProvider();
    try {
      const deploys = await vercel.getDeployments({ limit: 1 });
      console.log(`✅ Vercel: CONNECTED`);
      console.log(`   Found ${deploys.length} recent deployment(s).`);
    } catch (err: any) {
      console.log(`❌ Vercel: FAILED - ${err.message}`);
    }
  } else {
    console.log(`⚪ Vercel: SKIPPED (Missing: VERCEL_TOKEN)`);
  }

  // 4. Better Stack
  if (status.betterstack.configured) {
    const bs = new BetterStackProvider();
    try {
      const monitors = await bs.getMonitors();
      console.log(`✅ Better Stack: CONNECTED`);
      console.log(`   Found ${monitors.length} active uptime monitor(s).`);
    } catch (err: any) {
      console.log(`❌ Better Stack: FAILED - ${err.message}`);
    }
  } else {
    console.log(`⚪ Better Stack: SKIPPED (Missing: BETTERSTACK_API_TOKEN)`);
  }

  // 5. Cloudflare
  if (status.cloudflare.configured) {
    const cf = new CloudflareProvider();
    try {
      if (config.cloudflare.zoneId) {
        const analytics = await cf.getHttpAnalytics({ sinceMinutesAgo: 10 });
        console.log(`✅ Cloudflare: CONNECTED`);
        console.log(`   Requests (10m): ${analytics.totalRequests}`);
      } else {
        console.log(`✅ Cloudflare: TOKEN DETECTED (Set CLOUDFLARE_ZONE_ID to test analytics)`);
      }
    } catch (err: any) {
      console.log(`❌ Cloudflare: FAILED - ${err.message}`);
    }
  } else {
    console.log(`⚪ Cloudflare: SKIPPED (Missing: CLOUDFLARE_API_TOKEN)`);
  }

  console.log("\n=================================================");
  console.log(" Run 'npx production-monitoring-mcp init' to configure missing services.");
  console.log("=================================================");
}
