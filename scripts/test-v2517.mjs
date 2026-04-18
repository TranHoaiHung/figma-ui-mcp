#!/usr/bin/env node
// Tests for v2.5.17 fixes: BUG-04 (VECTOR resize) + BUG-11 (H/V path normalization)
// Run: node scripts/test-v2517.mjs
import { executeCode } from "../server/code-executor.js";
import { readFileSync } from "fs";

let passed = 0, failed = 0;

function assert(label, condition, detail = "") {
  if (condition) { console.log("  ✓", label); passed++; }
  else { console.error("  ✗", label, detail ? `— ${detail}` : ""); failed++; }
}

function makeBridge(overrides = {}) {
  return { sendOperation: async (op, params) => {
    if (overrides[op]) return overrides[op](params);
    throw new Error("Unexpected bridge op: " + op);
  }};
}

// ── Load normalizeSvgPath from source for direct testing ───────────────────
const src = readFileSync("src/plugin/svg-path-helpers.js", "utf-8");
const { normalizeSvgPath } = new Function("return (function() {\n" + src + "\nreturn { normalizeSvgPath };\n})()")();

// ── BUG-11: H/V uppercase normalization ───────────────────────────────────
console.log("\nBUG-11: H command → L (uppercase)");
{
  const d = normalizeSvgPath("M 10 10 H 90 L 90 40 Z");
  assert("H removed from output", !d.includes("H"), d);
  assert("H replaced with L 90 10", d.includes("L 90 10"), d);
}

console.log("\nBUG-11: V command → L (uppercase)");
{
  const d = normalizeSvgPath("M 10 10 V 90 L 40 90 Z");
  assert("V removed from output", !d.includes("V"), d);
  assert("V replaced with L 10 90", d.includes("L 10 90"), d);
}

console.log("\nBUG-11: Mixed H+V uppercase");
{
  const d = normalizeSvgPath("M 0 0 H 100 V 50 Z");
  assert("H+V both removed", !d.includes("H") && !d.includes(" V"), d);
  assert("H→L 100 0", d.includes("L 100 0"), d);
  assert("V→L 100 50", d.includes("L 100 50"), d);
}

console.log("\nBUG-11: Lowercase h/v (regression)");
{
  const d = normalizeSvgPath("M 10 10 h 80 v 30 z");
  assert("h removed", !d.includes("h"), d);
  assert("v removed", !/[^A-Z] v /.test(d), d);
  assert("h→absolute L 90 10", d.includes("L 90 10"), d);
  assert("v→absolute L 90 40", d.includes("L 90 40"), d);
}

console.log("\nBUG-11: A arc command regression (must still work)");
{
  const d = normalizeSvgPath("M 50 5 A 45 45 0 1 1 13 80");
  assert("A converted to C curves", d.includes("C ") && !d.includes(" A "), d.substring(0, 60));
}

console.log("\nBUG-11: Pure L/M path — no unnecessary processing");
{
  const input = "M 10 10 L 90 10 L 90 90 Z";
  const d = normalizeSvgPath(input);
  assert("L/M passthrough unchanged", d.includes("L 90 10"), "got: " + d);
}

// ── BUG-04: VECTOR resize forwarded after setVectorPaths ──────────────────
console.log("\nBUG-04: VECTOR width/height forwarded to bridge");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "v:1", type: "VECTOR", name: "arc", width: p.width, height: p.height }; }
  });
  const r = await executeCode(`
    return await figma.create({ type: "VECTOR", x: 20, y: 20, width: 100, height: 100,
      d: "M 50 5 A 45 45 0 1 1 13 80", stroke: "#000000", strokeWeight: 2 });
  `, bridge);
  assert("VECTOR create succeeds", r.success, r.error);
  assert("width=100 forwarded", captured && captured.width === 100);
  assert("height=100 forwarded", captured && captured.height === 100);
  assert("result width=100", r.success && r.result && r.result.width === 100);
}

console.log("\nBUG-04: VECTOR with paths array");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "v:2", type: "VECTOR", name: "shape", width: p.width, height: p.height }; }
  });
  const r = await executeCode(`
    return await figma.create({ type: "VECTOR", width: 80, height: 60,
      paths: [{ d: "M 0 0 L 80 0 L 80 60 Z", windingRule: "NONZERO" }], fill: "#6C5CE7" });
  `, bridge);
  assert("VECTOR paths array succeeds", r.success, r.error);
  assert("width=80 forwarded", captured && captured.width === 80);
  assert("height=60 forwarded", captured && captured.height === 60);
}

// ── BUG-05: loadIconIn bgOpacity=0 respected ─────────────────────────────
console.log("\nBUG-05: loadIconIn bgOpacity=0 forwarded (not 0.1)");
{
  let capturedOpacity = null;
  const bridge = makeBridge({
    create: (p) => {
      if (p.type === "FRAME") capturedOpacity = p.fillOpacity;
      return { id: "c:1", type: p.type, name: p.name || "", width: p.width || 40, height: p.height || 40 };
    }
  });
  const r = await executeCode(`
    return await figma.loadIconIn("star", { parentId: "1:1", containerSize: 40, fill: "#FFF", bgOpacity: 0 });
  `, bridge);
  assert("bgOpacity=0 succeeds", r.success, r.error);
  assert("fillOpacity=0 forwarded", capturedOpacity === 0, "got: " + capturedOpacity);
}

// ── BUG-15: loadIconIn noContainer:true ───────────────────────────────────
console.log("\nBUG-15: loadIconIn noContainer:true — no wrapper FRAME");
{
  const createCalls = [];
  const bridge = makeBridge({
    create: (p) => { createCalls.push(p); return { id: "c:" + createCalls.length, type: p.type, name: p.name || "", width: p.width || 24, height: p.height || 24 }; }
  });
  await executeCode(`
    try { await figma.loadIconIn("home", { parentId: "1:1", containerSize: 40, fill: "#6C5CE7", noContainer: true }); }
    catch(e) {}
  `, bridge);
  const frameCall = createCalls.find(p => p.type === "FRAME");
  assert("no wrapper FRAME created", !frameCall, "unexpected FRAME: " + JSON.stringify(frameCall));
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
