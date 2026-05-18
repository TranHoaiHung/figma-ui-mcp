#!/usr/bin/env node
// Tests for documentAccess: dynamic-page fixes:
//   1. handlers.instantiate calls loadAllPagesAsync before findOne
//   2. loadAllPagesAsync exposed as a sandbox op (figma.loadAllPagesAsync())
//
// Layer A — proxy/sandbox: confirms figma.loadAllPagesAsync() is routed to the bridge.
// Layer B — plugin handler logic: instantiate runs loadAllPagesAsync BEFORE findOne;
//           regression check that the happy path (existing tests) still works.
//
// No live Figma needed.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { executeCode } from "../server/code-executor.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

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

// ──────────────────────────────────────────────────────────────────────────────
// LAYER A — proxy/sandbox forwarding
// ──────────────────────────────────────────────────────────────────────────────

console.log("\nLayer A: figma.loadAllPagesAsync() routed to bridge");
{
  let captured = false;
  const bridge = makeBridge({
    loadAllPagesAsync: () => { captured = true; return { loaded: true, pageCount: 3 }; },
  });
  const r = await executeCode(`return await figma.loadAllPagesAsync();`, bridge);
  assert("call succeeds", r.success, r.error);
  assert("bridge received op", captured === true);
  assert("response forwarded back", r.result && r.result.loaded === true && r.result.pageCount === 3);
}

console.log("\nLayer A: op is on the WRITE_OPS allowlist");
{
  // If not on the allowlist, the proxy method would be undefined → TypeError.
  // With an empty bridge, we should see "Unexpected op: loadAllPagesAsync" instead.
  const r = await executeCode(`return await figma.loadAllPagesAsync();`, makeBridge({}));
  assert("op reaches bridge (allowlist OK)", !r.success && /Unexpected op: loadAllPagesAsync/.test(r.error),
    "got: " + (r.error || JSON.stringify(r.result)));
}

// ──────────────────────────────────────────────────────────────────────────────
// LAYER B — plugin handler logic with mocked Figma globals
// ──────────────────────────────────────────────────────────────────────────────
// handlers-write.js depends on helpers from utils.js and paint-and-effects.js
// (normalizeHex, solidFill, etc.). We concat those + handlers-write itself
// into a vm context and exercise handlers.instantiate against mocked Figma.

function loadPluginContext() {
  const utils = readFileSync(resolve(REPO, "src/plugin/utils.js"), "utf8");
  const paintFx = readFileSync(resolve(REPO, "src/plugin/paint-and-effects.js"), "utf8");
  // handlers-write.js is the first file in the build concat order and declares
  // `const handlers = {}` at the top. Strip that line so handler assignments
  // target the sandbox's pre-seeded `handlers` instead of a shadowed const.
  const writeH = readFileSync(resolve(REPO, "src/plugin/handlers-write.js"), "utf8")
    .replace(/^const handlers = \{\};\s*$/m, "// (handlers seeded by test harness)");

  const callLog = [];
  const sandbox = {
    handlers: {},
    callLog,
    figma: {
      // Tracks the order operations are called.
      async loadAllPagesAsync() { callLog.push("loadAllPagesAsync"); },
      root: {
        // findOne is sync in real plugin; the handler awaits loadAllPagesAsync first.
        findOne(predicate) {
          callLog.push("findOne");
          const node = sandbox.__mockComponents.find(c => predicate(c));
          return node || null;
        },
        findAllWithCriteria() { return []; },
      },
      async loadFontAsync() {},
      // findAll defaults for other handlers we don't exercise
      currentPage: { findAll: () => [] },
    },
    console,
  };

  sandbox.__mockComponents = [];
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

const ctx = loadPluginContext();
const { handlers, callLog } = ctx;

function makeMockComponent(id, name) {
  return {
    id, name, type: "COMPONENT",
    createInstance() {
      return { id: id + ":inst", name: name + "-inst", type: "INSTANCE", x: 0, y: 0,
        findOne() { return null; } };
    },
  };
}

console.log("\nLayer B: instantiate by id — loadAllPagesAsync called BEFORE findOne");
{
  callLog.length = 0;
  ctx.__mockComponents.push(makeMockComponent("c:1", "btn/primary"));
  const r = await handlers.instantiate({ componentId: "c:1", x: 10, y: 20 });
  assert("instantiate succeeds", r && r.id === "c:1:inst");
  assert("loadAllPagesAsync was called", callLog.includes("loadAllPagesAsync"));
  assert("findOne was called", callLog.includes("findOne"));
  assert("loadAllPagesAsync ran BEFORE findOne",
    callLog.indexOf("loadAllPagesAsync") < callLog.indexOf("findOne"),
    "callLog: " + callLog.join(","));
}

console.log("\nLayer B: instantiate by name — loadAllPagesAsync called BEFORE findOne");
{
  callLog.length = 0;
  ctx.__mockComponents.length = 0;
  ctx.__mockComponents.push(makeMockComponent("c:2", "btn/secondary"));
  const r = await handlers.instantiate({ componentName: "btn/secondary" });
  assert("instantiate succeeds", r && r.id === "c:2:inst");
  assert("loadAllPagesAsync called", callLog.includes("loadAllPagesAsync"));
  assert("ordering preserved", callLog.indexOf("loadAllPagesAsync") < callLog.indexOf("findOne"));
}

console.log("\nLayer B: instantiate — missing component still throws after load attempt");
{
  callLog.length = 0;
  ctx.__mockComponents.length = 0;
  await handlers.instantiate({ componentId: "ghost" })
    .then(() => assert("missing component rejected", false))
    .catch(e => assert("missing component rejected", /Component ghost not found/.test(e.message)));
  assert("load was still attempted (graceful)", callLog.includes("loadAllPagesAsync"));
}

console.log("\nLayer B: loadAllPagesAsync handler — returns pageCount");
{
  // listComponents handler exists in handlers-write.js; loadAllPagesAsync was
  // added next to it. Check the new one works standalone.
  ctx.figma.root.children = [{}, {}, {}]; // 3 mock pages
  const r = await handlers.loadAllPagesAsync();
  assert("returns loaded:true", r && r.loaded === true);
  assert("returns pageCount", r && r.pageCount === 3);
}

// ──────────────────────────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`Total: ${passed + failed} tests | ✓ ${passed} passed | ✗ ${failed} failed`);
console.log(`════════════════════════════════════════════════════════════`);
process.exit(failed === 0 ? 0 : 1);
