#!/usr/bin/env node
/**
 * v2.5.10 tests — bug fixes:
 * - BUG-03: `characters` alias for `content` in TEXT create
 * - BUG-04: `fills` array + `fontColor` on TEXT create
 * - BUG-05: `fontColor` alias in modify()
 * - BUG-08: set_selection auto-switches page
 * - BUG-12: figma.getNodeById in sandbox
 * - BUG-13: figma.zoom_to_fit in sandbox
 * - BUG-14: figma.getCurrentPage in sandbox
 */
import { readFileSync } from "fs";

let passed = 0, failed = 0;
const errs = [];
function assert(label, cond, detail = "") {
  if (cond) { console.log("  ✓", label); passed++; }
  else { const m = `  ✗ ${label}${detail ? " — " + detail : ""}`; console.error(m); errs.push(m); failed++; }
}

const write   = readFileSync(new URL("../src/plugin/handlers-write.js", import.meta.url), "utf-8");
const writeOps= readFileSync(new URL("../src/plugin/handlers-write-ops.js", import.meta.url), "utf-8");
const executor= readFileSync(new URL("../server/code-executor.js", import.meta.url), "utf-8");
const built   = readFileSync(new URL("../plugin/code.js", import.meta.url), "utf-8");
const pkg     = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
const index   = readFileSync(new URL("../server/index.js", import.meta.url), "utf-8");

// ── BUG-03: characters alias ─────────────────────────────────────────────────
console.log("\n── BUG-03: characters alias for content ──");
{
  assert("params.characters fallback in create()",
    write.includes("params.characters !== undefined ? params.characters"));
  assert("content var built from params.content ?? params.characters",
    write.includes("params.content !== undefined ? params.content : (params.characters"));
  assert("in built plugin", built.includes("params.characters !== undefined ? params.characters"));
}

// ── BUG-04: fills array + fontColor on TEXT create ───────────────────────────
console.log("\n── BUG-04: fills + fontColor on TEXT create ──");
{
  assert("fontColor accepted as textFill in create()",
    write.includes("var textFill = fill || params.fontColor"));
  assert("fills array handled in TEXT create",
    write.includes("params.fills && Array.isArray(params.fills)"));
  assert("in built plugin", built.includes("var textFill = fill || params.fontColor"));
}

// ── BUG-05: fontColor alias in modify() ─────────────────────────────────────
console.log("\n── BUG-05: fontColor alias in modify() ──");
{
  assert("fontColor remapped to fill before buildFillArray in modify()",
    write.includes("params.fontColor !== undefined && params.fill === undefined") &&
    write.includes("params.fill = params.fontColor"));
  assert("in built plugin", built.includes("params.fontColor !== undefined && params.fill === undefined"));
}

// ── BUG-08: set_selection auto page switch ───────────────────────────────────
console.log("\n── BUG-08: set_selection auto-switches page ──");
{
  assert("walks parent chain to find PAGE",
    writeOps.includes("candidate.type !== \"PAGE\"") && writeOps.includes("candidate = candidate.parent"));
  assert("calls setCurrentPageAsync when page differs",
    writeOps.includes("setCurrentPageAsync(candidate)"));
  assert("in built plugin", built.includes("setCurrentPageAsync(candidate)"));
}

// ── BUG-12/13/14: sandbox proxy additions ────────────────────────────────────
console.log("\n── BUG-12/13/14: sandbox proxy APIs ──");
{
  assert("BUG-12: getNodeById defined in proxy",
    executor.includes("proxy.getNodeById"));
  assert("BUG-12: getNodeById calls get_node_detail",
    executor.includes("get_node_detail") && executor.includes("proxy.getNodeById"));
  assert("BUG-13: zoom_to_fit defined in proxy",
    executor.includes("proxy.zoom_to_fit"));
  assert("BUG-13: zoom_to_fit calls set_viewport",
    executor.includes("proxy.zoom_to_fit") && executor.includes("set_viewport"));
  assert("BUG-14: getCurrentPage defined in proxy",
    executor.includes("proxy.getCurrentPage"));
  assert("BUG-14: getCurrentPage calls status",
    executor.includes("proxy.getCurrentPage") && executor.includes("\"status\""));
}

// ── version bump ─────────────────────────────────────────────────────────────
console.log("\n── version ──");
{
  assert("package.json version is 2.5.10", pkg.version === "2.5.10");
  assert("server/index.js version is 2.5.10", index.includes('"2.5.10"'));
}

// ── regression: prior fixes still present ────────────────────────────────────
console.log("\n── regression ──");
{
  assert("BUG-16 x/y set after appendChild still present",
    write.includes("node.x = x") && write.includes("node.y = y"));
  assert("BUG-17 layoutMode NONE guard still present",
    write.includes("removingLayout"));
  assert("BUG-07 (modify content reflow) still present",
    write.includes("WIDTH_AND_HEIGHT"));
  assert("BUG-10 stroke-width normalization still present",
    executor.includes("stroke-width"));
}

// ── unit: characters alias logic ─────────────────────────────────────────────
console.log("\n── unit: characters alias logic ──");
{
  function resolveContent(params) {
    return params.content !== undefined ? params.content
      : (params.characters !== undefined ? params.characters : "");
  }
  assert("content wins over characters", resolveContent({ content: "A", characters: "B" }) === "A");
  assert("characters used when no content", resolveContent({ characters: "Hello" }) === "Hello");
  assert("empty string when neither", resolveContent({}) === "");
  assert("content: '' is respected", resolveContent({ content: "", characters: "B" }) === "");
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`v2.5.10 tests: ${passed} passed, ${failed} failed`);
if (errs.length) { errs.forEach(e => console.error(e)); process.exit(1); }
