#!/usr/bin/env node
/**
 * v2.5.4 regression tests — typography tokens + variable bindings.
 * Uses the code-executor with mock bridge (no live Figma needed).
 */
import { executeCode } from "../server/code-executor.js";

let passed = 0, failed = 0;
const errs = [];

function assert(label, cond, detail = "") {
  if (cond) { console.log("  ✓", label); passed++; }
  else { const m = `  ✗ ${label}${detail ? " — " + detail : ""}`; console.error(m); errs.push(m); failed++; }
}

function makeBridge(ops = {}) {
  return {
    sendOperation: async (op, params) => {
      if (ops[op]) return ops[op](params);
      throw new Error(`Unexpected op: ${op}`);
    }
  };
}

// ── applyVariable: fontFamily STRING binding ──────────────────────────────
console.log("\n── applyVariable: fontFamily / fontStyle STRING ──");
{
  let capturedParams = null;
  const b = makeBridge({
    applyVariable: (p) => {
      capturedParams = p;
      return { nodeId: p.nodeId, field: p.field, variableId: p.variableId || "V:str-font" };
    }
  });
  const r = await executeCode(`
    return await figma.applyVariable({ nodeId: "1:1", field: "fontFamily", variableName: "font-primary" });
  `, b);
  assert("applyVariable field=fontFamily succeeds", r.success, JSON.stringify(r.error));
  assert("field passed through", capturedParams && capturedParams.field === "fontFamily");
}
{
  let capturedParams = null;
  const b = makeBridge({
    applyVariable: (p) => { capturedParams = p; return { nodeId: p.nodeId, field: p.field, variableId: "V:weight" }; }
  });
  const r = await executeCode(`return await figma.applyVariable({ nodeId: "1:1", field: "fontStyle", variableName: "font-weight-bold" });`, b);
  assert("applyVariable field=fontStyle succeeds", r.success, JSON.stringify(r.error));
  assert("fontStyle field passed through", capturedParams && capturedParams.field === "fontStyle");
}
{
  // alias fontWeight → fontStyle
  const b = makeBridge({ applyVariable: (p) => ({ nodeId: p.nodeId, field: p.field }) });
  const r = await executeCode(`return await figma.applyVariable({ nodeId: "1:1", field: "fontWeight", variableName: "w" });`, b);
  assert("applyVariable field=fontWeight alias accepted", r.success);
}
{
  // alias characters binding
  const b = makeBridge({ applyVariable: (p) => ({ nodeId: p.nodeId, field: p.field }) });
  const r = await executeCode(`return await figma.applyVariable({ nodeId: "1:1", field: "characters", variableName: "greeting" });`, b);
  assert("applyVariable field=characters accepted", r.success);
}

// ── setupDesignTokens: fontSizes + fonts ──────────────────────────────────
console.log("\n── setupDesignTokens: fontSizes (FLOAT) + fonts (STRING) ──");
{
  let params = null;
  const b = makeBridge({
    setupDesignTokens: (p) => {
      params = p;
      return {
        collectionId: "VC:1",
        collectionName: p.collectionName || "Design Tokens",
        modes: [{ id: "m:1", name: "Mode 1" }],
        created: [
          { name: "accent", id: "V:1", type: "COLOR" },
          { name: "text-body", id: "V:2", type: "FLOAT" },
          { name: "font-primary", id: "V:3", type: "STRING" },
        ],
        updated: [],
        textStyles: [],
        totalVariables: 3,
      };
    }
  });
  const r = await executeCode(`
    return await figma.setupDesignTokens({
      collectionName: "Design Tokens",
      colors: { "accent": "#6C5CE7" },
      fontSizes: { "text-body": 14, "text-heading": 20 },
      fonts: { "font-primary": "Inter", "font-display": "Playfair Display" },
    });
  `, b);
  assert("setupDesignTokens with fontSizes+fonts succeeds", r.success, JSON.stringify(r.error));
  assert("fontSizes passed", params && params.fontSizes && params.fontSizes["text-body"] === 14);
  assert("fonts passed", params && params.fonts && params.fonts["font-primary"] === "Inter");
  assert("response includes modes array", r.success && Array.isArray(r.result.modes));
}

// ── setupDesignTokens: textStyles with {var-name} refs ────────────────────
console.log("\n── setupDesignTokens: textStyles with variable refs ──");
{
  let params = null;
  const b = makeBridge({
    setupDesignTokens: (p) => {
      params = p;
      return {
        collectionId: "VC:1",
        collectionName: "Design Tokens",
        modes: [{ id: "m:1", name: "Mode 1" }],
        created: [{ name: "text/heading-xl", id: "S:1", type: "TEXT_STYLE" }],
        updated: [],
        textStyles: [{ name: "text/heading-xl", id: "S:1", created: true, fontFamily: "Inter", fontStyle: "Bold" }],
        totalVariables: 5,
      };
    }
  });
  const r = await executeCode(`
    return await figma.setupDesignTokens({
      fontSizes: { "text-heading-xl": 32 },
      fonts: { "font-primary": "Inter" },
      textStyles: {
        "text/heading-xl": {
          fontFamily: "{font-primary}",
          fontWeight: "Bold",
          fontSize: "{text-heading-xl}",
          lineHeight: 40,
          letterSpacing: -0.5
        }
      }
    });
  `, b);
  assert("textStyles with refs succeeds", r.success, JSON.stringify(r.error));
  assert("textStyles param passed through", params && params.textStyles && params.textStyles["text/heading-xl"]);
  assert("textStyles fontFamily is var ref", params.textStyles["text/heading-xl"].fontFamily === "{font-primary}");
  assert("textStyles fontSize is var ref", params.textStyles["text/heading-xl"].fontSize === "{text-heading-xl}");
  assert("response includes textStyles array", r.success && Array.isArray(r.result.textStyles));
}

// ── setupDesignTokens: multi-mode typography ──────────────────────────────
console.log("\n── setupDesignTokens: multi-mode typography ──");
{
  let params = null;
  const b = makeBridge({
    setupDesignTokens: (p) => {
      params = p;
      return {
        collectionId: "VC:2",
        collectionName: "Typography",
        modes: [
          { id: "m:compact", name: "compact" },
          { id: "m:comfortable", name: "comfortable" },
          { id: "m:large", name: "large" }
        ],
        created: [{ name: "text-body", id: "V:1", type: "FLOAT" }],
        updated: [],
        textStyles: [],
        totalVariables: 1,
      };
    }
  });
  const r = await executeCode(`
    return await figma.setupDesignTokens({
      collectionName: "Typography",
      modes: ["compact", "comfortable", "large"],
      fontSizes: {
        "text-body": { compact: 12, comfortable: 14, large: 16 },
        "text-heading-xl": { compact: 22, comfortable: 24, large: 28 }
      }
    });
  `, b);
  assert("multi-mode typography succeeds", r.success, JSON.stringify(r.error));
  assert("modes array passed", params && Array.isArray(params.modes) && params.modes.length === 3);
  assert("fontSizes per-mode value object", params && typeof params.fontSizes["text-body"] === "object");
  assert("response has 3 modes", r.success && r.result.modes.length === 3);
}

// ── applyTextStyle helper ─────────────────────────────────────────────────
console.log("\n── applyTextStyle helper ──");
{
  let params = null;
  const b = makeBridge({
    applyTextStyle: (p) => {
      params = p;
      return { nodeId: p.nodeId, nodeName: "title", styleId: "S:heading", styleName: p.styleName };
    }
  });
  const r = await executeCode(`
    return await figma.applyTextStyle({ nodeId: "1:10", styleName: "text/heading-xl" });
  `, b);
  assert("applyTextStyle succeeds", r.success, JSON.stringify(r.error));
  assert("nodeId passed", params && params.nodeId === "1:10");
  assert("styleName passed", params && params.styleName === "text/heading-xl");
  assert("returns styleId", r.success && r.result.styleId === "S:heading");
}
{
  // by styleId directly
  const b = makeBridge({ applyTextStyle: (p) => ({ nodeId: p.nodeId, styleId: p.styleId }) });
  const r = await executeCode(`return await figma.applyTextStyle({ nodeId: "1:10", styleId: "S:heading" });`, b);
  assert("applyTextStyle by styleId works", r.success);
}

// ── Full workflow: setup tokens → create text → apply style ───────────────
console.log("\n── Full workflow: tokens → text → apply style ──");
{
  const log = [];
  const b = makeBridge({
    setupDesignTokens: (p) => { log.push("setupDesignTokens"); return {
      collectionId: "VC:1", collectionName: "Tokens", modes: [{id:"m:1",name:"Mode 1"}],
      created: [{name:"text-body",id:"V:1",type:"FLOAT"}], updated: [], textStyles: [{name:"text/body",id:"S:1",created:true}], totalVariables: 1
    }; },
    create: (p) => { log.push("create:"+p.type); return { id: "T:1", type: p.type, name: p.name }; },
    applyTextStyle: (p) => { log.push("applyTextStyle:"+p.styleName); return { nodeId: p.nodeId, styleName: p.styleName }; },
  });
  const r = await executeCode(`
    // Step 1: setup tokens
    await figma.setupDesignTokens({
      fontSizes: { "text-body": 14 },
      fonts: { "font-primary": "Inter" },
      textStyles: {
        "text/body": { fontFamily: "{font-primary}", fontWeight: "Regular", fontSize: "{text-body}" }
      }
    });
    // Step 2: create text
    var t = await figma.create({ type: "TEXT", content: "Hello", name: "label" });
    // Step 3: apply style
    return await figma.applyTextStyle({ nodeId: t.id, styleName: "text/body" });
  `, b);
  assert("full workflow runs end-to-end", r.success, JSON.stringify(r.error));
  assert("all 3 ops called", log.length === 3);
  assert("correct order", log[0] === "setupDesignTokens" && log[1] === "create:TEXT" && log[2] === "applyTextStyle:text/body");
}

// ── Summary ───────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${"═".repeat(60)}`);
console.log(`Total: ${total} | ✓ ${passed} | ✗ ${failed}`);
if (errs.length) { console.log("\nFailures:"); errs.forEach(e => console.log(e)); }
console.log("═".repeat(60));
if (failed > 0) process.exit(1);
