// ─── HANDLERS COMPONENT PROPERTIES ───
// Component property definitions and bindings on master components.
// Split out of handlers-tokens.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

function resolveComponentPropertyName(componentNode, propertyName) {
  var defs = componentNode.componentPropertyDefinitions;
  if (!defs) return null;
  if (defs[propertyName]) return propertyName;
  var keys = Object.keys(defs);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].split("#")[0] === propertyName) return keys[i];
  }
  return null;
}

// addComponentProperty — create a property definition on a Component or ComponentSet.
// type: "TEXT" | "BOOLEAN" | "INSTANCE_SWAP"
// For TEXT: defaultValue is a string. Pair with bindComponentPropertyToText so
//   the child TEXT node's `characters` is driven by the property — this is what
//   actually triggers auto-layout to re-measure when an instance overrides it.
// For BOOLEAN: defaultValue is a boolean. Bind via `componentPropertyReferences.visible`.
// For INSTANCE_SWAP: defaultValue is a node ID (string) of a COMPONENT — NOT a published
//   component key. The plugin API resolves the ID against the local document.
//   Auto-corrects published-key strings (no ":") by looking up the local component.
//   options.preferredValues accepts [{ type: "COMPONENT" | "COMPONENT_SET", key }].
//   Bind a child INSTANCE via `.mainComponent`.
handlers.addComponentProperty = async function(params) {
  var componentId = params.componentId || params.nodeId || params.id;
  var name = params.name || params.propertyName;
  var type = params.type;
  var defaultValue = params.defaultValue;
  var options = params.options || undefined;

  if (!componentId) throw new Error("componentId is required");
  if (!name) throw new Error("name is required");
  if (!type) throw new Error("type is required (TEXT | BOOLEAN | INSTANCE_SWAP)");

  var allowed = ["TEXT", "BOOLEAN", "INSTANCE_SWAP"];
  if (allowed.indexOf(type) === -1) {
    throw new Error("type must be one of TEXT, BOOLEAN, INSTANCE_SWAP — got " + type +
      ". VARIANT properties are managed through component sets, not addComponentProperty.");
  }

  var node = await findNodeByIdAsync(componentId);
  if (!node) throw new Error("Component not found: " + componentId);
  if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
    throw new Error("addComponentProperty requires a COMPONENT or COMPONENT_SET node, got: " + node.type);
  }

  if (type === "TEXT" && typeof defaultValue !== "string") {
    throw new Error("TEXT properties require a string defaultValue");
  }
  if (type === "BOOLEAN" && typeof defaultValue !== "boolean") {
    throw new Error("BOOLEAN properties require a boolean defaultValue");
  }
  if (type === "INSTANCE_SWAP" && typeof defaultValue !== "string") {
    throw new Error("INSTANCE_SWAP properties require a node ID string as defaultValue " +
      "(e.g. \"123:456\"). NOT a published component key.");
  }

  // BUG: callers sometimes pass a published component key (no \":\") which Figma
  // silently accepts but breaks instance swap. Auto-resolve key → local node ID.
  if (type === "INSTANCE_SWAP" && defaultValue.indexOf(":") === -1) {
    var localComp = null;
    try { localComp = await figma.importComponentByKeyAsync(defaultValue); } catch (e) {}
    if (!localComp) {
      throw new Error("INSTANCE_SWAP defaultValue \"" + defaultValue + "\" looks like a " +
        "published component key, not a node ID. Pass the local component's node ID instead " +
        "(e.g. \"123:456\"). Get it from createComponent(...).id or listComponents().");
    }
    defaultValue = localComp.id;
  }

  var uniqueName = options
    ? node.addComponentProperty(name, type, defaultValue, options)
    : node.addComponentProperty(name, type, defaultValue);

  return {
    componentId: node.id,
    componentName: node.name,
    propertyName: uniqueName,    // e.g. "label#5:0"
    requestedName: name,         // what the caller passed
    type: type,
    defaultValue: defaultValue,
  };
};

// bindComponentPropertyToText — link a TEXT node's `characters` to a TEXT property.
// This is the step that makes auto-layout actually recalculate on instance override.
// The property must already exist on the parent component (call addComponentProperty
// with type="TEXT" first). The bare name ("label") is accepted; we resolve it to
// the fully-qualified "label#id" form Figma requires.
