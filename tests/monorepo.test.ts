import { describe, it, expect } from "vitest";
import { resolveMonorepoPath } from "../src/core/normalization/path.js";

describe("Monorepo Subpath Resolution", () => {
  const repoFiles = [
    "apps/frontend/src/pages/checkout.tsx",
    "apps/backend/src/services/billing.ts",
    "packages/ui/src/button.tsx",
    "services/auth/src/jwt.ts",
  ];

  it("resolves exact path matches", () => {
    expect(resolveMonorepoPath("apps/backend/src/services/billing.ts", repoFiles)).toBe(
      "apps/backend/src/services/billing.ts"
    );
  });

  it("resolves nested service paths from stack frames", () => {
    // Sentry reports relative to service root: src/services/billing.ts
    const match = resolveMonorepoPath("src/services/billing.ts", repoFiles);
    expect(match).toBe("apps/backend/src/services/billing.ts");
  });

  it("resolves frontend component paths", () => {
    const match = resolveMonorepoPath("src/pages/checkout.tsx", repoFiles);
    expect(match).toBe("apps/frontend/src/pages/checkout.tsx");
  });

  it("returns undefined when no repo file corresponds", () => {
    expect(resolveMonorepoPath("src/unknown/nonexistent.ts", repoFiles)).toBeUndefined();
  });
});
