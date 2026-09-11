#!/usr/bin/env node
import { Command } from "commander";
import { startMcpServer } from "./server.js";
import { runSetupWizard } from "./cli/wizard.js";
import { runDoctor } from "./cli/doctor.js";
import { autoInstallClients, getRecommendedConfigSnippet } from "./cli/installer.js";
import { runDemoSimulation } from "./cli/demo.js";
import { clearStoredConfig, getConfigFilePath } from "./config/store.js";

const program = new Command();

program
  .name("production-monitoring-mcp")
  .description("Production Monitoring MCP Server connecting AI agents to Sentry, GitHub, Vercel, Better Stack, and Cloudflare")
  .version("1.0.0");

program
  .command("demo")
  .description("Run a deterministic offline simulation of an incident triage investigation")
  .action(async () => {
    await runDemoSimulation();
  });

program
  .command("init")
  .description("Interactive terminal wizard to configure API tokens and AI clients")
  .action(async () => {
    try {
      await runSetupWizard();
    } catch (err: any) {
      console.error("Setup error:", err.message);
      process.exit(1);
    }
  });

program
  .command("doctor")
  .description("Run health checks and verify connectivity with all configured services")
  .action(async () => {
    try {
      await runDoctor();
    } catch (err: any) {
      console.error("Doctor error:", err.message);
      process.exit(1);
    }
  });

program
  .command("install")
  .description("Auto-configure Claude Desktop and local AI clients")
  .action(() => {
    const results = autoInstallClients();
    if (results.length > 0) {
      for (const r of results) {
        if (r.status === "installed" || r.status === "updated") {
          console.log(`✅ Configured ${r.client} at: ${r.configPath}`);
        } else {
          console.log(`⚠️ Could not configure ${r.client}: ${r.error}`);
        }
      }
    } else {
      console.log("No local Claude Desktop installation detected.");
      console.log("Add this snippet to your AI client configuration:\n");
      console.log(getRecommendedConfigSnippet());
    }
  });

program
  .command("reset")
  .description("Clear all locally stored credentials from this machine")
  .action(() => {
    clearStoredConfig();
    console.log(`✅ Cleared all stored credentials from: ${getConfigFilePath()}`);
  });

program
  .command("serve", { isDefault: true })
  .description("Start the MCP Server on stdio transport (default when invoked by AI agents)")
  .action(async () => {
    try {
      await startMcpServer();
    } catch (err: any) {
      console.error("Fatal MCP server error:", err);
      process.exit(1);
    }
  });

program.parse(process.argv);
