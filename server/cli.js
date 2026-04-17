#!/usr/bin/env node
// CLI entry point — handles --version before any heavy imports
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(path.join(__dirname, "../package.json"), "utf-8"));
  const pluginDir = path.resolve(__dirname, "../plugin");
  process.stdout.write(`figma-ui-mcp v${pkg.version}  —  plugin: ${pluginDir}\n`);
  process.exit(0);
}

// Not --version — start the MCP server
await import("./index.js");
