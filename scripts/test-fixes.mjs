#!/usr/bin/env node
// Unit tests for feedback.md bug fixes (no live Figma needed)
import { executeCode } from "../server/code-executor.js";

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log("  ✓", label);
    passed++;
  } else {
    console.error("  ✗", label, detail ? `— ${detail}` : "");
    failed++;
  }
}

function makeBridge(overrides = {}) {
  return {
    sendOperation: async (op, params) => {
      if (overrides[op]) return overrides[op](params);
      throw new Error(`Unexpected op: ${op}`);
    }
  };
}

// ── Bug 1 (v2.5.0): get_page_nodes() returns array ──────────────────────────
console.log("\nBug 1: get_page_nodes() returns array");
{
  const bridge = makeBridge({
    get_page_nodes: () => ({ page: "Page 1", nodes: [{ id: "1:1", name: "Frame A" }, { id: "1:2", name: "Frame B" }] })
  });
  const r = await executeCode(`
    var nodes = await figma.get_page_nodes();
    return { isArray: Array.isArray(nodes), length: nodes.length, first: nodes[0].name };
  `, bridge);
  assert("returns Array", r.success && r.result.isArray === true, JSON.stringify(r));
  assert("has correct length", r.success && r.result.length === 2);
  assert("first element accessible", r.success && r.result.first === "Frame A");
}
{
  const bridge = makeBridge({ get_page_nodes: () => [{ id: "1:1", name: "Frame A" }] });
  const r = await executeCode(`var nodes = await figma.get_page_nodes(); return Array.isArray(nodes) && nodes.length;`, bridge);
  assert("handles raw array from bridge", r.success && r.result === 1);
}
{
  const bridge = makeBridge({ get_page_nodes: () => ({ page: "P", nodes: [] }) });
  const r = await executeCode(`var nodes = await figma.get_page_nodes(); return nodes.length;`, bridge);
  assert("empty nodes returns length 0", r.success && r.result === 0);
}

// ── Bug 2 (v2.5.0): batch delete ─────────────────────────────────────────────
console.log("\nBug 2: figma.delete({ ids: [...] }) batch delete");
{
  const bridge = makeBridge({
    delete: (p) => ({ deleted: true, count: p.ids.length, results: p.ids.map(id => ({ deleted: true, id })) })
  });
  const r = await executeCode(`return await figma.delete({ ids: ["1:1", "1:2", "1:3"] });`, bridge);
  assert("batch delete succeeds", r.success, JSON.stringify(r.error));
  assert("returns count=3", r.success && r.result.count === 3);
  assert("returns results array", r.success && Array.isArray(r.result.results));
}

// ── Bug 5 (v2.5.0): ReferenceError sandbox hint ───────────────────────────────
console.log("\nBug 5: ReferenceError gets sandbox isolation hint");
{
  const r = await executeCode(`return te.id;`, makeBridge({}));
  assert("fails with error", !r.success);
  assert("contains sandbox note", r.error && r.error.includes("isolated sandbox"), r.error);
  assert("mentions get_page_nodes", r.error && r.error.includes("get_page_nodes"), r.error);
}
{
  const r = await executeCode(`throw new Error("regular error");`, makeBridge({}));
  assert("non-ReferenceError has no sandbox note", !r.success && !r.error.includes("isolated sandbox"));
}

// ── BUG-01 (v2.5.1): invalid parentId throws instead of silent root placement ─
console.log("\nBUG-01: invalid parentId throws descriptive error");
{
  const bridge = makeBridge({
    create: (p) => {
      // Simulate the full plugin error message (matches handlers-write.js BUG-01 fix)
      if (p.parentId === "9:999") throw new Error(
        'parentId "9:999" not found in the current scene. ' +
        'If you just created the parent in a previous figma_write call, re-query its ID with ' +
        'figma.get_page_nodes() or figma.query() at the start of this call.'
      );
      return { id: "1:10", name: p.name, type: p.type };
    }
  });
  const r = await executeCode(`return await figma.create({ type: "FRAME", name: "test", parentId: "9:999" });`, bridge);
  assert("throws when parentId invalid", !r.success);
  assert("error mentions parentId", r.error && r.error.includes("9:999"), r.error);
  assert("error mentions get_page_nodes", r.error && r.error.includes("get_page_nodes"), r.error);
}
{
  // Valid parentId should still work
  const bridge = makeBridge({
    create: (p) => ({ id: "1:11", name: p.name, type: p.type, parentId: p.parentId })
  });
  const r = await executeCode(`return await figma.create({ type: "RECTANGLE", name: "child", parentId: "1:5" });`, bridge);
  assert("valid parentId still works", r.success, JSON.stringify(r.error));
}

// ── SUGGEST-04 (v2.5.1): instantiate with overrides ──────────────────────────
console.log("\nSUGGEST-04: figma.instantiate() with overrides");
{
  let capturedParams = null;
  const bridge = makeBridge({
    instantiate: (p) => {
      capturedParams = p;
      return { id: "2:1", name: p.componentName || "inst", type: "INSTANCE" };
    }
  });
  const r = await executeCode(`
    return await figma.instantiate({
      componentName: "btn/primary",
      parentId: "1:1",
      x: 20, y: 40,
      overrides: {
        "Label": { text: "Sign Up", fill: "#FFFFFF" },
        "Background": { fill: "#6C5CE7", cornerRadius: 8 }
      }
    });
  `, bridge);
  assert("instantiate with overrides succeeds", r.success, JSON.stringify(r.error));
  assert("overrides param passed through", capturedParams && capturedParams.overrides !== undefined);
  assert("text override present", capturedParams && capturedParams.overrides["Label"] && capturedParams.overrides["Label"].text === "Sign Up");
  assert("fill override present", capturedParams && capturedParams.overrides["Background"] && capturedParams.overrides["Background"].fill === "#6C5CE7");
}

// ── applyVariable extended fields (v2.5.1) ───────────────────────────────────
console.log("\napplyVariable: extended field support");
{
  const bridge = makeBridge({
    applyVariable: (p) => ({ nodeId: p.nodeId, field: p.field, variableId: p.variableId || "v:1" })
  });
  const fields = ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "itemSpacing", "fontSize", "strokeWeight", "visible", "cornerRadius", "width", "height"];
  for (const field of fields) {
    const r = await executeCode(`
      return await figma.applyVariable({ nodeId: "1:1", field: "${field}", variableName: "my-var" });
    `, bridge);
    assert(`applyVariable field="${field}" accepted`, r.success, r.error);
  }
}

// ── batch() supports delete operation (SUGGEST-01) ───────────────────────────
console.log("\nSUGGEST-01: batch() supports delete operation");
{
  const ops = [];
  const bridge = makeBridge({
    batch: (p) => {
      // Mirror what the plugin batch handler does
      const results = (Array.isArray(p) ? p : p.operations).map((op, i) => ({
        index: i, operation: op.operation, success: true, data: { deleted: true, id: op.params.id }
      }));
      return { results, total: results.length, succeeded: results.length };
    }
  });
  const r = await executeCode(`
    return await figma.batch([
      { operation: "delete", params: { id: "1:1" } },
      { operation: "delete", params: { id: "1:2" } },
      { operation: "delete", params: { id: "1:3" } }
    ]);
  `, bridge);
  assert("batch with delete ops succeeds", r.success, JSON.stringify(r.error));
  assert("batch returns 3 results", r.success && r.result.total === 3);
  assert("all succeeded", r.success && r.result.succeeded === 3);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
