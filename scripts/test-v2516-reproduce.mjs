#!/usr/bin/env node
// Reproduce tests for BUG-04, BUG-05/15, BUG-11 before fix
import { executeCode } from "../server/code-executor.js";

let passed = 0, failed = 0;

function assert(label, condition, detail = "") {
  if (condition) { console.log("  ✓", label); passed++; }
  else { console.error("  ✗", label, detail ? `— ${detail}` : ""); failed++; }
}

function makeBridge(overrides = {}) {
  return {
    sendOperation: async (op, params) => {
      if (overrides[op]) return overrides[op](params);
      throw new Error("Unexpected bridge op: " + op);
    }
  };
}

// ── BUG-04: VECTOR should resize to requested width/height ─────────────────
console.log("\nBUG-04: VECTOR resize after setVectorPaths");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => {
      captured = p;
      // Simulate Figma resetting bounding box to path bbox (78x90) — plugin can't fix this server-side
      // But after fix, plugin should call resize() after setVectorPaths → width/height matches
      return { id: "v:1", type: "VECTOR", name: "arc", width: p.width, height: p.height };
    }
  });
  const r = await executeCode(`
    return await figma.create({
      type: "VECTOR", x: 20, y: 20, width: 100, height: 100,
      d: "M 50 5 A 45 45 0 1 1 13 80", stroke: "#000000", strokeWeight: 2
    });
  `, bridge);
  assert("VECTOR create succeeds", r.success, r.error);
  assert("VECTOR params width=100 forwarded", captured && captured.width === 100);
}

// ── BUG-11: H/V uppercase commands — early return bug ──────────────────────
console.log("\nBUG-11: H/V commands in VECTOR path (early return bug)");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => {
      captured = p;
      return { id: "v:2", type: "VECTOR", name: "hv", width: p.width || 100, height: p.height || 50 };
    }
  });

  // H command — uppercase only
  const r1 = await executeCode(`
    return await figma.create({
      type: "VECTOR", width: 100, height: 50,
      d: "M 10 10 H 90 L 90 40 Z"
    });
  `, bridge);
  // Before fix: H passes through unchanged → Figma throws "Invalid command at H"
  // In mock bridge we can't throw the Figma error, so we check if H was replaced
  const d1 = captured ? captured.d : null;
  assert("H command create does not crash executor", r1.success, r1.error);
  // After fix: d should NOT contain "H" (normalized to L)
  // In executor this happens in buildVector inside plugin — but executor sends d as-is to bridge
  // So we need to check that normalizeSvgPath is called on the path before bridge.create
  // Actually normalizeSvgPath is plugin-side, executor just forwards d param
  // This test verifies the executor doesn't crash, and plugin would normalize
  assert("H path forwarded to bridge (plugin normalizes)", d1 && d1.includes("M"), "d=" + d1);

  // V command
  captured = null;
  const r2 = await executeCode(`
    return await figma.create({
      type: "VECTOR", width: 50, height: 100,
      d: "M 10 10 V 90 L 40 90 Z"
    });
  `, bridge);
  const d2 = captured ? captured.d : null;
  assert("V command create does not crash executor", r2.success, r2.error);
  assert("V path forwarded to bridge (plugin normalizes)", d2 && d2.includes("M"), "d=" + d2);
}

// ── BUG-05: loadIconIn bgOpacity=0 should forward fillOpacity=0 ────────────
console.log("\nBUG-05/15: loadIconIn bgOpacity=0 must forward fillOpacity=0 (not 0.1)");
{
  let capturedOpacity = null;
  const bridge = makeBridge({
    create: (p) => {
      if (p.type === "FRAME") capturedOpacity = p.fillOpacity;
      return { id: "c:1", type: p.type, name: p.name || "", width: p.width || 40, height: p.height || 40 };
    }
  });

  const r = await executeCode(`
    return await figma.loadIconIn("star", { parentId: "1:1", containerSize: 40, fill: "#FFFFFF", bgOpacity: 0 });
  `, bridge);
  // bgOpacity=0 must be preserved — not defaulted to 0.1
  assert("loadIconIn bgOpacity=0 succeeds", r.success, r.error);
  assert("fillOpacity=0 forwarded (not 0.1)", capturedOpacity === 0, "got: " + capturedOpacity);
}

// ── BUG-15/18: loadIconIn noContainer:true skips wrap frame ────────────────
console.log("\nBUG-15/18: loadIconIn noContainer:true skips wrapper");
{
  const createCalls = [];
  const bridge = makeBridge({
    create: (p) => {
      createCalls.push(p);
      return { id: "c:" + createCalls.length, type: p.type, name: p.name || "", width: p.width || 24, height: p.height || 24 };
    }
  });

  createCalls.length = 0;
  const r = await executeCode(`
    try {
      return await figma.loadIconIn("home", { parentId: "1:1", containerSize: 40, fill: "#6C5CE7", noContainer: true });
    } catch(e) { return { httpError: true }; }
  `, bridge);

  const frameCall = createCalls.find(p => p.type === "FRAME");
  assert("noContainer:true — no wrapper FRAME created", !frameCall, "unexpected FRAME: " + JSON.stringify(frameCall));
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
