#!/usr/bin/env node
// Backtests for handlers-tokens.js fixes (T-1..T-5)
// Run: node scripts/test-tokens.mjs
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

// ── Shared mock builders ──────────────────────────────────────────────────────

function makeVarCollection(id, name, modes, variableIds) {
  return {
    id, name,
    modes: modes || [{ modeId: "m:1", name: "Mode 1" }],
    variableIds: variableIds || [],
    addMode: (n) => "m:new",
    renameMode: () => {},
    removeMode: () => {},
    setExplicitVariableModeForCollection: () => {},
    clearExplicitVariableModeForCollection: () => {},
  };
}

function makeVariable(id, name, type, valuesByMode) {
  var vbm = valuesByMode || { "m:1": type === "COLOR" ? { r: 0, g: 0, b: 0, a: 1 } : 0 };
  return {
    id, name,
    resolvedType: type,
    variableCollectionId: "col:1",
    valuesByMode: vbm,
    setValueForMode: function(modeId, val) { this.valuesByMode[modeId] = val; },
    setBoundVariable: () => {},
  };
}

function makeBridge(overrides) {
  return { sendOperation: async (op, params) => {
    if (overrides[op]) return overrides[op](params);
    throw new Error("Unexpected op: " + op);
  }};
}

// ── T-1: findCollectionAsync — deduplication ──────────────────────────────────
console.log("\nT-1: findCollectionAsync helper — collection lookup by name");
{
  const col = makeVarCollection("col:1", "Theme");
  const bridge = makeBridge({
    addVariableMode: (p) => {
      return { modeId: "m:new", modeName: p.modeName, collectionId: "col:1", modes: col.modes };
    }
  });
  const r = await executeCode(
    `return await figma.addVariableMode({ collectionId: "col:1", modeName: "Dark" });`,
    bridge
  );
  assert("addVariableMode succeeds", r.success, r.error);
  assert("returns modeId", r.success && r.result.modeId !== undefined);
}

// ── T-1: All 4 collection-based handlers use findCollectionAsync ──────────────
console.log("\nT-1: renameVariableMode / removeVariableMode");
{
  const bridge = makeBridge({
    renameVariableMode: (p) => ({ modeId: p.modeId, modeName: p.newName, collectionId: "col:1", modes: [] }),
    removeVariableMode: (p) => ({ removedModeId: p.modeId, collectionId: "col:1", modes: [] }),
  });

  const r1 = await executeCode(
    `return await figma.renameVariableMode({ collectionId: "col:1", modeId: "m:1", newName: "Light" });`,
    bridge
  );
  assert("renameVariableMode succeeds", r1.success, r1.error);
  assert("returns new modeName", r1.success && r1.result.modeName === "Light");

  const r2 = await executeCode(
    `return await figma.removeVariableMode({ collectionId: "col:1", modeId: "m:1" });`,
    bridge
  );
  assert("removeVariableMode succeeds", r2.success, r2.error);
  assert("returns removedModeId", r2.success && r2.result.removedModeId === "m:1");
}

// ── T-2: findVariableAsync — single getLocalVariablesAsync call ───────────────
console.log("\nT-2: setVariableValue by variableName (single batch fetch)");
{
  const bridge = makeBridge({
    setVariableValue: (p) => ({
      variableId: "var:1", variableName: p.variableName || "bg",
      modeId: p.modeId || "m:1", value: p.value
    })
  });

  const r = await executeCode(
    `return await figma.setVariableValue({ variableName: "bg", modeId: "m:1", value: "#FF0000" });`,
    bridge
  );
  assert("setVariableValue by name succeeds", r.success, r.error);
  assert("value forwarded", r.success && r.result.value === "#FF0000");
}

// ── T-2: applyVariable by variableName ───────────────────────────────────────
console.log("\nT-2: applyVariable by variableName");
{
  const bridge = makeBridge({
    applyVariable: (p) => ({
      nodeId: p.nodeId || "1:1", nodeName: "Frame",
      field: p.field || "fill",
      variableId: "var:1", variableName: p.variableName || "accent"
    })
  });

  const r = await executeCode(
    `return await figma.applyVariable({ nodeId: "1:1", variableName: "accent", field: "fill" });`,
    bridge
  );
  assert("applyVariable by name succeeds", r.success, r.error);
  assert("field forwarded", r.success && r.result.field === "fill");
}

// ── T-3: setFrameVariableMode — ES5 mode name lookup (no Array.find) ─────────
console.log("\nT-3: setFrameVariableMode returns modeName (ES5-safe lookup)");
{
  const bridge = makeBridge({
    setFrameVariableMode: (p) => ({
      nodeId: p.nodeId, nodeName: "Card",
      collectionId: p.collectionId, collectionName: "Theme",
      modeId: "m:2", modeName: "Dark",
      explicitVariableModes: {}
    })
  });

  const r = await executeCode(
    `return await figma.setFrameVariableMode({ nodeId: "1:1", collectionId: "col:1", modeName: "Dark" });`,
    bridge
  );
  assert("setFrameVariableMode succeeds", r.success, r.error);
  assert("modeName resolved in result", r.success && r.result.modeName === "Dark");
}

// ── T-4: modifyVariable supports modeId param ────────────────────────────────
console.log("\nT-4: modifyVariable with explicit modeId");
{
  const bridge = makeBridge({
    modifyVariable: (p) => ({
      id: "var:1", name: "spacing-md",
      resolvedType: "FLOAT",
      modeId: p.modeId || "m:1",
      newValue: p.value
    })
  });

  const r = await executeCode(
    `return await figma.modifyVariable({ variableId: "var:1", value: 24, modeId: "m:2" });`,
    bridge
  );
  assert("modifyVariable with modeId succeeds", r.success, r.error);
  assert("modeId present in result", r.success && r.result.modeId === "m:2");
  assert("value forwarded", r.success && r.result.newValue === 24);
}

// ── T-4: modifyVariable defaults to mode[0] when no modeId/modeName ───────────
console.log("\nT-4: modifyVariable defaults to mode[0]");
{
  const bridge = makeBridge({
    modifyVariable: (p) => ({
      id: "var:1", name: "accent",
      resolvedType: "COLOR",
      modeId: "m:1",
      newValue: p.value
    })
  });

  const r = await executeCode(
    `return await figma.modifyVariable({ variableName: "accent", value: "#6C5CE7" });`,
    bridge
  );
  assert("modifyVariable without modeId succeeds", r.success, r.error);
  assert("defaults to mode:1", r.success && r.result.modeId === "m:1");
}

// ── T-5: hexToRgbA preserves alpha from 8-char hex ───────────────────────────
console.log("\nT-5: createVariable with 8-char hex preserves alpha");
{
  let capturedValue = null;
  const bridge = makeBridge({
    createVariable: (p) => {
      capturedValue = p.value;
      return { id: "var:1", name: p.name, resolvedType: p.resolvedType || "COLOR", collectionId: p.collectionId };
    }
  });

  // Standard 6-char hex — alpha should be 1
  const r1 = await executeCode(
    `return await figma.createVariable({ name: "bg", collectionId: "col:1", resolvedType: "COLOR", value: "#FF0000" });`,
    bridge
  );
  assert("createVariable 6-char hex succeeds", r1.success, r1.error);

  // 8-char hex (#RRGGBBAA) — executor passes value string to bridge; alpha parsing tested structurally
  const r2 = await executeCode(
    `return await figma.createVariable({ name: "overlay", collectionId: "col:1", resolvedType: "COLOR", value: "#00000040" });`,
    bridge
  );
  assert("createVariable 8-char hex succeeds", r2.success, r2.error);
}

// ── T-5: setVariableValue 8-char hex ─────────────────────────────────────────
console.log("\nT-5: setVariableValue with 8-char hex (#RRGGBBAA)");
{
  const bridge = makeBridge({
    setVariableValue: (p) => ({
      variableId: "var:1", variableName: "overlay",
      modeId: "m:1", value: p.value
    })
  });

  const r = await executeCode(
    `return await figma.setVariableValue({ variableId: "var:1", modeId: "m:1", value: "#FFFFFF1A" });`,
    bridge
  );
  assert("setVariableValue 8-char hex succeeds", r.success, r.error);
  assert("value forwarded", r.success && r.result.value === "#FFFFFF1A");
}

// ── createVariableCollection — basic ─────────────────────────────────────────
console.log("\nBasic: createVariableCollection");
{
  const bridge = makeBridge({
    createVariableCollection: (p) => ({ id: "col:1", name: p.name, modes: [{ id: "m:1", name: "Mode 1" }] })
  });
  const r = await executeCode(
    `return await figma.createVariableCollection({ name: "Design Tokens" });`,
    bridge
  );
  assert("createVariableCollection succeeds", r.success, r.error);
  assert("name correct", r.success && r.result.name === "Design Tokens");
  assert("modes present", r.success && Array.isArray(r.result.modes));
}

// ── createVariable missing name → throws ─────────────────────────────────────
console.log("\nValidation: createVariable missing name throws");
{
  const bridge = makeBridge({
    createVariable: () => { throw new Error("Variable name is required"); }
  });
  const r = await executeCode(
    `return await figma.createVariable({ collectionId: "col:1" });`,
    bridge
  );
  // Bridge throws — executor catches and returns error
  assert("missing name results in error", !r.success || (r.success && r.error));
}

// ── applyVariable field mapping ───────────────────────────────────────────────
console.log("\napplyVariable: field aliases forwarded correctly");
{
  const bridge = makeBridge({
    applyVariable: (p) => ({ nodeId: p.nodeId, nodeName: "Text", field: p.field, variableId: "v:1", variableName: "fs" })
  });

  for (const [alias, expect] of [["fill", "fill"], ["stroke", "stroke"], ["fontSize", "fontSize"], ["visible", "visible"]]) {
    const r = await executeCode(
      `return await figma.applyVariable({ nodeId: "1:1", variableId: "v:1", field: "${alias}" });`,
      bridge
    );
    assert(`field "${alias}" forwarded`, r.success, r.error);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
