import { ErrorStackFrame, NormalizedStackFrame } from "../../types/domain.js";

export function normalizeFilePath(rawPath: string, preserveCase = false): string {
  if (!rawPath || typeof rawPath !== "string") {
    return "";
  }

  let p = rawPath.trim();

  // Strip query parameters and hashes (e.g. file.ts?v=123#L40)
  p = p.split("?")[0].split("#")[0];

  // Convert Windows backslashes to forward slashes
  p = p.replace(/\\/g, "/");

  // Remove common bundler schemes
  p = p.replace(/^webpack:\/\/[^/]*\/?/, "");
  p = p.replace(/^webpack:\/\/\/?/, "");
  p = p.replace(/^file:\/\/\/?/, "");

  // Strip container / serverless prefixes
  p = p.replace(/^\/var\/task\//, "");
  p = p.replace(/^\/app\//, "");
  p = p.replace(/^\/usr\/src\/app\//, "");
  p = p.replace(/^\/workspace\//, "");

  // Strip Next.js / bundler chunk prefixes
  p = p.replace(/^_next\/static\/chunks\//, "");
  p = p.replace(/^\.next\/server\//, "");
  p = p.replace(/^dist\//, "");

  // Remove leading './' or '/'
  p = p.replace(/^(\.\/|\/)+/, "");

  return preserveCase ? p : p.toLowerCase();
}

/**
 * Normalizes a raw Sentry/runtime error stack frame into a canonical NormalizedStackFrame.
 */
export function normalizeStackFrame(frame: ErrorStackFrame): NormalizedStackFrame {
  const normalizedPath = normalizeFilePath(frame.filename, false);

  // Clean function names from bundler artifacts
  let functionName = frame.function?.trim();
  if (functionName) {
    functionName = functionName
      .replace(/^async\s+/, "")
      .replace(/^Object\./, "")
      .replace(/\s*\[as\s+[^\]]+\]$/, "")
      .replace(/__WEBPACK_DEFAULT_EXPORT__/, "default");
  }

  return {
    normalizedPath,
    functionName,
    lineno: frame.lineno,
    colno: frame.colno,
    inApp: frame.inApp ?? true,
    contextCode: frame.context,
  };
}

/**
 * Checks whether two file paths refer to the same repository file,
 * accounting for base names, leading directory structures, and extensions (.js vs .ts).
 */
export function arePathsEquivalent(pathA: string, pathB: string): boolean {
  const normA = normalizeFilePath(pathA, false);
  const normB = normalizeFilePath(pathB, false);

  if (!normA || !normB) return false;

  // Exact normalized match
  if (normA === normB) return true;

  // Match without extension (e.g. .js vs .ts / .tsx)
  const stripExt = (path: string) => path.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
  const baseA = stripExt(normA);
  const baseB = stripExt(normB);

  if (baseA === baseB) return true;

  // Match suffix (one path might be src/services/checkout.ts and the other services/checkout.ts)
  if (normA.endsWith("/" + normB) || normB.endsWith("/" + normA)) {
    return true;
  }

  // If one ends with the other's base name without extension
  if (baseA.endsWith("/" + baseB) || baseB.endsWith("/" + baseA)) {
    return true;
  }

  return false;
}

/**
 * Resolves a stack frame file path against a set of monorepo file paths
 * (e.g. apps/web/src/services/checkout.ts matching src/services/checkout.ts).
 */
export function resolveMonorepoPath(
  framePath: string,
  candidateRepoPaths: string[]
): string | undefined {
  const normFrame = normalizeFilePath(framePath, false);
  if (!normFrame) return undefined;

  // 1. Exact match
  for (const p of candidateRepoPaths) {
    if (normalizeFilePath(p, false) === normFrame) {
      return p;
    }
  }

  // 2. Suffix / subpath equivalence match
  for (const p of candidateRepoPaths) {
    if (arePathsEquivalent(normFrame, p)) {
      return p;
    }
  }

  // 3. Monorepo pattern match (apps/<app>/<path> or packages/<pkg>/<path>)
  for (const p of candidateRepoPaths) {
    const strippedRepoPath = normalizeFilePath(p, false).replace(
      /^(apps|packages|services|libs|projects)\/[^/]+\//,
      ""
    );
    if (arePathsEquivalent(normFrame, strippedRepoPath)) {
      return p;
    }
  }

  return undefined;
}

