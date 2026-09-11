import axios, { AxiosInstance } from "axios";
import { config } from "../config.js";
import { UnifiedError, UnifiedErrorDetails, ErrorStackFrame } from "../types/domain.js";

export class SentryProvider {
  private client: AxiosInstance | null = null;
  private org: string;
  private defaultProject?: string;

  constructor() {
    this.org = config.sentry.org || "";
    this.defaultProject = config.sentry.project;

    if (config.sentry.authToken) {
      this.client = axios.create({
        baseURL: `${config.sentry.host.replace(/\/$/, "")}/api/0`,
        headers: {
          Authorization: `Bearer ${config.sentry.authToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.client && this.org);
  }

  private ensureConfigured(): void {
    if (!this.client || !this.org) {
      throw new Error(
        "Sentry provider is not configured. Please set SENTRY_AUTH_TOKEN and SENTRY_ORG in your environment."
      );
    }
  }

  /**
   * Fetch recent errors/issues from Sentry with filtering by project, query, or timeframe.
   */
  async getRecentErrors(params?: {
    project?: string;
    query?: string;
    statsPeriod?: string; // e.g. "24h", "14d", "1h"
    limit?: number;
  }): Promise<UnifiedError[]> {
    this.ensureConfigured();
    const project = params?.project || this.defaultProject;
    if (!project) {
      throw new Error("Sentry project must be specified or set as SENTRY_PROJECT in environment.");
    }

    const queryParts: string[] = [];
    if (params?.query) {
      queryParts.push(params.query);
    } else {
      queryParts.push("is:unresolved");
    }

    const res = await this.client!.get(`/projects/${this.org}/${project}/issues/`, {
      params: {
        query: queryParts.join(" "),
        statsPeriod: params?.statsPeriod || "24h",
        limit: params?.limit || 20,
      },
    });

    return res.data.map((item: any): UnifiedError => ({
      id: item.id,
      title: item.title || item.metadata?.value || "Unknown Error",
      culprit: item.culprit,
      level: item.level || "error",
      status: item.status,
      firstSeen: item.firstSeen,
      lastSeen: item.lastSeen,
      count: parseInt(item.count, 10) || 1,
      userCount: item.userCount || 0,
      permalink: item.permalink,
      project: item.project?.slug || project,
      release: item.lastRelease?.version || item.firstRelease?.version,
    }));
  }

  /**
   * Fetch full details for a specific Sentry issue, including stack trace and breadcrumbs.
   */
  async getErrorDetails(issueId: string): Promise<UnifiedErrorDetails> {
    this.ensureConfigured();

    const [issueRes, eventRes] = await Promise.all([
      this.client!.get(`/issues/${issueId}/`),
      this.client!.get(`/issues/${issueId}/events/latest/`).catch(() => ({ data: null })),
    ]);

    const issue = issueRes.data;
    const latestEvent = eventRes.data;

    const stacktrace: ErrorStackFrame[] = [];
    let errorType = issue.metadata?.type;
    let errorValue = issue.metadata?.value;

    if (latestEvent?.entries) {
      for (const entry of latestEvent.entries) {
        if (entry.type === "exception" && entry.data?.values) {
          for (const exc of entry.data.values) {
            errorType = errorType || exc.type;
            errorValue = errorValue || exc.value;
            if (exc.stacktrace?.frames) {
              for (const f of exc.stacktrace.frames) {
                stacktrace.push({
                  filename: f.filename || f.absPath || "unknown",
                  function: f.function,
                  lineno: f.lineNo,
                  colno: f.colNo,
                  inApp: Boolean(f.inApp),
                  context: f.context?.map((c: any) => `${c[0]}: ${c[1]}`) || [],
                });
              }
            }
          }
        }
      }
    }

    const tags: Record<string, string> = {};
    if (Array.isArray(latestEvent?.tags)) {
      for (const t of latestEvent.tags) {
        tags[t.key] = t.value;
      }
    }

    const breadcrumbs = latestEvent?.entries?.find((e: any) => e.type === "breadcrumbs")?.data?.values?.map(
      (b: any) => ({
        category: b.category,
        message: b.message,
        level: b.level,
        timestamp: b.timestamp,
        data: b.data,
      })
    );

    return {
      id: issue.id,
      title: issue.title || errorValue || "Unknown Error",
      culprit: issue.culprit,
      level: issue.level || "error",
      status: issue.status,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
      count: parseInt(issue.count, 10) || 1,
      userCount: issue.userCount || 0,
      permalink: issue.permalink,
      project: issue.project?.slug,
      release: issue.lastRelease?.version || issue.firstRelease?.version,
      type: errorType,
      value: errorValue,
      stacktrace,
      tags,
      breadcrumbs,
    };
  }

  /**
   * Search for regressed errors (errors that were resolved previously or newly introduced in a release).
   */
  async findRegressions(params?: {
    project?: string;
    timeframe?: string;
    release?: string;
  }): Promise<UnifiedError[]> {
    this.ensureConfigured();
    const queryParts = ["is:unresolved"];
    if (params?.release) {
      queryParts.push(`release:${params.release}`);
    } else {
      queryParts.push("is:regressed");
    }

    try {
      const results = await this.getRecentErrors({
        project: params?.project,
        query: queryParts.join(" "),
        statsPeriod: params?.timeframe || "24h",
      });

      if (results.length > 0) return results;

      // Fallback to highest frequency errors in that timeframe if no explicit is:regressed tag
      return await this.getRecentErrors({
        project: params?.project,
        query: "is:unresolved",
        statsPeriod: params?.timeframe || "24h",
        limit: 10,
      });
    } catch (err: any) {
      throw new Error(`Failed to find regressions from Sentry: ${err.message}`);
    }
  }
}
