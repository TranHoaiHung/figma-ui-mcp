#!/usr/bin/env node
/**
 * v2.5.11 tests — sectioned figma_docs:
 * - getDocs() returns index + default (quick-start) section
 * - getDocs("rules") returns rules section
 * - getDocs("layout") returns layout section
 * - getDocs("api") returns api section
 * - getDocs("tokens") returns tokens section
 * - getDocs("icons") returns icons section
 * - getDocs("unknown") returns error + index
 * - Each section is under 25KB (MCP token limit)
 * - tool-definitions.js has section param with enum
 * - server/index.js calls getDocs(args?.section)
 */
import { readFileSync } from "fs";

let passed = 0, failed = 0;
const errs = [];
function assert(label, cond, detail = "") {
  if (cond) { console.log("  ✓", label); passed++; }
  else { const m = `  ✗ ${label}${detail ? " — " + detail : ""}`; console.error(m); errs.push(m); failed++; }
}

const pkg      = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
const index    = readFileSync(new URL("../server/index.js", import.meta.url), "utf-8");
const toolDefs = readFileSync(new URL("../server/tool-definitions.js", import.meta.url), "utf-8");

// ── version ──────────────────────────────────────────────────────────────────
console.log("\n── version ──");
{
  assert("package.json version is 2.5.11", pkg.version === "2.5.11");
  assert("server/index.js version is 2.5.11", index.includes('"2.5.11"'));
}

// ── server/index.js wiring ───────────────────────────────────────────────────
console.log("\n── server/index.js wiring ──");
{
  assert("imports getDocs (not DOCS)", index.includes("getDocs") && !index.includes("{ DOCS }"));
  assert("figma_docs handler calls getDocs(args?.section)", index.includes("getDocs(args?.section)"));
}

// ── tool-definitions.js section param ────────────────────────────────────────
console.log("\n── tool-definitions.js section param ──");
{
  assert("figma_docs has section property", toolDefs.includes("section:") || toolDefs.includes('"section"'));
  assert("section enum includes 'rules'", toolDefs.includes('"rules"'));
  assert("section enum includes 'layout'", toolDefs.includes('"layout"'));
  assert("section enum includes 'api'", toolDefs.includes('"api"'));
  assert("section enum includes 'tokens'", toolDefs.includes('"tokens"'));
  assert("section enum includes 'icons'", toolDefs.includes('"icons"'));
}

// ── getDocs() functional tests ───────────────────────────────────────────────
console.log("\n── getDocs() functional tests ──");
{
  const { getDocs } = await import(new URL("../server/api-docs.js", import.meta.url));

  const defaultDoc = getDocs();
  assert("getDocs() returns non-empty string", typeof defaultDoc === "string" && defaultDoc.length > 100);
  assert("getDocs() includes quick-start or index content",
    defaultDoc.includes("figma_docs") || defaultDoc.includes("quick") || defaultDoc.includes("section"));
  assert("getDocs() under 25KB", Buffer.byteLength(defaultDoc, "utf-8") < 25 * 1024,
    `got ${(Buffer.byteLength(defaultDoc, "utf-8") / 1024).toFixed(1)}KB`);

  const sections = ["rules", "layout", "api", "tokens", "icons"];
  for (const s of sections) {
    const doc = getDocs(s);
    assert(`getDocs("${s}") returns non-empty`, typeof doc === "string" && doc.length > 100);
    const kb = Buffer.byteLength(doc, "utf-8") / 1024;
    assert(`getDocs("${s}") under 25KB`, kb < 25, `got ${kb.toFixed(1)}KB`);
  }

  const unknown = getDocs("nonexistent");
  assert('getDocs("nonexistent") returns error message', unknown.includes("Unknown section") || unknown.includes("nonexistent"));
}

// ── regression: v2.5.10 fixes still present ──────────────────────────────────
console.log("\n── regression: v2.5.10 fixes ──");
{
  const write    = readFileSync(new URL("../src/plugin/handlers-write.js", import.meta.url), "utf-8");
  const writeOps = readFileSync(new URL("../src/plugin/handlers-write-ops.js", import.meta.url), "utf-8");
  const executor = readFileSync(new URL("../server/code-executor.js", import.meta.url), "utf-8");

  assert("BUG-03: characters alias still present", write.includes("params.characters !== undefined ? params.characters"));
  assert("BUG-04: fontColor in TEXT create still present", write.includes("var textFill = fill || params.fontColor"));
  assert("BUG-05: fontColor in modify still present", write.includes("params.fontColor !== undefined && params.fill === undefined"));
  assert("BUG-08: setCurrentPageAsync still present", writeOps.includes("setCurrentPageAsync(candidate)"));
  assert("BUG-12: proxy.getNodeById still present", executor.includes("proxy.getNodeById"));
  assert("BUG-13: proxy.zoom_to_fit still present", executor.includes("proxy.zoom_to_fit"));
  assert("BUG-14: proxy.getCurrentPage still present", executor.includes("proxy.getCurrentPage"));
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`v2.5.11 tests: ${passed} passed, ${failed} failed`);
if (errs.length) { errs.forEach(e => console.error(e)); process.exit(1); }
