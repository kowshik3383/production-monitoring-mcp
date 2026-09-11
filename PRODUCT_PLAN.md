# 🛰️ Production Doctor: Architecture & Evolution Plan

> **Positioning:** An evidence-driven incident investigation MCP that connects production errors, deployments, code changes, and infrastructure signals to identify likely root causes with explicit confidence and caveats.

---

## 🎯 1. Core Product Thesis & Market Moat

| Dimension | Raw Vendor MCPs | Enterprise SREs (OpenSRE) | **Production Doctor MCP** |
| :--- | :--- | :--- | :--- |
| **Interface** | 4 fragmented servers, 90+ tools | Heavy orchestration agent | **Lightweight MCP, 1 command (`npx`), 13 structured tools** |
| **Target User** | Developers manually gluing APIs | Dedicated DevOps/SRE teams | **Everyday engineers using Claude Code, Cursor, Antigravity** |
| **Core Moat** | Generic CRUD endpoints | Automated remediation / webhooks | **Evidence Normalization + Multi-Dimensional Correlation + Explanation Engine** |

### The Value Proposition
> *"Don't give the AI agent five raw observability APIs and 20,000 tokens of noise. Give it one coherent, evidence-linked incident investigation."*

---

## 🏗️ 2. System Architecture

```text
                    ┌─────────────────────────┐
                    │ Claude / Cursor / Agent │
                    └────────────┬────────────┘
                                 │ MCP (stdio JSON-RPC)
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION DOCTOR MCP                           │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 1. Tool Taxonomy Layer (Discovery / Investigation / Intelligence)│  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    ▼                                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 2. Incident Intelligence Engine                                  │  │
│  │    ├── Normalization (Webpack paths, stack frames, timestamps)   │  │
│  │    ├── Git Unified Diff Parser (added vs removed vs context)    │  │
│  │    ├── Multi-Dimensional Evidence Model (Code, Runtime, Temporal)│  │
│  │    └── Heuristic Confidence Evaluator (with explicit caveats)    │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    ▼                                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 3. Explanation & Synthesis Engine (explain_incident)             │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
└────────────────────────────────────┼───────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
  [Sentry Adapter]            [GitHub Adapter]            [Vercel Adapter]
   Errors & Traces             Commits & Diffs             Deployments & Logs
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     ▼
                        [Telemetry & Edge Providers]
                        Better Stack (Uptime/Logs)
                        Cloudflare (5xx & Latency)
```

---

## 🔬 3. The 4 Technical Pillars

### Pillar A: Path & Stack-Frame Normalization (`src/core/normalization/`)
Raw stack traces from Sentry, bundlers, and Docker containers rarely match GitHub repo paths. The normalization engine reconciles:
*   `webpack://app/src/services/checkout.ts` → `src/services/checkout.ts`
*   `/app/dist/services/checkout.js` (with source maps) → `src/services/checkout.ts`
*   `src\services\checkout.ts` (Windows) → `src/services/checkout.ts`

```ts
interface NormalizedStackFrame {
  normalizedPath: string;     // e.g. "src/services/checkout.ts"
  functionName?: string;
  lineno?: number;
  colno?: number;
  inApp: boolean;
  contextCode?: string[];
}
```

---

### Pillar B: Line-Level Unified Diff Parser
Rather than checking rough hunk intervals (`start`/`end`), the parser distinguishes **added lines**, **removed lines**, and **surrounding context lines**:

```ts
interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  addedLines: number[];     // Exact line numbers added in target commit
  removedLines: number[];   // Exact line numbers removed in target commit
  contextLines: number[];   // Unchanged surrounding lines
}

interface ParsedFileDiff {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed";
  hunks: DiffHunk[];
  isLineModified(lineno: number): boolean;
}
```
*Value:* When Sentry reports `checkout.ts:142`, we verify whether line 142 was **introduced in this specific commit diff**, proving a direct code change.

---

### Pillar C: Multi-Dimensional Evidence Model
Instead of an arbitrary linear addition (`+0.40 + 0.25...`), evidence is evaluated across independent orthogonal dimensions:

```text
                       Incident Investigation
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       ▼                          ▼                          ▼
[Code Evidence]           [Runtime Evidence]        [Temporal Evidence]
• File changed            • Sentry stack trace      • Deploy readyAt
• Line modified in hunk   • Unresolved error count  • Error firstSeen
• Culprit function match  • Affected user volume    • Edge 5xx spike timing
```

#### Structured Confidence Representation
```json
{
  "confidence": {
    "score": 0.94,
    "level": "HIGH_CONFIDENCE",
    "basis": [
      "stack_frame_matches_changed_file",
      "stack_line_matches_added_hunk",
      "error_first_seen_4m_after_deployment",
      "edge_5xx_spike_correlates_with_deployment"
    ],
    "caveats": [
      "Temporal correlation supports causation but does not prove it",
      "Assumes source maps mapped production bundle line accurately"
    ]
  }
}
```

#### Explicit Verdict Tiers
*   `0.90 – 1.00`: **HIGH_CONFIDENCE_REGRESSION** (Modified line match + error timestamp + telemetry spike)
*   `0.70 – 0.89`: **LIKELY_REGRESSION** (File modified + post-deploy error, line outside hunk or ambiguous)
*   `0.40 – 0.69`: **POSSIBLE_CAUSE** (Multiple candidates, high error volume, or loose timestamp)
*   `0.00 – 0.39`: **INSUFFICIENT_DATA** (No correlated deployments or code changes found)

---

### Pillar D: Environment & Release Awareness
Every query and evidence object enforces context isolation to prevent false correlations across environments:

```ts
interface IncidentContext {
  environment: "production" | "staging" | "preview";
  project: string;
  service?: string;
  timeframe: {
    from: string;
    to: string;
  };
}
```
*Rule:* A production incident will never correlate with a staging deployment or preview build.

---

## 🧰 4. Structured Tool Taxonomy (13 Tools)

To reduce LLM context bloat, tools follow a strict lifecycle: **Discover → Investigate → Correlate → Explain**.

### 1. Discovery (Low Context, High Breadth)
*   `get_production_health` — Single-call operational pulse (Uptime + Sentry spike + Vercel deploy + Edge 5xx). Returns lean signal badges, not raw logs.
*   `get_recent_errors` — Unresolved error issues with frequency and affected users.
*   `get_recent_deployments` — Recent production deployments, commit SHAs, and authors.
*   `check_uptime` — Better Stack monitor availability and active downtime alerts.

### 2. Investigation (Deep Inspection)
*   `get_error_details` — Full stack trace, normalized in-app frames, tags, and breadcrumbs.
*   `get_deployment_logs` — Runtime and build logs for a specific deployment ID.
*   `compare_deployments` — Git commit log and changed file diffs between two releases.
*   `get_commit_details` — Individual commit metadata and patch hunk snippets.
*   `analyze_logs` — Structured application log queries (Better Stack Logs / Logtail).
*   `analyze_api_latency` — Edge HTTP distribution (2xx/4xx/5xx) and latency percentiles.

### 3. Intelligence (Composite Synthesis)
*   `correlate_incident` — Multi-dimensional correlation engine linking deployment, diffs, stack trace, and metrics.
*   `find_regression` — Pinpoints issues first introduced in a specific release.
*   `explain_incident` — Formats a structured, human-readable root-cause executive briefing for immediate engineer handoff.

---

## 💻 5. Deterministic Demo Mode (`npx production-monitoring-mcp demo`)

A built-in offline simulation mode allowing anyone to test, screenshot, and evaluate the engine in **5 seconds** without configuring production tokens:

```bash
npx production-monitoring-mcp demo
```

```text
🛰️ Production Doctor — Incident Investigation Demo
────────────────────────────────────────────────────
🔴 Incident Detected: Checkout failure rate spike

1. Telemetry Pulse
   • Edge 5xx Rate: 0.01% → 3.8% (31x increase)
   • Sentry Errors: 420 events (89 affected users)
   • Uptime: Degraded

2. Correlating Production Signals...
   ✓ Deployment: 3c9e21 (PR #182 by @dev, deployed 35m ago)
   ✓ Git Diff: 3 files modified in range 8a1f4b...3c9e21
   ✓ Sentry Stacktrace: TypeError at src/services/checkout.ts:142
   ✓ Hunk Verification: Line 142 was added in commit 3c9e21 (+14, -8)

────────────────────────────────────────────────────
ROOT CAUSE
File:   src/services/checkout.ts:142
Commit: 3c9e21 ("refactor: clean up billing tax calculation")
Author: dev

Confidence: HIGH_CONFIDENCE (94%)
Basis:
  ✓ Stack frame matches modified file
  ✓ Offending line is inside Git added hunk
  ✓ Error first seen 4m after deployment readyAt
  ✓ 5xx spike correlates with deployment timestamp

Caveat: Temporal correlation supports causation but does not prove it.

RECOMMENDATION:
Rollback deployment dpl_9a4f21 or revert PR #182.
────────────────────────────────────────────────────
```

---

## 🔒 6. Security & Credential Isolation

1. **Zero Credential Exposure to LLMs**: Tokens are kept entirely inside the local process memory. The AI agent never receives or outputs raw tokens.
2. **Automated Secret Redaction**: All tool outputs scrub Bearer tokens, passwords, database URIs, and JWTs via regex sanitization before serialization.
3. **Strict Read-Only Enforcement**: Recommended token scopes only require read permissions (`repo:read`, `project:read`, `event:read`).
4. **Timeout & Rate Limiting**: All outbound HTTP adapter requests enforce strict 10s timeouts to prevent hanging client processes.

---

## 📅 7. Revised Implementation Roadmap

```text
PHASE 1: INCIDENT ENGINE CORE (Current Focus)
├── Path Normalization (src/core/normalization/path.ts)
├── Git Unified Diff Hunk Parser (added/removed/context lines)
├── Multi-Dimensional Evidence Model (Code, Runtime, Temporal)
├── Structured Confidence Evaluator (with basis & caveats)
└── Deterministic Test Fixtures

PHASE 2: COMPOSITE MASTER TOOLS
├── get_production_health (Lean, context-friendly operational pulse)
├── correlate_incident (Upgraded with Evidence Model)
├── explain_incident (Human-readable executive triage summary)
└── find_regression (Release-aware regression finder)

PHASE 3: DEVELOPER EXPERIENCE & DEMO
├── npx production-monitoring-mcp demo (Zero-token offline demonstration)
├── npx production-monitoring-mcp init (Interactive @clack wizard)
├── npx production-monitoring-mcp doctor (Connection diagnostics)
└── npx production-monitoring-mcp install (Zero-touch Claude/Cursor config)

PHASE 4: SHOWCASE & LANDING PAGE
├── brainless React Component Integration (@brainless/claude-session)
├── Simulated Claude Code Incident Triage Terminal Demo
└── GitHub README GIF / Video Walkthrough

PHASE 5: ECOSYSTEM LAUNCH
├── NPM Registry Release (production-monitoring-mcp)
├── Official MCP Directories & Smithery.ai Submission
└── Community Announcements (r/ClaudeAI, Show HN, Twitter/X)
```
