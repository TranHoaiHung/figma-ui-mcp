#!/usr/bin/env node
/**
 * Full regression test suite for figma-ui-mcp
 * Covers: all handlers, edge cases, new features in v2.5.x
 * No live Figma connection needed — uses mock bridge.
 */
import { executeCode } from "../server/code-executor.js";

let passed = 0;
let failed = 0;
const errors = [];

function assert(label, condition, detail = "") {
  if (condition) {
    console.log("  ✓", label);
    passed++;
  } else {
    const msg = `  ✗ ${label}${detail ? " — " + detail : ""}`;
    console.error(msg);
    errors.push(msg);
    failed++;
  }
}

function makeBridge(ops = {}) {
  return {
    sendOperation: async (op, params) => {
      if (ops[op]) return ops[op](params);
      throw new Error(`Unexpected op: ${op}`);
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. get_page_nodes — returns array, not object
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 1. get_page_nodes() returns array ──");
{
  const b = makeBridge({ get_page_nodes: () => ({ page: "P", nodes: [{ id: "1:1", name: "A" }, { id: "1:2", name: "B" }] }) });
  const r = await executeCode(`var n = await figma.get_page_nodes(); return { arr: Array.isArray(n), len: n.length, first: n[0].name };`, b);
  assert("returns Array", r.success && r.result.arr === true);
  assert("correct length", r.success && r.result.len === 2);
  assert("first element name", r.success && r.result.first === "A");
}
{
  const b = makeBridge({ get_page_nodes: () => ({ page: "P", nodes: [] }) });
  const r = await executeCode(`var n = await figma.get_page_nodes(); return n.length === 0;`, b);
  assert("empty page returns []", r.success && r.result === true);
}
{
  // for..loop works
  const b = makeBridge({ get_page_nodes: () => ({ page: "P", nodes: [{ id: "1:1", name: "Frame A" }, { id: "1:2", name: "Frame B" }] }) });
  const r = await executeCode(`
    var nodes = await figma.get_page_nodes();
    var names = [];
    for (var i = 0; i < nodes.length; i++) { names.push(nodes[i].name); }
    return names;
  `, b);
  assert("for-loop iteration works", r.success && Array.isArray(r.result) && r.result[0] === "Frame A", JSON.stringify(r));
}
{
  // find by name works
  const b = makeBridge({ get_page_nodes: () => ({ page: "P", nodes: [{ id: "3:5", name: "Sidebar" }, { id: "3:6", name: "Header" }] }) });
  const r = await executeCode(`
    var nodes = await figma.get_page_nodes();
    var sidebar = nodes.find(function(n) { return n.name === "Sidebar"; });
    return sidebar ? sidebar.id : null;
  `, b);
  assert("Array.find() works on result", r.success && r.result === "3:5", JSON.stringify(r));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. delete — single and batch
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 2. delete() single & batch ──");
{
  const b = makeBridge({ delete: (p) => ({ deleted: true, id: p.id }) });
  const r = await executeCode(`return await figma.delete({ id: "1:1" });`, b);
  assert("single delete succeeds", r.success && r.result.deleted === true);
}
{
  const b = makeBridge({ delete: (p) => ({ deleted: true, count: p.ids.length, results: p.ids.map(id => ({ deleted: true, id })) }) });
  const r = await executeCode(`return await figma.delete({ ids: ["1:1", "1:2", "1:3"] });`, b);
  assert("batch delete count=3", r.success && r.result.count === 3);
  assert("batch delete has results array", r.success && Array.isArray(r.result.results));
}
{
  // idempotent: already gone
  const b = makeBridge({ delete: (p) => ({ deleted: true, alreadyGone: true, ref: p.id }) });
  const r = await executeCode(`return await figma.delete({ id: "9:999" });`, b);
  assert("already-gone delete succeeds (idempotent)", r.success && r.result.alreadyGone === true);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. create — BUG-01/03 parentId validation
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 3. create() parentId validation (BUG-01/03) ──");
{
  const b = makeBridge({
    create: (p) => {
      if (p.parentId === "9:NOTFOUND") throw new Error(
        `parentId "9:NOTFOUND" not found in the current scene. ` +
        `If you just created the parent in a previous figma_write call, re-query its ID with ` +
        `figma.get_page_nodes() or figma.query() at the start of this call.`
      );
      return { id: "2:1", name: p.name, type: p.type };
    }
  });
  const r = await executeCode(`return await figma.create({ type: "FRAME", name: "x", parentId: "9:NOTFOUND" });`, b);
  assert("throws on invalid parentId", !r.success);
  assert("error mentions parentId value", r.error && r.error.includes("9:NOTFOUND"), r.error);
  assert("error hints get_page_nodes", r.error && r.error.includes("get_page_nodes"), r.error);
}
{
  const b = makeBridge({ create: (p) => ({ id: "2:2", name: p.name, type: p.type }) });
  const r = await executeCode(`return await figma.create({ type: "RECTANGLE", name: "rect", parentId: "1:5" });`, b);
  assert("valid parentId still works", r.success);
}
{
  // no parentId = page root, always ok
  const b = makeBridge({ create: (p) => ({ id: "2:3", name: p.name, type: p.type }) });
  const r = await executeCode(`return await figma.create({ type: "FRAME", name: "root-frame", width: 400, height: 300 });`, b);
  assert("no parentId (page root) works", r.success);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. screenshot / export_image — BUG-05 viewport fix
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 4. screenshot/export_image viewport fix (BUG-05) ──");
{
  const b = makeBridge({
    screenshot: (p) => ({ base64: "iVBORw0KGgoAAAANS", nodeId: p.id || "1:1", sizeBytes: 2048 })
  });
  const r = await executeCode(`return await figma.screenshot({ id: "1:1" });`, b);
  assert("screenshot succeeds", r.success, JSON.stringify(r.error));
  assert("screenshot has base64", r.success && r.result.base64 !== undefined);
  assert("screenshot sizeBytes > 0", r.success && r.result.sizeBytes > 0);
}
{
  const b = makeBridge({
    export_image: (p) => ({ base64: "iVBORw0KGgo=", format: p.format || "PNG", sizeBytes: 4096 })
  });
  const r = await executeCode(`return await figma.export_image({ id: "1:1", format: "PNG", scale: 2 });`, b);
  assert("export_image succeeds", r.success);
  assert("export_image has base64", r.success && r.result.base64 !== undefined);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ReferenceError sandbox isolation hint
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 5. ReferenceError sandbox isolation hint ──");
{
  const r = await executeCode(`return myVar.id;`, makeBridge({}));
  assert("ReferenceError fails", !r.success);
  assert("error has sandbox note", r.error && r.error.includes("isolated sandbox"), r.error);
  assert("error mentions re-query", r.error && r.error.includes("get_page_nodes"), r.error);
}
{
  const r = await executeCode(`throw new TypeError("type mismatch");`, makeBridge({}));
  assert("non-ReferenceError has no sandbox note", !r.success && !r.error.includes("isolated sandbox"));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. instantiate with overrides (SUGGEST-04)
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 6. instantiate() with overrides (SUGGEST-04) ──");
{
  let cap = null;
  const b = makeBridge({ instantiate: (p) => { cap = p; return { id: "5:1", name: "btn/primary", type: "INSTANCE" }; } });
  const r = await executeCode(`
    return await figma.instantiate({
      componentName: "btn/primary",
      parentId: "1:100",
      x: 20, y: 40,
      overrides: {
        "Label": { text: "Sign Up", fill: "#FFFFFF", fontSize: 16 },
        "BG": { fill: "#6C5CE7", cornerRadius: 8 },
        "Icon": { visible: false }
      }
    });
  `, b);
  assert("instantiate succeeds", r.success, JSON.stringify(r.error));
  assert("overrides passed", cap && cap.overrides !== undefined);
  assert("text override", cap && cap.overrides["Label"] && cap.overrides["Label"].text === "Sign Up");
  assert("fill override", cap && cap.overrides["BG"] && cap.overrides["BG"].fill === "#6C5CE7");
  assert("visible override", cap && cap.overrides["Icon"] && cap.overrides["Icon"].visible === false);
}
{
  // without overrides still works
  const b = makeBridge({ instantiate: (p) => ({ id: "5:2", name: p.componentName, type: "INSTANCE" }) });
  const r = await executeCode(`return await figma.instantiate({ componentName: "card/kpi", x: 0, y: 0 });`, b);
  assert("instantiate without overrides works", r.success);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. applyVariable — all supported fields
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 7. applyVariable() all fields ──");
{
  const b = makeBridge({ applyVariable: (p) => ({ nodeId: p.nodeId, field: p.field, variableId: "v:1" }) });
  const fields = [
    // Color
    "fill", "fills", "stroke", "strokes",
    // Geometry
    "opacity", "width", "height",
    // Corner radius
    "cornerRadius", "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius",
    // Spacing
    "itemSpacing", "counterAxisSpacing",
    "padding", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight",
    // Typography
    "fontSize", "letterSpacing", "lineHeight", "paragraphSpacing", "paragraphIndent",
    // Stroke
    "strokeWeight",
    // Visibility
    "visible",
  ];
  for (const field of fields) {
    const r = await executeCode(`return await figma.applyVariable({ nodeId: "1:1", field: "${field}", variableName: "token" });`, b);
    assert(`applyVariable field="${field}"`, r.success, r.error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. batch() — create, modify, delete mixed
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 8. batch() with mixed operations including delete ──");
{
  const b = makeBridge({
    batch: (p) => {
      const ops = Array.isArray(p) ? p : (p.operations || []);
      const results = ops.map((op, i) => ({
        index: i, operation: op.operation, success: true,
        data: op.operation === "delete" ? { deleted: true, id: op.params.id }
              : op.operation === "create" ? { id: "new:" + i, type: op.params.type }
              : { modified: true }
      }));
      return { results, total: ops.length, succeeded: ops.length };
    }
  });
  const r = await executeCode(`
    return await figma.batch([
      { operation: "create", params: { type: "FRAME", name: "A", width: 200, height: 100 } },
      { operation: "modify", params: { id: "1:1", fill: "#FF0000" } },
      { operation: "delete", params: { id: "1:2" } }
    ]);
  `, b);
  assert("mixed batch succeeds", r.success, JSON.stringify(r.error));
  assert("batch total=3", r.success && r.result.total === 3);
  assert("batch all succeeded", r.success && r.result.succeeded === 3);
  assert("delete in batch works", r.success && r.result.results[2].data.deleted === true);
}
{
  // batch with delete({ ids: [] }) via batch operation
  const b = makeBridge({
    batch: (p) => {
      const ops = Array.isArray(p) ? p : (p.operations || []);
      return { results: ops.map((op, i) => ({ index: i, operation: op.operation, success: true, data: {} })), total: ops.length, succeeded: ops.length };
    }
  });
  const r = await executeCode(`
    return await figma.batch([
      { operation: "delete", params: { ids: ["1:1", "1:2", "1:3"] } }
    ]);
  `, b);
  assert("batch with batch-delete operation", r.success && r.result.succeeded === 1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. get_styles — correct response structure
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 9. get_styles() response structure ──");
{
  const b = makeBridge({
    get_styles: () => ({
      paintStyles: [{ id: "S:1", name: "color/accent-purple", hex: "#6C5CE7", type: "PAINT" }],
      textStyles: [{ id: "S:2", name: "text/heading-xl", type: "TEXT", fontSize: 24, fontFamily: "Inter", fontWeight: "Bold", lineHeight: 32 }],
      effectStyles: [],
      gridStyles: []
    })
  });
  const r = await executeCode(`
    var s = await figma.get_styles();
    return {
      hasPaint: Array.isArray(s.paintStyles),
      hasText: Array.isArray(s.textStyles),
      paintName: s.paintStyles[0].name,
      paintId: s.paintStyles[0].id,
      textName: s.textStyles[0].name,
      textFontSize: s.textStyles[0].fontSize
    };
  `, b);
  assert("get_styles returns paintStyles array", r.success && r.result.hasPaint === true);
  assert("get_styles returns textStyles array", r.success && r.result.hasText === true);
  assert("paintStyle has id", r.success && r.result.paintId === "S:1");
  assert("textStyle has fontSize", r.success && r.result.textFontSize === 24);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. get_variables — correct response structure
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 10. get_variables() response structure ──");
{
  const b = makeBridge({
    get_variables: () => ({
      collections: [{
        id: "VC:1", name: "OMI Design Tokens",
        modes: [{ id: "m:light", name: "light" }, { id: "m:dark", name: "dark" }],
        variables: [
          { id: "V:1", name: "bg", resolvedType: "COLOR", values: { "m:light": "#FCFCFC", "m:dark": "#0C1C35" }, description: "" },
          { id: "V:2", name: "spacing/md", resolvedType: "FLOAT", values: { "m:light": 16 }, description: "" }
        ]
      }]
    })
  });
  const r = await executeCode(`
    var v = await figma.get_variables();
    var coll = v.collections[0];
    var varMap = {};
    for (var i = 0; i < coll.variables.length; i++) {
      var variable = coll.variables[i];
      varMap[variable.name] = variable.id;
    }
    return { collName: coll.name, modesLen: coll.modes.length, bgId: varMap["bg"], spacingId: varMap["spacing/md"] };
  `, b);
  assert("get_variables has collections", r.success && r.result.collName === "OMI Design Tokens");
  assert("collection has 2 modes", r.success && r.result.modesLen === 2);
  assert("variable name lookup works", r.success && r.result.bgId === "V:1");
  assert("float variable lookup works", r.success && r.result.spacingId === "V:2");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. Workflow: apply existing project styles
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 11. Workflow: load existing styles + apply to new nodes ──");
{
  const callLog = [];
  const b = makeBridge({
    get_styles: () => ({
      paintStyles: [
        { id: "S:10", name: "color/accent", hex: "#6C5CE7", type: "PAINT" },
        { id: "S:11", name: "color/bg", hex: "#FFFFFF", type: "PAINT" }
      ],
      textStyles: [
        { id: "S:20", name: "text/heading-lg", type: "TEXT", fontSize: 20, fontFamily: "Inter", fontWeight: "Bold" }
      ],
      effectStyles: [], gridStyles: []
    }),
    create: (p) => { callLog.push({ op: "create", name: p.name }); return { id: "N:" + callLog.length, name: p.name, type: p.type }; },
  });
  const r = await executeCode(`
    // Typical workflow: load styles from existing project, build a style map, use it
    var styles = await figma.get_styles();
    var colors = {};
    for (var i = 0; i < styles.paintStyles.length; i++) {
      var ps = styles.paintStyles[i];
      colors[ps.name] = ps.hex;
    }
    var texts = {};
    for (var j = 0; j < styles.textStyles.length; j++) {
      var ts = styles.textStyles[j];
      texts[ts.name] = { fontSize: ts.fontSize, fontFamily: ts.fontFamily };
    }
    // Create frame using discovered colors
    var frame = await figma.create({ type: "FRAME", name: "Card", fill: colors["color/accent"], width: 300, height: 200 });
    return { accentColor: colors["color/accent"], headingSize: texts["text/heading-lg"].fontSize, frameId: frame.id };
  `, b);
  assert("style workflow: load colors", r.success && r.result.accentColor === "#6C5CE7");
  assert("style workflow: load text sizes", r.success && r.result.headingSize === 20);
  assert("style workflow: create with discovered color", r.success && r.result.frameId.startsWith("N:"));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Workflow: apply variables to nodes
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 12. Workflow: get_variables → applyVariable to nodes ──");
{
  const b = makeBridge({
    get_variables: () => ({
      collections: [{
        id: "VC:1", name: "Tokens",
        modes: [{ id: "m:1", name: "light" }],
        variables: [
          { id: "V:accent", name: "accent", resolvedType: "COLOR", values: { "m:1": "#6C5CE7" }, description: "" },
          { id: "V:radius", name: "radius/md", resolvedType: "FLOAT", values: { "m:1": 8 }, description: "" },
          { id: "V:spacing", name: "spacing/md", resolvedType: "FLOAT", values: { "m:1": 16 }, description: "" }
        ]
      }]
    }),
    create: (p) => ({ id: "N:1", name: p.name, type: p.type }),
    applyVariable: (p) => ({ nodeId: p.nodeId, field: p.field, variableId: p.variableId }),
  });
  const r = await executeCode(`
    // Load variable IDs
    var vars = await figma.get_variables();
    var varMap = {};
    for (var ci = 0; ci < vars.collections.length; ci++) {
      var coll = vars.collections[ci];
      for (var vi = 0; vi < coll.variables.length; vi++) {
        var v = coll.variables[vi];
        varMap[v.name] = v.id;
      }
    }
    // Create a button frame
    var btn = await figma.create({ type: "FRAME", name: "Button", fill: "#6C5CE7", width: 160, height: 44 });
    // Bind variables
    await figma.applyVariable({ nodeId: btn.id, field: "fill", variableId: varMap["accent"] });
    await figma.applyVariable({ nodeId: btn.id, field: "cornerRadius", variableId: varMap["radius/md"] });
    await figma.applyVariable({ nodeId: btn.id, field: "paddingLeft", variableId: varMap["spacing/md"] });
    await figma.applyVariable({ nodeId: btn.id, field: "paddingRight", variableId: varMap["spacing/md"] });
    return { btnId: btn.id, accentVarId: varMap["accent"], radiusVarId: varMap["radius/md"] };
  `, b);
  assert("variable workflow: load varMap", r.success && r.result.accentVarId === "V:accent");
  assert("variable workflow: create node", r.success && r.result.btnId === "N:1");
  assert("variable workflow: radius var found", r.success && r.result.radiusVarId === "V:radius");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 13. loadIcon / loadIconIn (proxy helpers)
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 13. loadImage / loadIcon helpers ──");
{
  // loadImage goes through httpFetch then create — mock create
  const b = makeBridge({ create: (p) => ({ id: "img:1", name: p.name, type: p.type }) });
  // We can't test httpFetch in unit test, but we can verify the proxy method exists
  const r = await executeCode(`return typeof figma.loadImage === "function" && typeof figma.loadIcon === "function" && typeof figma.loadIconIn === "function";`, b);
  assert("loadImage/loadIcon/loadIconIn are functions", r.success && r.result === true);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 14. normalizeHex edge cases
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 14. normalizeHex (color parsing) ──");
{
  // Test that create doesn't throw on valid color formats
  const colorTests = [
    ["#6C5CE7", "6-digit hex"],
    ["#fff", "3-digit shorthand"],
    ["rgba(108,92,231,0.8)", "rgba with alpha"],
    ["rgb(108,92,231)", "rgb"],
    ["#6C5CE780", "8-digit hex with alpha"],
    ["white", "CSS name"],
  ];
  for (const [color, label] of colorTests) {
    const b = makeBridge({ create: (p) => ({ id: "c:1", type: p.type, fill: p.fill }) });
    const r = await executeCode(`return await figma.create({ type: "RECTANGLE", name: "r", fill: "${color}" });`, b);
    assert(`create accepts ${label} "${color}"`, r.success, r.error);
  }
}
{
  // NONE / transparent = no fill
  const b = makeBridge({ create: (p) => ({ id: "c:1", type: p.type, fill: p.fill }) });
  const r = await executeCode(`return await figma.create({ type: "RECTANGLE", name: "r", fill: "NONE" });`, b);
  assert("fill:NONE accepted without error", r.success, r.error);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 15. Multi-session: sessionId forwarding
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── 15. sessionId forwarding ──");
{
  let capturedSessionId = null;
  const realBridge = {
    sendOperation: async (op, params, sid) => {
      capturedSessionId = sid;
      return { id: "1:1", type: "FRAME" };
    }
  };
  const { executeCode: ec } = await import("../server/code-executor.js");
  const r = await ec(`return await figma.create({ type: "FRAME", name: "f" });`, realBridge, "session-abc");
  assert("sessionId forwarded to bridge", r.success && capturedSessionId === "session-abc");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════
const total = passed + failed;
console.log(`\n${"═".repeat(60)}`);
console.log(`Total: ${total} tests | ✓ ${passed} passed | ✗ ${failed} failed`);
if (errors.length) {
  console.log("\nFailed tests:");
  errors.forEach(e => console.log(e));
}
console.log("═".repeat(60));
if (failed > 0) process.exit(1);
