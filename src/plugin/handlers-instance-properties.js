// ─── HANDLERS INSTANCE PROPERTIES ───
// Instance property get/set against the main component.
// Split out of handlers-write.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

// ─── INSTANCE PROPERTY OPERATIONS ─────────────────────────────────────────────
// These three ops were on the WRITE_OPS / READ_OPS allowlist since v2.4.0 but
// never had plugin-side handlers — calls would fail with `Unknown operation
// "setComponentProperties"`. Without setComponentProperties in particular,
// addComponentProperty + bindComponentPropertyToText (PR #8) couldn't be
// exercised end-to-end: instance text overrides had no way to flow through
// the bound property, so auto-layout never recalculated.

// Under documentAccess: dynamic-page (set in plugin/manifest.json), reading
// `instance.mainComponent` synchronously THROWS — it doesn't return null.
// Always go through getMainComponentAsync when available; fall back to the
// sync getter only for older plugin runtimes that don't have the async API.
async function getMainComponentSafe(instance) {
  if (typeof instance.getMainComponentAsync === "function") {
    return await instance.getMainComponentAsync();
  }
  return instance.mainComponent;
}

// Resolve "label" → "label#5:0" using the already-fetched main component's
// componentPropertyDefinitions. Caller passes `main` so we don't re-fetch it
// per key.
function resolvePropertyNameAgainstMain(main, propertyName) {
  if (!main) return null;
  var defs = main.componentPropertyDefinitions;
  if (!defs) return null;
  if (defs[propertyName]) return propertyName;
  var keys = Object.keys(defs);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].split("#")[0] === propertyName) return keys[i];
  }
  return null;
}

// setComponentProperties — set property values on a component instance.
// Wraps Figma's InstanceNode.setProperties({ "name#id": value, ... }).
// Values: TEXT/VARIANT → string, BOOLEAN → boolean, INSTANCE_SWAP → component key string.
// Accepts bare property names (e.g. "label") and resolves to "label#5:0".
handlers.setComponentProperties = async function(params) {
  var nodeId = params.id || params.nodeId;
  var properties = params.properties;

  if (!nodeId) throw new Error("id is required");
  if (!properties || typeof properties !== "object") {
    throw new Error("properties object is required");
  }

  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (node.type !== "INSTANCE") {
    throw new Error("setComponentProperties requires an INSTANCE node, got: " + node.type);
  }

  // Fetch main once — dynamic-page-safe — and reuse for every property lookup
  // plus the diagnostic on unknown names.
  var main = await getMainComponentSafe(node);

  var resolvedMap = {};
  var unresolved = [];
  var keys = Object.keys(properties);
  for (var i = 0; i < keys.length; i++) {
    var name = keys[i];
    var resolved = resolvePropertyNameAgainstMain(main, name);
    if (!resolved) {
      unresolved.push(name);
      continue;
    }
    resolvedMap[resolved] = properties[name];
  }

  if (unresolved.length > 0) {
    var available = (main && main.componentPropertyDefinitions)
      ? Object.keys(main.componentPropertyDefinitions) : [];
    throw new Error(
      "Unknown component property: " + unresolved.join(", ") +
      ". Available on main component: " + (available.length ? available.join(", ") : "(none — call addComponentProperty first)")
    );
  }

  node.setProperties(resolvedMap);

  // Promote any bound TEXT child's layoutSizing axis to HUG so a hug-width
  // auto-layout parent actually reflows in response to the property change.
  // Without this, setProperties updates `characters` but `layoutSizingHorizontal:
  // FIXED` (Figma's default after parenting) overrides textAutoResize and
  // pins the child width — the parent never sees a size change to react to.
  //
  // Targeted at TEXT-type properties only; BOOLEAN / INSTANCE_SWAP don't
  // change child dimensions in a way the auto-layout needs help with.
  //
  // Inline rather than calling a shared helper because the layout-sizing
  // exposure + auto-promote helper lives in a separate PR (feat/layout-
  // sizing-axes) that may merge after this one. Once both land, this block
  // can be replaced with a call to the shared autoPromoteTextHugForReflow.
  if (typeof node.findAll === "function") {
    var defs = (main && main.componentPropertyDefinitions) || {};
    var changedKeys = Object.keys(resolvedMap);
    for (var ck = 0; ck < changedKeys.length; ck++) {
      var key = changedKeys[ck];
      var def = defs[key];
      if (!def || def.type !== "TEXT") continue;
      var boundTexts = node.findAll(function(t) {
        return t.type === "TEXT"
          && t.componentPropertyReferences
          && t.componentPropertyReferences.characters === key;
      });
      for (var bi = 0; bi < boundTexts.length; bi++) {
        var textNode = boundTexts[bi];
        var p = textNode.parent;
        if (!p || !p.layoutMode || p.layoutMode === "NONE") continue;
        var horizontal = p.layoutMode === "HORIZONTAL";
        var parentHugs = p.primaryAxisSizingMode === "AUTO" ||
          (horizontal ? p.layoutSizingHorizontal === "HUG"
                      : p.layoutSizingVertical   === "HUG");
        if (!parentHugs) continue;
        try {
          if (horizontal && "layoutSizingHorizontal" in textNode) {
            textNode.layoutSizingHorizontal = "HUG";
          } else if (!horizontal && "layoutSizingVertical" in textNode) {
            textNode.layoutSizingVertical = "HUG";
          }
        } catch (e) {}
      }
    }
  }

  return {
    id: node.id,
    name: node.name,
    properties: node.componentProperties,
    appliedKeys: Object.keys(resolvedMap),
  };
};

// getComponentProperties — read current property values from an instance.
// Returns Figma's InstanceNode.componentProperties as-is.
handlers.getComponentProperties = async function(params) {
  var nodeId = params.id || params.nodeId;
  if (!nodeId) throw new Error("id is required");

  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (node.type !== "INSTANCE") {
    throw new Error("getComponentProperties requires an INSTANCE node, got: " + node.type);
  }

  return {
    id: node.id,
    name: node.name,
    properties: node.componentProperties,
  };
};

// setReactions — prototype interactions on a node (server already exposes the op).
// Accepts the docs shorthand { type: "NAVIGATE", destinationId, transition } and
// normalizes it to Figma's Action shape { type: "NODE", navigation: "NAVIGATE", ... }.
