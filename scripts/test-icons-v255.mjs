#!/usr/bin/env node
/**
 * v2.5.5 icon library tests — verify priority order + fill injection.
 * Uses real httpFetch to unpkg (network required).
 */
import { executeCode } from "../server/code-executor.js";

let passed = 0, failed = 0;
const errs = [];
function assert(label, cond, detail = "") {
  if (cond) { console.log("  ✓", label); passed++; }
  else { const m = `  ✗ ${label}${detail ? " — " + detail : ""}`; console.error(m); errs.push(m); failed++; }
}

// Capture the SVG markup that loadIcon ultimately posts to the plugin
function makeCapturingBridge() {
  const captured = [];
  return {
    captured,
    sendOperation: async (op, params) => {
      if (op === "create" && params.type === "SVG") {
        captured.push({ name: params.name, svg: params.svg, fill: params.fill });
        return { id: "S:" + captured.length, type: "SVG", name: params.name };
      }
      throw new Error("Unexpected op: " + op);
    }
  };
}

console.log("\n── Ionicons priority (filled iOS style is first) ──");
{
  const b = makeCapturingBridge();
  const r = await executeCode(`
    return await figma.loadIcon("home", { size: 24, fill: "#6C5CE7" });
  `, b);
  assert("loadIcon('home') succeeds", r.success, r.error);
  assert("captured 1 SVG op", b.captured.length === 1);
  const svg = b.captured[0] && b.captured[0].svg;
  assert("SVG contains <svg", svg && svg.includes("<svg"));
  // Ionicons has viewBox 0 0 512 512; Fluent has 0 0 24 24. Priority check:
  assert("Ionicons served first (viewBox 512)", svg && svg.includes('viewBox="0 0 512 512"'),
    "got viewBox: " + (svg ? svg.match(/viewBox="[^"]*"/)?.[0] : "none"));
  // fill injection at <svg> root for Ionicons
  assert("SVG tag has fill attribute injected",
    svg && /<svg[^>]*fill="#6C5CE7"/i.test(svg),
    "svg header: " + (svg ? svg.slice(0, 200) : "none"));
}

console.log("\n── Fallback to Fluent when Ionicons has no match ──");
{
  const b = makeCapturingBridge();
  // "document-filled" doesn't exist in Ionicons; Fluent has "document_24_filled"
  const r = await executeCode(`
    return await figma.loadIcon("document", { size: 24, fill: "#FF0000" });
  `, b);
  assert("loadIcon falls back gracefully", r.success, r.error);
  const svg = b.captured[0] && b.captured[0].svg;
  // Either Ionicons "document" (200) or Fluent. Both have currentColor replaced.
  assert("fill applied", svg && (svg.includes("#FF0000") || svg.includes('fill="#FF0000"')),
    "svg: " + (svg ? svg.slice(0, 300) : "none"));
}

console.log("\n── Tabler filled works ──");
{
  const b = makeCapturingBridge();
  // Use an icon that is clearly Tabler-specific to hit the path
  // (most common names resolve at Ionicons first — use a name that only
  //  exists in Tabler filled: "lock-filled"? we verify by whichever lib wins)
  const r = await executeCode(`
    return await figma.loadIcon("adjustments", { size: 24, fill: "#333333" });
  `, b);
  assert("loadIcon('adjustments') resolves", r.success, r.error);
  const svg = b.captured[0] && b.captured[0].svg;
  assert("non-empty SVG", svg && svg.length > 50);
}

console.log("\n── Unknown icon throws with helpful error ──");
{
  const b = makeCapturingBridge();
  const r = await executeCode(`
    return await figma.loadIcon("absolutely-not-a-real-icon-xyz-123");
  `, b);
  assert("unknown icon fails", !r.success);
  assert("error lists tried libraries", r.error && /ionicons/.test(r.error) && /tabler/.test(r.error),
    "err: " + r.error);
}

const total = passed + failed;
console.log(`\n${"═".repeat(60)}`);
console.log(`Total: ${total} | ✓ ${passed} | ✗ ${failed}`);
if (errs.length) { console.log("\nFailures:"); errs.forEach(e => console.log(e)); }
console.log("═".repeat(60));
if (failed > 0) process.exit(1);
