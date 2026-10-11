// ─── HANDLERS VARIABLE BINDING ───
// handlers.applyVariable — binds a variable to a node field.
// Split out of handlers-tokens.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

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
    try { await ensureTextFontLoaded(node); } catch (e) {}
    node.setBoundVariable(figmaField, variable);
  } else if (figmaField === "characters") {
    if (node.type !== "TEXT") throw new Error("field \"characters\" can only be applied to TEXT nodes");
    try { await ensureTextFontLoaded(node); } catch (e) {}
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
