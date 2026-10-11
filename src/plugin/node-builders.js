// ─── NODE BUILDERS ───
// Node builders: frame, rectangle, ellipse, line, text.
// Split out of handlers-write.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

// ─── node builders (one per type) ─────────────────────────────────────────────

function buildFrame(params, width, height, fill, stroke, strokeWeight) {
  var node = figma.createFrame();
  applyCommonProps(node, params, width, height, fill, stroke, strokeWeight);
  applyCornerRadii(node, params);
  applyAutoLayout(node, params);
  return node;
}

function buildRectangle(params, width, height, fill, stroke, strokeWeight) {
  var node = figma.createRectangle();
  applyCommonProps(node, params, width, height, fill, stroke, strokeWeight);
  applyCornerRadii(node, params);
  return node;
}

function buildEllipse(params, width, height, fill, stroke, strokeWeight) {
  var node = figma.createEllipse();
  applyCommonProps(node, params, width, height, fill, stroke, strokeWeight);
  if (params.arcData) {
    var arc = params.arcData;
    node.arcData = {
      startingAngle: arc.startingAngle !== undefined ? arc.startingAngle : (arc.startAngle !== undefined ? arc.startAngle : 0),
      endingAngle:   arc.endingAngle   !== undefined ? arc.endingAngle   : (arc.endAngle   !== undefined ? arc.endAngle   : Math.PI * 2),
      innerRadius:   arc.innerRadius   !== undefined ? arc.innerRadius   : 0,
    };
  }
  return node;
}

function buildLine(params, width, stroke, strokeWeight) {
  var node = figma.createLine();
  node.resize(width || 100, 0);
  node.fills = [];
  if (stroke) { node.strokes = solidStroke(stroke, params.strokeOpacity); node.strokeWeight = strokeWeight; }
  if (params.effects) applyEffects(node, params.effects);
  return node;
}

async function buildText(params, width, height, fill, fontSize, fontWeight, lineHeight) {
  var content = params.content !== undefined ? params.content : (params.characters !== undefined ? params.characters : "");
  const style = FONT_STYLE_MAP[fontWeight] || "Regular";
  await figma.loadFontAsync({ family: "Inter", style });
  var node = figma.createText();
  node.fontName = { family: "Inter", style };
  node.fontSize = fontSize;
  node.characters = content;

  var textFill = fill || params.fontColor;
  if (textFill) {
    node.fills = solidFill(textFill, params.fillOpacity);
  } else if (params.fills && Array.isArray(params.fills) && params.fills.length > 0) {
    var firstColor = params.fills[0] && params.fills[0].color;
    if (firstColor) node.fills = buildFillArray(firstColor, params.fillOpacity);
  }

  if (params.effects) applyEffects(node, params.effects);

  if (lineHeight) {
    node.lineHeight = (typeof lineHeight === "object" && lineHeight.unit)
      ? lineHeight
      : { value: lineHeight, unit: "PIXELS" };
  }

  var textAlignValue = params.textAlignHorizontal || params.textAlign;
  if (textAlignValue) node.textAlignHorizontal = String(textAlignValue).toUpperCase();
  if (params.textAlignVertical) node.textAlignVertical = String(params.textAlignVertical).toUpperCase();

  // Auto-resize: explicit > both dims fixed > centered/right width > width-only > default hug
  if (params.textAutoResize) {
    node.textAutoResize = params.textAutoResize;
    if (params.textAutoResize === "NONE" && width && height) node.resize(width, height);
  } else if (width && height) {
    // BUG-01 fix: both dimensions given → fixed box, resize after setting NONE
    node.textAutoResize = "NONE";
    node.resize(width, height);
  } else if (width && textAlignValue) {
    var upAlign = String(textAlignValue).toUpperCase();
    if (upAlign === "CENTER" || upAlign === "RIGHT" || upAlign === "JUSTIFIED") {
      // Fixed width so centering has room; height stays auto (HEIGHT mode wraps)
      node.textAutoResize = "HEIGHT";
      node.resize(width, node.height);
    } else {
      node.textAutoResize = "HEIGHT";
    }
  } else if (width) {
    // BUG-TEXT-01: width-only → set width but let height auto-fit content.
    // Previously left node.height at default 100 → caused vertical overflow.
    node.textAutoResize = "HEIGHT";
    node.resize(width, node.height);
  } else {
    // BUG-TEXT-01: neither width nor height → hug both axes (natural text bounds).
    // Default text size in Figma is 100x100 if textAutoResize stays at its initial value;
    // WIDTH_AND_HEIGHT makes the box shrink-wrap the actual rendered glyphs.
    node.textAutoResize = "WIDTH_AND_HEIGHT";
  }
  return node;
}
