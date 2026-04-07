// ─── DESIGN TOKEN OPERATIONS (v1.7.0) ───────────────────────────────────────

// createVariableCollection — create a new variable collection
handlers.createVariableCollection = async function(params) {
  var name = params.name;
  if (!name) throw new Error("Collection name is required");

  var collection = figma.variables.createVariableCollection(name);
  return {
    id: collection.id,
    name: collection.name,
    modes: collection.modes.map(function(m) { return { id: m.modeId, name: m.name }; }),
  };
};

// createVariable — create a variable in a collection
// Supports COLOR, FLOAT, STRING, BOOLEAN
handlers.createVariable = async function(params) {
  var name = params.name;
  var collectionId = params.collectionId;
  var resolvedType = params.resolvedType || "COLOR";
  var value = params.value;

  if (!name) throw new Error("Variable name is required");
  if (!collectionId) throw new Error("collectionId is required");

  // Find collection
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = null;
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].id === collectionId || collections[i].name === collectionId) {
      collection = collections[i];
      break;
    }
  }
  if (!collection) throw new Error("Collection not found: " + collectionId);

  var variable = figma.variables.createVariable(name, collection, resolvedType);

  // Set value for default mode
  var modeId = collection.modes[0].modeId;
  if (resolvedType === "COLOR" && typeof value === "string") {
    // Convert hex to RGBA
    var rgb = hexToRgb(value);
    variable.setValueForMode(modeId, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
  } else if (value !== undefined) {
    variable.setValueForMode(modeId, value);
  }

  return {
    id: variable.id,
    name: variable.name,
    resolvedType: variable.resolvedType,
    collectionId: collection.id,
  };
};

// addVariableMode — add a new mode to an existing variable collection
handlers.addVariableMode = async function(params) {
  var collectionId = params.collectionId;
  var modeName = params.modeName || params.name;
  if (!collectionId) throw new Error("collectionId is required");
  if (!modeName) throw new Error("modeName is required");

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = null;
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].id === collectionId || collections[i].name === collectionId) {
      collection = collections[i]; break;
    }
  }
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

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = null;
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].id === collectionId || collections[i].name === collectionId) {
      collection = collections[i]; break;
    }
  }
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

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = null;
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].id === collectionId || collections[i].name === collectionId) {
      collection = collections[i]; break;
    }
  }
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

  // Resolve variable by id or name
  var variable = null;
  if (variableId) {
    variable = await figma.variables.getVariableByIdAsync(variableId);
  }
  if (!variable && variableName) {
    var allCols = await figma.variables.getLocalVariableCollectionsAsync();
    for (var ci = 0; ci < allCols.length && !variable; ci++) {
      var col = allCols[ci];
      if (collectionId && col.id !== collectionId && col.name !== collectionId) continue;
      for (var vi = 0; vi < col.variableIds.length && !variable; vi++) {
        var v = await figma.variables.getVariableByIdAsync(col.variableIds[vi]);
        if (v && v.name === variableName) variable = v;
      }
    }
  }
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
    var rgb = hexToRgb(value);
    variable.setValueForMode(resolvedModeId, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
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
// Equivalent to Figma REST PATCH explicitVariableModes, but via Plugin API
// node.setExplicitVariableModeForCollection(collection, modeId)
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

  // Resolve collection
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = null;
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].id === collectionId || collections[i].name === collectionId) {
      collection = collections[i]; break;
    }
  }
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

  return {
    nodeId: node.id,
    nodeName: node.name,
    collectionId: collection.id,
    collectionName: collection.name,
    modeId: resolvedModeId,
    modeName: collection.modes.find(function(m) { return m.modeId === resolvedModeId; }).name,
    explicitVariableModes: node.explicitVariableModes || {},
  };
};

// clearFrameVariableMode — remove explicit mode override from a frame
// Reverts to inheriting the mode from the parent frame or document default
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

  // Resolve collection
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = null;
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].id === collectionId || collections[i].name === collectionId) {
      collection = collections[i]; break;
    }
  }
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
handlers.applyVariable = async function(params) {
  // Accept nodeId, id, node (object with .id), or targetId
  var nodeId = params.nodeId || params.id || params.targetId
    || (params.node && (typeof params.node === "string" ? params.node : params.node.id));
  var variableId = params.variableId;
  var variableName = params.variableName;
  var field = params.field || "fill"; // fill, stroke, opacity, cornerRadius, etc.

  if (!nodeId) throw new Error("nodeId is required — pass nodeId, id, or targetId");
  if (!variableId && !variableName) throw new Error("variableId or variableName is required");

  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);

  // Find variable by ID or name
  var variable = null;
  if (variableId) {
    variable = await figma.variables.getVariableByIdAsync(variableId);
  }
  if (!variable && variableName) {
    var allCollections = await figma.variables.getLocalVariableCollectionsAsync();
    for (var ci = 0; ci < allCollections.length && !variable; ci++) {
      var col = allCollections[ci];
      for (var vi = 0; vi < col.variableIds.length && !variable; vi++) {
        var v = await figma.variables.getVariableByIdAsync(col.variableIds[vi]);
        if (v && v.name === variableName) variable = v;
      }
    }
  }
  if (!variable) throw new Error("Variable not found: " + (variableId || variableName));

  // Map field names to Figma setBoundVariable fields
  var fieldMap = {
    "fill": "fills",
    "fills": "fills",
    "stroke": "strokes",
    "strokes": "strokes",
    "opacity": "opacity",
    "cornerRadius": "topLeftRadius",
    "width": "width",
    "height": "height",
  };

  var figmaField = fieldMap[field] || field;

  if (figmaField === "fills" || figmaField === "strokes") {
    // For fills/strokes, bind variable to the first solid paint
    var currentPaints = figmaField === "fills" ? node.fills : node.strokes;
    if (!currentPaints || currentPaints.length === 0) {
      // Create a solid fill first so we have something to bind to
      currentPaints = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
    }
    // Clone paints array (Figma requires setting the full array)
    var paintsCopy = [];
    for (var pi = 0; pi < currentPaints.length; pi++) {
      paintsCopy.push(Object.assign({}, currentPaints[pi]));
      if (currentPaints[pi].color) {
        paintsCopy[pi].color = Object.assign({}, currentPaints[pi].color);
      }
    }
    paintsCopy[0] = figma.variables.setBoundVariableForPaint(paintsCopy[0], "color", variable);
    if (figmaField === "fills") node.fills = paintsCopy;
    else node.strokes = paintsCopy;
  } else {
    node.setBoundVariable(figmaField, variable);
  }

  return {
    nodeId: node.id,
    nodeName: node.name,
    field: field,
    variableId: variable.id,
    variableName: variable.name,
  };
};

// createPaintStyle — create a reusable local paint style
handlers.createPaintStyle = async function(params) {
  var name = params.name;
  var color = params.color; // hex string
  var description = params.description || "";

  if (!name) throw new Error("Style name is required");
  if (!color) throw new Error("Color hex is required");

  var style = figma.createPaintStyle();
  style.name = name;
  style.description = description;
  style.paints = [{ type: "SOLID", color: hexToRgb(color) }];

  return {
    id: style.id,
    name: style.name,
    key: style.key,
    color: color,
  };
};

// createTextStyle — create a reusable local text style
handlers.createTextStyle = async function(params) {
  var name = params.name;
  var fontFamily = params.fontFamily || "Inter";
  var fontWeight = params.fontWeight || "Regular";
  var fontSize = params.fontSize || 14;
  var lineHeight = params.lineHeight;
  var letterSpacing = params.letterSpacing;
  var description = params.description || "";

  if (!name) throw new Error("Style name is required");

  var style = figma.createTextStyle();
  style.name = name;
  style.description = description;

  // Map weight names to Figma font style strings
  var weightMap = FONT_STYLE_MAP;
  var figmaStyle = weightMap[fontWeight] || fontWeight;

  await figma.loadFontAsync({ family: fontFamily, style: figmaStyle });
  style.fontName = { family: fontFamily, style: figmaStyle };
  style.fontSize = fontSize;

  if (lineHeight !== undefined) {
    if (lineHeight === "auto") {
      style.lineHeight = { unit: "AUTO" };
    } else if (typeof lineHeight === "string" && lineHeight.indexOf("%") !== -1) {
      style.lineHeight = { unit: "PERCENT", value: parseFloat(lineHeight) };
    } else {
      style.lineHeight = { unit: "PIXELS", value: Number(lineHeight) };
    }
  }

  if (letterSpacing !== undefined) {
    style.letterSpacing = { unit: "PIXELS", value: Number(letterSpacing) };
  }

  return {
    id: style.id,
    name: style.name,
    key: style.key,
    fontFamily: fontFamily,
    fontWeight: fontWeight,
    fontSize: fontSize,
  };
};

// createComponent — convert an existing frame/group into a reusable component
handlers.createComponent = async function(params) {
  var nodeId = params.nodeId || params.id;
  var name = params.name;

  if (!nodeId) throw new Error("nodeId of the frame to convert is required");

  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);

  var component;
  if (node.type === "FRAME" || node.type === "GROUP") {
    component = figma.createComponentFromNode(node);
  } else {
    throw new Error("Can only convert FRAME or GROUP to component, got: " + node.type);
  }

  if (name) component.name = name;

  return {
    id: component.id,
    name: component.name,
    key: component.key,
    width: Math.round(component.width),
    height: Math.round(component.height),
  };
};

// modifyVariable — change the value of an existing variable
handlers.modifyVariable = async function(params) {
  var variableId = params.variableId;
  var variableName = params.variableName;
  var value = params.value; // hex color string for COLOR type, number for FLOAT

  if (!variableId && !variableName) throw new Error("variableId or variableName is required");
  if (value === undefined) throw new Error("value is required");

  // Find variable
  var variable = null;
  if (variableId) {
    variable = await figma.variables.getVariableByIdAsync(variableId);
  }
  if (!variable && variableName) {
    var allCollections = await figma.variables.getLocalVariableCollectionsAsync();
    for (var ci = 0; ci < allCollections.length && !variable; ci++) {
      var col = allCollections[ci];
      for (var vi = 0; vi < col.variableIds.length && !variable; vi++) {
        var v = await figma.variables.getVariableByIdAsync(col.variableIds[vi]);
        if (v && v.name === variableName) variable = v;
      }
    }
  }
  if (!variable) throw new Error("Variable not found: " + (variableId || variableName));

  // Get the collection to find mode ID
  var collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  var modeId = collection.modes[0].modeId;

  // Set value based on type
  if (variable.resolvedType === "COLOR") {
    var hex = value.replace("#", "");
    var r = parseInt(hex.substring(0, 2), 16) / 255;
    var g = parseInt(hex.substring(2, 4), 16) / 255;
    var b = parseInt(hex.substring(4, 6), 16) / 255;
    variable.setValueForMode(modeId, { r: r, g: g, b: b, a: 1 });
  } else if (variable.resolvedType === "FLOAT") {
    variable.setValueForMode(modeId, Number(value));
  } else if (variable.resolvedType === "STRING") {
    variable.setValueForMode(modeId, String(value));
  } else if (variable.resolvedType === "BOOLEAN") {
    variable.setValueForMode(modeId, Boolean(value));
  }

  return {
    id: variable.id,
    name: variable.name,
    resolvedType: variable.resolvedType,
    newValue: value,
  };
};

// setupDesignTokens — bootstrap a complete design token system in one call
// Creates variable collection + all color/spacing variables if they don't exist
// Idempotent: skips existing variables, only adds missing ones
handlers.setupDesignTokens = async function(params) {
  var collectionName = params.collectionName || "Design Tokens";
  var colors = params.colors || {};   // { "accent": "#3B82F6", "bg-base": "#08090E", ... }
  var numbers = params.numbers || {}; // { "spacing-sm": 8, "radius-md": 12, ... }

  // Find or create collection
  var collection = null;
  var allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  for (var ci = 0; ci < allCollections.length; ci++) {
    if (allCollections[ci].name === collectionName) {
      collection = allCollections[ci];
      break;
    }
  }
  if (!collection) {
    collection = figma.variables.createVariableCollection(collectionName);
  }

  // Read existing variables in this collection
  var existing = {};
  for (var vi = 0; vi < collection.variableIds.length; vi++) {
    var v = await figma.variables.getVariableByIdAsync(collection.variableIds[vi]);
    if (v) existing[v.name] = v;
  }

  var modeId = collection.modes[0].modeId;
  var created = [];
  var skipped = [];

  // Create color variables
  var colorNames = Object.keys(colors);
  for (var i = 0; i < colorNames.length; i++) {
    var name = colorNames[i];
    var hex = colors[name].replace("#", "");
    var r = parseInt(hex.substring(0, 2), 16) / 255;
    var g = parseInt(hex.substring(2, 4), 16) / 255;
    var b = parseInt(hex.substring(4, 6), 16) / 255;

    if (existing[name]) {
      // Update existing variable value
      existing[name].setValueForMode(modeId, { r: r, g: g, b: b, a: 1 });
      skipped.push(name);
    } else {
      var cv = figma.variables.createVariable(name, collection, "COLOR");
      cv.setValueForMode(modeId, { r: r, g: g, b: b, a: 1 });
      created.push({ name: name, id: cv.id, type: "COLOR" });
    }
  }

  // Create number variables (spacing, radius, etc.)
  var numNames = Object.keys(numbers);
  for (var i = 0; i < numNames.length; i++) {
    var name = numNames[i];
    if (existing[name]) {
      existing[name].setValueForMode(modeId, Number(numbers[name]));
      skipped.push(name);
    } else {
      var nv = figma.variables.createVariable(name, collection, "FLOAT");
      nv.setValueForMode(modeId, Number(numbers[name]));
      created.push({ name: name, id: nv.id, type: "FLOAT" });
    }
  }

  return {
    collectionId: collection.id,
    collectionName: collection.name,
    created: created,
    updated: skipped,
    totalVariables: collection.variableIds.length,
  };
};
