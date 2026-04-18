// ─── DESIGN TOKEN OPERATIONS (v1.7.0) ───────────────────────────────────────

// ── Shared helpers ────────────────────────────────────────────────────────────

// T-1: Find variable collection by id OR name — replaces 6 duplicated loops
async function findCollectionAsync(collectionId) {
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].id === collectionId || collections[i].name === collectionId) {
      return collections[i];
    }
  }
  return null;
}

// T-2: Find variable by id OR name (with optional collectionId scope)
// Uses getLocalVariablesAsync() — 1 call instead of N getVariableByIdAsync calls
async function findVariableAsync(variableId, variableName, collectionId) {
  if (variableId) {
    var v = await figma.variables.getVariableByIdAsync(variableId);
    if (v) return v;
  }
  if (variableName) {
    var allVars = await figma.variables.getLocalVariablesAsync();
    for (var i = 0; i < allVars.length; i++) {
      var lv = allVars[i];
      if (!lv || lv.name !== variableName) continue;
      if (collectionId && lv.variableCollectionId !== collectionId) {
        // Also allow match by collection name
        var col = await figma.variables.getVariableCollectionByIdAsync(lv.variableCollectionId);
        if (!col || col.name !== collectionId) continue;
      }
      return lv;
    }
  }
  return null;
}

// T-5: hexToRgbA — preserves alpha from 8-char hex (#RRGGBBAA)
function hexToRgbA(hex) {
  var rgb = hexToRgb(hex); // existing util: returns {r,g,b} normalized 0-1
  var a = 1;
  if (hex && hex.length === 9) { // #RRGGBBAA
    a = parseInt(hex.slice(7, 9), 16) / 255;
  }
  return { r: rgb.r, g: rgb.g, b: rgb.b, a: a };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

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

  var collection = await findCollectionAsync(collectionId);
  if (!collection) throw new Error("Collection not found: " + collectionId);

  var variable = figma.variables.createVariable(name, collection, resolvedType);

  // Set value for default mode
  var modeId = collection.modes[0].modeId;
  if (resolvedType === "COLOR" && typeof value === "string") {
    variable.setValueForMode(modeId, hexToRgbA(value));
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
handlers.applyVariable = async function(params) {
  var nodeId = params.nodeId || params.id || params.targetId
    || (params.node && (typeof params.node === "string" ? params.node : params.node.id));
  var variableId = params.variableId;
  var variableName = params.variableName;
  var field = params.field || "fill";

  if (!nodeId) throw new Error("nodeId is required — pass nodeId, id, or targetId");
  if (!variableId && !variableName) throw new Error("variableId or variableName is required");

  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);

  var variable = await findVariableAsync(variableId, variableName, null);
  if (!variable) throw new Error("Variable not found: " + (variableId || variableName));

  // Map friendly field aliases → Figma Plugin API setBoundVariable field names
  var fieldMap = {
    "fill": "fills", "fills": "fills",
    "stroke": "strokes", "strokes": "strokes",
    "opacity": "opacity",
    "width": "width", "height": "height",
    "cornerRadius": "topLeftRadius",
    "topLeftRadius": "topLeftRadius", "topRightRadius": "topRightRadius",
    "bottomLeftRadius": "bottomLeftRadius", "bottomRightRadius": "bottomRightRadius",
    "itemSpacing": "itemSpacing", "counterAxisSpacing": "counterAxisSpacing",
    "padding": "paddingTop",
    "paddingTop": "paddingTop", "paddingBottom": "paddingBottom",
    "paddingLeft": "paddingLeft", "paddingRight": "paddingRight",
    "fontSize": "fontSize",
    "letterSpacing": "letterSpacing", "lineHeight": "lineHeight",
    "paragraphSpacing": "paragraphSpacing", "paragraphIndent": "paragraphIndent",
    "fontFamily": "fontFamily", "fontName": "fontFamily",
    "fontStyle": "fontStyle", "fontWeight": "fontStyle",
    "characters": "characters", "text": "characters",
    "strokeWeight": "strokeWeight",
    "visible": "visible",
  };

  var figmaField = fieldMap[field] !== undefined ? fieldMap[field] : field;

  if (figmaField === "fills" || figmaField === "strokes") {
    var currentPaints = figmaField === "fills" ? node.fills : node.strokes;
    if (!currentPaints || currentPaints.length === 0) {
      currentPaints = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
    }
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
    if (node.type !== "TEXT") throw new Error("field \"" + field + "\" can only be applied to TEXT nodes");
    if (variable.resolvedType !== "STRING") {
      throw new Error("field \"" + field + "\" requires a STRING variable, got " + variable.resolvedType);
    }
    try { await figma.loadFontAsync(node.fontName); } catch (e) {}
    node.setBoundVariable(figmaField, variable);
  } else if (figmaField === "characters") {
    if (node.type !== "TEXT") throw new Error("field \"characters\" can only be applied to TEXT nodes");
    try { await figma.loadFontAsync(node.fontName); } catch (e) {}
    node.setBoundVariable("characters", variable);
  } else if (figmaField === "letterSpacing" || figmaField === "lineHeight") {
    if (node.type !== "TEXT") throw new Error("field \"" + field + "\" can only be applied to TEXT nodes");
    node.setBoundVariable(figmaField, variable);
  } else {
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
  var color = params.color;
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

  var figmaStyle = FONT_STYLE_MAP[fontWeight] || fontWeight;

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
// T-4: now supports modeId/modeName params (was always mode[0])
handlers.modifyVariable = async function(params) {
  var variableId = params.variableId;
  var variableName = params.variableName;
  var modeId = params.modeId;
  var modeName = params.modeName;
  var value = params.value;

  if (!variableId && !variableName) throw new Error("variableId or variableName is required");
  if (value === undefined) throw new Error("value is required");

  var variable = await findVariableAsync(variableId, variableName, null);
  if (!variable) throw new Error("Variable not found: " + (variableId || variableName));

  var collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  var resolvedModeId = modeId || null;

  if (!resolvedModeId && modeName) {
    for (var mi = 0; mi < collection.modes.length; mi++) {
      if (collection.modes[mi].name === modeName) {
        resolvedModeId = collection.modes[mi].modeId; break;
      }
    }
    if (!resolvedModeId) throw new Error("Mode not found: " + modeName);
  }

  // Default to first mode when neither modeId nor modeName specified
  if (!resolvedModeId) resolvedModeId = collection.modes[0].modeId;

  if (variable.resolvedType === "COLOR") {
    variable.setValueForMode(resolvedModeId, hexToRgbA(value));
  } else if (variable.resolvedType === "FLOAT") {
    variable.setValueForMode(resolvedModeId, Number(value));
  } else if (variable.resolvedType === "STRING") {
    variable.setValueForMode(resolvedModeId, String(value));
  } else if (variable.resolvedType === "BOOLEAN") {
    variable.setValueForMode(resolvedModeId, Boolean(value));
  }

  return {
    id: variable.id,
    name: variable.name,
    resolvedType: variable.resolvedType,
    modeId: resolvedModeId,
    newValue: value,
  };
};

// setupDesignTokens — bootstrap a complete design token system in one call.
// Idempotent: existing variables get their value updated; new ones are created.
handlers.setupDesignTokens = async function(params) {
  var collectionName = params.collectionName || "Design Tokens";
  var colors = params.colors || {};
  var numbers = params.numbers || {};
  var fontSizes = params.fontSizes || {};
  var fonts = params.fonts || {};
  var textStyles = params.textStyles || {};
  var requestedModes = params.modes || null;

  // Find or create collection
  var collection = null;
  var allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  for (var ci = 0; ci < allCollections.length; ci++) {
    if (allCollections[ci].name === collectionName) {
      collection = allCollections[ci]; break;
    }
  }
  if (!collection) {
    collection = figma.variables.createVariableCollection(collectionName);
  }

  // Apply requested modes (rename default + add missing)
  if (Array.isArray(requestedModes) && requestedModes.length > 0) {
    var existingModes = collection.modes;
    if (existingModes.length >= 1 && existingModes[0].name !== requestedModes[0]) {
      try { collection.renameMode(existingModes[0].modeId, requestedModes[0]); }
      catch (e) {}
    }
    for (var rm = 1; rm < requestedModes.length; rm++) {
      var rmName = requestedModes[rm];
      var modeExists = false;
      for (var em = 0; em < collection.modes.length; em++) {
        if (collection.modes[em].name === rmName) { modeExists = true; break; }
      }
      if (!modeExists) {
        try { collection.addMode(rmName); } catch (e) {}
      }
    }
  }

  // Build modeName → modeId lookup
  var modesByName = {};
  for (var mi = 0; mi < collection.modes.length; mi++) {
    modesByName[collection.modes[mi].name] = collection.modes[mi].modeId;
  }
  var defaultModeId = collection.modes[0].modeId;

  // Read existing variables in this collection
  var existing = {};
  for (var vi = 0; vi < collection.variableIds.length; vi++) {
    var v = await figma.variables.getVariableByIdAsync(collection.variableIds[vi]);
    if (v) existing[v.name] = v;
  }

  var created = [];
  var skipped = [];

  // Helper: apply scalar OR {modeName: value} spec to variable
  function applyVariableValue(variable, valueSpec, mapValueFn) {
    if (valueSpec && typeof valueSpec === "object" && !Array.isArray(valueSpec)) {
      var keys = Object.keys(valueSpec);
      for (var k = 0; k < keys.length; k++) {
        var mid = modesByName[keys[k]] || defaultModeId;
        variable.setValueForMode(mid, mapValueFn(valueSpec[keys[k]]));
      }
    } else {
      variable.setValueForMode(defaultModeId, mapValueFn(valueSpec));
    }
  }

  // Create/update COLOR variables
  var colorNames = Object.keys(colors);
  for (var i = 0; i < colorNames.length; i++) {
    var cName = colorNames[i];
    var cVar = existing[cName];
    if (!cVar) {
      cVar = figma.variables.createVariable(cName, collection, "COLOR");
      created.push({ name: cName, id: cVar.id, type: "COLOR" });
    } else {
      skipped.push(cName);
    }
    applyVariableValue(cVar, colors[cName], function(hex) { return hexToRgbA(hex); });
  }

  // Create/update FLOAT variables (spacing, radius, etc.)
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

  // Create/update FLOAT variables for fontSizes
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

  // Create/update STRING variables for fonts
  var fontVarNames = Object.keys(fonts);
  for (var fn = 0; fn < fontVarNames.length; fn++) {
    var fontVarName = fontVarNames[fn];
    var fontVar = existing[fontVarName];
    if (!fontVar) {
      fontVar = figma.variables.createVariable(fontVarName, collection, "STRING");
      created.push({ name: fontVarName, id: fontVar.id, type: "STRING" });
    } else {
      skipped.push(fontVarName);
    }
    applyVariableValue(fontVar, fonts[fontVarName], function(v) { return String(v); });
  }

  // Re-read existing after creates so textStyles can reference new vars
  for (var vi2 = 0; vi2 < collection.variableIds.length; vi2++) {
    var v2 = await figma.variables.getVariableByIdAsync(collection.variableIds[vi2]);
    if (v2) existing[v2.name] = v2;
  }

  // Create/update TEXT STYLES with variable references
  var textStyleResults = [];
  var tsNames = Object.keys(textStyles);
  if (tsNames.length > 0) {
    var existingTextStyles = {};
    try {
      var allStyles = await figma.getLocalTextStylesAsync();
      for (var as = 0; as < allStyles.length; as++) {
        existingTextStyles[allStyles[as].name] = allStyles[as];
      }
    } catch (e) {}
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

      var resolvedFamily = resolveRefOrLiteral(spec.fontFamily || "Inter", existing);
      var resolvedStyle = resolveRefOrLiteral(spec.fontWeight || "Regular", existing);
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
        await figma.loadFontAsync({ family: familyLiteral, style: "Regular" });
        styleLiteral = "Regular";
      }
      style.fontName = { family: familyLiteral, style: styleLiteral };

      var sizeSpec = spec.fontSize;
      if (sizeSpec !== undefined) {
        var resolvedSize = resolveRefOrLiteral(sizeSpec, existing);
        if (typeof resolvedSize === "number") {
          style.fontSize = resolvedSize;
        } else if (resolvedSize && resolvedSize.resolvedType === "FLOAT") {
          style.fontSize = Number(resolvedSize.valuesByMode[defaultModeId]) || 14;
          try { style.setBoundVariable("fontSize", resolvedSize); } catch (e) {}
        } else {
          style.fontSize = 14;
        }
      }

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

      if (spec.letterSpacing !== undefined) {
        style.letterSpacing = { unit: "PIXELS", value: Number(spec.letterSpacing) };
      }

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

// resolveRefOrLiteral — return variable object if "{name}" reference, else literal
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

// applyTextStyle — apply a text style by name to a TEXT node
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

  try {
    var styleObj = await figma.getStyleByIdAsync ? await figma.getStyleByIdAsync(resolvedStyleId) : figma.getStyleById(resolvedStyleId);
    if (styleObj && styleObj.fontName) {
      await figma.loadFontAsync(styleObj.fontName);
    }
  } catch (e) {}

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
