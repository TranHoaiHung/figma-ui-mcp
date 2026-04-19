#!/usr/bin/env node
// Tests for v2.5.19: BUG-13 (FRAME auto-sizing), BUG-16 (search_nodes text),
//                    BUG-17 (strokeDashPattern), BUG-18/19 (strokeColor alias)
// Run: node scripts/test-v2519.mjs
import { executeCode } from "../server/code-executor.js";

let passed = 0, failed = 0;
function assert(label, condition, detail = "") {
  if (condition) { console.log("  ✓", label); passed++; }
  else { console.error("  ✗", label, detail ? `— ${detail}` : ""); failed++; }
}
function makeBridge(overrides = {}) {
  return { sendOperation: async (op, params) => {
    if (overrides[op]) return overrides[op](params);
    throw new Error("Unexpected op: " + op);
  }};
}

// ── BUG-18: strokeColor alias on create ───────────────────────────────────
console.log("\nBUG-18: strokeColor alias — create FRAME");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "f:1", type: "FRAME", name: "box", width: p.width, height: p.height }; }
  });
  const r = await executeCode(`
    return await figma.create({
      type: "FRAME", width: 28, height: 28,
      fill: "#FFFFFF", strokeColor: "#D6E8FF", strokeWeight: 2, cornerRadius: 10
    });
  `, bridge);
  assert("FRAME with strokeColor succeeds", r.success, r.error);
  assert("strokeColor forwarded as stroke", captured && (captured.stroke === "#D6E8FF" || captured.strokeColor === "#D6E8FF"),
    "stroke=" + (captured && captured.stroke) + " strokeColor=" + (captured && captured.strokeColor));
}

// ── BUG-18: strokeColor alias on create ELLIPSE ───────────────────────────
console.log("\nBUG-18/19: strokeColor alias — create ELLIPSE with fillOpacity:0");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "e:1", type: "ELLIPSE", name: "ring", width: p.width, height: p.height }; }
  });
  const r = await executeCode(`
    return await figma.create({
      type: "ELLIPSE", x: 66, y: 50, width: 220, height: 220,
      fillOpacity: 0, strokeColor: "#D6E8FF", strokeWeight: 16
    });
  `, bridge);
  assert("ELLIPSE with fillOpacity:0 + strokeColor succeeds", r.success, r.error);
  assert("strokeColor forwarded", captured && (captured.stroke === "#D6E8FF" || captured.strokeColor === "#D6E8FF"));
  assert("strokeWeight=16 forwarded", captured && captured.strokeWeight === 16);
}

// ── BUG-18: strokeColor alias on modify ───────────────────────────────────
console.log("\nBUG-18: strokeColor alias — modify");
{
  let modifyCapture = null;
  const bridge = makeBridge({
    modify: (p) => { modifyCapture = p; return { id: p.id }; }
  });
  const r = await executeCode(`
    return await figma.modify({ id: "1:1", strokeColor: "#D6E8FF", strokeWeight: 2 });
  `, bridge);
  assert("modify with strokeColor succeeds", r.success, r.error);
  assert("strokeColor in modify params", modifyCapture && (modifyCapture.strokeColor === "#D6E8FF" || modifyCapture.stroke === "#D6E8FF"));
}

// ── BUG-17: strokeDashPattern forwarded ──────────────────────────────────
console.log("\nBUG-17: strokeDashPattern forwarded on create");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "f:2", type: "FRAME", name: "dashed" }; }
  });
  const r = await executeCode(`
    return await figma.create({
      type: "FRAME", width: 353, height: 48,
      fill: "#EEF5FF", cornerRadius: 16,
      stroke: "#D6E8FF", strokeWeight: 1,
      strokeDashPattern: [6, 4]
    });
  `, bridge);
  assert("FRAME with strokeDashPattern succeeds", r.success, r.error);
  assert("strokeDashPattern forwarded", captured && Array.isArray(captured.strokeDashPattern) &&
    captured.strokeDashPattern[0] === 6 && captured.strokeDashPattern[1] === 4,
    "got: " + JSON.stringify(captured && captured.strokeDashPattern));
}

// ── BUG-13: FRAME + layoutMode without explicit width/height ──────────────
console.log("\nBUG-13: FRAME with layoutMode, no explicit size → hasExplicitWidth/Height tracked");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "f:3", type: "FRAME", name: "body", width: p.width || 100, height: p.height || 100 }; }
  });
  // No explicit width/height — bridge receives 100×100 (default), but plugin sets AUTO sizing
  // We verify the executor forwards the params correctly (auto-sizing happens in plugin sandbox)
  const r = await executeCode(`
    return await figma.create({
      type: "FRAME", parentId: "1:1",
      fillOpacity: 0, layoutMode: "VERTICAL",
      primaryAxisAlignItems: "MIN", counterAxisAlignItems: "MIN",
      itemSpacing: 3, layoutGrow: 1
    });
  `, bridge);
  // In mock bridge, can't test Figma's AUTO sizing — but verify it doesn't crash
  // and that layoutMode is forwarded
  assert("FRAME without explicit size succeeds", r.success, r.error);
  assert("layoutMode forwarded", captured && captured.layoutMode === "VERTICAL");
  assert("layoutGrow forwarded", captured && captured.layoutGrow === 1);
}

// ── BUG-13: FRAME with explicit size — no regression ──────────────────────
console.log("\nBUG-13 regression: FRAME with explicit width/height unaffected");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "f:4", type: "FRAME", name: "card", width: p.width, height: p.height }; }
  });
  const r = await executeCode(`
    return await figma.create({
      type: "FRAME", width: 353, height: 72, fill: "#FFF", cornerRadius: 20,
      layoutMode: "HORIZONTAL", primaryAxisAlignItems: "MIN",
      counterAxisAlignItems: "CENTER", itemSpacing: 14,
      paddingLeft: 14, paddingRight: 14
    });
  `, bridge);
  assert("FRAME with explicit size succeeds", r.success, r.error);
  assert("width=353 preserved", captured && captured.width === 353, "got: " + (captured && captured.width));
  assert("height=72 preserved", captured && captured.height === 72, "got: " + (captured && captured.height));
  assert("result width=353", r.result && r.result.width === 353);
}

// ── BUG-16: search_nodes with text param ─────────────────────────────────
console.log("\nBUG-16: search_nodes text param forwarded to bridge");
{
  let captured = null;
  const bridge = makeBridge({
    search_nodes: (p) => { captured = p; return [{ id: "t:1", type: "TEXT", name: "label", content: "7 🔥" }]; }
  });
  const r = await executeCode(`
    return await figma.search_nodes({ type: "TEXT", text: "7 🔥" });
  `, bridge);
  assert("search_nodes with text param succeeds", r.success, r.error);
  assert("text param forwarded to bridge", captured && captured.text === "7 🔥", "got: " + JSON.stringify(captured));
  assert("results returned", r.success && Array.isArray(r.result) && r.result.length === 1);
}

// ── Regressions: stroke still works via `stroke` param ───────────────────
console.log("\nRegression: stroke param still works (not broken by alias)");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "r:1", type: "RECTANGLE", name: "rect" }; }
  });
  const r = await executeCode(`
    return await figma.create({
      type: "RECTANGLE", width: 100, height: 100,
      fill: "#FFF", stroke: "#6C5CE7", strokeWeight: 3
    });
  `, bridge);
  assert("stroke param still works", r.success, r.error);
  assert("stroke forwarded", captured && captured.stroke === "#6C5CE7");
}

// ── Regression: ELLIPSE with stroke (no strokeColor) ────────────────────
console.log("\nRegression: ELLIPSE with stroke param (not strokeColor)");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "e:2", type: "ELLIPSE", name: "ring" }; }
  });
  const r = await executeCode(`
    return await figma.create({
      type: "ELLIPSE", width: 100, height: 100,
      fill: "#00000000", stroke: "#428DE7", strokeWeight: 14
    });
  `, bridge);
  assert("ELLIPSE stroke param still works", r.success, r.error);
  assert("stroke forwarded", captured && captured.stroke === "#428DE7");
  assert("strokeWeight=14 forwarded", captured && captured.strokeWeight === 14);
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
