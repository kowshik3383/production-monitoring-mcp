import axios, { AxiosInstance } from "axios";
import { config } from "../config.js";
import { UnifiedDeployment } from "../types/domain.js";

export class CloudflareProvider {
  private client: AxiosInstance | null = null;
  private zoneId?: string;
  private accountId?: string;

  constructor() {
    this.zoneId = config.cloudflare.zoneId;
    this.accountId = config.cloudflare.accountId;

    if (config.cloudflare.apiToken) {
      this.client = axios.create({
        baseURL: "https://api.cloudflare.com/client/v4",
        headers: {
          Authorization: `Bearer ${config.cloudflare.apiToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.client);
  }

  private ensureConfigured(): void {
    if (!this.client) {
      throw new Error("Cloudflare provider is not configured. Please set CLOUDFLARE_API_TOKEN in your environment.");
    }
  }

  /**
   * Query Cloudflare GraphQL Analytics for HTTP status distribution (2xx, 4xx, 5xx) and latency.
   */
  async getHttpAnalytics(params?: {
    zoneId?: string;
    sinceMinutesAgo?: number;
  }) {
    this.ensureConfigured();
    const zoneId = params?.zoneId || this.zoneId;
    if (!zoneId) {
      throw new Error("Cloudflare zoneId is required. Provide it as a parameter or set CLOUDFLARE_ZONE_ID.");
    }

    const minutes = params?.sinceMinutesAgo || 60;
    const sinceDate = new Date(Date.now() - minutes * 60 * 1000).toISOString();

    const query = `
      query GetHttpMetrics($zoneTag: String!, $since: String!) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            httpRequests1mGroups(
              limit: 60
              filter: { datetime_geq: $since }
              orderBy: [datetime_DESC]
            ) {
              dimensions {
                datetime
              }
              sum {
                requests
                bytes
                countryMap {
                  clientCountryName
                  requests
                }
                responseStatusMap {
                  edgeResponseStatus
                  requests
                }
              }
            }
          }
        }
      }
    `;

    const res = await this.client!.post("/graphql", {
      query,
      variables: {
        zoneTag: zoneId,
        since: sinceDate,
      },
    });

    const groups = res.data?.data?.viewer?.zones?.[0]?.httpRequests1mGroups || [];

    let totalRequests = 0;
    let status2xx = 0;
    let status4xx = 0;
    let status5xx = 0;

    for (const g of groups) {
      totalRequests += g.sum?.requests || 0;
      const statusMap = g.sum?.responseStatusMap || [];
      for (const item of statusMap) {
        const code = Number(item.edgeResponseStatus);
        const count = item.requests || 0;
        if (code >= 200 && code < 300) status2xx += count;
        else if (code >= 400 && code < 500) status4xx += count;
        else if (code >= 500) status5xx += count;
      }
    }

    return {
      timeframe: `Past ${minutes} minutes`,
      totalRequests,
      statusCodes: {
        "2xx": status2xx,
        "4xx": status4xx,
        "5xx": status5xx,
      },
      errorRate5xx: totalRequests > 0 ? ((status5xx / totalRequests) * 100).toFixed(2) + "%" : "0%",
      datapoints: groups.length,
    };
  }

  /**
   * Get Cloudflare Pages deployments.
   */
  async getPagesDeployments(projectName: string, limit: number = 5): Promise<UnifiedDeployment[]> {
    this.ensureConfigured();
    if (!this.accountId) {
      throw new Error("Cloudflare accountId is required. Set CLOUDFLARE_ACCOUNT_ID in your environment.");
    }

    const res = await this.client!.get(
      `/accounts/${this.accountId}/pages/projects/${projectName}/deployments`
    );

    const deployments = (res.data?.result || []).slice(0, limit);

    return deployments.map((d: any): UnifiedDeployment => ({
      id: d.id,
      name: projectName,
      url: d.url,
      state: d.latest_stage?.status === "success" ? "READY" : "ERROR",
      environment: d.environment || "production",
      createdAt: d.created_on,
      commitSha: d.deployment_trigger?.metadata?.commit_hash,
      commitMessage: d.deployment_trigger?.metadata?.commit_message,
      branch: d.deployment_trigger?.metadata?.branch,
      provider: "cloudflare",
    }));
  }
}
