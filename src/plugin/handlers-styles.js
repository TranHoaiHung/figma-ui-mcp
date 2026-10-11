// ─── HANDLERS STYLES ───
// Paint/text style creation and component creation.
// Split out of handlers-tokens.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

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
  // name and description are variable-level, not per-mode, so a rename or a
  // description edit is a valid call with no value. Only require one of the three.
  if (value === undefined && params.name === undefined && params.description === undefined) {
    throw new Error("Nothing to change: pass value, name or description");
  }

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

  if (value !== undefined) {
    if (variable.resolvedType === "COLOR") {
      variable.setValueForMode(resolvedModeId, hexToRgbA(value));
    } else if (variable.resolvedType === "FLOAT") {
      variable.setValueForMode(resolvedModeId, Number(value));
    } else if (variable.resolvedType === "STRING") {
      variable.setValueForMode(resolvedModeId, String(value));
    } else if (variable.resolvedType === "BOOLEAN") {
      variable.setValueForMode(resolvedModeId, Boolean(value));
    }
  }

  if (params.name !== undefined) variable.name = String(params.name);
  if (params.description !== undefined) variable.description = String(params.description);

  return {
    id: variable.id,
    name: variable.name,
    description: variable.description,
    resolvedType: variable.resolvedType,
    modeId: resolvedModeId,
    newValue: value !== undefined ? value : null,
  };
};

// setupDesignTokens — bootstrap a complete design token system in one call.
// Idempotent: existing variables get their value updated; new ones are created.
