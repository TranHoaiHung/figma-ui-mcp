// Test helper: load the plugin source the way the build does.
//
// Tests used to readFileSync individual src/plugin/*.js files and regex out the
// `const handlers = {}` line. That coupled every test to the current file layout,
// so splitting an oversized file broke thirteen of them. Load through here
// instead and a split is invisible to the test.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { PLUGIN_FILES } from "./plugin-files.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// `const handlers = {}` would shadow a harness-seeded object, so neutralize the
// declaration and let the sandbox supply it.
function stripHandlersDecl(src) {
  return src.replace(/^const handlers = \{\};\s*$/m, "// (handlers supplied by the test sandbox)");
}

// Concatenated plugin source. `only` picks a subset by basename or path fragment,
// for tests that deliberately exercise one layer.
export function pluginSource(opts) {
  const only = opts && opts.only;
  const picked = only
    ? PLUGIN_FILES.filter((f) => only.some((o) => f.endsWith(o) || f.includes(o)))
    : PLUGIN_FILES;
  if (only && picked.length === 0) {
    throw new Error("load-plugin: no files matched " + JSON.stringify(only));
  }
  return picked
    .map((f) => "// ── " + f + " ──\n" + stripHandlersDecl(readFileSync(resolve(REPO, f), "utf8")))
    .join("\n\n")
    .replace(/\{\{PLUGIN_VERSION\}\}/g, pkgVersion());
}

export function pkgVersion() {
  return JSON.parse(readFileSync(resolve(REPO, "package.json"), "utf8")).version;
}

// Run the plugin source in a vm with the given globals. Returns the sandbox, so a
// test can reach `sandbox.handlers` or any top-level function.
export function loadPlugin(globals, opts) {
  const sandbox = Object.assign({ handlers: {}, console }, globals || {});
  vm.createContext(sandbox);
  vm.runInContext(pluginSource(opts), sandbox, { filename: "plugin-under-test.js" });
  return sandbox;
}

export { PLUGIN_FILES, REPO };
