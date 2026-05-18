#!/usr/bin/env node
// Tests for component property definitions on master components:
//   addComponentProperty, bindComponentPropertyToText, removeComponentProperty
//
// Layer A — proxy/sandbox: confirms figma.* exposes the new ops and forwards params.
// Layer B — plugin handler logic: runs handlers-tokens.js against mocked Figma globals
//           to exercise validation, propertyName resolution, and bind semantics.
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

console.log("\nLayer A: proxy forwards addComponentProperty");
{
  let captured = null;
  const bridge = makeBridge({
    addComponentProperty: (p) => {
      captured = p;
      return { componentId: p.componentId, propertyName: p.name + "#5:0", type: p.type, defaultValue: p.defaultValue };
    },
  });
  const r = await executeCode(`
    return await figma.addComponentProperty({
      componentId: "1:2", name: "label", type: "TEXT", defaultValue: "Click me"
    });
  `, bridge);
  assert("addComponentProperty succeeds", r.success, r.error);
  assert("componentId forwarded", captured && captured.componentId === "1:2");
  assert("name forwarded", captured && captured.name === "label");
  assert("type forwarded", captured && captured.type === "TEXT");
  assert("defaultValue forwarded", captured && captured.defaultValue === "Click me");
  assert("returns unique propertyName", r.result && r.result.propertyName === "label#5:0");
}

console.log("\nLayer A: proxy forwards bindComponentPropertyToText");
{
  let captured = null;
  const bridge = makeBridge({
    bindComponentPropertyToText: (p) => {
      captured = p;
      return { textNodeId: p.textNodeId, propertyName: p.propertyName, boundField: "characters" };
    },
  });
  const r = await executeCode(`
    return await figma.bindComponentPropertyToText({
      textNodeId: "3:4", propertyName: "label"
    });
  `, bridge);
  assert("bindComponentPropertyToText succeeds", r.success, r.error);
  assert("textNodeId forwarded", captured && captured.textNodeId === "3:4");
  assert("propertyName forwarded", captured && captured.propertyName === "label");
  assert("boundField returned", r.result && r.result.boundField === "characters");
}

console.log("\nLayer A: proxy forwards removeComponentProperty");
{
  let captured = null;
  const bridge = makeBridge({
    removeComponentProperty: (p) => {
      captured = p;
      return { componentId: p.componentId, removedProperty: p.propertyName };
    },
  });
  const r = await executeCode(`
    return await figma.removeComponentProperty({ componentId: "1:2", propertyName: "label#5:0" });
  `, bridge);
  assert("removeComponentProperty succeeds", r.success, r.error);
  assert("componentId forwarded", captured && captured.componentId === "1:2");
  assert("propertyName forwarded", captured && captured.propertyName === "label#5:0");
  assert("returns removed property", r.result && r.result.removedProperty === "label#5:0");
}

console.log("\nLayer A: each new op is on the WRITE_OPS allowlist (rejects when bridge omits it)");
{
  // If the op weren't on the allowlist, the sandbox would throw "figma.X is not a function".
  // We make the bridge throw to confirm the proxy method exists and reaches the bridge.
  const bridge = makeBridge({}); // throws "Unexpected op: X" for everything
  const r1 = await executeCode(`return await figma.addComponentProperty({ componentId: "1", name: "x", type: "TEXT", defaultValue: "y" });`, bridge);
  assert("addComponentProperty exposed on proxy", !r1.success && /Unexpected op: addComponentProperty/.test(r1.error));
  const r2 = await executeCode(`return await figma.bindComponentPropertyToText({ textNodeId: "1", propertyName: "x" });`, bridge);
  assert("bindComponentPropertyToText exposed on proxy", !r2.success && /Unexpected op: bindComponentPropertyToText/.test(r2.error));
  const r3 = await executeCode(`return await figma.removeComponentProperty({ componentId: "1", propertyName: "x" });`, bridge);
  assert("removeComponentProperty exposed on proxy", !r3.success && /Unexpected op: removeComponentProperty/.test(r3.error));
}

// ──────────────────────────────────────────────────────────────────────────────
// LAYER B — plugin handler logic with mocked Figma globals
// ──────────────────────────────────────────────────────────────────────────────
// handlers-tokens.js declares functions/handlers on a shared `handlers` object
// (concatenation pattern). We evaluate it in a vm context with the same globals
// the Figma plugin sandbox provides, but mocked.

function makeMockComponent(name, defs = {}) {
  let nextId = 0;
  const node = {
    id: "comp:" + name,
    name,
    type: "COMPONENT",
    componentPropertyDefinitions: { ...defs },
    parent: null,
    addComponentProperty(propName, type, defaultValue, options) {
      const uniqueName = `${propName}#${++nextId}:0`;
      this.componentPropertyDefinitions[uniqueName] = { type, defaultValue, options };
      node._lastAddArgs = { propName, type, defaultValue, options };
      return uniqueName;
    },
    deleteComponentProperty(propName) {
      if (!this.componentPropertyDefinitions[propName]) {
        throw new Error("no such prop in mock: " + propName);
      }
      delete this.componentPropertyDefinitions[propName];
      node._lastDeletedProp = propName;
    },
  };
  return node;
}

function makeMockText(name, parent) {
  return {
    id: "text:" + name,
    name,
    type: "TEXT",
    characters: "",
    parent,
    componentPropertyReferences: null,
  };
}

function loadPluginContext() {
  // Concatenate the dependent source files the same way build-plugin.js does.
  // handlers-tokens.js depends on findNodeByIdAsync from utils.js.
  const utils = readFileSync(resolve(REPO, "src/plugin/utils.js"), "utf8");
  const tokens = readFileSync(resolve(REPO, "src/plugin/handlers-tokens.js"), "utf8");

  // figma plugin globals the source touches at module top-level. We provide
  // just enough to let the file evaluate. Handlers we don't call won't run.
  const sandbox = {
    handlers: {},
    figma: {
      variables: {
        getLocalVariableCollectionsAsync: async () => [],
        getVariableByIdAsync: async () => null,
        getLocalVariablesAsync: async () => [],
      },
      getStyleByIdAsync: async () => null,
      getStyleById: () => null,
      loadFontAsync: async () => {},
      currentPage: { findAll: () => [] },
      root: { findAll: () => [] },
    },
    console,
  };

  // Test hook: redirect findNodeByIdAsync to a per-test map.
  // utils.js declares findNodeByIdAsync as a function declaration. We append a
  // reassignment AFTER utils to override (function declarations create
  // reassignable bindings in non-strict mode).
  sandbox.__mockNodes = new Map();
  const shim = `
    findNodeByIdAsync = async function(id) {
      return globalThis.__mockNodes.get(id) || null;
    };
  `;

  vm.createContext(sandbox);
  vm.runInContext(utils + "\n" + shim + "\n" + tokens, sandbox, { filename: "handlers-tokens.test.cjs" });
  return sandbox;
}

const ctx = loadPluginContext();
const { handlers } = ctx;

console.log("\nLayer B: addComponentProperty — TEXT happy path");
{
  const comp = makeMockComponent("Button");
  ctx.__mockNodes.set(comp.id, comp);
  const r = await handlers.addComponentProperty({
    componentId: comp.id, name: "label", type: "TEXT", defaultValue: "Click me",
  });
  assert("returns Figma's unique propertyName", r.propertyName === "label#1:0", "got " + r.propertyName);
  assert("returns requestedName for reference", r.requestedName === "label");
  assert("type echoed", r.type === "TEXT");
  assert("definition actually added to mock", !!comp.componentPropertyDefinitions["label#1:0"]);
  assert("calls Figma addComponentProperty with right args",
    comp._lastAddArgs.propName === "label" && comp._lastAddArgs.type === "TEXT" && comp._lastAddArgs.defaultValue === "Click me");
}

console.log("\nLayer B: addComponentProperty — BOOLEAN + INSTANCE_SWAP happy path");
{
  const comp = makeMockComponent("Card");
  ctx.__mockNodes.set(comp.id, comp);
  const b = await handlers.addComponentProperty({ componentId: comp.id, name: "showIcon", type: "BOOLEAN", defaultValue: true });
  assert("BOOLEAN succeeds", b.propertyName.startsWith("showIcon#"));
  const i = await handlers.addComponentProperty({
    componentId: comp.id, name: "iconSwap", type: "INSTANCE_SWAP", defaultValue: "abc123",
    options: { preferredValues: [{ type: "COMPONENT", key: "abc123" }] },
  });
  assert("INSTANCE_SWAP succeeds", i.propertyName.startsWith("iconSwap#"));
  assert("INSTANCE_SWAP options forwarded to Figma",
    comp._lastAddArgs.options && Array.isArray(comp._lastAddArgs.options.preferredValues));
}

console.log("\nLayer B: addComponentProperty — validation");
{
  const comp = makeMockComponent("Button");
  ctx.__mockNodes.set(comp.id, comp);

  await handlers.addComponentProperty({ name: "x", type: "TEXT", defaultValue: "y" })
    .then(() => assert("missing componentId throws", false))
    .catch(e => assert("missing componentId throws", /componentId is required/.test(e.message)));

  await handlers.addComponentProperty({ componentId: comp.id, type: "TEXT", defaultValue: "y" })
    .then(() => assert("missing name throws", false))
    .catch(e => assert("missing name throws", /name is required/.test(e.message)));

  await handlers.addComponentProperty({ componentId: comp.id, name: "x", defaultValue: "y" })
    .then(() => assert("missing type throws", false))
    .catch(e => assert("missing type throws", /type is required/.test(e.message)));

  await handlers.addComponentProperty({ componentId: comp.id, name: "x", type: "VARIANT", defaultValue: "y" })
    .then(() => assert("VARIANT type rejected", false))
    .catch(e => assert("VARIANT type rejected with helpful message",
      /VARIANT.*managed through component sets/.test(e.message)));

  await handlers.addComponentProperty({ componentId: comp.id, name: "x", type: "TEXT", defaultValue: 42 })
    .then(() => assert("TEXT requires string defaultValue", false))
    .catch(e => assert("TEXT requires string defaultValue", /TEXT properties require a string/.test(e.message)));

  await handlers.addComponentProperty({ componentId: comp.id, name: "x", type: "BOOLEAN", defaultValue: "no" })
    .then(() => assert("BOOLEAN requires boolean defaultValue", false))
    .catch(e => assert("BOOLEAN requires boolean defaultValue", /BOOLEAN properties require a boolean/.test(e.message)));

  // Not a component
  const frame = { id: "f:1", name: "Frame", type: "FRAME" };
  ctx.__mockNodes.set(frame.id, frame);
  await handlers.addComponentProperty({ componentId: frame.id, name: "x", type: "TEXT", defaultValue: "y" })
    .then(() => assert("non-component rejected", false))
    .catch(e => assert("non-component rejected", /requires a COMPONENT or COMPONENT_SET/.test(e.message)));

  // Missing node
  await handlers.addComponentProperty({ componentId: "does-not-exist", name: "x", type: "TEXT", defaultValue: "y" })
    .then(() => assert("missing component rejected", false))
    .catch(e => assert("missing component rejected", /Component not found/.test(e.message)));
}

console.log("\nLayer B: bindComponentPropertyToText — happy path + name resolution");
{
  const comp = makeMockComponent("Button");
  ctx.__mockNodes.set(comp.id, comp);
  await handlers.addComponentProperty({ componentId: comp.id, name: "label", type: "TEXT", defaultValue: "Click" });
  // Property is now stored as "label#1:0" on the mock.

  const textNode = makeMockText("label-text", comp);
  ctx.__mockNodes.set(textNode.id, textNode);

  // Bind using the bare name — handler should resolve to fully-qualified form.
  const r = await handlers.bindComponentPropertyToText({ textNodeId: textNode.id, propertyName: "label" });
  assert("resolves bare 'label' to 'label#1:0'", r.propertyName === "label#1:0", "got " + r.propertyName);
  assert("boundField is 'characters'", r.boundField === "characters");
  assert("componentPropertyReferences.characters set on text node",
    textNode.componentPropertyReferences && textNode.componentPropertyReferences.characters === "label#1:0");

  // Existing references preserved
  textNode.componentPropertyReferences = { visible: "showLabel#2:0" };
  await handlers.bindComponentPropertyToText({ textNodeId: textNode.id, propertyName: "label#1:0" });
  assert("preserves existing .visible reference",
    textNode.componentPropertyReferences.visible === "showLabel#2:0" &&
    textNode.componentPropertyReferences.characters === "label#1:0");
}

console.log("\nLayer B: bindComponentPropertyToText — validation");
{
  const comp = makeMockComponent("Card");
  ctx.__mockNodes.set(comp.id, comp);
  await handlers.addComponentProperty({ componentId: comp.id, name: "showIcon", type: "BOOLEAN", defaultValue: true });
  const textNode = makeMockText("title", comp);
  ctx.__mockNodes.set(textNode.id, textNode);

  await handlers.bindComponentPropertyToText({ propertyName: "label" })
    .then(() => assert("missing textNodeId throws", false))
    .catch(e => assert("missing textNodeId throws", /textNodeId is required/.test(e.message)));

  await handlers.bindComponentPropertyToText({ textNodeId: textNode.id })
    .then(() => assert("missing propertyName throws", false))
    .catch(e => assert("missing propertyName throws", /propertyName is required/.test(e.message)));

  // Non-text node
  const frame = { id: "f:1", name: "Frame", type: "FRAME", parent: comp };
  ctx.__mockNodes.set(frame.id, frame);
  await handlers.bindComponentPropertyToText({ textNodeId: frame.id, propertyName: "showIcon" })
    .then(() => assert("non-TEXT rejected", false))
    .catch(e => assert("non-TEXT rejected", /requires a TEXT node/.test(e.message)));

  // TEXT outside a component
  const orphan = makeMockText("orphan", null);
  ctx.__mockNodes.set(orphan.id, orphan);
  await handlers.bindComponentPropertyToText({ textNodeId: orphan.id, propertyName: "label" })
    .then(() => assert("text outside component rejected", false))
    .catch(e => assert("text outside component rejected", /not inside a COMPONENT/.test(e.message)));

  // Unknown property
  await handlers.bindComponentPropertyToText({ textNodeId: textNode.id, propertyName: "doesNotExist" })
    .then(() => assert("unknown property rejected", false))
    .catch(e => assert("unknown property rejected",
      /not found on component/.test(e.message) && /addComponentProperty first/.test(e.message)));

  // Wrong-type property (BOOLEAN, not TEXT)
  await handlers.bindComponentPropertyToText({ textNodeId: textNode.id, propertyName: "showIcon" })
    .then(() => assert("binding to BOOLEAN rejected", false))
    .catch(e => assert("binding to BOOLEAN rejected with helpful hint",
      /is BOOLEAN, not TEXT/.test(e.message)));
}

console.log("\nLayer B: removeComponentProperty");
{
  const comp = makeMockComponent("Button");
  ctx.__mockNodes.set(comp.id, comp);
  const created = await handlers.addComponentProperty({ componentId: comp.id, name: "label", type: "TEXT", defaultValue: "x" });

  const r = await handlers.removeComponentProperty({ componentId: comp.id, propertyName: "label" });
  assert("resolves bare name and deletes", r.removedProperty === created.propertyName);
  assert("definition gone from mock", !comp.componentPropertyDefinitions[created.propertyName]);
  assert("calls deleteComponentProperty with fully-qualified name", comp._lastDeletedProp === created.propertyName);

  await handlers.removeComponentProperty({ componentId: comp.id, propertyName: "ghost" })
    .then(() => assert("removing nonexistent rejected", false))
    .catch(e => assert("removing nonexistent rejected", /not found on component/.test(e.message)));
}

// ──────────────────────────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`Total: ${passed + failed} tests | ✓ ${passed} passed | ✗ ${failed} failed`);
console.log(`════════════════════════════════════════════════════════════`);
process.exit(failed === 0 ? 0 : 1);
