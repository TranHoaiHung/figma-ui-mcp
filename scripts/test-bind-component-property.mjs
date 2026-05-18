#!/usr/bin/env node
// Tests for bindComponentProperty + unbindComponentProperty (v2.5.22 follow-up)
// Layer A: mock-bridge proxy forwarding
// Layer B: plugin-side logic with mocked Figma globals
import { executeCode } from "../server/code-executor.js";
import { readFileSync } from "fs";
import vm from "node:vm";

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

// ════════════════════════════════════════════════════════════════
// Layer A: Executor proxy forwards bindComponentProperty / unbindComponentProperty
// ════════════════════════════════════════════════════════════════
console.log("\nLayer A: proxy forwarding");
{
  let bindCapture = null, unbindCapture = null;
  const bridge = makeBridge({
    bindComponentProperty: (p) => { bindCapture = p; return { nodeId: p.nodeId, boundField: p.field }; },
    unbindComponentProperty: (p) => { unbindCapture = p; return { nodeId: p.nodeId, unboundField: p.field }; },
  });

  const r1 = await executeCode(`
    return await figma.bindComponentProperty({ nodeId: "1:1", field: "visible", propertyName: "showIcon" });
  `, bridge);
  assert("bindComponentProperty proxy works", r1.success, r1.error);
  assert("bind params forwarded", bindCapture && bindCapture.nodeId === "1:1" && bindCapture.field === "visible");

  const r2 = await executeCode(`
    return await figma.unbindComponentProperty({ nodeId: "1:1", field: "visible" });
  `, bridge);
  assert("unbindComponentProperty proxy works", r2.success, r2.error);
  assert("unbind params forwarded", unbindCapture && unbindCapture.field === "visible");
}

// ════════════════════════════════════════════════════════════════
// Layer B: plugin-side logic with mocked Figma globals
// ════════════════════════════════════════════════════════════════
console.log("\nLayer B: bindComponentProperty (mocked Figma)");

// Build a minimal sandbox with the plugin handler code
function loadHandlers(mockFigma) {
  const src = readFileSync("src/plugin/handlers-tokens.js", "utf-8");
  const ctx = {
    figma: mockFigma,
    handlers: {},
    findNodeByIdAsync: async (id) => mockFigma._nodes[id] || null,
    hexToRgb: () => ({ r: 0, g: 0, b: 0 }),
    getStringVarValue: () => null,
    resolveRefOrLiteral: (x) => x,
    Promise, Object, Array, String, Number, JSON, parseInt, Error,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.handlers;
}

function buildComponent(id, name, defs = {}) {
  return {
    id, name, type: "COMPONENT",
    componentPropertyDefinitions: defs,
    addComponentProperty(n, t, d) { defs[n + "#1:1"] = { type: t, defaultValue: d }; return n + "#1:1"; },
    deleteComponentProperty(n) { delete defs[n]; },
  };
}

function buildNode(id, name, type, parent) {
  var node = { id, name, type, parent, componentPropertyReferences: null };
  return node;
}

// — visible (BOOLEAN) on FRAME inside component —
{
  const defs = { "showIcon#1:2": { type: "BOOLEAN", defaultValue: true } };
  const owner = buildComponent("c:1", "Card", defs);
  const target = buildNode("n:1", "icon", "FRAME", owner);
  const mockFigma = { _nodes: { "n:1": target, "c:1": owner } };
  const h = loadHandlers(mockFigma);

  const r = await h.bindComponentProperty({ nodeId: "n:1", field: "visible", propertyName: "showIcon" });
  assert("visible binding succeeds", r.boundField === "visible");
  assert("propertyName resolved to fully-qualified", r.propertyName === "showIcon#1:2");
  assert("componentPropertyReferences.visible set", target.componentPropertyReferences && target.componentPropertyReferences.visible === "showIcon#1:2");
}

// — mainComponent (INSTANCE_SWAP) on INSTANCE node —
{
  const defs = { "iconType#1:3": { type: "INSTANCE_SWAP", defaultValue: "abc" } };
  const owner = buildComponent("c:2", "Btn", defs);
  const target = buildNode("n:2", "icon-slot", "INSTANCE", owner);
  const mockFigma = { _nodes: { "n:2": target, "c:2": owner } };
  const h = loadHandlers(mockFigma);

  const r = await h.bindComponentProperty({ nodeId: "n:2", field: "mainComponent", propertyName: "iconType" });
  assert("mainComponent binding succeeds", r.boundField === "mainComponent");
  assert("mainComponent ref set", target.componentPropertyReferences.mainComponent === "iconType#1:3");
}

// — characters (TEXT) on TEXT node — should work like the existing handler —
{
  const defs = { "label#1:4": { type: "TEXT", defaultValue: "Click" } };
  const owner = buildComponent("c:3", "Btn", defs);
  const target = buildNode("n:3", "lbl", "TEXT", owner);
  const mockFigma = { _nodes: { "n:3": target, "c:3": owner } };
  const h = loadHandlers(mockFigma);

  const r = await h.bindComponentProperty({ nodeId: "n:3", field: "characters", propertyName: "label" });
  assert("characters binding succeeds", r.boundField === "characters");
  assert("characters ref set", target.componentPropertyReferences.characters === "label#1:4");
}

// — existing references preserved —
{
  const defs = {
    "showIcon#1:5": { type: "BOOLEAN", defaultValue: true },
    "label#1:6": { type: "TEXT", defaultValue: "x" },
  };
  const owner = buildComponent("c:4", "C", defs);
  const target = buildNode("n:4", "t", "TEXT", owner);
  target.componentPropertyReferences = { characters: "label#1:6" };
  const mockFigma = { _nodes: { "n:4": target, "c:4": owner } };
  const h = loadHandlers(mockFigma);

  await h.bindComponentProperty({ nodeId: "n:4", field: "visible", propertyName: "showIcon" });
  assert("existing .characters preserved", target.componentPropertyReferences.characters === "label#1:6");
  assert("new .visible added", target.componentPropertyReferences.visible === "showIcon#1:5");
}

// — type mismatch rejected —
{
  const defs = { "label#1:7": { type: "TEXT", defaultValue: "x" } };
  const owner = buildComponent("c:5", "C", defs);
  const target = buildNode("n:5", "icon", "FRAME", owner);
  const mockFigma = { _nodes: { "n:5": target, "c:5": owner } };
  const h = loadHandlers(mockFigma);

  let err = null;
  try { await h.bindComponentProperty({ nodeId: "n:5", field: "visible", propertyName: "label" }); }
  catch (e) { err = e; }
  assert("type mismatch rejected", err && err.message.indexOf("not BOOLEAN") !== -1, err && err.message);
}

// — wrong field name rejected —
{
  const h = loadHandlers({ _nodes: {} });
  let err = null;
  try { await h.bindComponentProperty({ nodeId: "x", field: "fill", propertyName: "y" }); }
  catch (e) { err = e; }
  assert("unknown field rejected", err && err.message.indexOf("field must be one of") !== -1, err && err.message);
}

// — characters on non-TEXT rejected —
{
  const defs = { "label#1:8": { type: "TEXT", defaultValue: "x" } };
  const owner = buildComponent("c:6", "C", defs);
  const target = buildNode("n:6", "f", "FRAME", owner);
  const mockFigma = { _nodes: { "n:6": target, "c:6": owner } };
  const h = loadHandlers(mockFigma);

  let err = null;
  try { await h.bindComponentProperty({ nodeId: "n:6", field: "characters", propertyName: "label" }); }
  catch (e) { err = e; }
  assert("characters on FRAME rejected", err && err.message.indexOf("TEXT node") !== -1, err && err.message);
}

// — mainComponent on non-INSTANCE rejected —
{
  const defs = { "icon#1:9": { type: "INSTANCE_SWAP", defaultValue: "x" } };
  const owner = buildComponent("c:7", "C", defs);
  const target = buildNode("n:7", "f", "FRAME", owner);
  const mockFigma = { _nodes: { "n:7": target, "c:7": owner } };
  const h = loadHandlers(mockFigma);

  let err = null;
  try { await h.bindComponentProperty({ nodeId: "n:7", field: "mainComponent", propertyName: "icon" }); }
  catch (e) { err = e; }
  assert("mainComponent on FRAME rejected", err && err.message.indexOf("INSTANCE node") !== -1, err && err.message);
}

console.log("\nLayer B: unbindComponentProperty");

// — unbind clears single field, preserves others —
{
  const target = buildNode("n:8", "t", "TEXT");
  target.componentPropertyReferences = { characters: "label#1", visible: "show#1" };
  const mockFigma = { _nodes: { "n:8": target } };
  const h = loadHandlers(mockFigma);

  const r = await h.unbindComponentProperty({ nodeId: "n:8", field: "visible" });
  assert("unbind .visible succeeds", r.unboundField === "visible" && !r.wasNoOp);
  assert(".characters preserved", target.componentPropertyReferences.characters === "label#1");
  assert(".visible cleared", !target.componentPropertyReferences.visible);
}

// — unbind last field clears to empty object (Figma rejects null) —
{
  const target = buildNode("n:9", "t", "TEXT");
  target.componentPropertyReferences = { characters: "label#1" };
  const mockFigma = { _nodes: { "n:9": target } };
  const h = loadHandlers(mockFigma);

  await h.unbindComponentProperty({ nodeId: "n:9", field: "characters" });
  assert("last field cleared → refs is empty object",
    target.componentPropertyReferences !== null &&
    Object.keys(target.componentPropertyReferences).length === 0);
}

// — unbind when nothing bound is a no-op —
{
  const target = buildNode("n:10", "t", "TEXT");
  const mockFigma = { _nodes: { "n:10": target } };
  const h = loadHandlers(mockFigma);

  const r = await h.unbindComponentProperty({ nodeId: "n:10", field: "visible" });
  assert("unbind nothing → wasNoOp:true", r.wasNoOp === true);
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
