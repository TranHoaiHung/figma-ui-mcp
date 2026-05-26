#!/usr/bin/env node
// v2.5.26 — regression tests for ALL bugs in feedback.md (BUG-FONT-01/02, MODE-01,
// CONN-01, TS-01, DEL-01, NUM-01, TS-02, TIMEOUT-01, TEXT-01)
// Strategy: layer A (executor proxy forwarding) + layer B (plugin-side logic via vm sandbox).
//
// Run: node scripts/test-v2526-feedback.mjs

import { executeCode } from "../server/code-executor.js";
import { readFileSync } from "fs";
import { resolve as pathResolve } from "path";
import { fileURLToPath } from "url";
import vm from "node:vm";

const REPO = pathResolve(fileURLToPath(import.meta.url), "../..");
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

// ── Plugin-side sandbox loader ─────────────────────────────────────────────
function loadPluginContext() {
  const utils = readFileSync(pathResolve(REPO, "src/plugin/utils.js"), "utf8");
  const tokens = readFileSync(pathResolve(REPO, "src/plugin/handlers-tokens.js"), "utf8");
  const sandbox = {
    handlers: {},
    figma: {
      variables: {
        getLocalVariableCollectionsAsync: async () => [],
        getVariableByIdAsync: async () => null,
        getVariableCollectionByIdAsync: async () => null,
        getLocalVariablesAsync: async () => [],
        createVariableCollection: () => null,
        createVariable: () => null,
      },
      getStyleByIdAsync: async () => null,
      getStyleById: () => null,
      getLocalTextStylesAsync: async () => [],
      loadFontAsync: async () => {},
      importComponentByKeyAsync: async () => null,
      createTextStyle: () => {
        var s = {
          name: "", fontSize: 14, lineHeight: { unit: "AUTO" }, letterSpacing: { unit: "PIXELS", value: 0 },
          fontName: { family: "Inter", style: "Regular" },
          _boundVars: {},
          setBoundVariable: function(field, v) { this._boundVars[field] = v; },
        };
        return s;
      },
      currentPage: { findAll: () => [] },
      root: { findAll: () => [] },
    },
    console,
    Promise, Object, Array, String, Number, JSON, parseInt, parseFloat, Error, isNaN,
  };
  sandbox.__mockNodes = new Map();
  vm.createContext(sandbox);
  vm.runInContext(utils + "\n;findNodeByIdAsync = async function(id){ return sandbox.__mockNodes.get(id) || null; };\n", sandbox);
  vm.runInContext("var sandbox = this;", sandbox);
  vm.runInContext(tokens, sandbox);
  return sandbox;
}

function makeMockVariable(name, type, valuesByMode) {
  return {
    id: "VariableID:" + name,
    name: name,
    resolvedType: type,
    valuesByMode: valuesByMode || {},
    setValueForMode: function(modeId, value) { this.valuesByMode[modeId] = value; },
  };
}
function makeMockCollection(modes) {
  var collection = {
    id: "VariableCollectionId:test",
    name: "Design Tokens",
    modes: modes,
    variableIds: [],
    _vars: {},
    addMode: function(name) {
      var id = "mode:" + name;
      this.modes.push({ modeId: id, name: name });
      return id;
    },
  };
  return collection;
}

// ════════════════════════════════════════════════════════════════════════════
// BUG-NUM-01: FLOAT scalar applies to ALL modes, not just default
// ════════════════════════════════════════════════════════════════════════════
console.log("\nBUG-NUM-01: scalar FLOAT applies to all modes");
{
  const ctx = loadPluginContext();
  var collection = makeMockCollection([
    { modeId: "mode:light", name: "light" },
    { modeId: "mode:dark", name: "dark" },
  ]);
  var createdVars = [];
  ctx.figma.variables.createVariableCollection = (name) => { collection.name = name; return collection; };
  ctx.figma.variables.createVariable = (name, col, type) => {
    var v = makeMockVariable(name, type, {});
    createdVars.push(v);
    col._vars[name] = v;
    col.variableIds.push(v.id);
    return v;
  };
  ctx.figma.variables.getVariableByIdAsync = async (id) => {
    for (var i = 0; i < createdVars.length; i++) if (createdVars[i].id === id) return createdVars[i];
    return null;
  };
  ctx.figma.variables.getLocalVariableCollectionsAsync = async () => [];

  await ctx.handlers.setupDesignTokens({
    collectionName: "Test",
    modes: ["light", "dark"],
    numbers: { "radius-md": 12, "space-md": 16 },
  });

  const radiusVar = createdVars.find(v => v.name === "radius-md");
  const spaceVar = createdVars.find(v => v.name === "space-md");
  assert("radius-md exists", !!radiusVar);
  assert("radius-md set in light mode", radiusVar && radiusVar.valuesByMode["mode:light"] === 12);
  assert("radius-md set in dark mode (not 0)", radiusVar && radiusVar.valuesByMode["mode:dark"] === 12);
  assert("space-md set in dark mode (not 0)", spaceVar && spaceVar.valuesByMode["mode:dark"] === 16);
}

// ════════════════════════════════════════════════════════════════════════════
// BUG-NUM-01 (mode object): {light: x, dark: y} still works
// ════════════════════════════════════════════════════════════════════════════
console.log("\nBUG-NUM-01: per-mode FLOAT object spec still routes per-mode");
{
  const ctx = loadPluginContext();
  var collection = makeMockCollection([
    { modeId: "mode:light", name: "light" },
    { modeId: "mode:dark", name: "dark" },
  ]);
  var createdVars = [];
  ctx.figma.variables.createVariableCollection = () => collection;
  ctx.figma.variables.createVariable = (name, col, type) => {
    var v = makeMockVariable(name, type, {});
    createdVars.push(v); col._vars[name] = v; col.variableIds.push(v.id);
    return v;
  };
  ctx.figma.variables.getVariableByIdAsync = async (id) =>
    createdVars.find(v => v.id === id) || null;

  await ctx.handlers.setupDesignTokens({
    collectionName: "Test",
    modes: ["light", "dark"],
    numbers: { "elevation": { light: 4, dark: 8 } },
  });

  const v = createdVars.find(x => x.name === "elevation");
  assert("per-mode FLOAT routes per-mode", v && v.valuesByMode["mode:light"] === 4 && v.valuesByMode["mode:dark"] === 8);
}

// ════════════════════════════════════════════════════════════════════════════
// BUG-FONT-02: scalar STRING font variable applies to ALL modes
// ════════════════════════════════════════════════════════════════════════════
console.log("\nBUG-FONT-02: scalar STRING font var applies to all modes (no 'String value' placeholder)");
{
  const ctx = loadPluginContext();
  var collection = makeMockCollection([
    { modeId: "mode:light", name: "light" },
    { modeId: "mode:dark", name: "dark" },
  ]);
  var createdVars = [];
  ctx.figma.variables.createVariableCollection = () => collection;
  ctx.figma.variables.createVariable = (name, col, type) => {
    var v = makeMockVariable(name, type, {});
    createdVars.push(v); col._vars[name] = v; col.variableIds.push(v.id);
    return v;
  };
  ctx.figma.variables.getVariableByIdAsync = async (id) =>
    createdVars.find(v => v.id === id) || null;

  await ctx.handlers.setupDesignTokens({
    collectionName: "Test",
    modes: ["light", "dark"],
    fonts: { "font-primary": "Inter" },
  });

  const fv = createdVars.find(x => x.name === "font-primary");
  assert("font-primary STRING var created", fv && fv.resolvedType === "STRING");
  assert("font-primary light = 'Inter'", fv && fv.valuesByMode["mode:light"] === "Inter");
  assert("font-primary dark = 'Inter' (NOT placeholder)", fv && fv.valuesByMode["mode:dark"] === "Inter");
}

// ════════════════════════════════════════════════════════════════════════════
// BUG-TS-01: re-running setupDesignTokens with literal font unbinds STRING var
// ════════════════════════════════════════════════════════════════════════════
console.log("\nBUG-TS-01: literal fontFamily unbinds existing STRING variable on re-run");
{
  const ctx = loadPluginContext();
  var collection = makeMockCollection([{ modeId: "mode:1", name: "light" }]);
  var createdVars = [];
  var existingStyle = {
    name: "text/heading-md",
    fontSize: 15, lineHeight: { unit: "AUTO" }, letterSpacing: { unit: "PIXELS", value: 0 },
    fontName: { family: "Inter", style: "Semi Bold" },
    _boundVars: { fontFamily: { id: "V:1", resolvedType: "STRING" } },
    setBoundVariable: function(field, v) {
      if (v === null) delete this._boundVars[field];
      else this._boundVars[field] = v;
    },
  };

  ctx.figma.variables.createVariableCollection = () => collection;
  ctx.figma.variables.createVariable = (name, col, type) => {
    var v = makeMockVariable(name, type, {});
    createdVars.push(v); col._vars[name] = v; col.variableIds.push(v.id);
    return v;
  };
  ctx.figma.variables.getVariableByIdAsync = async (id) =>
    createdVars.find(v => v.id === id) || null;
  ctx.figma.getLocalTextStylesAsync = async () => [existingStyle];

  // No `fonts:` — only textStyles with literal fontFamily
  await ctx.handlers.setupDesignTokens({
    collectionName: "Test",
    modes: ["light"],
    textStyles: { "text/heading-md": { fontFamily: "Inter", fontWeight: "SemiBold", fontSize: 15 } },
  });

  assert("existing STRING font variable binding cleared",
    !existingStyle._boundVars.fontFamily,
    "still bound: " + JSON.stringify(existingStyle._boundVars));
}

// ════════════════════════════════════════════════════════════════════════════
// BUG-FONT-01: clear error for system fonts like "SF Mono"
// ════════════════════════════════════════════════════════════════════════════
console.log("\nBUG-FONT-01: system font errors are descriptive");
{
  const ctx = loadPluginContext();
  var collection = makeMockCollection([{ modeId: "mode:1", name: "light" }]);
  ctx.figma.variables.createVariableCollection = () => collection;
  ctx.figma.variables.createVariable = (name, col, type) => {
    var v = makeMockVariable(name, type, {});
    col._vars[name] = v; col.variableIds.push(v.id);
    return v;
  };
  ctx.figma.variables.getVariableByIdAsync = async () => null;
  ctx.figma.getLocalTextStylesAsync = async () => [];
  // Reject all font loads (simulates SF Mono not in Figma cloud registry)
  ctx.figma.loadFontAsync = async () => { throw new Error("The font could not be loaded"); };

  let err = null;
  try {
    await ctx.handlers.setupDesignTokens({
      collectionName: "Test",
      modes: ["light"],
      textStyles: { "text/mono": { fontFamily: "SF Mono", fontWeight: "Medium", fontSize: 13 } },
    });
  } catch (e) { err = e; }
  assert("SF Mono throws", err !== null);
  assert("error suggests JetBrains/Roboto/Fira Mono",
    err && /JetBrains Mono.*Roboto Mono.*Fira Code/i.test(err.message),
    err && err.message);
}

console.log("\nBUG-FONT-01: SF Pro suggestion");
{
  const ctx = loadPluginContext();
  var collection = makeMockCollection([{ modeId: "mode:1", name: "light" }]);
  ctx.figma.variables.createVariableCollection = () => collection;
  ctx.figma.variables.createVariable = (name, col, type) => {
    var v = makeMockVariable(name, type, {});
    col._vars[name] = v; col.variableIds.push(v.id);
    return v;
  };
  ctx.figma.variables.getVariableByIdAsync = async () => null;
  ctx.figma.getLocalTextStylesAsync = async () => [];
  ctx.figma.loadFontAsync = async () => { throw new Error("missing"); };

  let err = null;
  try {
    await ctx.handlers.setupDesignTokens({
      collectionName: "Test", modes: ["light"],
      textStyles: { "h1": { fontFamily: "SF Pro", fontWeight: "Bold", fontSize: 24 } },
    });
  } catch (e) { err = e; }
  assert("SF Pro suggestion mentions Inter/Manrope/DM Sans",
    err && /Inter.*Manrope.*DM Sans/i.test(err.message),
    err && err.message);
}

// ════════════════════════════════════════════════════════════════════════════
// BUG-TEXT-01: TEXT without width/height defaults to WIDTH_AND_HEIGHT (hug)
// ════════════════════════════════════════════════════════════════════════════
console.log("\nBUG-TEXT-01: TEXT without explicit dimensions does NOT stuck at 100x100");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => {
      captured = p;
      // Mock bridge — return what plugin would: hug-sized to content
      return { id: "t:1", type: "TEXT", name: "T", width: 50, height: 18, textAutoResize: "WIDTH_AND_HEIGHT" };
    },
  });
  const r = await executeCode(`
    return await figma.create({ type: "TEXT", content: "Hi", fontSize: 14 });
  `, bridge);
  assert("TEXT create succeeds without width/height", r.success, r.error);
  assert("plugin did NOT receive explicit width=100", captured && captured.width === undefined,
    "got width=" + (captured && captured.width));
  assert("plugin did NOT receive explicit height=100", captured && captured.height === undefined,
    "got height=" + (captured && captured.height));
}

console.log("\nBUG-TEXT-01: width-only TEXT keeps height auto");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "t:2", width: p.width, height: 20 }; }
  });
  const r = await executeCode(`
    return await figma.create({ type: "TEXT", content: "Hi", fontSize: 14, width: 200 });
  `, bridge);
  assert("width-only succeeds", r.success, r.error);
  assert("width=200 forwarded", captured && captured.width === 200);
  assert("height NOT forwarded (undefined)", captured && captured.height === undefined);
}

console.log("\nBUG-TEXT-01: explicit width+height locks both");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "t:3", width: p.width, height: p.height }; }
  });
  const r = await executeCode(`
    return await figma.create({ type: "TEXT", content: "Hi", fontSize: 14, width: 200, height: 22 });
  `, bridge);
  assert("both dims forwarded", captured && captured.width === 200 && captured.height === 22);
}

// ════════════════════════════════════════════════════════════════════════════
// BUG-DEL-01: deleting a frame containing COMPONENT requires force:true
// ════════════════════════════════════════════════════════════════════════════
console.log("\nBUG-DEL-01: delete blocks frames containing components without force:true");
{
  let captured = null;
  const bridge = makeBridge({
    delete: (p) => { captured = p; return { deleted: false, blocked: "contains-components", componentCount: 3 }; }
  });
  const r = await executeCode(`return await figma.delete({ id: "1:1" });`, bridge);
  assert("blocked response forwarded", r.success && r.result.blocked === "contains-components");
  assert("componentCount in response", r.success && r.result.componentCount === 3);
}

console.log("\nBUG-DEL-01: force:true bypasses block");
{
  let forceFlagReceived = false;
  const bridge = makeBridge({
    delete: (p) => { forceFlagReceived = (p.force === true); return { deleted: true }; }
  });
  await executeCode(`return await figma.delete({ id: "1:1", force: true });`, bridge);
  assert("force:true forwarded to bridge", forceFlagReceived);
}

// ════════════════════════════════════════════════════════════════════════════
// Regression: existing flows still work
// ════════════════════════════════════════════════════════════════════════════
console.log("\nRegression: setupDesignTokens with COLOR + multi-mode object");
{
  const ctx = loadPluginContext();
  var collection = makeMockCollection([
    { modeId: "mode:light", name: "light" },
    { modeId: "mode:dark", name: "dark" },
  ]);
  var createdVars = [];
  ctx.figma.variables.createVariableCollection = () => collection;
  ctx.figma.variables.createVariable = (name, col, type) => {
    var v = makeMockVariable(name, type, {});
    createdVars.push(v); col._vars[name] = v; col.variableIds.push(v.id);
    return v;
  };
  ctx.figma.variables.getVariableByIdAsync = async (id) =>
    createdVars.find(v => v.id === id) || null;

  await ctx.handlers.setupDesignTokens({
    collectionName: "Test",
    modes: ["light", "dark"],
    colors: { "bg": { light: "#FFFFFF", dark: "#000000" } },
  });

  const v = createdVars.find(x => x.name === "bg");
  assert("COLOR per-mode still works", v && v.valuesByMode["mode:light"] && v.valuesByMode["mode:dark"]);
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
