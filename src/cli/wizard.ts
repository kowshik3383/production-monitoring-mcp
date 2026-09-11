import * as p from "@clack/prompts";
import { saveStoredConfig, StoredCredentials, getConfigFilePath } from "../config/store.js";
import { SentryProvider } from "../providers/sentry.js";
import { GitHubProvider } from "../providers/github.js";
import { VercelProvider } from "../providers/vercel.js";
import { BetterStackProvider } from "../providers/betterstack.js";
import { CloudflareProvider } from "../providers/cloudflare.js";
import { autoInstallClients, getRecommendedConfigSnippet } from "./installer.js";

export async function runSetupWizard(): Promise<void> {
  console.clear();
  p.intro("🛰️  Production Monitoring MCP - Setup Wizard");

  p.note(
    "Connect your AI agent to your real production observability stack.\nCredentials are saved securely on your machine at:\n" +
      getConfigFilePath(),
    "Getting Started"
  );

  const selectedServices = (await p.multiselect({
    message: "Select the observability services you want to connect:",
    options: [
      { value: "sentry", label: "Sentry (Error tracking & stack traces)", hint: "recommended" },
      { value: "github", label: "GitHub (Commit diffs & releases)", hint: "recommended" },
      { value: "vercel", label: "Vercel (Deployments & build/runtime logs)" },
      { value: "betterstack", label: "Better Stack (Uptime monitors & logtail)" },
      { value: "cloudflare", label: "Cloudflare (Edge analytics & latency)" },
    ],
    required: true,
  })) as string[];

  if (p.isCancel(selectedServices)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const updates: Partial<StoredCredentials> = {};

  // 1. Sentry Setup
  if (selectedServices.includes("sentry")) {
    const token = await p.password({
      message: "Enter your Sentry Auth Token (scope: project:read, event:read, org:read):",
    });
    if (p.isCancel(token)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    const org = await p.text({
      message: "Enter your Sentry Organization Slug:",
      placeholder: "e.g. acme-corp",
      validate: (v) => (!v || v.trim().length === 0 ? "Organization slug is required" : undefined),
    });
    if (p.isCancel(org)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    const project = await p.text({
      message: "Enter your default Sentry Project Slug (optional):",
      placeholder: "e.g. web-app",
    });
    if (p.isCancel(project)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    updates.sentryAuthToken = token;
    updates.sentryOrg = org;
    if (project) updates.sentryProject = project;

    // Test Sentry connection
    const s = p.spinner();
    s.start("Testing Sentry API connection...");
    process.env.SENTRY_AUTH_TOKEN = token;
    process.env.SENTRY_ORG = org;
    if (project) process.env.SENTRY_PROJECT = project;

    const sentry = new SentryProvider();
    try {
      if (project) {
        await sentry.getRecentErrors({ project, limit: 1 });
      }
      s.stop("✅ Sentry API connection verified!");
    } catch (err: any) {
      s.stop(`⚠️  Saved, but validation note: ${err.message}`);
    }
  }

  // 2. GitHub Setup
  if (selectedServices.includes("github")) {
    const token = await p.password({
      message: "Enter your GitHub Personal Access Token (read-only):",
    });
    if (p.isCancel(token)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    const owner = await p.text({
      message: "Default GitHub Owner / Organization (optional):",
      placeholder: "e.g. acme-inc",
    });
    if (p.isCancel(owner)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    const repo = await p.text({
      message: "Default GitHub Repository Name (optional):",
      placeholder: "e.g. frontend",
    });
    if (p.isCancel(repo)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    updates.githubToken = token;
    if (owner) updates.githubOwner = owner;
    if (repo) updates.githubRepo = repo;

    const s = p.spinner();
    s.start("Testing GitHub token...");
    process.env.GITHUB_TOKEN = token;
    if (owner) process.env.GITHUB_OWNER = owner;
    if (repo) process.env.GITHUB_REPO = repo;

    const gh = new GitHubProvider();
    try {
      if (owner && repo) {
        await gh.getDeployments({ owner, repo, limit: 1 });
      }
      s.stop("✅ GitHub access verified!");
    } catch (err: any) {
      s.stop(`⚠️  Saved, but note: ${err.message}`);
    }
  }

  // 3. Vercel Setup
  if (selectedServices.includes("vercel")) {
    const token = await p.password({
      message: "Enter your Vercel Access Token:",
    });
    if (p.isCancel(token)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    const projectId = await p.text({
      message: "Vercel Project Name or ID (optional):",
      placeholder: "e.g. prj_xxxxxx",
    });
    if (p.isCancel(projectId)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    updates.vercelToken = token;
    if (projectId) updates.vercelProjectId = projectId;

    const s = p.spinner();
    s.start("Testing Vercel API...");
    process.env.VERCEL_TOKEN = token;
    if (projectId) process.env.VERCEL_PROJECT_ID = projectId;

    const vercel = new VercelProvider();
    try {
      await vercel.getDeployments({ limit: 1 });
      s.stop("✅ Vercel access verified!");
    } catch (err: any) {
      s.stop(`⚠️  Saved, but note: ${err.message}`);
    }
  }

  // 4. Better Stack Setup
  if (selectedServices.includes("betterstack")) {
    const uptimeToken = await p.password({
      message: "Enter your Better Stack Uptime API Token:",
    });
    if (p.isCancel(uptimeToken)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    updates.betterstackUptimeToken = uptimeToken;

    const s = p.spinner();
    s.start("Testing Better Stack Uptime API...");
    process.env.BETTERSTACK_API_TOKEN = uptimeToken;
    const bs = new BetterStackProvider();
    try {
      const monitors = await bs.getMonitors();
      s.stop(`✅ Better Stack verified! Found ${monitors.length} monitor(s).`);
    } catch (err: any) {
      s.stop(`⚠️  Saved, but note: ${err.message}`);
    }
  }

  // 5. Cloudflare Setup
  if (selectedServices.includes("cloudflare")) {
    const cfToken = await p.password({
      message: "Enter your Cloudflare API Token (scope: Analytics:Read):",
    });
    if (p.isCancel(cfToken)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    const zoneId = await p.text({
      message: "Enter Cloudflare Zone ID (optional):",
    });
    if (p.isCancel(zoneId)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    updates.cloudflareApiToken = cfToken;
    if (zoneId) updates.cloudflareZoneId = zoneId;
  }

  // Save to persistent storage
  saveStoredConfig(updates);
  p.log.success("Credentials saved to local machine store!");

  // Client Auto-Configuration
  const shouldInstall = await p.confirm({
    message: "Would you like to automatically configure Claude Desktop and local AI clients?",
    initialValue: true,
  });

  if (!p.isCancel(shouldInstall) && shouldInstall) {
    const s = p.spinner();
    s.start("Configuring AI clients...");
    const installResults = autoInstallClients();
    s.stop("Client configuration finished!");

    if (installResults.length > 0) {
      for (const res of installResults) {
        if (res.status === "installed" || res.status === "updated") {
          p.log.success(`✅ Configured ${res.client} at: ${res.configPath}`);
        } else {
          p.log.warn(`⚠️  Could not configure ${res.client}: ${res.error}`);
        }
      }
    } else {
      p.note(
        "No local Claude Desktop installation was detected automatically.\nAdd this snippet to your AI client's MCP configuration:\n\n" +
          getRecommendedConfigSnippet(),
        "Manual Client Configuration"
      );
    }
  }

  p.outro("🎉 Setup complete! Restart your AI assistant (Claude Desktop / Cursor) to start monitoring production.");
}
