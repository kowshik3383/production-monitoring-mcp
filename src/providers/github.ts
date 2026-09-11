import { Octokit } from "@octokit/rest";
import { config } from "../config.js";
import { DeploymentDiff, ChangedFile } from "../types/domain.js";

export class GitHubProvider {
  private octokit: Octokit | null = null;
  private defaultOwner?: string;
  private defaultRepo?: string;

  constructor() {
    this.defaultOwner = config.github.owner;
    this.defaultRepo = config.github.repo;

    if (config.github.token) {
      this.octokit = new Octokit({
        auth: config.github.token,
      });
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.octokit);
  }

  private ensureConfigured(): void {
    if (!this.octokit) {
      throw new Error("GitHub provider is not configured. Please set GITHUB_TOKEN in your environment.");
    }
  }

  /**
   * Compare two git references (branches, tags, or commit SHAs) to identify all changes deployed between them.
   */
  async compareDeployments(params: {
    base: string;
    head: string;
    owner?: string;
    repo?: string;
  }): Promise<DeploymentDiff> {
    this.ensureConfigured();
    const owner = params.owner || this.defaultOwner;
    const repo = params.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error("GitHub owner and repo must be provided or set in environment variables.");
    }

    const res = await this.octokit!.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${params.base}...${params.head}`,
    });

    const commits = res.data.commits.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author?.name || c.author?.login || "Unknown",
      date: c.commit.author?.date || "",
    }));

    const files: ChangedFile[] = (res.data.files || []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch ? (f.patch.length > 500 ? f.patch.slice(0, 500) + "\n... [truncated]" : f.patch) : undefined,
    }));

    return {
      baseSha: params.base,
      headSha: params.head,
      totalCommits: res.data.total_commits,
      commits,
      files,
    };
  }

  /**
   * Get single commit details, author, message, and files modified.
   */
  async getCommitDetails(params: {
    ref: string;
    owner?: string;
    repo?: string;
  }) {
    this.ensureConfigured();
    const owner = params.owner || this.defaultOwner;
    const repo = params.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error("GitHub owner and repo must be provided or set in environment variables.");
    }

    const res = await this.octokit!.repos.getCommit({
      owner,
      repo,
      ref: params.ref,
    });

    return {
      sha: res.data.sha,
      message: res.data.commit.message,
      author: res.data.commit.author?.name || res.data.author?.login,
      date: res.data.commit.author?.date,
      stats: res.data.stats,
      files: res.data.files?.map((f) => ({
        filename: f.filename,
        status: f.status,
        changes: f.changes,
        patch: f.patch?.slice(0, 1000),
      })),
    };
  }

  /**
   * List recent GitHub Deployments.
   */
  async getDeployments(params?: {
    environment?: string;
    owner?: string;
    repo?: string;
    limit?: number;
  }) {
    this.ensureConfigured();
    const owner = params?.owner || this.defaultOwner;
    const repo = params?.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error("GitHub owner and repo must be provided or set in environment variables.");
    }

    const res = await this.octokit!.repos.listDeployments({
      owner,
      repo,
      environment: params?.environment,
      per_page: params?.limit || 10,
    });

    return res.data.map((d) => ({
      id: String(d.id),
      sha: d.sha,
      ref: d.ref,
      task: d.task,
      environment: d.environment,
      description: d.description,
      creator: d.creator?.login,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
  }
}
