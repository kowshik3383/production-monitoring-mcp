import Conf from "conf";

export interface StoredCredentials {
  sentryAuthToken?: string;
  sentryOrg?: string;
  sentryProject?: string;
  sentryHost?: string;
  githubToken?: string;
  githubOwner?: string;
  githubRepo?: string;
  vercelToken?: string;
  vercelTeamId?: string;
  vercelProjectId?: string;
  betterstackUptimeToken?: string;
  betterstackLogsToken?: string;
  cloudflareApiToken?: string;
  cloudflareZoneId?: string;
  cloudflareAccountId?: string;
}

export const credentialStore = new Conf<StoredCredentials>({
  projectName: "production-monitoring-mcp",
  defaults: {},
});

export function getStoredConfig(): StoredCredentials {
  return credentialStore.store;
}

export function saveStoredConfig(values: Partial<StoredCredentials>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") {
      credentialStore.set(key as keyof StoredCredentials, value);
    }
  }
}

export function clearStoredConfig(): void {
  credentialStore.clear();
}

export function getConfigFilePath(): string {
  return credentialStore.path;
}
