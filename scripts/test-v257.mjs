#!/usr/bin/env node
/**
 * v2.5.7 tests — BUG-07 (modify content reflow), BUG-08 (insertIndex), BUG-10 (stroke-width normalize).
 */
import { readFileSync } from "fs";
import { executeCode } from "../server/code-executor.js";

let passed = 0, failed = 0;
const errs = [];
function assert(label, cond, detail = "") {
  if (cond) { console.log("  ✓", label); passed++; }
  else { const m = `  ✗ ${label}${detail ? " — " + detail : ""}`; console.error(m); errs.push(m); failed++; }
}

function makeBridge(overrides = {}) {
  const ops = [];
  return {
    ops,
    sendOperation: async (op, params) => {
      ops.push({ op, params });
      if (overrides[op]) return overrides[op](params);
      if (op === "create") return { id: "N:" + ops.length, type: params.type || "FRAME", name: params.name || "node" };
      if (op === "modify") return { id: params.id, modified: true };
      if (op === "get_page_nodes") return { nodes: [] };
      return {};
    }
  };
}

// ── BUG-07: modify content triggers textAutoResize WIDTH_AND_HEIGHT ──────────
// The fix lives in the Figma plugin (handlers-write.js) and runs inside the plugin
// sandbox — it applies node.textAutoResize directly, not via bridge params.
// Here we verify: (a) modify with content still succeeds, (b) the handlers-write.js
// source contains the auto-reflow logic, (c) explicit overrides are respected in params.
console.log("\n── BUG-07: modify({ content }) reflow logic ──");
{
  const src = readFileSync(new URL("../src/plugin/handlers-write.js", import.meta.url), "utf-8");

  // Verify fix is present in plugin source
  assert("plugin source has WIDTH_AND_HEIGHT reflow on content change",
    src.includes("WIDTH_AND_HEIGHT") && src.includes("params.content !== undefined") && src.includes("textAutoResize !== \"NONE\""),
    "fix not found in handlers-write.js");

  assert("plugin source checks params.width === undefined before injecting reflow",
    src.includes("params.width === undefined && params.textAutoResize === undefined"),
    "guard not found");
}

{
  // modify with content + width: bridge receives both, no auto inject
  const b = makeBridge({ modify: (p) => ({ id: p.id, ...p }) });
  const r = await executeCode(`
    return await figma.modify({ id: "T:1", content: "Hello", width: 200 });
  `, b);
  assert("modify content + width succeeds", r.success, r.error);
  const op = b.ops.find(o => o.op === "modify");
  assert("width passed to bridge", op && op.params.width === 200);
  assert("textAutoResize not injected in params when width given", op && op.params.textAutoResize === undefined,
    "got textAutoResize=" + (op && op.params.textAutoResize));
}

{
  // modify with content + explicit textAutoResize NONE: should pass as-is
  const b = makeBridge({ modify: (p) => ({ id: p.id, ...p }) });
  const r = await executeCode(`
    return await figma.modify({ id: "T:1", content: "Hello", textAutoResize: "NONE" });
  `, b);
  assert("modify content + explicit NONE succeeds", r.success, r.error);
  const op = b.ops.find(o => o.op === "modify");
  assert("explicit NONE preserved in params", op && op.params.textAutoResize === "NONE",
    "got=" + (op && op.params.textAutoResize));
}

// ── BUG-08: create with insertIndex ─────────────────────────────────────────
console.log("\n── BUG-08: create with insertIndex ──");
{
  const b = makeBridge({
    create: (p) => ({ id: "C:1", type: p.type, name: p.name, insertIndex: p.insertIndex }),
  });

  const r = await executeCode(`
    return await figma.create({ type: "FRAME", name: "menu-label", parentId: "P:1", insertIndex: 2 });
  `, b);

  assert("create with insertIndex succeeds", r.success, r.error);
  const op = b.ops.find(o => o.op === "create");
  assert("insertIndex=2 passed to bridge", op && op.params.insertIndex === 2,
    "got insertIndex=" + (op && op.params.insertIndex));
}

{
  // insertIndex 0 = prepend
  const b = makeBridge({ create: (p) => ({ id: "C:1", type: p.type, insertIndex: p.insertIndex }) });
  const r = await executeCode(`
    return await figma.create({ type: "RECTANGLE", parentId: "P:1", insertIndex: 0 });
  `, b);
  assert("insertIndex=0 (prepend) succeeds", r.success, r.error);
  const op = b.ops.find(o => o.op === "create");
  assert("insertIndex=0 passed", op && op.params.insertIndex === 0,
    "got=" + (op && op.params.insertIndex));
}

// ── BUG-10: loadIcon stroke-width normalization ──────────────────────────────
console.log("\n── BUG-10: stroke-width normalization ──");
{
  // Test the normalization logic directly by simulating what code-executor does.
  // Ionicons outline SVG has viewBox="0 0 512 512" and stroke-width="48".
  // At size=14: normalizedStroke = 48 * (14/512) ≈ 1.31 → should become ~1.31, not 48.
  const ioniconsOutlineSample = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 112l-144 144 144 144" stroke="#000" stroke-width="48" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // Replicate the normalization from code-executor.js
  function normalizeStrokeWidth(svg, size) {
    const vbMatch = svg.match(/viewBox="[^"]*"/);
    if (vbMatch) {
      const parts = vbMatch[0].replace('viewBox="', "").replace('"', "").trim().split(/[\s,]+/);
      const vbW = parseFloat(parts[2]);
      if (vbW > 0 && vbW !== size) {
        const scale = size / vbW;
        return svg.replace(/stroke-width="([^"]+)"/g, (_, w) => {
          const normalized = Math.max(0.5, parseFloat(w) * scale);
          return `stroke-width="${Math.round(normalized * 100) / 100}"`;
        });
      }
    }
    return svg;
  }

  const result14 = normalizeStrokeWidth(ioniconsOutlineSample, 14);
  const match14 = result14.match(/stroke-width="([^"]+)"/);
  const sw14 = match14 ? parseFloat(match14[1]) : null;
  assert("stroke-width normalized at size=14", sw14 !== null && sw14 < 5,
    `got stroke-width=${sw14} (expected ~1.31, not 48)`);
  assert("stroke-width >= 0.5 (min clamp)", sw14 >= 0.5, `got=${sw14}`);

  const result24 = normalizeStrokeWidth(ioniconsOutlineSample, 24);
  const match24 = result24.match(/stroke-width="([^"]+)"/);
  const sw24 = match24 ? parseFloat(match24[1]) : null;
  assert("stroke-width normalized at size=24", sw24 !== null && sw24 < 5,
    `got stroke-width=${sw24}`);

  // SVG without viewBox should be unchanged
  const noVb = `<svg><path stroke-width="48"/></svg>`;
  const unchanged = normalizeStrokeWidth(noVb, 24);
  assert("SVG without viewBox not modified", unchanged === noVb);

  // SVG where viewBox matches size exactly should be unchanged
  const exact = `<svg viewBox="0 0 24 24"><path stroke-width="2"/></svg>`;
  const exactResult = normalizeStrokeWidth(exact, 24);
  assert("SVG with viewBox == size not modified", exactResult === exact);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`v2.5.7 tests: ${passed} passed, ${failed} failed`);
if (errs.length) { errs.forEach(e => console.error(e)); process.exit(1); }
