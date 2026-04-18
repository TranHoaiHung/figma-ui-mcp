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

console.log("\nBUG-09: figma.getChildren(nodeId)");
{
  const bridge = makeBridge({
    get_node_detail: (p) => ({
      id: p.id, type: "FRAME", name: "card",
      children: [{ id: "2:1", type: "TEXT", name: "title" }, { id: "2:2", type: "RECTANGLE", name: "bg" }]
    })
  });
  const r = await executeCode(`
    var children = await figma.getChildren("1:1");
    return { count: children.length, first: children[0] };
  `, bridge);
  assert("getChildren does not throw", r.success, r.error);
  assert("returns 2 children", r.success && r.result.count === 2);
  assert("first child id=2:1", r.success && r.result.first && r.result.first.id === "2:1");
}

console.log("\nBUG-09: getChildren with no children field");
{
  const bridge = makeBridge({ get_node_detail: () => ({ id: "1:1", type: "TEXT" }) });
  const r = await executeCode(`
    var ch = await figma.getChildren("1:1");
    return { isArray: Array.isArray(ch), len: ch.length };
  `, bridge);
  assert("returns empty array", r.success && r.result.isArray && r.result.len === 0, r.error);
}

console.log("\nBUG-09: getChildren → loop → modify");
{
  const modifyCalls = [];
  const bridge = makeBridge({
    get_node_detail: () => ({ id: "1:1", children: [{ id: "2:1" }, { id: "2:2" }] }),
    modify: (p) => { modifyCalls.push(p); return { id: p.id }; }
  });
  const r = await executeCode(`
    var children = await figma.getChildren("1:1");
    for (var i = 0; i < children.length; i++) {
      await figma.modify({ id: children[i].id, visible: false });
    }
    return { modified: children.length };
  `, bridge);
  assert("loop + modify succeeds", r.success, r.error);
  assert("2 children modified", modifyCalls.length === 2);
  assert("correct ids", modifyCalls[0].id === "2:1" && modifyCalls[1].id === "2:2");
}

console.log("\nBUG-10: figma.getNode(id)");
{
  const bridge = makeBridge({
    get_node_detail: (p) => ({ id: p.id, type: "FRAME", width: 375, height: 200 })
  });
  const r = await executeCode(`
    var node = await figma.getNode("5:10");
    return { id: node.id, width: node.width };
  `, bridge);
  assert("getNode does not throw", r.success, r.error);
  assert("returns id=5:10", r.success && r.result.id === "5:10");
  assert("returns width=375", r.success && r.result.width === 375);
}

console.log("\nRegression: figma.getNodeById still works");
{
  const bridge = makeBridge({ get_node_detail: (p) => ({ id: p.id, type: "RECTANGLE" }) });
  const r = await executeCode(`return (await figma.getNodeById("3:3")).id;`, bridge);
  assert("getNodeById still works", r.success && r.result === "3:3", r.error);
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
