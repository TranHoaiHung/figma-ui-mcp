// ─── HANDLERS VARIABLE MODES ───
// Mode add/rename/remove, values per mode, and frame mode overrides.
// Split out of handlers-tokens.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

handlers.addVariableMode = async function(params) {
  var collectionId = params.collectionId;
  var modeName = params.modeName || params.name;
  if (!collectionId) throw new Error("collectionId is required");
  if (!modeName) throw new Error("modeName is required");

  var collection = await findCollectionAsync(collectionId);
  if (!collection) throw new Error("Collection not found: " + collectionId);

  var modeId = collection.addMode(modeName);
  return {
    modeId: modeId,
    modeName: modeName,
    collectionId: collection.id,
    modes: collection.modes.map(function(m) { return { id: m.modeId, name: m.name }; }),
  };
};

// renameVariableMode — rename an existing mode in a variable collection
handlers.renameVariableMode = async function(params) {
  var collectionId = params.collectionId;
  var modeId = params.modeId;
  var newName = params.newName || params.name;
  if (!collectionId) throw new Error("collectionId is required");
  if (!modeId) throw new Error("modeId is required");
  if (!newName) throw new Error("newName is required");

  var collection = await findCollectionAsync(collectionId);
  if (!collection) throw new Error("Collection not found: " + collectionId);

  collection.renameMode(modeId, newName);
  return {
    modeId: modeId,
    modeName: newName,
    collectionId: collection.id,
    modes: collection.modes.map(function(m) { return { id: m.modeId, name: m.name }; }),
  };
};

// removeVariableMode — delete a mode from a variable collection
handlers.removeVariableMode = async function(params) {
  var collectionId = params.collectionId;
  var modeId = params.modeId;
  if (!collectionId) throw new Error("collectionId is required");
  if (!modeId) throw new Error("modeId is required");

  var collection = await findCollectionAsync(collectionId);
  if (!collection) throw new Error("Collection not found: " + collectionId);

  collection.removeMode(modeId);
  return {
    removedModeId: modeId,
    collectionId: collection.id,
    modes: collection.modes.map(function(m) { return { id: m.modeId, name: m.name }; }),
  };
};

// setVariableValue — set a variable's value for a specific mode
// Enables true multi-mode: Light/Dark/Brand/any mode independently
handlers.setVariableValue = async function(params) {
  var variableId = params.variableId;
  var variableName = params.variableName;
  var collectionId = params.collectionId;
  var modeId = params.modeId;
  var modeName = params.modeName;
  var value = params.value;

  if (!variableId && !variableName) throw new Error("variableId or variableName is required");
  if (!modeId && !modeName) throw new Error("modeId or modeName is required");
  if (value === undefined) throw new Error("value is required");

  var variable = await findVariableAsync(variableId, variableName, collectionId);
  if (!variable) throw new Error("Variable not found: " + (variableId || variableName));

  // Resolve modeId from modeName if needed
  var resolvedModeId = modeId;
  if (!resolvedModeId && modeName) {
    var parentCol = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    if (parentCol) {
      for (var mi = 0; mi < parentCol.modes.length; mi++) {
        if (parentCol.modes[mi].name === modeName) {
          resolvedModeId = parentCol.modes[mi].modeId; break;
        }
      }
    }
    if (!resolvedModeId) throw new Error("Mode not found: " + modeName);
  }

  // Auto-convert hex string for COLOR variables
  if (variable.resolvedType === "COLOR" && typeof value === "string") {
    variable.setValueForMode(resolvedModeId, hexToRgbA(value));
  } else {
    variable.setValueForMode(resolvedModeId, value);
  }

  return {
    variableId: variable.id,
    variableName: variable.name,
    modeId: resolvedModeId,
    value: value,
  };
};

// setFrameVariableMode — set explicit variable mode on a frame/group node
handlers.setFrameVariableMode = async function(params) {
  var nodeId = params.nodeId || params.id;
  var collectionId = params.collectionId;
  var modeId = params.modeId;
  var modeName = params.modeName;

  if (!nodeId) throw new Error("nodeId is required");
  if (!collectionId) throw new Error("collectionId is required");
  if (!modeId && !modeName) throw new Error("modeId or modeName is required");

  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (!node.setExplicitVariableModeForCollection) {
    throw new Error("Node type does not support explicit variable modes (must be FRAME, GROUP, or SECTION)");
  }

  var collection = await findCollectionAsync(collectionId);
  if (!collection) throw new Error("Collection not found: " + collectionId);

  // Resolve modeId from modeName if needed
  var resolvedModeId = modeId;
  if (!resolvedModeId && modeName) {
    for (var mi = 0; mi < collection.modes.length; mi++) {
      if (collection.modes[mi].name === modeName) {
        resolvedModeId = collection.modes[mi].modeId; break;
      }
    }
    if (!resolvedModeId) throw new Error("Mode not found: " + modeName);
  }

  node.setExplicitVariableModeForCollection(collection, resolvedModeId);

  // T-3: ES5-safe mode name lookup (no Array.find)
  var resolvedModeName = resolvedModeId;
  for (var mn = 0; mn < collection.modes.length; mn++) {
    if (collection.modes[mn].modeId === resolvedModeId) {
      resolvedModeName = collection.modes[mn].name; break;
    }
  }

  return {
    nodeId: node.id,
    nodeName: node.name,
    collectionId: collection.id,
    collectionName: collection.name,
    modeId: resolvedModeId,
    modeName: resolvedModeName,
    explicitVariableModes: node.explicitVariableModes || {},
  };
};

// clearFrameVariableMode — remove explicit mode override from a frame
handlers.clearFrameVariableMode = async function(params) {
  var nodeId = params.nodeId || params.id;
  var collectionId = params.collectionId;

  if (!nodeId) throw new Error("nodeId is required");
  if (!collectionId) throw new Error("collectionId is required");

  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (!node.clearExplicitVariableModeForCollection) {
    throw new Error("Node type does not support explicit variable modes (must be FRAME, GROUP, or SECTION)");
  }

  var collection = await findCollectionAsync(collectionId);
  if (!collection) throw new Error("Collection not found: " + collectionId);

  node.clearExplicitVariableModeForCollection(collection);

  return {
    nodeId: node.id,
    nodeName: node.name,
    collectionId: collection.id,
    collectionName: collection.name,
    explicitVariableModes: node.explicitVariableModes || {},
  };
};

// applyVariable — bind a variable to a node property (fill, stroke, etc.)
