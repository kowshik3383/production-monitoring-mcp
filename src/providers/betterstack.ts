import axios, { AxiosInstance } from "axios";
import { config } from "../config.js";
import { UnifiedMonitor, UnifiedLogEntry } from "../types/domain.js";

export class BetterStackProvider {
  private uptimeClient: AxiosInstance | null = null;
  private logsClient: AxiosInstance | null = null;

  constructor() {
    if (config.betterstack.uptimeToken) {
      this.uptimeClient = axios.create({
        baseURL: "https://uptime.betterstack.com/api/v2",
        headers: {
          Authorization: `Bearer ${config.betterstack.uptimeToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });
    }

    if (config.betterstack.logsToken) {
      this.logsClient = axios.create({
        baseURL: "https://logs.betterstack.com/api/v1",
        headers: {
          Authorization: `Bearer ${config.betterstack.logsToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.uptimeClient || this.logsClient);
  }

  private ensureUptimeConfigured(): void {
    if (!this.uptimeClient) {
      throw new Error(
        "Better Stack Uptime is not configured. Please set BETTERSTACK_API_TOKEN in your environment."
      );
    }
  }

  /**
   * Get all monitors and their current uptime status.
   */
  async getMonitors(): Promise<UnifiedMonitor[]> {
    this.ensureUptimeConfigured();

    const res = await this.uptimeClient!.get("/monitors");
    const data = res.data?.data || [];

    return data.map((item: any): UnifiedMonitor => {
      const attr = item.attributes || {};
      return {
        id: item.id,
        name: attr.pronounceable_name || attr.url || "Monitor",
        url: attr.url,
        status: attr.status, // "up", "down", "validating", "paused"
        lastCheckAt: attr.last_checked_at,
        availabilityPercent: attr.availability,
      };
    });
  }

  /**
   * Get downtime incidents.
   */
  async getIncidents(params?: { from?: string; to?: string }) {
    this.ensureUptimeConfigured();

    const queryParams: Record<string, any> = {};
    if (params?.from) queryParams.from = params.from;
    if (params?.to) queryParams.to = params.to;

    const res = await this.uptimeClient!.get("/incidents", { params: queryParams });
    const data = res.data?.data || [];

    return data.map((item: any) => {
      const attr = item.attributes || {};
      return {
        id: item.id,
        name: attr.name,
        cause: attr.cause,
        startedAt: attr.started_at,
        resolvedAt: attr.resolved_at,
        responseContent: attr.response_content,
        responseCode: attr.response_code,
        monitorId: item.relationships?.monitor?.data?.id,
      };
    });
  }

  /**
   * Query logs from Better Stack Logs.
   */
  async queryLogs(params: {
    query?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<UnifiedLogEntry[]> {
    if (!this.logsClient) {
      throw new Error(
        "Better Stack Logs is not configured. Please set BETTERSTACK_LOGS_TOKEN in your environment."
      );
    }

    // Better Stack Logs query endpoint
    const res = await this.logsClient.post("/query", {
      query: params.query || "*",
      from: params.from,
      to: params.to,
      limit: params.limit || 50,
    });

    const rows = res.data?.data || res.data || [];
    if (!Array.isArray(rows)) return [];

    return rows.map((r: any): UnifiedLogEntry => ({
      id: r.id || String(Math.random()),
      timestamp: r.dt || r.timestamp || new Date().toISOString(),
      level: (r.level || "info").toLowerCase(),
      message: r.message || JSON.stringify(r),
      service: r.source_name || r.service,
      attributes: r,
    }));
  }
}
