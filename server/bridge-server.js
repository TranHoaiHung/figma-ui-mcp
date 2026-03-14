// HTTP bridge — plugin polls this server for queued operations
import http from "node:http";

export const CONFIG = {
  PORT: 38451,
  HOST: "127.0.0.1",        // localhost only, never exposed to network
  OP_TIMEOUT_MS: 10_000,    // per-operation timeout
  MAX_BODY_BYTES: 500_000,
  MAX_QUEUE: 50,
  HEALTH_TTL_MS: 15_000,    // plugin considered offline after 15s without poll
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

    const path = new URL(req.url, `http://${CONFIG.HOST}`).pathname;

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
    this.#server.listen(CONFIG.PORT, CONFIG.HOST);
    this.#server.on("error", err =>
      process.stderr.write(`[figma-ui-mcp bridge] ${err.message}\n`)
    );
    return this;
  }
}
