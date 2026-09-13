export interface UnifiedError {
  id: string;
  title: string;
  culprit?: string;
  level: string;
  status: "unresolved" | "resolved" | "ignored" | string;
  firstSeen: string;
  lastSeen: string;
  count: number;
  userCount: number;
  permalink?: string;
  project?: string;
  release?: string;
}

export interface ErrorStackFrame {
  filename: string;
  function?: string;
  lineno?: number;
  colno?: number;
  inApp: boolean;
  context?: string[];
}

export interface NormalizedStackFrame {
  normalizedPath: string; // e.g. "src/services/checkout.ts"
  functionName?: string;
  lineno?: number;
  colno?: number;
  inApp: boolean;
  contextCode?: string[];
}

export interface IncidentContext {
  environment: "production" | "staging" | "preview";
  project: string;
  service?: string;
  timeframe: {
    from: string;
    to: string;
  };
}

export interface UnifiedErrorDetails extends UnifiedError {
  type?: string;
  value?: string;
  stacktrace: ErrorStackFrame[];
  tags: Record<string, string>;
  breadcrumbs?: Array<{
    category?: string;
    message?: string;
    level?: string;
    timestamp?: string;
    data?: Record<string, any>;
  }>;
}

export interface UnifiedDeployment {
  id: string;
  name: string;
  url?: string;
  state: "READY" | "BUILDING" | "ERROR" | "CANCELED" | "INITIALIZING" | string;
  environment: "production" | "preview" | "staging" | string;
  creator?: string;
  createdAt: string;
  readyAt?: string;
  commitSha?: string;
  commitMessage?: string;
  branch?: string;
  provider: "vercel" | "cloudflare" | "github" | string;
}

export interface ChangedFile {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed" | string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface DeploymentDiff {
  baseSha: string;
  headSha: string;
  totalCommits: number;
  commits: Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
  }>;
  files: ChangedFile[];
}

export interface UnifiedMonitor {
  id: string;
  name: string;
  url?: string;
  status: "up" | "down" | "degraded" | "paused" | string;
  lastCheckAt?: string;
  responseTimeMs?: number;
  availabilityPercent?: number;
}

export interface UnifiedLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug" | string;
  message: string;
  service?: string;
  attributes?: Record<string, any>;
}

export interface IncidentCorrelationReport {
  timestamp: string;
  serviceOrProject: string;
  targetDeployment?: UnifiedDeployment;
  previousDeployment?: UnifiedDeployment;
  codeChanges?: DeploymentDiff;
  suspectErrors: UnifiedError[];
  matchingFilesBetweenDiffAndStackTrace: string[];
  summary: string;
  likelyRootCause?: string;
  recommendedAction?: string;
}
