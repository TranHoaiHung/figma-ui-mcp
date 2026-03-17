// HTTP bridge — plugin polls this server for queued operations
import http from "node:http";

export const CONFIG = {
  PORT: 38451,
  HOST: null,               // null = Node.js binds :: (dual-stack IPv4+IPv6), accepts localhost on both
  OP_TIMEOUT_MS: 10_000,    // per-operation timeout
  MAX_BODY_BYTES: 5_000_000,  // 5MB to support image payloads
  MAX_QUEUE: 50,
  HEALTH_TTL_MS: 30_000,    // plugin considered offline after 30s without poll (was 15s, too aggressive)
};

export class BridgeServer {
  #requestQueue = [];
  #pending = new Map();     // id → { resolve, reject, timer }
  #lastPollAt = 0;
  #server = null;

  get lastPollAt() { return this.#lastPollAt; }
  get queueLength() { return this.#requestQueue.length; }
  get pendingCount() { return this.#pending.size; }

  isPluginConnected() {
    return this.#lastPollAt > 0 && Date.now() - this.#lastPollAt < CONFIG.HEALTH_TTL_MS;
  }

  async sendOperation(operation, params = {}) {
    if (this.#requestQueue.length >= CONFIG.MAX_QUEUE) {
      throw new Error("Queue full — is the Figma plugin running?");
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.#requestQueue.push({ id, operation, params });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Operation "${operation}" timed out after ${CONFIG.OP_TIMEOUT_MS}ms`));
      }, CONFIG.OP_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timer });
    });
  }

  #settle(response) {
    const p = this.#pending.get(response.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.#pending.delete(response.id);
    response.success ? p.resolve(response.data) : p.reject(new Error(response.error || "Plugin error"));
  }

  async #readJson(req) {
    return new Promise((resolve, reject) => {
      let raw = "";
      let size = 0;
      req.on("data", chunk => {
        size += chunk.length;
        if (size > CONFIG.MAX_BODY_BYTES) { req.destroy(); return reject(new Error("Body too large")); }
        raw += chunk;
      });
      req.on("end", () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error("Invalid JSON")); } });
      req.on("error", reject);
    });
  }

  #headers(res) {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type",                 "application/json");
    res.setHeader("X-Content-Type-Options",       "nosniff");
  }

  #route(req, res) {
    this.#headers(res);
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const path = new URL(req.url, `http://localhost:${CONFIG.PORT}`).pathname;

    // Plugin → pick up queued operations
    if (path === "/poll" && req.method === "GET") {
      this.#lastPollAt = Date.now();
      const requests = this.#requestQueue.splice(0);
      res.writeHead(200);
      res.end(JSON.stringify({ requests, mode: "ready" }));
      return;
    }

    // Plugin → return operation result
    if (path === "/response" && req.method === "POST") {
      this.#readJson(req)
        .then(body => { this.#settle(body); res.writeHead(200); res.end(JSON.stringify({ ok: true })); })
        .catch(err  => { res.writeHead(400); res.end(JSON.stringify({ error: err.message })); });
      return;
    }

    // Direct HTTP execution — allows any HTTP client to send operations without MCP layer
    // POST /exec { operation, params } → waits for plugin response (max 10s)
    if (path === "/exec" && req.method === "POST") {
      this.#readJson(req)
        .then(async body => {
          if (!this.isPluginConnected()) {
            res.writeHead(503); res.end(JSON.stringify({ error: "Plugin not connected" })); return;
          }
          try {
            const data = await this.sendOperation(body.operation, body.params || {});
            res.writeHead(200); res.end(JSON.stringify({ success: true, data }));
          } catch (e) {
            res.writeHead(200); res.end(JSON.stringify({ success: false, error: e.message }));
          }
        })
        .catch(err => { res.writeHead(400); res.end(JSON.stringify({ error: err.message })); });
      return;
    }

    // Health check
    if (path === "/health" && req.method === "GET") {
      res.writeHead(200);
      res.end(JSON.stringify({
        pluginConnected: this.isPluginConnected(),
        queueLength:     this.queueLength,
        pendingCount:    this.pendingCount,
        lastPollAgoMs:   this.#lastPollAt ? Date.now() - this.#lastPollAt : null,
      }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }

  start() {
    this.#server = http.createServer((req, res) => this.#route(req, res));
    this.#server.on("error", err => {
      if (err.code === "EADDRINUSE") {
        process.stderr.write(`[figma-ui-mcp] Port ${CONFIG.PORT} in use — killing old process and retrying...\n`);
        // Try to reclaim the port
        import("node:child_process").then(cp => {
          cp.execSync(`lsof -ti :${CONFIG.PORT} | xargs kill -9 2>/dev/null || true`);
          setTimeout(() => {
            this.#server.listen(CONFIG.PORT, CONFIG.HOST);
          }, 1000);
        }).catch(() => {
          process.stderr.write(`[figma-ui-mcp] Could not reclaim port ${CONFIG.PORT}. Kill the old process manually.\n`);
        });
      } else {
        process.stderr.write(`[figma-ui-mcp bridge] ${err.message}\n`);
      }
    });
    this.#server.listen(CONFIG.PORT, CONFIG.HOST);
    return this;
  }

  stop() {
    if (this.#server) {
      this.#server.close();
      this.#server = null;
    }
    // Clear all pending operations
    for (var [id, p] of this.#pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Bridge shutting down"));
    }
    this.#pending.clear();
    this.#requestQueue.length = 0;
  }
}
