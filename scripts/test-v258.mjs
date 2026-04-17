#!/usr/bin/env node
/**
 * v2.5.8 tests — read design-to-code improvements:
 * P1: boundVariables resolved (name+value, not just IDs)
 * P2: get_css operation
 * P3: instance overrides full list
 * P4: fillStyleId/textStyleId resolved to name+value
 * P5: componentSetName + variantLabel on INSTANCE
 */
import { readFileSync } from "fs";

let passed = 0, failed = 0;
const errs = [];
function assert(label, cond, detail = "") {
  if (cond) { console.log("  ✓", label); passed++; }
  else { const m = `  ✗ ${label}${detail ? " — " + detail : ""}`; console.error(m); errs.push(m); failed++; }
}

const src = readFileSync(new URL("../src/plugin/handlers-read-detail.js", import.meta.url), "utf-8");
const toolDefs = readFileSync(new URL("../server/tool-definitions.js", import.meta.url), "utf-8");
const builtPlugin = readFileSync(new URL("../plugin/code.js", import.meta.url), "utf-8");

// ── P1: Bound variable resolution ───────────────────────────────────────────
console.log("\n── P1: boundVariables resolved to name+value ──");
{
  assert("source resolves variable via getVariableByIdAsync",
    src.includes("getVariableByIdAsync") && src.includes("entry.name = variable.name") && src.includes("entry.resolvedType"),
    "resolve logic not found");

  assert("resolved entry includes value (hex for COLOR)",
    src.includes("entry.value = rgbToHex") && src.includes("entry.value = val"),
    "value assignment not found");

  assert("built plugin contains getVariableByIdAsync for binding resolution",
    builtPlugin.includes("getVariableByIdAsync") && builtPlugin.includes("entry.name"),
    "not in built plugin");
}

// ── P2: get_css operation ───────────────────────────────────────────────────
console.log("\n── P2: get_css operation ──");
{
  assert("get_css handler defined in source",
    src.includes("handlers.get_css = async function"),
    "handler not found");

  assert("get_css emits position CSS",
    src.includes("position: absolute;") && src.includes("left: ") && src.includes("top: "),
    "position CSS not found");

  assert("get_css emits flex layout CSS",
    src.includes("display: \" + c.display") || src.includes('display: " + c.display'),
    "flex CSS not found");

  assert("get_css emits typography CSS",
    src.includes("font-size: ") && src.includes("font-family: ") && src.includes("font-weight: "),
    "typography CSS not found");

  assert("get_css emits background-color",
    src.includes("background-color: "),
    "background-color not found");

  assert("get_css emits box-shadow",
    src.includes("box-shadow: \" + detail.boxShadow") || src.includes("boxShadow"),
    "box-shadow not found");

  assert("get_css registered in tool-definitions enum",
    toolDefs.includes('"get_css"'),
    "not in enum");

  assert("get_css description in tool-definitions",
    toolDefs.includes("get_css: ready-to-use CSS string"),
    "description not found");

  assert("get_css in built plugin",
    builtPlugin.includes("handlers.get_css = async function"),
    "not in built plugin");
}

// ── P3: Instance overrides full list ────────────────────────────────────────
console.log("\n── P3: instance overrides full list ──");
{
  assert("overrides mapped to id + overriddenFields (not just count)",
    src.includes("overriddenFields: ov.overriddenFields"),
    "full override list not found");

  assert("both overrides array and overrideCount kept",
    src.includes("detail.overrides =") && src.includes("detail.overrideCount = node.overrides.length"),
    "both fields not found");
}

// ── P4: Style ID resolution ─────────────────────────────────────────────────
console.log("\n── P4: fillStyle / textStyle resolved ──");
{
  assert("getStyleByIdAsync used for textStyleId",
    src.includes("getStyleByIdAsync(node.textStyleId)") && src.includes("detail.textStyle = {"),
    "textStyle resolution not found");

  assert("textStyle includes name + fontSize + fontFamily",
    src.includes("name: ts.name") && src.includes("fontSize: ts.fontSize") && src.includes("fontFamily: ts.fontName"),
    "textStyle fields incomplete");

  assert("getStyleByIdAsync used for fillStyleId",
    src.includes("getStyleByIdAsync(node.fillStyleId)") && src.includes("detail.fillStyle = {"),
    "fillStyle resolution not found");

  assert("fillStyle includes name + hex",
    src.includes("name: fs.name") && src.includes("hex: fsHex"),
    "fillStyle fields incomplete");
}

// ── P5: componentSetName + variantLabel ─────────────────────────────────────
console.log("\n── P5: componentSetName + variantLabel on INSTANCE ──");
{
  assert("componentSetName set when parent is COMPONENT_SET",
    src.includes('instComp.parent.type === "COMPONENT_SET"') && src.includes("detail.componentSetName = instComp.parent.name"),
    "componentSetName not found");

  assert("variantLabel derived from component name",
    src.includes("detail.variantLabel ="),
    "variantLabel not found");

  // Test the variantLabel logic inline (pure string logic)
  function getVariantLabel(setName, compName) {
    return compName.indexOf(setName) === 0 ? compName.slice(setName.length).replace(/^[,\s/]+/, "") : compName;
  }
  assert("variantLabel strips setName prefix",
    getVariantLabel("Button", "Button, State=Primary, Size=Large") === "State=Primary, Size=Large",
    "got: " + getVariantLabel("Button", "Button, State=Primary, Size=Large"));
  assert("variantLabel fallback when no prefix match",
    getVariantLabel("Button", "IconButton/State=Hover") === "IconButton/State=Hover",
    "got: " + getVariantLabel("Button", "IconButton/State=Hover"));
}

// ── Regression: existing operations still in tool-definitions ───────────────
console.log("\n── Regression: tool-definitions enum intact ──");
{
  const ops = ["get_selection", "get_design", "get_page_nodes", "screenshot", "export_svg",
    "get_styles", "get_local_components", "get_viewport", "get_variables",
    "get_node_detail", "get_css", "export_image", "search_nodes", "scan_design"];
  ops.forEach(op => {
    assert(`"${op}" in enum`, toolDefs.includes(`"${op}"`));
  });
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`v2.5.8 tests: ${passed} passed, ${failed} failed`);
if (errs.length) { errs.forEach(e => console.error(e)); process.exit(1); }
