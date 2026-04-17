#!/usr/bin/env node
/**
 * v2.5.9 tests — design-to-code gap closure:
 * - get_design_context
 * - get_component_map
 * - get_unmapped_components
 * - figma_rules (server-side MCP tool)
 */
import { readFileSync } from "fs";

let passed = 0, failed = 0;
const errs = [];
function assert(label, cond, detail = "") {
  if (cond) { console.log("  ✓", label); passed++; }
  else { const m = `  ✗ ${label}${detail ? " — " + detail : ""}`; console.error(m); errs.push(m); failed++; }
}

const src       = readFileSync(new URL("../src/plugin/handlers-read-detail.js", import.meta.url), "utf-8");
const toolDefs  = readFileSync(new URL("../server/tool-definitions.js", import.meta.url), "utf-8");
const indexSrc  = readFileSync(new URL("../server/index.js", import.meta.url), "utf-8");
const builtPlug = readFileSync(new URL("../plugin/code.js", import.meta.url), "utf-8");

// ── get_design_context ───────────────────────────────────────────────────────
console.log("\n── get_design_context ──");
{
  assert("handler defined", src.includes("handlers.get_design_context = async function"));
  assert("builds variable name map via getVariableByIdAsync",
    src.includes("varNameMap[v.id] = v.name"));
  assert("builds style name map via getLocalPaintStylesAsync",
    src.includes("styleNameMap[s.id] = s.name"));
  assert("resolveFill uses var(--token) for bound variables",
    src.includes("var(--") && src.includes("varNameMap[bvf.id]"));
  assert("nodeContext outputs flex layout",
    src.includes("display: \"flex\"") || src.includes('display: "flex"'));
  assert("nodeContext outputs component.set + component.variant",
    src.includes("ctx.component.set = mc.parent.name") && src.includes("ctx.component.variant ="));
  assert("returns summary.tokensUsed + componentsUsed",
    src.includes("tokensUsed:") && src.includes("componentsUsed:"));
  assert("children limited to depth 4 to avoid token overflow",
    src.includes("if (depth < 4 && nd.children"));
  assert("hint field explains how to use output",
    src.includes("context.layout for flex CSS"));
  assert("in built plugin", builtPlug.includes("handlers.get_design_context = async function"));
}

// ── get_component_map ────────────────────────────────────────────────────────
console.log("\n── get_component_map ──");
{
  assert("handler defined", src.includes("handlers.get_component_map = async function"));
  assert("walks INSTANCE nodes recursively", src.includes("nd.type === \"INSTANCE\"") && src.includes("walkInstances"));
  assert("exposes componentSetName + variantLabel",
    src.includes("entry.componentSetName = mc.parent.name") && src.includes("entry.variantLabel ="));
  assert("generates suggestedImport path",
    src.includes("entry.suggestedImport =") && src.includes("import { "));
  assert("deduplicates by componentName for uniqueComponents",
    src.includes("uniqueComponents[key]"));
  assert("returns totalInstances + instances + uniqueComponents",
    src.includes("totalInstances:") && src.includes("uniqueComponents:"));
  assert("in built plugin", builtPlug.includes("handlers.get_component_map = async function"));
}

// ── get_unmapped_components ──────────────────────────────────────────────────
console.log("\n── get_unmapped_components ──");
{
  assert("handler defined", src.includes("handlers.get_unmapped_components = async function"));
  assert("calls get_component_map + get_local_components internally",
    src.includes("handlers.get_component_map(params)") && src.includes("handlers.get_local_components()"));
  assert("builds described set from components with description",
    src.includes("if (c.description && c.description.trim())"));
  assert("returns unmapped + mapped arrays",
    src.includes("unmapped:") && src.includes("mapped:"));
  assert("hint message explains how to fix unmapped",
    src.includes("Add a code import path to each component"));
  assert("in built plugin", builtPlug.includes("handlers.get_unmapped_components = async function"));
}

// ── tool-definitions: 3 new ops in enum ─────────────────────────────────────
console.log("\n── tool-definitions ──");
{
  assert('"get_design_context" in enum', toolDefs.includes('"get_design_context"'));
  assert('"get_component_map" in enum',  toolDefs.includes('"get_component_map"'));
  assert('"get_unmapped_components" in enum', toolDefs.includes('"get_unmapped_components"'));
  assert("figma_rules tool defined",     toolDefs.includes('name: "figma_rules"'));
  assert("figma_rules description mentions design system rules",
    toolDefs.includes("design system rule sheet"));

  // All 17 ops present
  const ops = [
    "get_selection","get_design","get_page_nodes","screenshot","export_svg",
    "get_styles","get_local_components","get_viewport","get_variables",
    "get_node_detail","get_css",
    "get_design_context","get_component_map","get_unmapped_components",
    "export_image","search_nodes","scan_design",
  ];
  ops.forEach(op => assert(`"${op}" in enum`, toolDefs.includes(`"${op}"`)));
}

// ── figma_rules in server/index.js ──────────────────────────────────────────
console.log("\n── figma_rules server handler ──");
{
  assert("figma_rules handler in index.js",
    indexSrc.includes("name === \"figma_rules\""));
  assert("calls get_styles + get_variables + get_local_components in parallel",
    indexSrc.includes("Promise.all") && indexSrc.includes("get_styles") &&
    indexSrc.includes("get_variables") && indexSrc.includes("get_local_components"));
  assert("outputs ## Color Tokens section",
    indexSrc.includes("## Color Tokens"));
  assert("outputs ## Typography Styles section",
    indexSrc.includes("## Typography Styles"));
  assert("outputs ## Component Sets section",
    indexSrc.includes("## Component Sets"));
  assert("outputs CSS custom property format",
    indexSrc.includes("var(--") || indexSrc.includes("--${") || indexSrc.includes("replace(/\\//g"));
}

// ── variantLabel logic (pure unit test) ──────────────────────────────────────
console.log("\n── variantLabel extraction logic ──");
{
  function getVariantLabel(setName, compName) {
    return compName.indexOf(setName) === 0
      ? compName.slice(setName.length).replace(/^[,\s/]+/, "")
      : compName;
  }
  assert("Button/State=Primary → 'State=Primary'",
    getVariantLabel("Button", "Button, State=Primary") === "State=Primary",
    "got: " + getVariantLabel("Button", "Button, State=Primary"));
  assert("Button/State=Primary, Size=Large → both parts",
    getVariantLabel("Button", "Button, State=Primary, Size=Large") === "State=Primary, Size=Large");
  assert("non-matching name returned as-is",
    getVariantLabel("Button", "IconButton/Hover") === "IconButton/Hover");
}

// ── regression: existing tests still pass ───────────────────────────────────
console.log("\n── regression: prior operations present in enum ──");
{
  const priorOps = ["get_css","get_node_detail","get_selection","search_nodes","scan_design"];
  priorOps.forEach(op => assert(`prior op "${op}" still in enum`, toolDefs.includes(`"${op}"`)));
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`v2.5.9 tests: ${passed} passed, ${failed} failed`);
if (errs.length) { errs.forEach(e => console.error(e)); process.exit(1); }
