#!/usr/bin/env node
/**
 * v2.5.2 regression tests — validate feedback.md fixes.
 * Uses vm to load plugin helpers directly (no live Figma needed).
 */
import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const vm = require("vm");

let passed = 0, failed = 0;
const errs = [];

function assert(label, cond, detail = "") {
  if (cond) { console.log("  ✓", label); passed++; }
  else { const m = `  ✗ ${label}${detail ? " — " + detail : ""}`; console.error(m); errs.push(m); failed++; }
}

// ── Load plugin sandbox with minimal figma stub ───────────────────────────────
const pluginSrc = readFileSync("plugin/code.js", "utf8");
// Strip the trailing plugin wiring (figma.ui.onmessage, showUI, etc.) — we only
// want to test pure helper functions. Extract everything up to the first
// "figma.showUI" or "figma.ui.onmessage" line.
const stripIdx = pluginSrc.search(/figma\.showUI|figma\.ui\.onmessage|figma\.on\(/);
const helpersOnly = stripIdx > 0 ? pluginSrc.slice(0, stripIdx) : pluginSrc;

const ctx = {
  figma: {
    variables: {},
    ui: { postMessage: () => {} },
    loadFontAsync: async () => {},
    root: { name: "Test" },
    currentPage: { name: "Page 1", children: [], findOne: () => null },
  },
  console,
  Promise, JSON, Math, Object, Array, String, Number, Boolean, Error,
  parseInt, parseFloat, isNaN, isFinite, TypeError, ReferenceError,
  setTimeout: () => {},
  Uint8Array,
};
vm.createContext(ctx);
try {
  vm.runInContext(helpersOnly, ctx, { filename: "plugin.js" });
} catch (e) {
  console.error("Failed to load plugin helpers:", e.message);
  process.exit(1);
}

// ── BUG-02: 8-digit hex / rgba alpha extraction ──────────────────────────────
console.log("\n── BUG-02: hex alpha extraction ──");
{
  assert("extractColorAlpha(#FFFFFF80) = 0.502", Math.abs(ctx.extractColorAlpha("#FFFFFF80") - (0x80/255)) < 0.001);
  assert("extractColorAlpha(#FFFFFF00) = 0", ctx.extractColorAlpha("#FFFFFF00") === 0);
  assert("extractColorAlpha(#FFFFFFFF) = 1", ctx.extractColorAlpha("#FFFFFFFF") === 1);
  assert("extractColorAlpha(rgba(0,0,0,0.3)) = 0.3", Math.abs(ctx.extractColorAlpha("rgba(0,0,0,0.3)") - 0.3) < 0.001);
  assert("extractColorAlpha(#FFFFFF) = null (no alpha)", ctx.extractColorAlpha("#FFFFFF") === null);
  assert("extractColorAlpha(#fff8) ≈ 0.53", Math.abs(ctx.extractColorAlpha("#fff8") - (0x88/255)) < 0.001);
}
{
  // normalizeHex accepts 8-digit without throwing
  let ok = true;
  try { ctx.normalizeHex("#FFFFFF00"); } catch (e) { ok = false; }
  assert("normalizeHex(#FFFFFF00) doesn't throw", ok);
  let ok2 = true;
  try { ctx.normalizeHex("#6C5CE780"); } catch (e) { ok2 = false; }
  assert("normalizeHex(#6C5CE780) doesn't throw", ok2);
}
{
  // solidFill extracts alpha automatically
  const fills = ctx.solidFill("#FFFFFF80");
  assert("solidFill(#FFFFFF80) has opacity", fills.length === 1 && typeof fills[0].opacity === "number");
  assert("solidFill(#FFFFFF80) opacity ≈ 0.502", Math.abs(fills[0].opacity - 0x80/255) < 0.001);
  // Explicit fillOpacity wins over alpha
  const explicit = ctx.solidFill("#FFFFFF80", 0.1);
  assert("explicit fillOpacity overrides hex alpha", explicit[0].opacity === 0.1);
  // No alpha → no opacity field
  const noAlpha = ctx.solidFill("#FFFFFF");
  assert("solidFill without alpha doesn't add opacity", noAlpha[0].opacity === undefined);
}

// ── BUG-04 + BUG-03: SVG path normalization ──────────────────────────────────
console.log("\n── BUG-04: commas in path ──");
{
  const out = ctx.normalizeSvgPath("M 150 7 C 229 7, 293 71, 293 150");
  assert("commas converted to spaces", !out.includes(","));
  assert("contains M command", out.includes("M"));
  assert("contains C command", out.includes("C"));
}

console.log("\n── BUG-03: arc A command → cubic bezier ──");
{
  const out = ctx.normalizeSvgPath("M 150 7 A 143 143 0 1 1 29.26 226.62");
  assert("arc command converted (no 'A' remains)", !/[ ]A[ ]/.test(" " + out + " "));
  assert("arc replaced with C segments", out.includes("C"));
  assert("M command preserved", out.startsWith("M"));
}
{
  // Relative arc
  const out = ctx.normalizeSvgPath("M 0 0 a 50 50 0 0 1 100 0");
  assert("relative arc 'a' also converted", !/ a /.test(" " + out + " "));
  assert("relative arc produces C segments", out.includes("C"));
}
{
  // Path with no arc should just normalize commas
  const out = ctx.normalizeSvgPath("M0,0 L100,100 Z");
  assert("simple path no-arc works", out.includes("M") && out.includes("L") && out.includes("Z"));
  assert("simple path comma-free", !out.includes(","));
}

// ── BUG-11: Gradient fills ──────────────────────────────────────────────────
console.log("\n── BUG-11: gradient fill spec ──");
{
  const paint = ctx.buildGradientPaint({
    type: "LINEAR_GRADIENT",
    angle: 135,
    stops: [{ pos: 0, color: "#7C3AED" }, { pos: 1, color: "#EC4899" }]
  });
  assert("gradient paint returns GRADIENT_LINEAR", paint && paint.type === "GRADIENT_LINEAR");
  assert("gradient has 2 stops", paint.gradientStops.length === 2);
  assert("first stop position 0", paint.gradientStops[0].position === 0);
  assert("first stop has RGBA color", paint.gradientStops[0].color.a === 1);
  assert("gradientTransform is 2x3 matrix", paint.gradientTransform.length === 2 && paint.gradientTransform[0].length === 3);
}
{
  const radial = ctx.buildGradientPaint({
    type: "RADIAL_GRADIENT",
    stops: [{ pos: 0, color: "#FFFFFF" }, { pos: 1, color: "#00000080" }]
  });
  assert("radial gradient type", radial && radial.type === "GRADIENT_RADIAL");
  assert("radial stop alpha extracted", Math.abs(radial.gradientStops[1].color.a - 0x80/255) < 0.001);
}
{
  // Invalid spec returns null
  assert("null spec → null", ctx.buildGradientPaint(null) === null);
  assert("wrong type → null", ctx.buildGradientPaint({ type: "INVALID", stops: [] }) === null);
  assert("empty stops → null", ctx.buildGradientPaint({ type: "LINEAR", stops: [] }) === null);
}
{
  // buildFillArray dispatches correctly
  const hex = ctx.buildFillArray("#FF0000");
  assert("buildFillArray hex → SOLID", hex[0].type === "SOLID");
  const grad = ctx.buildFillArray({ type: "LINEAR", stops: [{ pos: 0, color: "#FF0000" }, { pos: 1, color: "#0000FF" }] });
  assert("buildFillArray spec → GRADIENT_LINEAR", grad[0].type === "GRADIENT_LINEAR");
}

// ── BUG-10: Effects (drop shadow, blur) ──────────────────────────────────────
console.log("\n── BUG-10: effects builder ──");
{
  const shadow = ctx.buildEffect({ type: "DROP_SHADOW", color: "#000000", offset: {x:0,y:4}, radius: 12, spread: 0 });
  assert("DROP_SHADOW type", shadow && shadow.type === "DROP_SHADOW");
  assert("DROP_SHADOW radius", shadow.radius === 12);
  assert("DROP_SHADOW offset y", shadow.offset.y === 4);
  assert("DROP_SHADOW default alpha 0.25", Math.abs(shadow.color.a - 0.25) < 0.001);
}
{
  const rgba = ctx.buildEffect({ type: "DROP_SHADOW", color: "#00000080", offsetY: 8, radius: 20 });
  assert("DROP_SHADOW extracts alpha from hex", Math.abs(rgba.color.a - 0x80/255) < 0.001);
  assert("DROP_SHADOW offsetY shorthand", rgba.offset.y === 8);
}
{
  const blur = ctx.buildEffect({ type: "LAYER_BLUR", radius: 8 });
  assert("LAYER_BLUR type", blur.type === "LAYER_BLUR");
  assert("LAYER_BLUR radius", blur.radius === 8);
}
{
  const bgBlur = ctx.buildEffect({ type: "BACKGROUND_BLUR", radius: 20 });
  assert("BACKGROUND_BLUR type", bgBlur.type === "BACKGROUND_BLUR");
}
{
  const inner = ctx.buildEffect({ type: "INNER_SHADOW", color: "#000", radius: 4 });
  assert("INNER_SHADOW type", inner.type === "INNER_SHADOW");
}

// ── BUG-13: Individual corner radii ──────────────────────────────────────────
console.log("\n── BUG-13: individual corner radii ──");
{
  // Mock a FRAME-like node
  const mockNode = {
    cornerRadius: 0, topLeftRadius: 0, topRightRadius: 0,
    bottomLeftRadius: 0, bottomRightRadius: 0
  };
  ctx.applyCornerRadii(mockNode, { topLeftRadius: 16, topRightRadius: 16 });
  assert("topLeftRadius applied", mockNode.topLeftRadius === 16);
  assert("topRightRadius applied", mockNode.topRightRadius === 16);
  assert("bottomLeftRadius unchanged", mockNode.bottomLeftRadius === 0);
}
{
  // Uniform cornerRadius still works
  const mockNode2 = { cornerRadius: 0, topLeftRadius: 0 };
  ctx.applyCornerRadii(mockNode2, { cornerRadius: 12 });
  assert("uniform cornerRadius still works", mockNode2.cornerRadius === 12);
}
{
  // Individual corners on node that doesn't support them → skipped
  const mockEllipse = {}; // no corner fields
  ctx.applyCornerRadii(mockEllipse, { topLeftRadius: 8 });
  assert("missing fields silently skipped (no throw)", true);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(60)}`);
console.log(`Total: ${passed+failed} | ✓ ${passed} | ✗ ${failed}`);
if (errs.length) { console.log("\nFailures:"); errs.forEach(e => console.log(e)); }
console.log("═".repeat(60));
if (failed > 0) process.exit(1);
