import fs from "fs";
import path from "path";
import os from "os";

export interface InstallResult {
  client: string;
  configPath: string;
  status: "installed" | "updated" | "skipped" | "error";
  error?: string;
}

function getClaudeConfigPath(): string | null {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === "win32") {
    const appdata = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appdata, "Claude", "claude_desktop_config.json");
  } else if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  } else {
    return path.join(home, ".config", "Claude", "claude_desktop_config.json");
  }
}

function getAntigravityConfigPath(): string | null {
  const home = os.homedir();
  return path.join(home, ".gemini", "antigravity-cli", "mcp_servers.json");
}

export function installIntoConfig(configFilePath: string, clientName: string): InstallResult {
  try {
    const dir = path.dirname(configFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let configData: Record<string, any> = {};
    let status: "installed" | "updated" = "installed";

    if (fs.existsSync(configFilePath)) {
      try {
        const raw = fs.readFileSync(configFilePath, "utf-8");
        configData = JSON.parse(raw);
        if (configData.mcpServers?.["production-monitoring"]) {
          status = "updated";
        }
      } catch {
        configData = {};
      }
    }

    if (!configData.mcpServers) {
      configData.mcpServers = {};
    }

    configData.mcpServers["production-monitoring"] = {
      command: "npx",
      args: ["-y", "production-monitoring-mcp"],
    };

    fs.writeFileSync(configFilePath, JSON.stringify(configData, null, 2), "utf-8");

    return {
      client: clientName,
      configPath: configFilePath,
      status,
    };
  } catch (err: any) {
    return {
      client: clientName,
      configPath: configFilePath,
      status: "error",
      error: err.message,
    };
  }
}

export function autoInstallClients(): InstallResult[] {
  const results: InstallResult[] = [];

  // 1. Claude Desktop
  const claudePath = getClaudeConfigPath();
  if (claudePath) {
    const dir = path.dirname(claudePath);
    // If Claude directory or config exists, configure it
    if (fs.existsSync(dir) || fs.existsSync(claudePath)) {
      results.push(installIntoConfig(claudePath, "Claude Desktop"));
    }
  }

  // 2. Antigravity CLI
  const antigravityPath = getAntigravityConfigPath();
  if (antigravityPath) {
    const dir = path.dirname(antigravityPath);
    if (fs.existsSync(dir) || fs.existsSync(antigravityPath)) {
      results.push(installIntoConfig(antigravityPath, "Antigravity CLI"));
    }
  }

  return results;
}

export function getRecommendedConfigSnippet(): string {
  return JSON.stringify(
    {
      mcpServers: {
        "production-monitoring": {
          command: "npx",
          args: ["-y", "production-monitoring-mcp"],
        },
      },
    },
    null,
    2
  );
}
