// VM sandbox for figma_write code.
import { createRequire } from "node:module";

import { buildFigmaProxy } from "./figma-proxy.js";

const vm = createRequire(import.meta.url)("vm");

const TIMEOUT_MS = 30_000;

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
export async function executeCode(code, bridge, sessionId) {
  // Wrap bridge to pin sessionId for all operations in this execution
  var wrappedBridge = sessionId ? {
    sendOperation: function(op, params) { return bridge.sendOperation(op, params, sessionId); }
  } : bridge;

  const logs = [];
  const ctx = vm.createContext({
    figma:   buildFigmaProxy(wrappedBridge),
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
    let msg = err.message;
    // Bug 5 fix: ReferenceError in sandbox means the variable was defined in a previous
    // figma_write call. Each call runs in an isolated VM context — variables don't persist.
    if (err instanceof ReferenceError || (err.name === "ReferenceError")) {
      msg += "\nNote: Each figma_write call runs in an isolated sandbox — variables from previous calls are not available. Re-query node IDs with figma.get_page_nodes() or figma.query() at the start of each call.";
    }
    return { success: false, error: msg, logs };
  }
}

