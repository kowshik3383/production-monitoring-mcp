import { parseGitDiff } from "../core/diff/parser.js";
import { normalizeFilePath, arePathsEquivalent } from "../core/normalization/path.js";
import { evaluateIncidentEvidence } from "../core/evidence/model.js";

/**
 * Deterministic Demo Simulator
 * Executes the real incident intelligence engine offline with deterministic
 * mock fixtures to showcase cross-system triage capabilities.
 */
export async function runDemoSimulation(): Promise<void> {
  console.log("==================================================================");
  console.log(" 🛰️  Production Doctor MCP — Deterministic Incident Triage Demo");
  console.log("==================================================================\n");

  console.log("🔴 INCIDENT DETECTED");
  console.log("──────────────────────────────────────────────────────────────────");
  console.log("• Service:        checkout-api (production)");
  console.log("• Symptoms:       Checkout conversion rate dropped 41%");
  console.log("• Edge Telemetry: 5xx errors spiked from 0.01% to 3.8% (31x baseline)");
  console.log("• Runtime Errors: 420 events affecting 89 users in past 45 minutes\n");

  console.log("🔍 RUNNING AUTOMATED CROSS-SYSTEM TRIAGE ENGINE...");
  console.log("──────────────────────────────────────────────────────────────────");

  // 1. Mock deployment data
  await delay(300);
  const mockDeploy = {
    id: "dpl_9a4f21",
    sha: "3c9e21",
    author: "@dev",
    pr: "#182",
    deployedMinutesAgo: 35,
  };
  console.log(`  [1/4] Vercel:       Identified target deployment ${mockDeploy.id} (Commit: ${mockDeploy.sha})`);
  console.log(`                      Deployed ${mockDeploy.deployedMinutesAgo}m ago by ${mockDeploy.author} (PR ${mockDeploy.pr})`);

  // 2. Real Diff Parser execution on a Git patch
  await delay(300);
  const samplePatch = `@@ -130,8 +140,8 @@ export async function processCheckout(cart: Cart) {
   const total = cart.subtotal;
-  const taxRate = getRegionTax(cart.region) ?? 0.05;
-  const tax = total * taxRate;
+  // Refactored billing tax lookup
+  const billingConfig = await getBillingConfig(cart.orgId);
+  const taxRate = billingConfig.taxRate;
+  const tax = total * taxRate;
   return { total: total + tax };
 }`;

  const diffFiles = [{ filename: "src/services/checkout.ts", patch: samplePatch, status: "modified" }];
  const diffMap = parseGitDiff(diffFiles);
  const parsedDiff = diffMap.get("src/services/checkout.ts")!;
  console.log("  [2/4] GitHub:       Compared range 8a1f4b...3c9e21");
  console.log(`                      Modified: 'src/services/checkout.ts' (${parsedDiff.addedLinesSet.size} lines added)`);

  // 3. Real Path Normalization on raw Webpack Sentry stack frame
  await delay(300);
  const rawSentryFrame = "webpack://app/src/services/checkout.ts";
  const normalizedFile = normalizeFilePath(rawSentryFrame);
  const errorLine = 142;
  console.log("  [3/4] Sentry:       Top error: TypeError: Cannot read properties of undefined (reading 'taxRate')");
  console.log(`                      Raw frame: ${rawSentryFrame}:${errorLine}`);
  console.log(`                      Normalized repo path: ${normalizedFile}:${errorLine}`);

  // 4. Real Line-Level Hunk Verification
  await delay(300);
  const isLineModifiedInCommit = parsedDiff.isLineModified(errorLine);
  const fileMatches = arePathsEquivalent(normalizedFile, "src/services/checkout.ts");
  console.log(`  [4/4] Diff Parser:  Line ${errorLine} modified in hunk? ${isLineModifiedInCommit ? "YES (Added in 3c9e21)" : "NO"}\n`);

  // 5. Real Multi-Dimensional Evidence Engine Evaluation
  const evaluation = evaluateIncidentEvidence({
    code: {
      fileMatch: fileMatches,
      lineModified: isLineModifiedInCommit,
      lineInContext: false,
      matchedFile: "src/services/checkout.ts",
      matchedLine: errorLine,
    },
    runtime: {
      errorCount: 420,
      affectedUsers: 89,
      isUnresolved: true,
      hasStackTrace: true,
    },
    temporal: {
      minutesBetweenDeployAndError: 4,
      isPostDeploy: true,
      edgeSpikeCorrelated: true,
    },
    candidateMeta: {
      functionName: "processCheckout",
      commitSha: mockDeploy.sha,
      commitAuthor: mockDeploy.author,
      commitMessage: "refactor: clean up billing tax calculation",
      errorTitle: "TypeError: Cannot read properties of undefined (reading 'taxRate')",
      errorId: "issue_4921",
    },
  });

  console.log("==================================================================");
  console.log(` 📋 TRIAGE VERDICT: ${evaluation.verdict} (${evaluation.confidence.percentage}%)`);
  console.log("==================================================================");
  console.log("SUSPECTED ROOT CAUSE:");
  console.log(`  File:       ${evaluation.candidate?.file}:${evaluation.candidate?.line}`);
  console.log(`  Function:   ${evaluation.candidate?.functionName}`);
  console.log(`  Commit:     ${evaluation.candidate?.commitSha} ("${evaluation.candidate?.commitMessage}")`);
  console.log(`  Author:     ${evaluation.candidate?.commitAuthor} (PR ${mockDeploy.pr})\n`);

  console.log("EVIDENCE CHAIN:");
  for (const b of evaluation.confidence.basis) {
    console.log(`  ✓ ${b}`);
  }

  if (evaluation.confidence.caveats.length > 0) {
    console.log("\nCAVEATS:");
    for (const c of evaluation.confidence.caveats) {
      console.log(`  ⚠ ${c}`);
    }
  }

  console.log("\nRECOMMENDED ACTION:");
  console.log(`  ${evaluation.recommendation}\n`);
  console.log("==================================================================");
  console.log(" Demo complete. Run 'npx production-monitoring-mcp init' to configure real keys.");
  console.log("==================================================================");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
