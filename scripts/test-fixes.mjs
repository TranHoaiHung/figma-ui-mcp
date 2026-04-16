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

// ── Mock bridge ───────────────────────────────────────────────────────────────
function makeBridge(overrides = {}) {
  return {
    sendOperation: async (op, params) => {
      if (overrides[op]) return overrides[op](params);
      throw new Error(`Unexpected op: ${op}`);
    }
  };
}

// ── Bug 1: get_page_nodes() returns array ────────────────────────────────────
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

// Bug 1b: works when plugin already returns array (future-proof)
{
  const bridge = makeBridge({
    get_page_nodes: () => [{ id: "1:1", name: "Frame A" }]
  });
  const r = await executeCode(`
    var nodes = await figma.get_page_nodes();
    return Array.isArray(nodes) && nodes.length;
  `, bridge);
  assert("handles raw array from bridge", r.success && r.result === 1);
}

// Bug 1c: empty nodes returns []
{
  const bridge = makeBridge({
    get_page_nodes: () => ({ page: "Page 1", nodes: [] })
  });
  const r = await executeCode(`
    var nodes = await figma.get_page_nodes();
    return nodes.length;
  `, bridge);
  assert("empty nodes returns length 0", r.success && r.result === 0);
}

// ── Bug 2: batch delete ───────────────────────────────────────────────────────
console.log("\nBug 2: figma.delete({ ids: [...] }) batch delete");
{
  // Simulate batch delete: check delete op receives ids array
  let receivedParams = null;
  const bridge = makeBridge({
    delete: (params) => {
      receivedParams = params;
      return { deleted: true, count: params.ids.length, results: params.ids.map(id => ({ deleted: true, id })) };
    }
  });
  const r = await executeCode(`
    var result = await figma.delete({ ids: ["1:1", "1:2", "1:3"] });
    return result;
  `, bridge);
  assert("batch delete call succeeds", r.success, JSON.stringify(r.error));
  assert("returns count", r.success && r.result.count === 3);
  assert("returns results array", r.success && Array.isArray(r.result.results));
}

// ── Bug 5: ReferenceError gets sandbox hint ───────────────────────────────────
console.log("\nBug 5: ReferenceError in sandbox gets isolation hint");
{
  const bridge = makeBridge({});
  const r = await executeCode(`
    // te is not defined — simulates using var from prior call
    return te.id;
  `, bridge);
  assert("fails with error", !r.success);
  assert("error message contains sandbox note",
    r.error && r.error.includes("isolated sandbox"),
    r.error
  );
  assert("error message mentions get_page_nodes",
    r.error && r.error.includes("get_page_nodes"),
    r.error
  );
}

// Bug 5b: non-ReferenceError does NOT get sandbox hint
{
  const bridge = makeBridge({});
  const r = await executeCode(`
    throw new Error("regular error");
  `, bridge);
  assert("non-ReferenceError has no sandbox note",
    !r.success && !r.error.includes("isolated sandbox")
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
