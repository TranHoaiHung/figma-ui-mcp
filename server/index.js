#!/usr/bin/env node
// figma-ui-mcp — MCP server entry point
// Bidirectional Figma bridge: write UI from Claude, read design back to code.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import http from "node:http";

import { BridgeServer, CONFIG } from "./bridge-server.js";
import { executeCode } from "./code-executor.js";
import { TOOLS } from "./tool-definitions.js";
import { DOCS } from "./api-docs.js";

// ── Bridge connection strategy ─────────────────────────────────────────────
// Try to start own bridge server. If port is already taken (another instance
// or standalone bridge running), connect to the existing one via HTTP client.

let bridge;
let useHttpProxy = false;

// HTTP proxy: forwards operations to existing bridge via /exec endpoint
const httpProxy = {
  isPluginConnected() { return true; }, // delegate health check to actual call
  get queueLength()  { return 0; },
  get lastPollAt()   { return Date.now(); },
  async sendOperation(operation, params = {}) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ operation, params });
      const req = http.request({
        hostname: "127.0.0.1", port: CONFIG.PORT,
        path: "/exec", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      }, res => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.success) resolve(parsed.data);
            else reject(new Error(parsed.error || "Bridge error"));
          } catch { reject(new Error("Invalid bridge response")); }
        });
      });
      req.on("error", e => reject(new Error(`Bridge connection failed: ${e.message}`)));
      req.setTimeout(CONFIG.OP_TIMEOUT_MS, () => { req.destroy(); reject(new Error("Bridge timeout")); });
      req.end(payload);
    });
  },
  // Health check via HTTP
  async checkHealth() {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: "127.0.0.1", port: CONFIG.PORT,
        path: "/health", method: "GET",
      }, res => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try { resolve(JSON.parse(data)); } catch { resolve({ pluginConnected: false }); }
        });
      });
      req.on("error", () => resolve({ pluginConnected: false }));
      req.setTimeout(2000, () => { req.destroy(); resolve({ pluginConnected: false }); });
      req.end();
    });
  },
};

// Try starting own bridge; if port taken, use HTTP proxy
try {
  bridge = new BridgeServer().start();
  // Wait briefly to see if it actually bound
  await new Promise(r => setTimeout(r, 200));
  process.stderr.write("[figma-ui-mcp] Bridge started on port " + CONFIG.PORT + "\n");
} catch (e) {
  useHttpProxy = true;
  bridge = httpProxy;
  process.stderr.write("[figma-ui-mcp] Port " + CONFIG.PORT + " in use, connecting to existing bridge\n");
}

// Also check: if bridge started but the "error" event fired (EADDRINUSE), switch to proxy
// The BridgeServer.start() doesn't throw on EADDRINUSE, it logs to stderr. So we check health.
if (!useHttpProxy) {
  const health = await httpProxy.checkHealth();
  if (health.pluginConnected && !bridge.isPluginConnected()) {
    // Another bridge is running and connected to plugin, but ours isn't
    useHttpProxy = true;
    bridge = httpProxy;
    process.stderr.write("[figma-ui-mcp] Existing bridge detected with plugin connected, using HTTP proxy\n");
  }
}

const server = new Server(
  { name: "figma-ui-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async ({ params: { name, arguments: args } }) => {

  // ── figma_status ──────────────────────────────────────────────────────────
  if (name === "figma_status") {
    let connected, pluginInfo = null, healthData = {};

    if (useHttpProxy) {
      healthData = await httpProxy.checkHealth();
      connected = healthData.pluginConnected;
      if (connected) {
        try { pluginInfo = await bridge.sendOperation("status", {}); } catch { /* brief disconnect */ }
      }
    } else {
      connected = bridge.isPluginConnected();
      if (connected) {
        try { pluginInfo = await bridge.sendOperation("status", {}); } catch { /* brief disconnect */ }
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          bridgePort:      CONFIG.PORT,
          pluginConnected: connected,
          pluginInfo,
          mode:            useHttpProxy ? "http-proxy" : "direct",
          queueLength:     healthData.queueLength || bridge.queueLength,
          lastPollAgoMs:   healthData.lastPollAgoMs || (bridge.lastPollAt ? Date.now() - bridge.lastPollAt : null),
          hint: connected
            ? "Ready. Use figma_write to draw or figma_read to extract design."
            : "Plugin not connected. In Figma Desktop: Plugins → Development → Figma UI MCP Bridge → Run",
        }, null, 2),
      }],
    };
  }

  // ── figma_write ───────────────────────────────────────────────────────────
  if (name === "figma_write") {
    if (useHttpProxy) {
      const health = await httpProxy.checkHealth();
      if (!health.pluginConnected) return notConnected();
    } else if (!bridge.isPluginConnected()) return notConnected();

    const code = args?.code;
    if (!code || typeof code !== "string") return err("'code' is required.");

    const { success, result, error, logs } = await executeCode(code, bridge);
    const parts = [];
    if (logs.length) parts.push(`Logs:\n${logs.join("\n")}`);
    parts.push(success ? `Result: ${JSON.stringify(result, null, 2)}` : `Error: ${error}`);

    return { isError: !success, content: [{ type: "text", text: parts.join("\n\n") }] };
  }

  // ── figma_read ────────────────────────────────────────────────────────────
  if (name === "figma_read") {
    if (useHttpProxy) {
      const health = await httpProxy.checkHealth();
      if (!health.pluginConnected) return notConnected();
    } else if (!bridge.isPluginConnected()) return notConnected();

    const { operation, nodeId, nodeName, scale } = args || {};
    if (!operation) return err("'operation' is required.");

    const params = {};
    if (nodeId)   params.id    = nodeId;
    if (nodeName) params.name  = nodeName;
    if (scale)    params.scale = scale;

    try {
      const data = await bridge.sendOperation(operation, params);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (e) {
      return err(e.message);
    }
  }

  // ── figma_docs ────────────────────────────────────────────────────────────
  if (name === "figma_docs") {
    return { content: [{ type: "text", text: DOCS }] };
  }

  return err(`Unknown tool: ${name}`);
});

function notConnected() {
  return {
    isError: true,
    content: [{
      type: "text",
      text: "Figma plugin not connected. Run the 'Figma UI MCP Bridge' plugin in Figma Desktop first.",
    }],
  };
}

function err(msg) {
  return { isError: true, content: [{ type: "text", text: msg }] };
}

await server.connect(new StdioServerTransport());
