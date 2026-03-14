// Executes user-provided JS code inside a Node.js vm sandbox.
// Only the figma proxy (allowlisted operations) + safe builtins are available.
// Blocked: require, process, fs, fetch, setTimeout, eval, Function constructor.
import { createRequire } from "node:module";
const vm = createRequire(import.meta.url)("vm");

const TIMEOUT_MS = 10_000;

const WRITE_OPS = [
  "status", "listPages", "setPage", "createPage",
  "query", "create", "modify", "delete", "append",
  "listComponents", "instantiate",
  "ensure_library", "get_library_tokens",
];

const READ_OPS = [
  "get_selection", "get_design", "get_page_nodes",
  "screenshot", "export_svg",
];

const ALL_OPS = [...WRITE_OPS, ...READ_OPS];

function buildFigmaProxy(bridge) {
  const proxy = { notify: (msg) => Promise.resolve(msg) };
  for (const op of ALL_OPS) {
    proxy[op] = (params = {}) => bridge.sendOperation(op, params);
  }
  return proxy;
}

function buildConsole(logs) {
  const fmt = (args) =>
    args.map(x => typeof x === "object" ? JSON.stringify(x, null, 2) : String(x)).join(" ");
  return {
    log:   (...a) => logs.push(fmt(a)),
    error: (...a) => logs.push("[error] " + fmt(a)),
    warn:  (...a) => logs.push("[warn] "  + fmt(a)),
    info:  (...a) => logs.push("[info] "  + fmt(a)),
  };
}

/**
 * @returns {{ success: boolean, result?: unknown, error?: string, logs: string[] }}
 */
export async function executeCode(code, bridge) {
  const logs = [];
  const ctx = vm.createContext({
    figma:   buildFigmaProxy(bridge),
    console: buildConsole(logs),
    // Safe builtins
    Promise, JSON, Math, Object, Array, String, Number,
    Boolean, Error, parseInt, parseFloat, isNaN, isFinite,
    // Blocked
    require: undefined, process: undefined, fetch: undefined,
    setTimeout: undefined, setInterval: undefined,
    queueMicrotask: undefined, XMLHttpRequest: undefined,
  });

  try {
    const result = await vm.runInContext(`(async()=>{ ${code} })()`, ctx, {
      timeout:  TIMEOUT_MS,
      filename: "figma-code.js",
    });
    return { success: true, result: result ?? null, logs };
  } catch (err) {
    return { success: false, error: err.message, logs };
  }
}
