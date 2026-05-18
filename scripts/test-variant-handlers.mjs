#!/usr/bin/env node
// Tests for the three variant/property handlers that were advertised in the
// WRITE_OPS / READ_OPS allowlist since v2.4.0 but never implemented:
//   setComponentProperties — wraps InstanceNode.setProperties
//   getComponentProperties — reads InstanceNode.componentProperties
//   swapComponent          — wraps InstanceNode.swapComponent
//
// Layer A — proxy/sandbox: confirms each op routes through the bridge.
// Layer B — plugin handler logic: handlers-write.js evaluated against mocked
//           Figma globals. Covers happy paths, bare-name resolution, the
//           cross-property-set call, error cases, and the diagnostic message
//           when a user passes an unknown property name.
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

console.log("\nLayer A: proxy forwards setComponentProperties");
{
  let captured = null;
  const bridge = makeBridge({
    setComponentProperties: (p) => { captured = p; return { id: p.id, appliedKeys: Object.keys(p.properties) }; },
  });
  const r = await executeCode(`
    return await figma.setComponentProperties({
      id: "inst:1",
      properties: { label: "Save changes" },
    });
  `, bridge);
  assert("call succeeds", r.success, r.error);
  assert("id forwarded", captured && captured.id === "inst:1");
  assert("properties forwarded", captured && captured.properties && captured.properties.label === "Save changes");
}

console.log("\nLayer A: proxy forwards getComponentProperties");
{
  let captured = null;
  const bridge = makeBridge({
    getComponentProperties: (p) => { captured = p; return { id: p.id, properties: { "label#5:0": { type: "TEXT", value: "x" } } }; },
  });
  const r = await executeCode(`return await figma.getComponentProperties({ id: "inst:1" });`, bridge);
  assert("call succeeds", r.success, r.error);
  assert("id forwarded", captured && captured.id === "inst:1");
  assert("properties returned", r.result && r.result.properties && r.result.properties["label#5:0"]);
}

console.log("\nLayer A: proxy forwards swapComponent");
{
  let captured = null;
  const bridge = makeBridge({
    swapComponent: (p) => { captured = p; return { id: p.id, newMainComponentId: p.componentId }; },
  });
  const r = await executeCode(`
    return await figma.swapComponent({ id: "inst:1", componentId: "comp:2" });
  `, bridge);
  assert("call succeeds", r.success, r.error);
  assert("id forwarded", captured && captured.id === "inst:1");
  assert("componentId forwarded", captured && captured.componentId === "comp:2");
}

// ──────────────────────────────────────────────────────────────────────────────
// LAYER B — plugin handler logic with mocked Figma globals
// ──────────────────────────────────────────────────────────────────────────────

function loadPluginContext() {
  const utils = readFileSync(resolve(REPO, "src/plugin/utils.js"), "utf8");
  const paintFx = readFileSync(resolve(REPO, "src/plugin/paint-and-effects.js"), "utf8");
  // handlers-write.js declares `const handlers = {}` as the first statement
  // (it's first in build-plugin.js concat order). Strip so the sandbox-seeded
  // handlers object receives our assignments instead of a shadowed const.
  const writeH = readFileSync(resolve(REPO, "src/plugin/handlers-write.js"), "utf8")
    .replace(/^const handlers = \{\};\s*$/m, "// (handlers seeded by test harness)");

  const sandbox = {
    handlers: {},
    figma: {
      async loadAllPagesAsync() {},
      root: { findOne() { return null; }, findAllWithCriteria() { return []; }, children: [] },
      async loadFontAsync() {},
      currentPage: { findAll: () => [] },
    },
    console,
  };

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
const { handlers } = ctx;

function makeMockMaster(name, defs = {}) {
  return {
    id: "comp:" + name,
    name,
    type: "COMPONENT",
    componentPropertyDefinitions: defs,
  };
}

// Default mode: "dynamic-page" — matches plugin/manifest.json, which is the
// actual runtime our users see. Sync `.mainComponent` access throws; only
// getMainComponentAsync() is allowed. Pass mode: "legacy" to simulate older
// Figma runtimes where the sync getter works.
function makeMockInstance(name, master, opts = {}) {
  const mode = opts.mode || "dynamic-page";
  const propValues = opts.propValues || {};
  // Store master in a closure so we can simulate the dynamic-page-throws-on-sync
  // behavior even though tests still need to inspect what the handler "saw".
  let storedMaster = master;
  const inst = {
    id: "inst:" + name,
    name,
    type: "INSTANCE",
    componentProperties: { ...propValues },
    _lastSetProperties: null,
    _lastSwap: null,
    async getMainComponentAsync() { return storedMaster; },
    setProperties(props) {
      this._lastSetProperties = props;
      const defs = (storedMaster && storedMaster.componentPropertyDefinitions) || {};
      Object.keys(props).forEach(k => {
        inst.componentProperties[k] = { type: defs[k] ? defs[k].type : "TEXT", value: props[k] };
      });
    },
    swapComponent(target) {
      this._lastSwap = target;
      storedMaster = target;
    },
  };
  if (mode === "legacy") {
    inst.mainComponent = storedMaster;
  } else {
    // dynamic-page: sync getter throws, matching Figma's actual behavior.
    Object.defineProperty(inst, "mainComponent", {
      get() {
        throw new Error("Cannot call with documentAccess: dynamic-page. Use node.getMainComponentAsync instead.");
      },
    });
  }
  return inst;
}

// ─── setComponentProperties ───────────────────────────────────────────────────

console.log("\nLayer B: setComponentProperties — happy path with bare name");
{
  const master = makeMockMaster("Button", { "label#5:0": { type: "TEXT", defaultValue: "Click" } });
  const inst = makeMockInstance("btn-1", master);
  ctx.__mockNodes.set(inst.id, inst);

  const r = await handlers.setComponentProperties({
    id: inst.id, properties: { label: "Save" },
  });
  assert("returns success shape", r && r.id === inst.id);
  assert("resolved bare 'label' to 'label#5:0'", inst._lastSetProperties && inst._lastSetProperties["label#5:0"] === "Save");
  assert("appliedKeys reflects resolved name", r.appliedKeys && r.appliedKeys[0] === "label#5:0");
}

console.log("\nLayer B: setComponentProperties — full name passes through unchanged");
{
  const master = makeMockMaster("Card", { "title#7:0": { type: "TEXT", defaultValue: "x" } });
  const inst = makeMockInstance("card-1", master);
  ctx.__mockNodes.set(inst.id, inst);

  await handlers.setComponentProperties({
    id: inst.id, properties: { "title#7:0": "New title" },
  });
  assert("full name forwarded as-is", inst._lastSetProperties["title#7:0"] === "New title");
}

console.log("\nLayer B: setComponentProperties — mixed types in one call");
{
  const master = makeMockMaster("Card", {
    "title#1:0":  { type: "TEXT",    defaultValue: "x" },
    "expanded#2:0": { type: "BOOLEAN", defaultValue: false },
  });
  const inst = makeMockInstance("card-2", master);
  ctx.__mockNodes.set(inst.id, inst);

  await handlers.setComponentProperties({
    id: inst.id, properties: { title: "Hello", expanded: true },
  });
  assert("TEXT set", inst._lastSetProperties["title#1:0"] === "Hello");
  assert("BOOLEAN set", inst._lastSetProperties["expanded#2:0"] === true);
}

// Regression: all happy-path tests above run against mock instances in
// `dynamic-page` mode by default — sync `.mainComponent` access throws,
// matching Figma's real behavior. The handler must reach the master through
// getMainComponentAsync only. This test guards the explicit "never read sync
// .mainComponent in setComponentProperties" invariant.
console.log("\nLayer B: setComponentProperties — never touches sync .mainComponent under dynamic-page");
{
  const master = makeMockMaster("DynamicPageBtn", { "label#1:0": { type: "TEXT", defaultValue: "x" } });
  // Default mode is dynamic-page: sync getter throws if read.
  const inst = makeMockInstance("dp-1", master);
  ctx.__mockNodes.set(inst.id, inst);

  let threw = false;
  try {
    await handlers.setComponentProperties({ id: inst.id, properties: { label: "OK" } });
  } catch (e) {
    threw = true;
    assert("did NOT throw the dynamic-page sync error", !/documentAccess: dynamic-page/.test(e.message),
      "caught: " + e.message);
  }
  assert("handler completed under dynamic-page", !threw);
  assert("setProperties was called with resolved name", inst._lastSetProperties && inst._lastSetProperties["label#1:0"] === "OK");
}

console.log("\nLayer B: setComponentProperties — legacy runtime (sync .mainComponent works) still supported");
{
  const master = makeMockMaster("LegacyBtn", { "label#1:0": { type: "TEXT", defaultValue: "x" } });
  const inst = makeMockInstance("legacy-1", master, { mode: "legacy" });
  // Drop the async getter to simulate an older Figma plugin runtime without it.
  delete inst.getMainComponentAsync;
  ctx.__mockNodes.set(inst.id, inst);

  await handlers.setComponentProperties({ id: inst.id, properties: { label: "Legacy OK" } });
  assert("legacy sync mainComponent fallback works", inst._lastSetProperties["label#1:0"] === "Legacy OK");
}

console.log("\nLayer B: setComponentProperties — validation");
{
  const master = makeMockMaster("Button", { "label#5:0": { type: "TEXT", defaultValue: "x" } });
  const inst = makeMockInstance("btn-validation", master);
  ctx.__mockNodes.set(inst.id, inst);

  await handlers.setComponentProperties({ properties: { label: "x" } })
    .then(() => assert("missing id throws", false))
    .catch(e => assert("missing id throws", /id is required/.test(e.message)));

  await handlers.setComponentProperties({ id: inst.id })
    .then(() => assert("missing properties throws", false))
    .catch(e => assert("missing properties throws", /properties object is required/.test(e.message)));

  await handlers.setComponentProperties({ id: inst.id, properties: "nope" })
    .then(() => assert("non-object properties throws", false))
    .catch(e => assert("non-object properties throws", /properties object is required/.test(e.message)));

  // Non-INSTANCE node
  const frame = { id: "f:1", name: "Frame", type: "FRAME" };
  ctx.__mockNodes.set(frame.id, frame);
  await handlers.setComponentProperties({ id: frame.id, properties: { label: "x" } })
    .then(() => assert("non-INSTANCE rejected", false))
    .catch(e => assert("non-INSTANCE rejected", /requires an INSTANCE node/.test(e.message)));

  // Unknown property name → diagnostic listing available names
  await handlers.setComponentProperties({ id: inst.id, properties: { ghost: "x" } })
    .then(() => assert("unknown property rejected", false))
    .catch(e => assert("unknown property rejected with diagnostic",
      /Unknown component property: ghost/.test(e.message) && /label#5:0/.test(e.message)));

  // Master with no properties at all — helpful hint
  const emptyMaster = makeMockMaster("Empty", {});
  const emptyInst = makeMockInstance("empty-1", emptyMaster);
  ctx.__mockNodes.set(emptyInst.id, emptyInst);
  await handlers.setComponentProperties({ id: emptyInst.id, properties: { label: "x" } })
    .then(() => assert("master with no properties rejected", false))
    .catch(e => assert("hints to call addComponentProperty",
      /call addComponentProperty first/.test(e.message)));
}

// ─── getComponentProperties ──────────────────────────────────────────────────

console.log("\nLayer B: getComponentProperties — happy path");
{
  const master = makeMockMaster("Button", { "label#5:0": { type: "TEXT", defaultValue: "Click" } });
  const inst = makeMockInstance("btn-get", master, {
    propValues: { "label#5:0": { type: "TEXT", value: "Hello" } },
  });
  ctx.__mockNodes.set(inst.id, inst);

  const r = await handlers.getComponentProperties({ id: inst.id });
  assert("returns id", r.id === inst.id);
  assert("returns property map", r.properties && r.properties["label#5:0"]);
  assert("returns current value", r.properties["label#5:0"].value === "Hello");
}

console.log("\nLayer B: getComponentProperties — validation");
{
  await handlers.getComponentProperties({})
    .then(() => assert("missing id throws", false))
    .catch(e => assert("missing id throws", /id is required/.test(e.message)));

  const frame = { id: "f:get", name: "Frame", type: "FRAME" };
  ctx.__mockNodes.set(frame.id, frame);
  await handlers.getComponentProperties({ id: frame.id })
    .then(() => assert("non-INSTANCE rejected", false))
    .catch(e => assert("non-INSTANCE rejected", /requires an INSTANCE node/.test(e.message)));
}

// ─── swapComponent ────────────────────────────────────────────────────────────

console.log("\nLayer B: swapComponent — happy path");
{
  const masterA = makeMockMaster("btn-A");
  const masterB = makeMockMaster("btn-B");
  const inst = makeMockInstance("swap-1", masterA);
  ctx.__mockNodes.set(inst.id, inst);
  ctx.__mockNodes.set(masterB.id, masterB);

  const r = await handlers.swapComponent({ id: inst.id, componentId: masterB.id });
  assert("swap called with target", inst._lastSwap === masterB);
  assert("returns new main id", r.newMainComponentId === masterB.id);
  assert("returns new main name", r.newMainComponentName === "btn-B");
}

console.log("\nLayer B: swapComponent — validation");
{
  const masterA = makeMockMaster("a");
  const inst = makeMockInstance("swap-validation", masterA);
  ctx.__mockNodes.set(inst.id, inst);

  await handlers.swapComponent({ componentId: "x" })
    .then(() => assert("missing id throws", false))
    .catch(e => assert("missing id throws", /id is required/.test(e.message)));

  await handlers.swapComponent({ id: inst.id })
    .then(() => assert("missing componentId throws", false))
    .catch(e => assert("missing componentId throws", /componentId is required/.test(e.message)));

  // Source not an INSTANCE
  const frame = { id: "f:swap", name: "Frame", type: "FRAME" };
  ctx.__mockNodes.set(frame.id, frame);
  const masterB = makeMockMaster("b");
  ctx.__mockNodes.set(masterB.id, masterB);
  await handlers.swapComponent({ id: frame.id, componentId: masterB.id })
    .then(() => assert("non-INSTANCE source rejected", false))
    .catch(e => assert("non-INSTANCE source rejected", /source must be an INSTANCE/.test(e.message)));

  // Target not a COMPONENT
  await handlers.swapComponent({ id: inst.id, componentId: frame.id })
    .then(() => assert("non-COMPONENT target rejected", false))
    .catch(e => assert("non-COMPONENT target rejected", /target must be a COMPONENT/.test(e.message)));
}

// ──────────────────────────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`Total: ${passed + failed} tests | ✓ ${passed} passed | ✗ ${failed} failed`);
console.log(`════════════════════════════════════════════════════════════`);
process.exit(failed === 0 ? 0 : 1);
