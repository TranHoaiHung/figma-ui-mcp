// HTTP bridge — plugin polls this server for queued operations
import http from "node:http";

export const CONFIG = {
  PORT: parseInt(process.env.FIGMA_MCP_PORT || "38451", 10),
  PORT_RANGE: 10,           // try up to 10 ports (38451-38460)
  HOST: null,               // null = Node.js binds :: (dual-stack IPv4+IPv6), accepts localhost on both
  OP_TIMEOUT_MS: 30_000,    // per-operation timeout (was 10s, too short for first-run font loading + large exports)
  MAX_BODY_BYTES: 5_000_000,  // 5MB to support image payloads
  MAX_QUEUE: 50,
  HEALTH_TTL_MS: 60_000,    // plugin considered offline after 60s without poll (was 30s, plugin may be busy processing)
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
        // Remove from BOTH pending AND queue (prevents stuck requests)
        this.#pending.delete(id);
        this.#requestQueue = this.#requestQueue.filter(r => r.id !== id);
        reject(new Error(`Operation "${operation}" timed out after ${CONFIG.OP_TIMEOUT_MS}ms`));
      }, CONFIG.OP_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timer });
    });
  }

  // Clear all queued and pending operations (unstick the queue)
  clearQueue() {
    const cleared = this.#requestQueue.length + this.#pending.size;
    for (const [id, p] of this.#pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Queue cleared manually"));
    }
    this.#pending.clear();
    this.#requestQueue.length = 0;
    return cleared;
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

    // Root — welcome + status (so curl http://localhost:38451 works)
    if (path === "/" && req.method === "GET") {
      res.writeHead(200);
      res.end(JSON.stringify({
        server: "figma-ui-mcp",
        version: "1.9.5",
        port: this.#actualPort,
        pluginConnected: this.isPluginConnected(),
        lastPollAgoMs: this.#lastPollAt ? Date.now() - this.#lastPollAt : null,
        queueLength: this.queueLength,
        endpoints: ["/health", "/poll", "/response", "/exec", "/clear"],
      }));
      return;
    }

    // Plugin → pick up queued operations (auto-clean expired requests)
    if (path === "/poll" && req.method === "GET") {
      this.#lastPollAt = Date.now();
      // Filter out requests whose pending already timed out
      const alive = this.#requestQueue.filter(r => this.#pending.has(r.id));
      this.#requestQueue.length = 0;
      res.writeHead(200);
      res.end(JSON.stringify({ requests: alive, mode: "ready" }));
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

    // Manual queue clear — unstick when requests are stuck
    if (path === "/clear" && (req.method === "POST" || req.method === "GET")) {
      const cleared = this.clearQueue();
      res.writeHead(200);
      res.end(JSON.stringify({ cleared, queueLength: 0, pendingCount: 0 }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }

  get port() { return this.#actualPort; }
  #actualPort = CONFIG.PORT;

  // Reclaim the primary port if it is held by a dead/zombie process (no HTTP response).
  // IMPORTANT: Never kill a port that responds with a valid figma-ui-mcp health payload —
  // that process is a live sibling session and killing it would cause "Transport closed".
  async #killStaleBridges() {
    var killed = 0;
    // Only attempt to reclaim the primary port, not fallback ports.
    // Fallback-port bridges belong to sibling MCP sessions — leave them alone.
    var port = CONFIG.PORT;
    try {
      var isZombie = await new Promise((resolve) => {
        var req = http.get({ hostname: "127.0.0.1", port, path: "/health", timeout: 800 }, (res) => {
          var data = "";
          res.on("data", (c) => { data += c; });
          res.on("end", () => {
            try {
              var j = JSON.parse(data);
              // Port responds with a valid health payload → live bridge, do NOT kill.
              resolve(j.pluginConnected === undefined);
            } catch {
              // Invalid JSON on the primary port → zombie/foreign process, safe to kill.
              resolve(true);
            }
          });
        });
        // Connection refused or timeout → port is free or held by a dead process.
        req.on("error", () => resolve(false));
        req.on("timeout", () => { req.destroy(); resolve(false); });
      });
      if (isZombie) {
        try {
          var { execSync } = await import("node:child_process");
          var pid = execSync("lsof -ti tcp:" + port + " 2>/dev/null", { encoding: "utf8" }).trim();
          if (pid) {
            execSync("kill " + pid + " 2>/dev/null");
            killed++;
            process.stderr.write("[figma-ui-mcp] Killed zombie process on port " + port + " (PID " + pid + ")\n");
            await new Promise((r) => setTimeout(r, 200));
          }
        } catch { /* ignore kill errors */ }
      }
    } catch { /* ignore */ }
    return killed;
  }

  start() {
    return new Promise(async (resolve) => {
      // Kill stale bridges first to reclaim port 38451
      await this.#killStaleBridges();

      var tryPort = (port, attempt) => {
        if (attempt >= CONFIG.PORT_RANGE) {
          process.stderr.write("[figma-ui-mcp] All ports " + CONFIG.PORT + "-" + (CONFIG.PORT + CONFIG.PORT_RANGE - 1) + " in use.\n");
          resolve(this);
          return;
        }
        this.#server = http.createServer((req, res) => this.#route(req, res));
        this.#server.once("error", (err) => {
          if (err.code === "EADDRINUSE") {
            process.stderr.write("[figma-ui-mcp] Port " + port + " in use — trying " + (port + 1) + "...\n");
            tryPort(port + 1, attempt + 1);
          } else {
            process.stderr.write("[figma-ui-mcp bridge] " + err.message + "\n");
            resolve(this);
          }
        });
        this.#server.once("listening", () => {
          this.#actualPort = port;
          resolve(this);
        });
        this.#server.listen(port, CONFIG.HOST);
      };
      tryPort(CONFIG.PORT, 0);
    });
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
