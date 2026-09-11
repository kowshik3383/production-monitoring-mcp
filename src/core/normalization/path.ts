/**
 * Path & Stack-Frame Normalizer
 * Normalizes disparate file paths from Sentry, Webpack, Docker containers,
 * Vercel Lambda functions, and GitHub repository diffs into canonical relative repo paths.
 */

export function normalizeFilePath(rawPath: string): string {
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

  // Remove leading './' or '/'
  p = p.replace(/^(\.\/|\/)+/, "");

  return p.toLowerCase();
}

/**
 * Checks whether two file paths refer to the same repository file,
 * accounting for base names, leading directory structures, and extensions (.js vs .ts).
 */
export function arePathsEquivalent(pathA: string, pathB: string): boolean {
  const normA = normalizeFilePath(pathA);
  const normB = normalizeFilePath(pathB);

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
