import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  sentry: {
    authToken?: string;
    org?: string;
    project?: string;
    host: string;
  };
  github: {
    token?: string;
    owner?: string;
    repo?: string;
  };
  vercel: {
    token?: string;
    teamId?: string;
    projectId?: string;
  };
  betterstack: {
    uptimeToken?: string;
    logsToken?: string;
  };
  cloudflare: {
    apiToken?: string;
    zoneId?: string;
    accountId?: string;
  };
}

export const config: AppConfig = {
  sentry: {
    authToken: process.env.SENTRY_AUTH_TOKEN,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    host: process.env.SENTRY_HOST || "https://sentry.io",
  },
  github: {
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
  },
  vercel: {
    token: process.env.VERCEL_TOKEN,
    teamId: process.env.VERCEL_TEAM_ID,
    projectId: process.env.VERCEL_PROJECT_ID,
  },
  betterstack: {
    uptimeToken: process.env.BETTERSTACK_API_TOKEN || process.env.BETTER_STACK_API_TOKEN,
    logsToken: process.env.BETTERSTACK_LOGS_TOKEN || process.env.LOGTAIL_SOURCE_TOKEN,
  },
  cloudflare: {
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  },
};

export function getProviderStatus() {
  return {
    sentry: {
      configured: Boolean(config.sentry.authToken && config.sentry.org),
      missing: [
        !config.sentry.authToken && "SENTRY_AUTH_TOKEN",
        !config.sentry.org && "SENTRY_ORG",
      ].filter(Boolean) as string[],
    },
    github: {
      configured: Boolean(config.github.token),
      missing: [!config.github.token && "GITHUB_TOKEN"].filter(Boolean) as string[],
    },
    vercel: {
      configured: Boolean(config.vercel.token),
      missing: [!config.vercel.token && "VERCEL_TOKEN"].filter(Boolean) as string[],
    },
    betterstack: {
      configured: Boolean(config.betterstack.uptimeToken),
      missing: [!config.betterstack.uptimeToken && "BETTERSTACK_API_TOKEN"].filter(Boolean) as string[],
    },
    cloudflare: {
      configured: Boolean(config.cloudflare.apiToken),
      missing: [!config.cloudflare.apiToken && "CLOUDFLARE_API_TOKEN"].filter(Boolean) as string[],
    },
  };
}
