// ─── HANDLERS COMPONENT PROPERTY BIND ───
// Binding and unbinding component properties on nodes.
// Split out of handlers-tokens.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

handlers.bindComponentPropertyToText = async function(params) {
  var textNodeId = params.textNodeId || params.nodeId;
  var propertyName = params.propertyName || params.name;

  if (!textNodeId) throw new Error("textNodeId is required");
  if (!propertyName) throw new Error("propertyName is required");

  var textNode = await findNodeByIdAsync(textNodeId);
  if (!textNode) throw new Error("Text node not found: " + textNodeId);
  if (textNode.type !== "TEXT") {
    throw new Error("bindComponentPropertyToText requires a TEXT node, got: " + textNode.type);
  }

  // Walk up to find the owning component/set so we can resolve the property name.
  var owner = textNode.parent;
  while (owner && owner.type !== "COMPONENT" && owner.type !== "COMPONENT_SET") {
    owner = owner.parent;
  }
  if (!owner) throw new Error("Text node is not inside a COMPONENT or COMPONENT_SET");

  var resolved = resolveComponentPropertyName(owner, propertyName);
  if (!resolved) {
    throw new Error("Property '" + propertyName + "' not found on component '" + owner.name +
      "'. Call addComponentProperty first.");
  }

  var defs = owner.componentPropertyDefinitions;
  if (defs[resolved].type !== "TEXT") {
    throw new Error("Property '" + resolved + "' is " + defs[resolved].type +
      ", not TEXT. Use componentPropertyReferences.visible / .mainComponent for BOOLEAN / INSTANCE_SWAP.");
  }

  // Preserve any existing references (visible, mainComponent) on this node.
  var refs = {};
  if (textNode.componentPropertyReferences) {
    var existing = textNode.componentPropertyReferences;
    var keys = Object.keys(existing);
    for (var i = 0; i < keys.length; i++) refs[keys[i]] = existing[keys[i]];
  }
  refs.characters = resolved;
  textNode.componentPropertyReferences = refs;

  return {
    textNodeId: textNode.id,
    textNodeName: textNode.name,
    componentId: owner.id,
    componentName: owner.name,
    boundField: "characters",
    propertyName: resolved,
  };
};

// bindComponentProperty — generic version of bindComponentPropertyToText.
// Binds any field (.visible / .mainComponent / .characters) on any descendant
// of a component to a property of the matching type.
//
//   field        | required property type
//   -------------+--------------------------
//   characters   | TEXT       (TEXT nodes only)
//   visible      | BOOLEAN    (any node)
//   mainComponent| INSTANCE_SWAP (INSTANCE nodes only)
handlers.bindComponentProperty = async function(params) {
  var nodeId = params.nodeId || params.id;
  var field = params.field;
  var propertyName = params.propertyName || params.name;

  if (!nodeId) throw new Error("nodeId is required");
  if (!field) throw new Error("field is required (characters | visible | mainComponent)");
  if (!propertyName) throw new Error("propertyName is required");

  var allowedFields = { characters: "TEXT", visible: "BOOLEAN", mainComponent: "INSTANCE_SWAP" };
  var expectedType = allowedFields[field];
  if (!expectedType) {
    throw new Error("field must be one of: characters, visible, mainComponent — got '" + field + "'");
  }

  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (field === "characters" && node.type !== "TEXT") {
    throw new Error("characters binding requires a TEXT node, got: " + node.type);
  }
  if (field === "mainComponent" && node.type !== "INSTANCE") {
    throw new Error("mainComponent binding requires an INSTANCE node, got: " + node.type);
  }

  // Walk up to find owning component/set
  var owner = node.parent;
  while (owner && owner.type !== "COMPONENT" && owner.type !== "COMPONENT_SET") {
    owner = owner.parent;
  }
  if (!owner) throw new Error("Node is not inside a COMPONENT or COMPONENT_SET");

  var resolved = resolveComponentPropertyName(owner, propertyName);
  if (!resolved) {
    throw new Error("Property '" + propertyName + "' not found on component '" + owner.name +
      "'. Call addComponentProperty first.");
  }

  var defs = owner.componentPropertyDefinitions;
  if (defs[resolved].type !== expectedType) {
    throw new Error("Property '" + resolved + "' is " + defs[resolved].type +
      ", not " + expectedType + ". Field '" + field + "' requires a " + expectedType + " property.");
  }

  // Preserve other existing references
  var refs = {};
  if (node.componentPropertyReferences) {
    var existing = node.componentPropertyReferences;
    var keys = Object.keys(existing);
    for (var i = 0; i < keys.length; i++) refs[keys[i]] = existing[keys[i]];
  }
  refs[field] = resolved;
  node.componentPropertyReferences = refs;

  return {
    nodeId: node.id,
    nodeName: node.name,
    componentId: owner.id,
    componentName: owner.name,
    boundField: field,
    propertyName: resolved,
  };
};

// unbindComponentProperty — remove a single field binding from a node.
// Other references on the node are preserved.
handlers.unbindComponentProperty = async function(params) {
  var nodeId = params.nodeId || params.id;
  var field = params.field;

  if (!nodeId) throw new Error("nodeId is required");
  if (!field) throw new Error("field is required (characters | visible | mainComponent)");

  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);

  if (!node.componentPropertyReferences || !node.componentPropertyReferences[field]) {
    return { nodeId: node.id, nodeName: node.name, unboundField: field, wasNoOp: true };
  }

  var refs = {};
  var existing = node.componentPropertyReferences;
  var keys = Object.keys(existing);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] !== field) refs[keys[i]] = existing[keys[i]];
  }
  // Figma rejects `null` here ("Expected object, received null"). Use empty object —
  // setting to {} effectively clears all references, which is what we want.
  node.componentPropertyReferences = refs;

  return { nodeId: node.id, nodeName: node.name, unboundField: field, wasNoOp: false };
};

// removeComponentProperty — delete a property definition from a Component / ComponentSet.
// Figma also clears any componentPropertyReferences on descendants that pointed to it.
handlers.removeComponentProperty = async function(params) {
  var componentId = params.componentId || params.nodeId || params.id;
  var propertyName = params.propertyName || params.name;

  if (!componentId) throw new Error("componentId is required");
  if (!propertyName) throw new Error("propertyName is required");

  var node = await findNodeByIdAsync(componentId);
  if (!node) throw new Error("Component not found: " + componentId);
  if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
    throw new Error("removeComponentProperty requires a COMPONENT or COMPONENT_SET node, got: " + node.type);
  }

  var resolved = resolveComponentPropertyName(node, propertyName);
  if (!resolved) {
    throw new Error("Property '" + propertyName + "' not found on component '" + node.name + "'");
  }

  node.deleteComponentProperty(resolved);

  return {
    componentId: node.id,
    componentName: node.name,
    removedProperty: resolved,
  };
};
