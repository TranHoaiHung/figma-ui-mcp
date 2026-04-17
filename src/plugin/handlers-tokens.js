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
    modeName: (collection.modes.find(function(m) { return m.modeId === resolvedModeId; }) || {}).name || resolvedModeId,
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

  // Map friendly field aliases → Figma Plugin API setBoundVariable field names
  // Full list of FLOAT-bindable fields per Figma API spec:
  // https://www.figma.com/plugin-docs/api/properties/nodes-setboundvariable/
  var fieldMap = {
    // ── Color ──────────────────────────────────────────────────────────────
    "fill":             "fills",
    "fills":            "fills",
    "stroke":           "strokes",
    "strokes":          "strokes",
    // ── Geometry ───────────────────────────────────────────────────────────
    "opacity":          "opacity",
    "width":            "width",
    "height":           "height",
    // Corner radius — all four corners map to individual fields
    "cornerRadius":     "topLeftRadius",
    "topLeftRadius":    "topLeftRadius",
    "topRightRadius":   "topRightRadius",
    "bottomLeftRadius": "bottomLeftRadius",
    "bottomRightRadius":"bottomRightRadius",
    // ── Auto-layout spacing (FLOAT variables) ──────────────────────────────
    "itemSpacing":      "itemSpacing",
    "counterAxisSpacing": "counterAxisSpacing",
    "padding":          "paddingTop",           // alias for uniform; use specific keys below
    "paddingTop":       "paddingTop",
    "paddingBottom":    "paddingBottom",
    "paddingLeft":      "paddingLeft",
    "paddingRight":     "paddingRight",
    // ── Typography (TEXT nodes — FLOAT variables) ──────────────────────────
    "fontSize":         "fontSize",
    "letterSpacing":    "letterSpacing",
    "lineHeight":       "lineHeight",
    "paragraphSpacing": "paragraphSpacing",
    "paragraphIndent":  "paragraphIndent",
    // ── Typography — STRING variables (v2.5.4) ────────────────────────────
    // font family/style bind a STRING variable to TextNode.fontName
    "fontFamily":       "fontFamily",
    "fontName":         "fontFamily",   // alias
    "fontStyle":        "fontStyle",
    "fontWeight":       "fontStyle",    // alias (maps to the "style" part of fontName)
    // ── Text characters (STRING variable) ─────────────────────────────────
    "characters":       "characters",
    "text":             "characters",   // alias
    // ── Stroke weight ─────────────────────────────────────────────────────
    "strokeWeight":     "strokeWeight",
    // ── Visibility (BOOLEAN variable) ─────────────────────────────────────
    "visible":          "visible",
  };

  var figmaField = fieldMap[field] !== undefined ? fieldMap[field] : field;

  if (figmaField === "fills" || figmaField === "strokes") {
    // For fills/strokes, bind variable to the COLOR of the first solid paint
    var currentPaints = figmaField === "fills" ? node.fills : node.strokes;
    if (!currentPaints || currentPaints.length === 0) {
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
  } else if (figmaField === "fontFamily" || figmaField === "fontStyle") {
    // STRING variable → fontName.family or fontName.style
    // Figma API requires setBoundVariable with exact key
    if (node.type !== "TEXT") throw new Error("field \"" + field + "\" can only be applied to TEXT nodes");
    if (variable.resolvedType !== "STRING") {
      throw new Error("field \"" + field + "\" requires a STRING variable, got " + variable.resolvedType);
    }
    // Ensure current font is loaded before binding (Figma throws if the resolved
    // font family isn't loaded in the sandbox)
    try { await figma.loadFontAsync(node.fontName); } catch (e) { /* continue */ }
    node.setBoundVariable(figmaField, variable);
  } else if (figmaField === "characters") {
    if (node.type !== "TEXT") throw new Error("field \"characters\" can only be applied to TEXT nodes");
    try { await figma.loadFontAsync(node.fontName); } catch (e) {}
    node.setBoundVariable("characters", variable);
  } else if (figmaField === "letterSpacing" || figmaField === "lineHeight") {
    // letterSpacing/lineHeight are TEXT style objects, not scalar — bind via setBoundVariable
    if (node.type !== "TEXT") throw new Error("field \"" + field + "\" can only be applied to TEXT nodes");
    node.setBoundVariable(figmaField, variable);
  } else {
    // All other FLOAT / BOOLEAN fields use setBoundVariable directly
    if (!(figmaField in node)) {
      throw new Error(
        "Field \"" + field + "\" (mapped to \"" + figmaField + "\") is not available on node type " + node.type + ". " +
        "Supported fields: fill, stroke, opacity, width, height, cornerRadius, " +
        "paddingTop/Bottom/Left/Right, itemSpacing, fontSize, letterSpacing, lineHeight, " +
        "fontFamily, fontStyle, strokeWeight, visible, characters."
      );
    }
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
    var rgb = hexToRgb(value);
    variable.setValueForMode(modeId, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
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

// setupDesignTokens — bootstrap a complete design token system in one call.
// Idempotent: existing variables get their value updated; new ones are created.
//
// v2.5.4: added fontSizes (FLOAT), fonts (STRING), textStyles (text styles that
// reference variables), and multi-mode support.
//
// Params:
//   collectionName: string (default "Design Tokens")
//   modes: array of mode names (optional — default ["Mode 1"])
//   colors: { name: "#hex" } OR { name: { mode1: "#hex", mode2: "#hex" } }
//   numbers: { name: 16 } OR { name: { mode1: 16, mode2: 14 } }
//   fontSizes: same shape as numbers (creates FLOAT variables)
//   fonts: { name: "Inter" } OR { name: { mode1: "Inter", mode2: "SF Pro" } } (STRING)
//   textStyles: {
//     "text/heading-xl": {
//       fontFamily: "{font-primary}" | "Inter",   // {var-name} binds to STRING var
//       fontWeight: "Bold",
//       fontSize: "{text-heading-xl}" | 24,       // {var-name} binds to FLOAT var
//       lineHeight: 32 | "auto" | "150%",
//       letterSpacing: -0.4
//     }
//   }
handlers.setupDesignTokens = async function(params) {
  var collectionName = params.collectionName || "Design Tokens";
  var colors = params.colors || {};
  var numbers = params.numbers || {};
  var fontSizes = params.fontSizes || {};
  var fonts = params.fonts || {};
  var textStyles = params.textStyles || {};
  var requestedModes = params.modes || null;

  // ── Find or create collection ──────────────────────────────────────────
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

  // ── Apply requested modes (rename default + add missing) ───────────────
  if (Array.isArray(requestedModes) && requestedModes.length > 0) {
    // Rename the default mode to the first requested name
    var existingModes = collection.modes;
    if (existingModes.length >= 1 && existingModes[0].name !== requestedModes[0]) {
      try { collection.renameMode(existingModes[0].modeId, requestedModes[0]); }
      catch (e) { /* non-fatal */ }
    }
    // Add any extra modes that don't exist yet
    for (var rm = 1; rm < requestedModes.length; rm++) {
      var rmName = requestedModes[rm];
      var exists = false;
      for (var em = 0; em < collection.modes.length; em++) {
        if (collection.modes[em].name === rmName) { exists = true; break; }
      }
      if (!exists) {
        try { collection.addMode(rmName); } catch (e) { /* non-fatal */ }
      }
    }
  }

  // Build modeName → modeId lookup (after any renames/adds)
  var modesByName = {};
  for (var mi = 0; mi < collection.modes.length; mi++) {
    modesByName[collection.modes[mi].name] = collection.modes[mi].modeId;
  }
  var defaultModeId = collection.modes[0].modeId;

  // ── Read existing variables in this collection ─────────────────────────
  var existing = {};
  for (var vi = 0; vi < collection.variableIds.length; vi++) {
    var v = await figma.variables.getVariableByIdAsync(collection.variableIds[vi]);
    if (v) existing[v.name] = v;
  }

  var created = [];
  var skipped = [];

  // Helper: resolve a value (scalar) OR { modeName: value } object → apply to variable
  function applyVariableValue(variable, valueSpec, mapValueFn) {
    if (valueSpec && typeof valueSpec === "object" && !Array.isArray(valueSpec)) {
      // Per-mode values
      var keys = Object.keys(valueSpec);
      for (var k = 0; k < keys.length; k++) {
        var modeId = modesByName[keys[k]] || defaultModeId;
        variable.setValueForMode(modeId, mapValueFn(valueSpec[keys[k]]));
      }
    } else {
      // Scalar — apply to default mode
      variable.setValueForMode(defaultModeId, mapValueFn(valueSpec));
    }
  }

  // ── Create/update COLOR variables ──────────────────────────────────────
  var colorNames = Object.keys(colors);
  for (var i = 0; i < colorNames.length; i++) {
    var name = colorNames[i];
    var variable = existing[name];
    if (!variable) {
      variable = figma.variables.createVariable(name, collection, "COLOR");
      created.push({ name: name, id: variable.id, type: "COLOR" });
    } else {
      skipped.push(name);
    }
    applyVariableValue(variable, colors[name], function(hex) {
      var rgb = hexToRgb(hex);
      return { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 };
    });
  }

  // ── Create/update FLOAT variables (spacing, radius, etc.) ──────────────
  var numNames = Object.keys(numbers);
  for (var n = 0; n < numNames.length; n++) {
    var numName = numNames[n];
    var numVar = existing[numName];
    if (!numVar) {
      numVar = figma.variables.createVariable(numName, collection, "FLOAT");
      created.push({ name: numName, id: numVar.id, type: "FLOAT" });
    } else {
      skipped.push(numName);
    }
    applyVariableValue(numVar, numbers[numName], function(v) { return Number(v); });
  }

  // ── Create/update FLOAT variables for fontSizes (v2.5.4) ───────────────
  var fsNames = Object.keys(fontSizes);
  for (var fs = 0; fs < fsNames.length; fs++) {
    var fsName = fsNames[fs];
    var fsVar = existing[fsName];
    if (!fsVar) {
      fsVar = figma.variables.createVariable(fsName, collection, "FLOAT");
      created.push({ name: fsName, id: fsVar.id, type: "FLOAT" });
    } else {
      skipped.push(fsName);
    }
    applyVariableValue(fsVar, fontSizes[fsName], function(v) { return Number(v); });
  }

  // ── Create/update STRING variables for fonts (v2.5.4) ──────────────────
  var fontNames = Object.keys(fonts);
  for (var fn = 0; fn < fontNames.length; fn++) {
    var fontName = fontNames[fn];
    var fontVar = existing[fontName];
    if (!fontVar) {
      fontVar = figma.variables.createVariable(fontName, collection, "STRING");
      created.push({ name: fontName, id: fontVar.id, type: "STRING" });
    } else {
      skipped.push(fontName);
    }
    applyVariableValue(fontVar, fonts[fontName], function(v) { return String(v); });
  }

  // ── Re-read existing after creates so textStyles can reference new vars
  for (var vi2 = 0; vi2 < collection.variableIds.length; vi2++) {
    var v2 = await figma.variables.getVariableByIdAsync(collection.variableIds[vi2]);
    if (v2) existing[v2.name] = v2;
  }

  // ── Create/update TEXT STYLES with variable references (v2.5.4) ───────
  // Syntax: any field value that matches "{var-name}" is bound to the variable.
  var textStyleResults = [];
  var tsNames = Object.keys(textStyles);
  if (tsNames.length > 0) {
    // Index existing text styles by name
    var existingTextStyles = {};
    try {
      var allStyles = await figma.getLocalTextStylesAsync();
      for (var as = 0; as < allStyles.length; as++) {
        existingTextStyles[allStyles[as].name] = allStyles[as];
      }
    } catch (e) { /* fall back to sync API if async not available */ }
    if (Object.keys(existingTextStyles).length === 0 && figma.getLocalTextStyles) {
      var syncStyles = figma.getLocalTextStyles();
      for (var ss = 0; ss < syncStyles.length; ss++) {
        existingTextStyles[syncStyles[ss].name] = syncStyles[ss];
      }
    }

    for (var ts = 0; ts < tsNames.length; ts++) {
      var styleName = tsNames[ts];
      var spec = textStyles[styleName] || {};
      var style = existingTextStyles[styleName];
      var wasCreated = false;
      if (!style) {
        style = figma.createTextStyle();
        style.name = styleName;
        wasCreated = true;
      }

      // Resolve fontFamily (may be "{var-name}" or literal "Inter")
      var resolvedFamily = resolveRefOrLiteral(spec.fontFamily || "Inter", existing);
      var resolvedStyle = resolveRefOrLiteral(spec.fontWeight || "Regular", existing);
      // If either is a variable ref, fall back to the variable's default-mode
      // string value so we have a concrete fontName to load.
      var familyLiteral = typeof resolvedFamily === "string"
        ? resolvedFamily
        : getStringVarValue(resolvedFamily, defaultModeId) || "Inter";
      var styleLiteral = typeof resolvedStyle === "string"
        ? (FONT_STYLE_MAP[resolvedStyle] || resolvedStyle)
        : (FONT_STYLE_MAP[getStringVarValue(resolvedStyle, defaultModeId)] ||
           getStringVarValue(resolvedStyle, defaultModeId) || "Regular");

      try {
        await figma.loadFontAsync({ family: familyLiteral, style: styleLiteral });
      } catch (fontErr) {
        // If the explicit weight isn't available, fall back to Regular
        await figma.loadFontAsync({ family: familyLiteral, style: "Regular" });
        styleLiteral = "Regular";
      }
      style.fontName = { family: familyLiteral, style: styleLiteral };

      // fontSize — literal or variable reference
      var sizeSpec = spec.fontSize;
      if (sizeSpec !== undefined) {
        var resolvedSize = resolveRefOrLiteral(sizeSpec, existing);
        if (typeof resolvedSize === "number") {
          style.fontSize = resolvedSize;
        } else if (resolvedSize && resolvedSize.resolvedType === "FLOAT") {
          // Variable — set literal first, then bind
          style.fontSize = Number(resolvedSize.valuesByMode[defaultModeId]) || 14;
          try { style.setBoundVariable("fontSize", resolvedSize); } catch (e) { /* may be unsupported */ }
        } else {
          style.fontSize = 14;
        }
      }

      // lineHeight
      if (spec.lineHeight !== undefined) {
        if (spec.lineHeight === "auto" || spec.lineHeight === "AUTO") {
          style.lineHeight = { unit: "AUTO" };
        } else if (typeof spec.lineHeight === "string" && spec.lineHeight.indexOf("%") !== -1) {
          style.lineHeight = { unit: "PERCENT", value: parseFloat(spec.lineHeight) };
        } else {
          var lhNum = typeof spec.lineHeight === "number" ? spec.lineHeight : Number(spec.lineHeight);
          if (!isNaN(lhNum)) style.lineHeight = { unit: "PIXELS", value: lhNum };
        }
      }

      // letterSpacing
      if (spec.letterSpacing !== undefined) {
        style.letterSpacing = { unit: "PIXELS", value: Number(spec.letterSpacing) };
      }

      // fontFamily/fontStyle bindings (STRING variables)
      if (typeof resolvedFamily !== "string" && resolvedFamily && resolvedFamily.resolvedType === "STRING") {
        try { style.setBoundVariable("fontFamily", resolvedFamily); } catch (e) {}
      }
      if (typeof resolvedStyle !== "string" && resolvedStyle && resolvedStyle.resolvedType === "STRING") {
        try { style.setBoundVariable("fontStyle", resolvedStyle); } catch (e) {}
      }

      textStyleResults.push({
        name: styleName,
        id: style.id,
        created: wasCreated,
        fontFamily: familyLiteral,
        fontStyle: styleLiteral,
      });
      if (wasCreated) created.push({ name: styleName, id: style.id, type: "TEXT_STYLE" });
      else skipped.push(styleName);
    }
  }

  return {
    collectionId: collection.id,
    collectionName: collection.name,
    modes: collection.modes.map(function(m) { return { id: m.modeId, name: m.name }; }),
    created: created,
    updated: skipped,
    textStyles: textStyleResults,
    totalVariables: collection.variableIds.length,
  };
};

// Helper: given a spec value, return variable object if "{name}" reference,
// otherwise return the literal.
function resolveRefOrLiteral(value, existingVarsByName) {
  if (typeof value === "string") {
    var m = value.match(/^\{([^}]+)\}$/);
    if (m && existingVarsByName[m[1]]) return existingVarsByName[m[1]];
  }
  return value;
}

function getStringVarValue(variable, modeId) {
  try {
    var val = variable.valuesByMode[modeId];
    return typeof val === "string" ? val : null;
  } catch (e) { return null; }
}

// applyTextStyle — apply a text style by name to a TEXT node (v2.5.4)
// Convenience wrapper: finds text style by name, sets textStyleId on the node.
// Much faster than calling modify({ textStyleId: ... }) because the lookup
// happens inside the plugin.
handlers.applyTextStyle = async function(params) {
  var nodeId = params.nodeId || params.id;
  var styleName = params.styleName || params.name;
  var styleId = params.styleId;

  if (!nodeId) throw new Error("nodeId is required");
  if (!styleId && !styleName) throw new Error("styleName or styleId is required");

  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (node.type !== "TEXT") throw new Error("applyTextStyle requires a TEXT node, got: " + node.type);

  var resolvedStyleId = styleId;
  if (!resolvedStyleId) {
    // Look up by name
    var styles = null;
    try { styles = await figma.getLocalTextStylesAsync(); }
    catch (e) { if (figma.getLocalTextStyles) styles = figma.getLocalTextStyles(); }
    if (!styles) throw new Error("Could not list text styles");
    for (var i = 0; i < styles.length; i++) {
      if (styles[i].name === styleName) { resolvedStyleId = styles[i].id; break; }
    }
    if (!resolvedStyleId) {
      throw new Error("Text style not found: \"" + styleName + "\". Available: " +
        styles.map(function(s) { return s.name; }).join(", "));
    }
  }

  // Ensure the style's font is loaded before applying
  try {
    var styleObj = await figma.getStyleByIdAsync ? await figma.getStyleByIdAsync(resolvedStyleId) : figma.getStyleById(resolvedStyleId);
    if (styleObj && styleObj.fontName) {
      await figma.loadFontAsync(styleObj.fontName);
    }
  } catch (e) { /* best-effort font load */ }

  // Apply style (async setter preferred in newer API)
  if (node.setTextStyleIdAsync) {
    await node.setTextStyleIdAsync(resolvedStyleId);
  } else {
    node.textStyleId = resolvedStyleId;
  }

  return {
    nodeId: node.id,
    nodeName: node.name,
    styleId: resolvedStyleId,
    styleName: styleName || null,
  };
};
