/**
 * Deterministic Demo Simulator
 * Recreates the complete production incident triage scenario offline
 * without requiring live API tokens.
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

  console.log("🔍 RUNNING AUTOMATED CROSS-SYSTEM TRIAGE...");
  console.log("──────────────────────────────────────────────────────────────────");
  await delay(400);
  console.log("  [1/4] Vercel:       Identified target deployment dpl_9a4f21 (Commit: 3c9e21)");
  console.log("                      Deployed 35 minutes ago by @dev (PR #182)");
  await delay(400);
  console.log("  [2/4] GitHub:       Compared range 8a1f4b...3c9e21");
  console.log("                      Modified: 'src/services/checkout.ts' (+14, -8)");
  await delay(400);
  console.log("  [3/4] Sentry:       Top error: TypeError: Cannot read properties of undefined (reading 'taxRate')");
  console.log("                      Culprit stack frame: src/services/checkout.ts:142");
  await delay(400);
  console.log("  [4/4] Diff Parser:  Line 142 matched hunk @@ -130,8 +135,15 @@ in commit 3c9e21\n");

  console.log("==================================================================");
  console.log(" 📋 TRIAGE VERDICT: HIGH_CONFIDENCE_REGRESSION (94%)");
  console.log("==================================================================");
  console.log("SUSPECTED ROOT CAUSE:");
  console.log("  File:       src/services/checkout.ts");
  console.log("  Line:       142");
  console.log("  Commit:     3c9e21 (\"refactor: clean up billing tax calculation\")");
  console.log("  Author:     @dev (PR #182)\n");

  console.log("EVIDENCE CHAIN:");
  console.log("  ✓ Stack trace filename matches Git diff file ('src/services/checkout.ts')");
  console.log("  ✓ Sentry culprit line 142 was directly added/modified in commit 3c9e21");
  console.log("  ✓ Error first appeared 4m after deployment readyAt timestamp");
  console.log("  ✓ Cloudflare edge 5xx rate spiked from 0.01% to 3.8% immediately post-deploy");
  console.log("  ✓ 420 error events with identical stack signature across 89 users\n");

  console.log("CAVEAT:");
  console.log("  ⚠ Temporal correlation supports causation but does not prove it.\n");

  console.log("RECOMMENDED ACTION:");
  console.log("  Roll back deployment dpl_9a4f21 or revert PR #182.\n");
  console.log("==================================================================");
  console.log(" Demo complete. Run 'npx production-monitoring-mcp init' to configure real keys.");
  console.log("==================================================================");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
