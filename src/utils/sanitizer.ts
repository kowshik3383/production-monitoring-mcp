/**
 * Security utility for scrubbing secrets, authorization tokens, and credentials
 * from logs, stacktraces, and error reports before sending them to the LLM agent.
 */

const SECRET_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // Bearer tokens & Authorization headers
  {
    regex: /bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi,
    replacement: "Bearer [REDACTED_TOKEN]",
  },
  // GitHub Tokens (Personal Access Token, OAuth, App)
  {
    regex: /gh[pousr]_[a-zA-Z0-9_]{20,255}/g,
    replacement: "ghp_[REDACTED_GITHUB_TOKEN]",
  },
  // Sentry Auth Tokens
  {
    regex: /sntrys_[a-zA-Z0-9_]{20,}/g,
    replacement: "sntrys_[REDACTED_SENTRY_TOKEN]",
  },
  // AWS Access Key IDs
  {
    regex: /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: "$1[REDACTED_AWS_KEY]",
  },
  // JSON Web Tokens (JWT)
  {
    regex: /eyJ[A-Za-z0-9-_=]{15,}\.[A-Za-z0-9-_=]{15,}\.[A-Za-z0-9-_.+/=]*/g,
    replacement: "[REDACTED_JWT_TOKEN]",
  },
  // Password / Secret in URIs: postgresql://user:password@host:5432/db
  {
    regex: /((?:postgres|mysql|redis|mongodb):\/\/[^:\s]+:)[^@\s]+(@)/gi,
    replacement: "$1[REDACTED_PASSWORD]$2",
  },
  // Key-value pairs in logs (password=..., apiKey=..., token=...)
  {
    regex: /(["']?(?:password|passwd|secret|api_key|apikey|auth_token|access_token|private_key)["']?\s*[:=]\s*["'])([^"'\s]{6,})(["'])/gi,
    replacement: "$1[REDACTED]$3",
  },
];

/**
 * Recursively sanitize strings, objects, and arrays to ensure no credentials leak into LLM prompts.
 */
export function sanitize<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    let sanitized: string = data;
    for (const { regex, replacement } of SECRET_PATTERNS) {
      sanitized = sanitized.replace(regex, replacement);
    }
    return sanitized as any;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitize(item)) as any;
  }

  if (typeof data === "object") {
    const sanitizedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      // Mask fields explicitly named after sensitive keywords
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("token") ||
        lowerKey.includes("auth") ||
        lowerKey.includes("apikey")
      ) {
        if (typeof value === "string" && value.length > 0) {
          sanitizedObj[key] = "[REDACTED_SECRET]";
          continue;
        }
      }
      sanitizedObj[key] = sanitize(value);
    }
    return sanitizedObj as any;
  }

  return data;
}

/**
 * Format any object as sanitized JSON text for safe MCP content transmission.
 */
export function safeJsonStringify(data: any): string {
  return JSON.stringify(sanitize(data), null, 2);
}
