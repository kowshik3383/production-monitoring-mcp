import axios, { AxiosInstance } from "axios";
import { config } from "../config.js";
import { UnifiedDeployment } from "../types/domain.js";

export class VercelProvider {
  private client: AxiosInstance | null = null;
  private teamId?: string;
  private defaultProjectId?: string;

  constructor() {
    this.teamId = config.vercel.teamId;
    this.defaultProjectId = config.vercel.projectId;

    if (config.vercel.token) {
      this.client = axios.create({
        baseURL: "https://api.vercel.com",
        headers: {
          Authorization: `Bearer ${config.vercel.token}`,
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
      throw new Error("Vercel provider is not configured. Please set VERCEL_TOKEN in your environment.");
    }
  }

  /**
   * List deployments for a project or team.
   */
  async getDeployments(params?: {
    projectId?: string;
    target?: "production" | "preview";
    limit?: number;
    state?: string;
  }): Promise<UnifiedDeployment[]> {
    this.ensureConfigured();
    const projectId = params?.projectId || this.defaultProjectId;

    const queryParams: Record<string, any> = {
      limit: params?.limit || 10,
    };
    if (projectId) queryParams.projectId = projectId;
    if (this.teamId) queryParams.teamId = this.teamId;
    if (params?.target) queryParams.target = params.target;
    if (params?.state) queryParams.state = params.state;

    const res = await this.client!.get("/v6/deployments", { params: queryParams });

    return (res.data.deployments || []).map((d: any): UnifiedDeployment => {
      const meta = d.meta || {};
      const commitSha = meta.githubCommitSha || meta.gitlabCommitSha || meta.bitbucketCommitSha;
      const commitMessage = meta.githubCommitMessage || meta.gitlabCommitMessage;
      const branch = meta.githubCommitRef || meta.gitlabCommitRef;

      return {
        id: d.uid,
        name: d.name,
        url: d.url ? `https://${d.url}` : undefined,
        state: d.state || d.readyState || "UNKNOWN",
        environment: d.target || "preview",
        creator: d.creator?.username || d.creator?.email,
        createdAt: new Date(d.created).toISOString(),
        readyAt: d.ready ? new Date(d.ready).toISOString() : undefined,
        commitSha,
        commitMessage,
        branch,
        provider: "vercel",
      };
    });
  }

  /**
   * Fetch specific deployment details.
   */
  async getDeploymentDetails(idOrUrl: string) {
    this.ensureConfigured();
    const queryParams: Record<string, any> = {};
    if (this.teamId) queryParams.teamId = this.teamId;

    const res = await this.client!.get(`/v13/deployments/${encodeURIComponent(idOrUrl)}`, {
      params: queryParams,
    });

    return res.data;
  }

  /**
   * Get build and runtime logs for a deployment.
   */
  async getDeploymentLogs(deploymentId: string, limit: number = 100) {
    this.ensureConfigured();
    const queryParams: Record<string, any> = {
      limit,
    };
    if (this.teamId) queryParams.teamId = this.teamId;

    const res = await this.client!.get(`/v2/deployments/${deploymentId}/events`, {
      params: queryParams,
    });

    return (res.data || []).map((ev: any) => ({
      id: ev.id,
      timestamp: new Date(ev.created).toISOString(),
      type: ev.type,
      text: ev.text || ev.payload?.text,
      step: ev.payload?.step,
    }));
  }
}
