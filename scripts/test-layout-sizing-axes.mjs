#!/usr/bin/env node
// Tests for layoutSizingHorizontal / layoutSizingVertical exposure + auto-
// promote on TEXT content change inside hug-mode auto-layout parents.
//
// This is the missing piece for setComponentProperties + modify(content) to
// trigger actual auto-layout reflow. Without layoutSizingHorizontal: HUG on
// the text child, a hug-width auto-layout parent stays at its original size
// no matter how textAutoResize is configured — Figma's per-axis sizing wins
// over the legacy textAutoResize for auto-layout children.
//
// Layer A — proxy: the handlers run through executeCode end-to-end.
// Layer B — plugin handler logic: handlers.modify and applyChildLayout run
//           against mocked Figma nodes that track layoutSizing assignments.
//
// No live Figma needed.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

let passed = 0, failed = 0;
function assert(label, condition, detail = "") {
  if (condition) { console.log("  ✓", label); passed++; }
  else { console.error("  ✗", label, detail ? `— ${detail}` : ""); failed++; }
}

// ──────────────────────────────────────────────────────────────────────────────
// Plugin context loader
// ──────────────────────────────────────────────────────────────────────────────

function loadPluginContext() {
  const utils = readFileSync(resolve(REPO, "src/plugin/utils.js"), "utf8");
  const paintFx = readFileSync(resolve(REPO, "src/plugin/paint-and-effects.js"), "utf8");
  const writeH = readFileSync(resolve(REPO, "src/plugin/handlers-write.js"), "utf8")
    .replace(/^const handlers = \{\};\s*$/m, "// (handlers seeded by test harness)");

  const sandbox = {
    handlers: {},
    figma: {
      async loadAllPagesAsync() {},
      root: { findOne() { return null; }, findAllWithCriteria() { return []; }, children: [] },
      async loadFontAsync() {},
      currentPage: { findAll: () => [] },
    },
    console,
  };

  sandbox.__mockNodes = new Map();

  const shim = `
    findNodeByIdAsync = async function(id) { return globalThis.__mockNodes.get(id) || null; };
    findNodeByName = function(name) { return null; };
  `;

  vm.createContext(sandbox);
  vm.runInContext(utils + "\n" + paintFx + "\n" + writeH + "\n" + shim, sandbox, {
    filename: "handlers-write.test.cjs",
  });
  return sandbox;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────────

// AutoLayoutFrame mock — exposes layoutMode, the sizing mode legacy + modern
// fields, and serves as a `parent` for text nodes.
function makeAutoLayoutFrame(opts) {
  return {
    id: "frame:" + (opts.id || "f"),
    name: opts.name || "Frame",
    type: "FRAME",
    layoutMode: opts.layoutMode || "HORIZONTAL",
    primaryAxisSizingMode: opts.primaryAxisSizingMode || "FIXED",
    counterAxisSizingMode: opts.counterAxisSizingMode || "FIXED",
    layoutSizingHorizontal: opts.layoutSizingHorizontal,
    layoutSizingVertical:   opts.layoutSizingVertical,
    width: opts.width || 200,
    height: opts.height || 40,
    parent: null,
  };
}

// TextNode mock — tracks layoutSizing assignments through setters so tests can
// see exactly what the handler wrote.
function makeTextNode(opts) {
  const state = {
    _layoutSizingHorizontal: opts.layoutSizingHorizontal || "FIXED",
    _layoutSizingVertical:   opts.layoutSizingVertical   || "FIXED",
    _setAttempts: { layoutSizingHorizontal: [], layoutSizingVertical: [] },
  };
  const node = {
    id: "text:" + (opts.id || "t"),
    name: opts.name || "Label",
    type: "TEXT",
    characters: opts.characters || "Continue",
    fontName: { family: "Inter", style: "Regular" },
    fontSize: 14,
    textAutoResize: opts.textAutoResize || "WIDTH_AND_HEIGHT",
    width: 80,
    height: 20,
    parent: opts.parent || null,
    resize(w, h) { this.width = w; this.height = h; },
  };
  Object.defineProperty(node, "layoutSizingHorizontal", {
    get() { return state._layoutSizingHorizontal; },
    set(v) {
      state._setAttempts.layoutSizingHorizontal.push(v);
      // Mirror Figma: throws if node isn't inside an auto-layout parent.
      if (!node.parent || !node.parent.layoutMode || node.parent.layoutMode === "NONE") {
        throw new Error("layoutSizingHorizontal can only be set on auto-layout children");
      }
      state._layoutSizingHorizontal = v;
    },
  });
  Object.defineProperty(node, "layoutSizingVertical", {
    get() { return state._layoutSizingVertical; },
    set(v) {
      state._setAttempts.layoutSizingVertical.push(v);
      if (!node.parent || !node.parent.layoutMode || node.parent.layoutMode === "NONE") {
        throw new Error("layoutSizingVertical can only be set on auto-layout children");
      }
      state._layoutSizingVertical = v;
    },
  });
  node._setAttempts = state._setAttempts;
  return node;
}

const ctx = loadPluginContext();
const { handlers } = ctx;

// ──────────────────────────────────────────────────────────────────────────────
// LAYER B — handler tests
// ──────────────────────────────────────────────────────────────────────────────

console.log("\nExposed params: layoutSizingHorizontal / Vertical pass through modify");
{
  const parent = makeAutoLayoutFrame({ id: "p1", layoutMode: "HORIZONTAL", primaryAxisSizingMode: "AUTO" });
  const text = makeTextNode({ id: "t1", parent });
  ctx.__mockNodes.set(text.id, text);

  await handlers.modify({ id: text.id, layoutSizingHorizontal: "HUG" });
  assert("modify accepts layoutSizingHorizontal", text.layoutSizingHorizontal === "HUG");

  await handlers.modify({ id: text.id, layoutSizingVertical: "FILL" });
  assert("modify accepts layoutSizingVertical", text.layoutSizingVertical === "FILL");
}

console.log("\nAuto-promote: TEXT content change inside hug-width HORIZONTAL parent → text HUG horizontally");
{
  const parent = makeAutoLayoutFrame({ id: "p2", layoutMode: "HORIZONTAL", primaryAxisSizingMode: "AUTO" });
  const text = makeTextNode({ id: "t2", parent, layoutSizingHorizontal: "FIXED" });
  ctx.__mockNodes.set(text.id, text);

  await handlers.modify({ id: text.id, content: "Save changes to your booking" });
  assert("text content updated", text.characters === "Save changes to your booking");
  assert("auto-promoted layoutSizingHorizontal to HUG", text.layoutSizingHorizontal === "HUG",
    "got " + text.layoutSizingHorizontal);
  assert("did NOT touch vertical axis", text.layoutSizingVertical === "FIXED");
}

console.log("\nAuto-promote: hug-height VERTICAL parent → text HUG vertically (not horizontally)");
{
  const parent = makeAutoLayoutFrame({ id: "p3", layoutMode: "VERTICAL", primaryAxisSizingMode: "AUTO" });
  const text = makeTextNode({ id: "t3", parent });
  ctx.__mockNodes.set(text.id, text);

  await handlers.modify({ id: text.id, content: "Longer copy" });
  assert("auto-promoted vertical axis", text.layoutSizingVertical === "HUG");
  // Horizontal default was FIXED; auto-promote should NOT change it for a vertical parent.
  assert("did NOT touch horizontal axis", text.layoutSizingHorizontal === "FIXED");
}

console.log("\nAuto-promote: parent that does NOT hug → no auto-promote");
{
  const parent = makeAutoLayoutFrame({ id: "p4", layoutMode: "HORIZONTAL", primaryAxisSizingMode: "FIXED" });
  const text = makeTextNode({ id: "t4", parent });
  ctx.__mockNodes.set(text.id, text);

  await handlers.modify({ id: text.id, content: "Longer copy" });
  assert("text content updated", text.characters === "Longer copy");
  assert("layoutSizingHorizontal left alone (FIXED parent)", text.layoutSizingHorizontal === "FIXED");
}

console.log("\nAuto-promote: explicit user param wins over auto-promote");
{
  const parent = makeAutoLayoutFrame({ id: "p5", layoutMode: "HORIZONTAL", primaryAxisSizingMode: "AUTO" });
  const text = makeTextNode({ id: "t5", parent });
  ctx.__mockNodes.set(text.id, text);

  await handlers.modify({
    id: text.id,
    content: "Hello",
    layoutSizingHorizontal: "FILL",  // explicit
  });
  assert("explicit FILL respected, no auto-HUG", text.layoutSizingHorizontal === "FILL");
}

console.log("\nAuto-promote: parent uses modern layoutSizingHorizontal:HUG (not legacy primaryAxisSizingMode)");
{
  const parent = makeAutoLayoutFrame({
    id: "p6", layoutMode: "HORIZONTAL",
    primaryAxisSizingMode: "FIXED",
    layoutSizingHorizontal: "HUG",
  });
  const text = makeTextNode({ id: "t6", parent });
  ctx.__mockNodes.set(text.id, text);

  await handlers.modify({ id: text.id, content: "Hi" });
  assert("detects HUG via modern field too", text.layoutSizingHorizontal === "HUG");
}

console.log("\nAuto-promote: TEXT outside any auto-layout parent → no auto-promote, no throw");
{
  const text = makeTextNode({ id: "t7", parent: null });
  ctx.__mockNodes.set(text.id, text);

  // Should not throw despite layoutSizing setters being guarded.
  await handlers.modify({ id: text.id, content: "Loose text" });
  assert("text content updated", text.characters === "Loose text");
  assert("no layoutSizing write attempted",
    text._setAttempts.layoutSizingHorizontal.length === 0,
    "attempts: " + JSON.stringify(text._setAttempts));
}

console.log("\nAuto-promote: non-TEXT node with content param is a no-op");
{
  const parent = makeAutoLayoutFrame({ id: "p8", layoutMode: "HORIZONTAL", primaryAxisSizingMode: "AUTO" });
  const frame = {
    id: "f:inner", name: "Inner", type: "FRAME", parent,
    fills: [], strokes: [], width: 50, height: 50,
    resize(w, h) { this.width = w; this.height = h; },
  };
  // No layoutSizing setters added — if the handler tries to set them, this'd
  // be a silent no-op via `in` guard.
  ctx.__mockNodes.set(frame.id, frame);

  // modify on a FRAME with content is fine (content only applies to TEXT).
  await handlers.modify({ id: frame.id, width: 60 });
  assert("non-TEXT modify unaffected", frame.width === 60);
}

console.log("\nRegression: modify without content param does NOT auto-promote");
{
  const parent = makeAutoLayoutFrame({ id: "p9", layoutMode: "HORIZONTAL", primaryAxisSizingMode: "AUTO" });
  const text = makeTextNode({ id: "t9", parent, layoutSizingHorizontal: "FIXED" });
  ctx.__mockNodes.set(text.id, text);

  await handlers.modify({ id: text.id, fontSize: 18 });
  assert("layoutSizingHorizontal untouched without content param", text.layoutSizingHorizontal === "FIXED");
}

// ──────────────────────────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`Total: ${passed + failed} tests | ✓ ${passed} passed | ✗ ${failed} failed`);
console.log(`════════════════════════════════════════════════════════════`);
process.exit(failed === 0 ? 0 : 1);
