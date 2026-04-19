#!/usr/bin/env node
// Multi-session / multi-tab tests for BridgeServer
// Run: node scripts/test-multi-session.mjs
import http from "node:http";
import { BridgeServer } from "../server/bridge-server.js";

let passed = 0, failed = 0;

function assert(label, condition, detail = "") {
  if (condition) { console.log("  ✓", label); passed++; }
  else { console.error("  ✗", label, detail ? `— ${detail}` : ""); failed++; }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function httpGet(port, path) {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on("error", () => resolve(null));
  });
}

function httpPost(port, path, body) {
  return new Promise((resolve) => {
    const raw = JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1", port, path, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(raw) }
    }, (res) => { res.resume(); resolve(); });
    req.on("error", () => resolve());
    req.write(raw); req.end();
  });
}

// Simulate plugin tab polling — returns op batch received
function simulatePoll(port, sessionId, fileName) {
  return new Promise((resolve) => {
    const url = `http://127.0.0.1:${port}/poll?sessionId=${sessionId}&fileName=${encodeURIComponent(fileName || sessionId)}`;
    http.get(url, (res) => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on("error", () => resolve(null));
  });
}

// Simulate plugin completing an op
function simulateResponse(port, opId, data) {
  return httpPost(port, "/response", { id: opId, success: true, data });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Start bridge ────────────────────────────────────────────────────────────
const bridge = new BridgeServer();
await bridge.start();
const PORT = bridge.port;

// ── TEST 1: Session created on poll ────────────────────────────────────────
console.log("\n# Session lifecycle");
{
  const pollP = simulatePoll(PORT, "tab-A", "File Alpha");
  await sleep(50);

  const sessions = bridge.getSessions();
  assert("tab-A session created after poll", sessions.some(s => s.id === "tab-A"));
  await pollP; // drain
}

// ── TEST 2: Two sessions are independent ───────────────────────────────────
console.log("\n# Two tabs → independent sessions");
{
  const pA = simulatePoll(PORT, "tab-A", "File Alpha");
  const pB = simulatePoll(PORT, "tab-B", "File Beta");
  await sleep(50);

  const sessions = bridge.getSessions();
  assert("tab-A and tab-B are separate sessions",
    sessions.filter(s => s.id === "tab-A" || s.id === "tab-B").length === 2);

  // Op to tab-A must NOT go to tab-B
  const opP = bridge.sendOperation("status", {}, "tab-A");
  const resA = await pA;
  const opsA = resA && resA.requests ? resA.requests : [];

  assert("tab-A receives its op", opsA.length === 1);
  assert("op is 'status'", opsA[0] && opsA[0].operation === "status");

  if (opsA[0]) await simulateResponse(PORT, opsA[0].id, { connected: true });
  await opP;

  // tab-B long-poll still running — should get no ops (just timeout)
  const resB = await Promise.race([pB, sleep(200).then(() => "timeout")]);
  const opsB = resB !== "timeout" && resB && resB.requests ? resB.requests : [];
  assert("tab-B received no ops", opsB.length === 0, JSON.stringify(opsB));
}

// ── TEST 3: Explicit sessionId routes to correct tab ──────────────────────
console.log("\n# Explicit sessionId routing");
{
  const pA = simulatePoll(PORT, "tab-A", "File Alpha");
  const pB = simulatePoll(PORT, "tab-B", "File Beta");
  await sleep(50);

  const opA = bridge.sendOperation("create", { type: "FRAME" }, "tab-A");
  const opB = bridge.sendOperation("create", { type: "RECTANGLE" }, "tab-B");

  const [resA, resB] = await Promise.all([pA, pB]);
  const opsA = resA && resA.requests ? resA.requests : [];
  const opsB = resB && resB.requests ? resB.requests : [];

  assert("tab-A received 1 op", opsA.length === 1);
  assert("tab-B received 1 op", opsB.length === 1);
  assert("tab-A op is FRAME", opsA[0] && opsA[0].params && opsA[0].params.type === "FRAME");
  assert("tab-B op is RECTANGLE", opsB[0] && opsB[0].params && opsB[0].params.type === "RECTANGLE");
  assert("op IDs are distinct", opsA[0] && opsB[0] && opsA[0].id !== opsB[0].id);

  await Promise.all([
    simulateResponse(PORT, opsA[0].id, { id: "1:1" }),
    simulateResponse(PORT, opsB[0].id, { id: "2:1" }),
  ]);
  const [rA, rB] = await Promise.all([opA, opB]);
  assert("opA resolves with FRAME id", rA && rA.id === "1:1");
  assert("opB resolves with RECTANGLE id", rB && rB.id === "2:1");
}

// ── TEST 4: No cross-contamination ────────────────────────────────────────
console.log("\n# No cross-contamination (op for tab-A never lands in tab-B)");
{
  // tab-B polls first → higher lastPollAt candidate
  const pB = simulatePoll(PORT, "tab-B", "File Beta");
  await sleep(30);
  const pA = simulatePoll(PORT, "tab-A", "File Alpha");
  await sleep(30);

  // Send explicitly to tab-A
  const opA = bridge.sendOperation("status", {}, "tab-A");
  const resA = await pA;
  const opsA = resA && resA.requests ? resA.requests : [];
  assert("op arrived at tab-A", opsA.length === 1 && opsA[0] && opsA[0].operation === "status");

  const resB = await Promise.race([pB, sleep(200).then(() => "timeout")]);
  const opsB = resB !== "timeout" && resB && resB.requests ? resB.requests : [];
  assert("tab-B received no ops (no leak)", opsB.length === 0, JSON.stringify(opsB));

  if (opsA[0]) await simulateResponse(PORT, opsA[0].id, { connected: true });
  await opA;
}

// ── TEST 5: getSessions metadata ──────────────────────────────────────────
console.log("\n# getSessions metadata");
{
  const p = simulatePoll(PORT, "tab-meta", "File Meta");
  await sleep(50);

  const sessions = bridge.getSessions();
  const s = sessions.find(x => x.id === "tab-meta");
  assert("session has correct fileName", s && s.fileName === "File Meta");
  assert("session connected=true", s && s.connected === true);
  assert("lastPollAgoMs is recent (<500ms)", s && s.lastPollAgoMs !== null && s.lastPollAgoMs < 500);
  assert("session has ops counter", s && typeof s.ops === "number");

  await p;
}

// ── TEST 6: isPluginConnected per session ─────────────────────────────────
console.log("\n# isPluginConnected per session");
{
  const p = simulatePoll(PORT, "tab-C", "File C");
  await sleep(50);

  assert("tab-C connected", bridge.isPluginConnected("tab-C"));
  assert("tab-X not connected (never polled)", !bridge.isPluginConnected("tab-X"));
  assert("global connected (any session)", bridge.isPluginConnected(null));

  await p;
}

// ── TEST 7: clearQueue is session-scoped ──────────────────────────────────
console.log("\n# clearQueue — session-scoped");
{
  const pA = simulatePoll(PORT, "tab-A", "A");
  const pB = simulatePoll(PORT, "tab-B", "B");
  await sleep(50);

  // Send ops but don't let plugin collect them yet — intercept via sendOperation Promise
  // We need ops sitting in queue, not yet delivered. Trick: deliver to tab-A poll but
  // reject tab-B's poll. Instead, just check clearQueue clears only target session.
  const opA = bridge.sendOperation("status", {}, "tab-A").catch(() => "cleared");
  await sleep(20);

  const cleared = bridge.clearQueue("tab-A");
  assert("clearQueue cleared tab-A ops", cleared > 0, "cleared=" + cleared);

  // tab-B is untouched
  const sB = bridge.getSessions().find(s => s.id === "tab-B");
  assert("tab-B session still exists after tab-A clear", !!sB);

  // Drain both polls
  await Promise.allSettled([pA, pB]);
  const opAResult = await opA;
  assert("opA was rejected (cleared)", opAResult === "cleared");
}

// ── TEST 8: /sessions HTTP endpoint ────────────────────────────────────────
console.log("\n# /sessions HTTP endpoint");
{
  const p = simulatePoll(PORT, "tab-http", "File HTTP");
  await sleep(50);

  const data = await httpGet(PORT, "/sessions");
  assert("/sessions returns sessions array", data && Array.isArray(data.sessions));
  assert("tab-http appears in /sessions", data && data.sessions.some(s => s.id === "tab-http"));

  await p;
}

// ── TEST 9: /health reports sessions ─────────────────────────────────────
console.log("\n# /health reports sessions");
{
  const health = await httpGet(PORT, "/health");
  assert("/health has sessions array", health && Array.isArray(health.sessions));
  assert("/health pluginConnected is boolean", typeof health.pluginConnected === "boolean");
  assert("/health has stats", health && health.stats && typeof health.stats.ops === "number");
}

// ── TEST 10: 3 tabs simultaneous — all ops resolve correctly ──────────────
console.log("\n# 3 tabs simultaneous — all ops resolve to correct tab");
{
  const tabs = ["alpha", "beta", "gamma"];
  const polls = tabs.map(t => simulatePoll(PORT, t, `File ${t}`));
  await sleep(50);

  const ops = tabs.map(t => bridge.sendOperation("create", { type: "TEXT", content: t }, t));
  const responses = await Promise.all(polls);

  for (let i = 0; i < tabs.length; i++) {
    const reqs = responses[i] && responses[i].requests ? responses[i].requests : [];
    assert(`${tabs[i]}: received exactly 1 op`, reqs.length === 1);
    assert(`${tabs[i]}: op content="${tabs[i]}"`,
      reqs[0] && reqs[0].params && reqs[0].params.content === tabs[i],
      reqs[0] && reqs[0].params && reqs[0].params.content);
    if (reqs[0]) await simulateResponse(PORT, reqs[0].id, { id: `${i + 1}:1`, type: "TEXT" });
  }

  const results = await Promise.all(ops);
  assert("all 3 ops resolved", results.every(r => r && r.type === "TEXT"));
  assert("all 3 ids are distinct", new Set(results.map(r => r.id)).size === 3);
}

// ── TEST 11: response goes to correct session even if other tab polls ─────
console.log("\n# Response settle — correct session regardless of poll order");
{
  const pA = simulatePoll(PORT, "tab-A", "A");
  const pB = simulatePoll(PORT, "tab-B", "B");
  await sleep(50);

  const opA = bridge.sendOperation("query", { name: "Card" }, "tab-A");
  const opB = bridge.sendOperation("query", { name: "Button" }, "tab-B");

  const [resA, resB] = await Promise.all([pA, pB]);
  const reqA = resA && resA.requests && resA.requests[0];
  const reqB = resB && resB.requests && resB.requests[0];

  assert("tab-A got query for Card", reqA && reqA.params && reqA.params.name === "Card");
  assert("tab-B got query for Button", reqB && reqB.params && reqB.params.name === "Button");

  // Respond in reverse order (B before A) — should still settle correctly
  await simulateResponse(PORT, reqB.id, [{ id: "b:1", name: "Button" }]);
  await simulateResponse(PORT, reqA.id, [{ id: "a:1", name: "Card" }]);

  const [rA, rB] = await Promise.all([opA, opB]);
  assert("opA resolved with Card result", Array.isArray(rA) && rA[0] && rA[0].name === "Card");
  assert("opB resolved with Button result", Array.isArray(rB) && rB[0] && rB[0].name === "Button");
}

// ── Teardown ────────────────────────────────────────────────────────────────
bridge.stop();

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
