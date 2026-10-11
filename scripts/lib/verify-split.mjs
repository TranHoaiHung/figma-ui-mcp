#!/usr/bin/env node
// Guard for file splits: the concatenated bundle must keep exactly the same
// top-level declarations after a split as before it. Run with `snapshot` before
// splitting and `check` after.
//
//   node scripts/lib/verify-split.mjs snapshot
//   ...move code between files...
//   node scripts/lib/verify-split.mjs check
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const SNAP = "/tmp/figma-mcp-split-snapshot.json";

function symbols() {
  execSync("npm run build:plugin", { stdio: "pipe" });
  const src = readFileSync("plugin/code.js", "utf8");
  const fns = [...src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const handlers = [...src.matchAll(/^handlers\.([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]);
  const vars = [...src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  return {
    functions: [...new Set(fns)].sort(),
    handlers: [...new Set(handlers)].sort(),
    topLevelVars: [...new Set(vars)].sort(),
  };
}

const mode = process.argv[2];

if (mode === "snapshot") {
  const s = symbols();
  writeFileSync(SNAP, JSON.stringify(s, null, 2));
  console.log(`snapshot: ${s.functions.length} functions, ${s.handlers.length} handlers, ${s.topLevelVars.length} top-level vars`);
  process.exit(0);
}

if (mode === "check") {
  if (!existsSync(SNAP)) { console.error("no snapshot — run `snapshot` first"); process.exit(1); }
  const before = JSON.parse(readFileSync(SNAP, "utf8"));
  const after = symbols();
  let bad = 0;
  for (const k of ["functions", "handlers", "topLevelVars"]) {
    const lost = before[k].filter((x) => !after[k].includes(x));
    const gained = after[k].filter((x) => !before[k].includes(x));
    if (lost.length) { console.error(`✗ ${k} LOST: ${lost.join(", ")}`); bad++; }
    if (gained.length) { console.log(`  ${k} added: ${gained.join(", ")}`); }
    if (!lost.length) console.log(`✓ ${k}: all ${before[k].length} still present`);
  }
  // A duplicate top-level declaration in one shared scope is a real break.
  const src = readFileSync("plugin/code.js", "utf8");
  for (const name of after.functions) {
    const n = (src.match(new RegExp(`^(?:async\\s+)?function\\s+${name}\\b`, "gm")) || []).length;
    if (n > 1) { console.error(`✗ duplicate function declaration: ${name} (${n}x)`); bad++; }
  }
  console.log(bad ? `\nFAILED (${bad})` : "\nOK — no symbols lost, no duplicates");
  process.exit(bad ? 1 : 0);
}

console.error("usage: verify-split.mjs snapshot|check");
process.exit(1);
