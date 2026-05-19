// ─── WRITE HANDLERS ───────────────────────────────────────────────────────────

const handlers = {};

handlers.status = async () => ({
  connected:   true,
  version:     "{{PLUGIN_VERSION}}",
  fileName:    figma.root.name,
  currentPage: figma.currentPage.name,
  pageCount:   figma.root.children.length,
  selection:   figma.currentPage.selection.map(nodeToInfo),
});

handlers.listPages = async () =>
  figma.root.children.map(p => ({ id: p.id, name: p.name }));

handlers.setPage = async (params) => {
  var name = params.name || params.pageName || (typeof params.page === "string" ? params.page : null);
  var id   = params.id   || params.pageId;
  var page = null;
  if (id)   page = figma.root.children.find(function(p) { return p.id === id; });
  if (!page && name) page = figma.root.children.find(function(p) { return p.name === name; });
  if (!page && figma.root.children.length === 1) page = figma.root.children[0];
  if (!page) throw new Error("Page not found: \"" + (name || id) + "\". Available: " + figma.root.children.map(function(p) { return p.name; }).join(", "));
  await figma.setCurrentPageAsync(page);
  return { id: page.id, name: page.name };
};

handlers.createPage = async ({ name }) => {
  const existing = figma.root.children.find(p => p.name === name);
  if (existing) return { id: existing.id, name: existing.name, existed: true };
  const page = figma.createPage();
  page.name = name;
  return { id: page.id, name: page.name };
};

handlers.query = async (params) => {
  var type = params.type, name = params.name, id = params.id;
  var parentId = params.parentId, limit = params.limit || 500;
  if (id) {
    const n = await findNodeByIdAsync(id);
    return n ? [nodeToInfo(n)] : [];
  }
  if (!type && !name) throw new Error("query requires at least one of: type, name, id");
  // BUG-03: parentId filter scopes search to a subtree; default cap raised 100 → 500.
  var scope = figma.currentPage;
  if (parentId) {
    var parent = await findNodeByIdAsync(parentId);
    if (!parent) throw new Error("parentId not found: " + parentId);
    if (typeof parent.findAll !== "function") return [];
    scope = parent;
  }
  const results = scope.findAll(n => {
    if (type && name) return n.type === type && n.name === name;
    if (type) return n.type === type;
    return n.name === name;
  });
  return results.slice(0, limit).map(nodeToInfo);
};

// ─── shared helpers ────────────────────────────────────────────────────────────

// Apply resize + fill + stroke + effects — shared by FRAME, RECT, ELLIPSE builders.
function applyCommonProps(node, params, width, height, fill, stroke, strokeWeight) {
  node.resize(width, height);
  node.fills = fill ? buildFillArray(fill, params.fillOpacity) : [];
  if (stroke) {
    node.strokes = solidStroke(stroke, params.strokeOpacity);
    node.strokeWeight = strokeWeight;
    if (params.strokeAlign) node.strokeAlign = params.strokeAlign;
    // BUG-17: forward strokeDashPattern to Figma dashPattern
    if (params.strokeDashPattern && Array.isArray(params.strokeDashPattern)) node.dashPattern = params.strokeDashPattern;
  }
  if (params.effects) applyEffects(node, params.effects);
}

// Apply auto-layout props to a FRAME node (create or modify path).
function applyAutoLayout(node, params) {
  if (!params.layoutMode || params.layoutMode === "NONE") return;
  node.layoutMode = params.layoutMode;
  if (params.counterAxisAlignItems === "STRETCH") {
    throw new Error(
      "counterAxisAlignItems does not support \"STRETCH\". " +
      "Set counterAxisAlignItems: \"MIN\" on the container and layoutAlign: \"STRETCH\" on each child."
    );
  }
  if (params.primaryAxisAlignItems) node.primaryAxisAlignItems = params.primaryAxisAlignItems;
  if (params.counterAxisAlignItems) node.counterAxisAlignItems = params.counterAxisAlignItems;

  if (params.padding !== undefined) {
    node.paddingTop = node.paddingBottom = node.paddingLeft = node.paddingRight = params.padding;
  }
  if (params.paddingHorizontal !== undefined) { node.paddingLeft = node.paddingRight = params.paddingHorizontal; }
  if (params.paddingVertical   !== undefined) { node.paddingTop  = node.paddingBottom = params.paddingVertical; }
  if (params.paddingTop    !== undefined) node.paddingTop    = params.paddingTop;
  if (params.paddingBottom !== undefined) node.paddingBottom = params.paddingBottom;
  if (params.paddingLeft   !== undefined) node.paddingLeft   = params.paddingLeft;
  if (params.paddingRight  !== undefined) node.paddingRight  = params.paddingRight;
  if (params.itemSpacing   !== undefined) node.itemSpacing   = params.itemSpacing;

  node.primaryAxisSizingMode = params.primaryAxisSizingMode || "FIXED";
  node.counterAxisSizingMode = params.counterAxisSizingMode || "FIXED";
  if (params.clipsContent !== undefined) node.clipsContent = params.clipsContent;
}

// Apply child layout props (layoutAlign, layoutGrow, layoutSizing{H,V}) — works
// for both create and modify paths. layoutSizingHorizontal/Vertical control how
// a child sits inside an auto-layout parent (HUG | FIXED | FILL) and are the
// modern (post-2022) per-axis controls — they override textAutoResize for
// auto-layout children, so without them programmatically-changed text content
// can't push a hug-width parent to grow.
//
// Setting these on a node that's NOT inside an auto-layout parent throws in
// Figma, so we guard with the `in` check + a try/catch for the edge case where
// `in` reports true but the runtime still rejects (e.g. parent layoutMode is
// being changed in the same call).
function applyChildLayout(node, params) {
  if (params.layoutAlign !== undefined && "layoutAlign" in node) node.layoutAlign = params.layoutAlign;
  if (params.layoutGrow  !== undefined && "layoutGrow"  in node) node.layoutGrow  = params.layoutGrow;
  if (params.layoutSizingHorizontal !== undefined && "layoutSizingHorizontal" in node) {
    try { node.layoutSizingHorizontal = params.layoutSizingHorizontal; } catch (e) {}
  }
  if (params.layoutSizingVertical !== undefined && "layoutSizingVertical" in node) {
    try { node.layoutSizingVertical = params.layoutSizingVertical; } catch (e) {}
  }
}

// When TEXT content is changed on a node inside a hug-axis auto-layout parent,
// promote the text node's matching layoutSizing axis to HUG. Otherwise the
// parent's hug request is silently ignored because the child's
// layoutSizingHorizontal defaults to FIXED after parenting — and FIXED beats
// textAutoResize for auto-layout children. Without this, setComponentProperties
// (and direct modify with content) update the text but the button never grows.
//
// Best-effort: skipped when the user passed the axis explicitly, when the
// parent isn't hug-mode, or when Figma rejects the assignment.
function autoPromoteTextHugForReflow(node, params) {
  if (!node || node.type !== "TEXT") return;
  if (params.content === undefined) return;

  var parent = node.parent;
  if (!parent || !parent.layoutMode || parent.layoutMode === "NONE") return;

  var horizontal = parent.layoutMode === "HORIZONTAL";
  var parentHugsPrimary = parent.primaryAxisSizingMode === "AUTO" ||
    (horizontal ? parent.layoutSizingHorizontal === "HUG"
                : parent.layoutSizingVertical   === "HUG");
  if (!parentHugsPrimary) return;

  if (horizontal && params.layoutSizingHorizontal !== undefined) return;
  if (!horizontal && params.layoutSizingVertical !== undefined) return;

  try {
    if (horizontal && "layoutSizingHorizontal" in node) {
      node.layoutSizingHorizontal = "HUG";
    } else if (!horizontal && "layoutSizingVertical" in node) {
      node.layoutSizingVertical = "HUG";
    }
  } catch (e) {}
}

// Reusable base64 lookup table — built once, not per-call.
var _B64_LOOKUP = (function() {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var t = {};
  for (var i = 0; i < chars.length; i++) t[chars[i]] = i;
  return t;
})();

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
    node.textAutoResize = "HEIGHT";
  }
  return node;
}

function buildSvg(params, width, height, fill, stroke, strokeWeight) {
  var svgStr = params.svg;
  if (!svgStr) throw new Error("SVG type requires 'svg' param with SVG markup string");
  var node = figma.createNodeFromSvg(svgStr);
  if (width && height) node.resize(width, height);

  if ((fill || stroke) && node.findAll) {
    var allVectors = node.findAll(function(n) { return n.type === "VECTOR"; });
    for (var vi = 0; vi < allVectors.length; vi++) {
      var vec = allVectors[vi];
      var hasFill   = vec.fills   && vec.fills.length   > 0 && vec.fills[0].type === "SOLID";
      var hasStroke = vec.strokes && vec.strokes.length  > 0;
      if (fill) {
        if (hasFill || !hasStroke) vec.fills   = solidFill(fill);
        else                        vec.strokes = solidStroke(fill);
      }
      if (stroke) { vec.strokes = solidStroke(stroke); vec.strokeWeight = strokeWeight; }
    }
  }
  return node;
}

function buildVector(params, width, height, fill, stroke, strokeWeight) {
  var pathData = params.d || params.path;
  var pathsArr = params.paths;
  if (!pathData && !pathsArr) {
    throw new Error('VECTOR type requires "d" (path data string) or "paths" (array of {d, windingRule})');
  }

  var node = figma.createVector();
  try {
    node.resize(width, height);
    if (pathsArr && Array.isArray(pathsArr)) {
      node.vectorPaths = pathsArr.map(function(p) {
        var raw = typeof p === "string" ? p : p.d;
        return { data: normalizeSvgPath(raw), windingRule: (typeof p === "object" && p.windingRule) ? p.windingRule : "NONZERO" };
      });
    } else {
      node.vectorPaths = [{ data: normalizeSvgPath(pathData), windingRule: params.windingRule || "NONZERO" }];
    }
    // BUG-04: Figma resets bounding box to path geometry after setVectorPaths.
    // Re-apply resize() so the node matches the requested dimensions.
    if (width && height) node.resize(width, height);
    // BUG-02: VECTOR fill now supports gradient objects (same as FRAME/RECTANGLE)
    node.fills = fill ? buildFillArray(fill, params.fillOpacity) : [];
    if (stroke) { node.strokes = solidStroke(stroke); node.strokeWeight = strokeWeight; }
    if (params.strokeCap)  node.strokeCap  = params.strokeCap;
    if (params.strokeJoin) node.strokeJoin = params.strokeJoin;
  } catch (vectorErr) {
    try { node.remove(); } catch(e) {}
    throw new Error("VECTOR path error: " + vectorErr.message + ". Check that 'd' is valid SVG path data (commas and A/arc are now supported).");
  }
  return node;
}

function buildImage(params, width, height, cornerRadius, stroke, strokeWeight) {
  var imgData = params.imageData;
  if (!imgData) throw new Error("IMAGE type requires 'imageData' param with base64 string");

  var strippedData = imgData.indexOf(",") !== -1 ? imgData.substring(imgData.indexOf(",") + 1) : imgData;
  var cleanData = strippedData.replace(/[^A-Za-z0-9+/=]/g, "");
  var outLen = Math.floor(cleanData.replace(/=/g, "").length * 3 / 4);
  var raw = new Uint8Array(outLen);
  var j = 0;
  for (var ci = 0; ci < cleanData.length; ci += 4) {
    // Use explicit undefined check — lookup['A']===0 is valid, lookup[undefined] must not default to 0
    var a = (_B64_LOOKUP[cleanData[ci]]     !== undefined) ? _B64_LOOKUP[cleanData[ci]]     : 0;
    var b = (_B64_LOOKUP[cleanData[ci + 1]] !== undefined) ? _B64_LOOKUP[cleanData[ci + 1]] : 0;
    var c = (_B64_LOOKUP[cleanData[ci + 2]] !== undefined) ? _B64_LOOKUP[cleanData[ci + 2]] : 0;
    var d = (_B64_LOOKUP[cleanData[ci + 3]] !== undefined) ? _B64_LOOKUP[cleanData[ci + 3]] : 0;
    raw[j++] = (a << 2) | (b >> 4);
    if (j < outLen) raw[j++] = ((b & 15) << 4) | (c >> 2);
    if (j < outLen) raw[j++] = ((c & 3) << 6) | d;
  }

  var image = figma.createImage(raw);
  var node = figma.createRectangle();
  node.resize(width, height);
  if (cornerRadius !== undefined) node.cornerRadius = cornerRadius;
  node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: params.scaleMode || "FILL" }];
  if (stroke) { node.strokes = solidStroke(stroke); node.strokeWeight = strokeWeight; }
  return node;
}

// ─── handlers.create ──────────────────────────────────────────────────────────

handlers.create = async (params) => {
  if (!params || !params.type) {
    var keys = Object.keys(params || {});
    throw new Error("create: 'type' is required. Received keys: [" + keys.join(", ") + "]. Use type: FRAME|RECTANGLE|ELLIPSE|LINE|TEXT|SVG|VECTOR|IMAGE");
  }

  const {
    type, parentId, name,
    x = 0, y = 0,
    strokeWeight = 1, cornerRadius,
    fontSize = 14, fontWeight = "Regular", lineHeight,
    opacity, visible,
  } = params;
  // BUG-13: FRAME with layoutMode and no explicit size → hug content (AUTO sizing)
  // Fall back to 100×100 only for non-layout nodes (RECTANGLE, ELLIPSE, etc.)
  var hasExplicitWidth  = params.width  !== undefined;
  var hasExplicitHeight = params.height !== undefined;
  var width  = hasExplicitWidth  ? params.width  : 100;
  var height = hasExplicitHeight ? params.height : 100;
  var fill = params.fill;
  // BUG-18/19: accept both `stroke` and `strokeColor` aliases
  var stroke = params.stroke || params.strokeColor || null;

  let parent = figma.currentPage;
  if (parentId) {
    const p = (await findNodeByIdAsync(parentId)) || findNodeByName(parentId);
    if (!p) throw new Error(
      "parentId \"" + parentId + "\" not found in the current scene. " +
      "If you just created the parent in a previous figma_write call, re-query its ID with " +
      "figma.get_page_nodes() or figma.query() at the start of this call."
    );
    parent = p;
  }

  let node;
  switch (type) {
    case "FRAME":
    case "GROUP":
      node = buildFrame(params, width, height, fill, stroke, strokeWeight);
      break;
    case "RECTANGLE":
      node = buildRectangle(params, width, height, fill, stroke, strokeWeight);
      break;
    case "ELLIPSE":
      node = buildEllipse(params, width, height, fill, stroke, strokeWeight);
      break;
    case "LINE":
      node = buildLine(params, width, stroke, strokeWeight);
      break;
    case "TEXT":
      node = await buildText(params, width, height, fill, fontSize, fontWeight, lineHeight);
      break;
    case "SVG":
      node = buildSvg(params, width, height, fill, stroke, strokeWeight);
      break;
    case "VECTOR":
      node = buildVector(params, width, height, fill, stroke, strokeWeight);
      break;
    case "IMAGE":
      node = buildImage(params, width, height, cornerRadius, stroke, strokeWeight);
      break;
    default:
      throw new Error('Unsupported node type: "' + type + '". Use FRAME, RECTANGLE, ELLIPSE, LINE, TEXT, SVG, VECTOR, IMAGE.');
  }

  // Apply node-level props before parenting (name can be set any time; opacity/visible are stable)
  if (name)    node.name    = name;
  if (opacity !== undefined) node.opacity = opacity;
  if (visible !== undefined) node.visible = visible;

  // BUG-13: FRAME with layoutMode and no explicit width/height → switch to hug-content sizing
  // Must happen before appendChild so auto-layout parent measures correct child size
  if ((type === "FRAME" || type === "GROUP") && params.layoutMode && params.layoutMode !== "NONE") {
    if (!hasExplicitWidth)  { node.primaryAxisSizingMode   = "AUTO"; }
    if (!hasExplicitHeight) { node.counterAxisSizingMode   = "AUTO"; }
  }

  if (parent !== figma.currentPage) {
    if (parent.removed) {
      node.remove();
      throw new Error("Parent node no longer exists (was it deleted?): " + (params.parentId || params.parentName));
    }

    if (parent.layoutMode && parent.layoutMode !== "NONE" &&
        params.x !== undefined && params.y !== undefined) {
      figma.ui.postMessage({
        type: "log",
        message: "Warning: node \"" + (name || type) + "\" has explicit x/y but parent \"" + parent.name + "\" uses auto-layout (" + parent.layoutMode + "). Figma ignores x/y inside auto-layout — use layoutAlign/layoutGrow instead."
      });
    }

    if (params.insertIndex !== undefined && typeof parent.insertChild === "function") {
      var idx = Math.max(0, Math.min(params.insertIndex, parent.children ? parent.children.length : 0));
      parent.insertChild(idx, node);
    } else {
      parent.appendChild(node);
    }

    if (parent.layoutMode && parent.layoutMode !== "NONE") {
      applyChildLayout(node, params);
    }
  } else {
    applyChildLayout(node, params);
  }

  // BUG-13/16/17/19: Re-apply TEXT sizing after appendChild — Figma auto-layout can reset
  // textAutoResize to WIDTH_AND_HEIGHT after parenting, causing the node to flash to 100x100.
  if (type === "TEXT") {
    var textAutoResize = params.textAutoResize;
    if (!textAutoResize) {
      if (width && height)  textAutoResize = "NONE";
      else if (width)       textAutoResize = "HEIGHT";
    }
    if (textAutoResize) {
      node.textAutoResize = textAutoResize;
      if (textAutoResize === "NONE") node.resize(width, height);
      else if (textAutoResize === "HEIGHT") node.resize(width, node.height);
    }
  }

  // x/y set after appendChild — Figma resets position on reparent
  node.x = x;
  node.y = y;

  return nodeToInfo(node);
};

handlers.modify = async (params) => {
  const node = await resolveNode(params);
  var nodeRef = params.id || params.nodeId || params.targetId || params.name || params.nodeName;
  if (!node) {
    var keys = Object.keys(params || {});
    throw new Error("Node not found: " + nodeRef + ". Received params keys: [" + keys.join(", ") + "]. Use id or name field.");
  }
  if (node.removed) throw new Error("Node was deleted: " + nodeRef);

  if (params.fontColor !== undefined && params.fill === undefined) params.fill = params.fontColor;
  if (params.fill     !== undefined && "fills"   in node) node.fills   = buildFillArray(params.fill, params.fillOpacity);
  if (params.fillOpacity !== undefined && params.fill === undefined && "fills" in node && node.fills && node.fills.length) {
    var existingFills = JSON.parse(JSON.stringify(node.fills));
    existingFills[0].opacity = params.fillOpacity;
    node.fills = existingFills;
  }
  // BUG-18: accept both `stroke` and `strokeColor` aliases in modify
  var modifyStroke = params.stroke !== undefined ? params.stroke : (params.strokeColor !== undefined ? params.strokeColor : undefined);
  if (modifyStroke !== undefined && "strokes" in node) {
    node.strokes = solidStroke(modifyStroke, params.strokeOpacity);
    if (params.strokeWeight !== undefined) node.strokeWeight = params.strokeWeight;
    if (params.strokeAlign !== undefined) node.strokeAlign = params.strokeAlign;
    if (params.strokeDashPattern && Array.isArray(params.strokeDashPattern)) node.dashPattern = params.strokeDashPattern;
  }
  if (params.x       !== undefined) node.x = params.x;
  if (params.y       !== undefined) node.y = params.y;
  if (params.opacity !== undefined) node.opacity = params.opacity;
  if (params.visible !== undefined) node.visible = params.visible;
  if (params.name    !== undefined) node.name = params.name;
  applyCornerRadii(node, params);
  if (params.effects !== undefined) {
    if (params.effects === null || (Array.isArray(params.effects) && params.effects.length === 0)) {
      if ("effects" in node) node.effects = [];
    } else {
      applyEffects(node, params.effects);
    }
  }

  if ((params.width !== undefined || params.height !== undefined) && "resize" in node) {
    node.resize(
      params.width  !== undefined ? params.width  : node.width,
      params.height !== undefined ? params.height : node.height
    );
  }

  if (node.type === "TEXT") {
    if (params.content !== undefined || params.fontWeight !== undefined || params.fontFamily !== undefined) {
      const family = params.fontFamily || node.fontName.family;
      const style = FONT_STYLE_MAP[params.fontWeight] || node.fontName.style;
      await figma.loadFontAsync({ family, style });
      node.fontName = { family, style };
      if (params.content !== undefined) {
        node.characters = params.content;
        if (params.width === undefined && params.textAutoResize === undefined &&
            node.textAutoResize !== "NONE") {
          node.textAutoResize = "WIDTH_AND_HEIGHT";
        }
        // Auto-promote layoutSizing so a hug-mode auto-layout parent actually
        // reflows in response to the new content. textAutoResize alone is
        // overridden by layoutSizingHorizontal:FIXED for auto-layout children.
        autoPromoteTextHugForReflow(node, params);
      }
    }
    if (params.fontSize !== undefined) node.fontSize = params.fontSize;
    if (params.textAlign !== undefined || params.textAlignVertical !== undefined || params.lineHeight !== undefined) {
      await figma.loadFontAsync(node.fontName);
      if (params.textAlign         !== undefined) node.textAlignHorizontal = params.textAlign.toUpperCase();
      if (params.textAlignVertical !== undefined) node.textAlignVertical   = params.textAlignVertical.toUpperCase();
      if (params.lineHeight !== undefined) {
        node.lineHeight = (typeof params.lineHeight === "object" && params.lineHeight.unit)
          ? params.lineHeight
          : { value: params.lineHeight, unit: "PIXELS" };
      }
    }
  }

  // Auto Layout properties on FRAME
  if (node.type === "FRAME") {
    var removingLayout = params.layoutMode === "NONE" || params.layoutMode === null || params.layoutMode === "";
    if (params.layoutMode !== undefined) {
      node.layoutMode = removingLayout ? "NONE" : params.layoutMode;
    }
    // Only apply align/spacing when the frame actually has auto-layout active
    if (node.layoutMode !== "NONE") {
      if (params.primaryAxisAlignItems !== undefined) node.primaryAxisAlignItems = params.primaryAxisAlignItems;
      if (params.counterAxisAlignItems === "STRETCH") {
        throw new Error(
          "counterAxisAlignItems does not support \"STRETCH\". " +
          "Set counterAxisAlignItems: \"MIN\" and layoutAlign: \"STRETCH\" on each child."
        );
      }
      if (params.counterAxisAlignItems !== undefined) node.counterAxisAlignItems = params.counterAxisAlignItems;
    }
    if (params.padding !== undefined) {
      node.paddingTop = node.paddingBottom = node.paddingLeft = node.paddingRight = params.padding;
    }
    if (params.paddingHorizontal !== undefined) { node.paddingLeft = node.paddingRight = params.paddingHorizontal; }
    if (params.paddingVertical   !== undefined) { node.paddingTop  = node.paddingBottom = params.paddingVertical; }
    if (params.paddingTop    !== undefined) node.paddingTop    = params.paddingTop;
    if (params.paddingBottom !== undefined) node.paddingBottom = params.paddingBottom;
    if (params.paddingLeft   !== undefined) node.paddingLeft   = params.paddingLeft;
    if (params.paddingRight  !== undefined) node.paddingRight  = params.paddingRight;
    if (params.itemSpacing   !== undefined) node.itemSpacing   = params.itemSpacing;
    if (params.primaryAxisSizingMode !== undefined) node.primaryAxisSizingMode = params.primaryAxisSizingMode;
    if (params.counterAxisSizingMode !== undefined) node.counterAxisSizingMode = params.counterAxisSizingMode;
    if (params.clipsContent  !== undefined) node.clipsContent  = params.clipsContent;
  }

  applyChildLayout(node, params);

  return nodeToInfo(node);
};

// "delete" is a JS reserved keyword — use bracket notation
handlers["delete"] = async (params) => {
  if (params && Array.isArray(params.ids)) {
    var results = [];
    for (var di = 0; di < params.ids.length; di++) {
      var targetId = params.ids[di];
      var n = await findNodeByIdAsync(targetId);
      if (!n || n.removed) {
        results.push({ deleted: true, alreadyGone: true, ref: targetId });
      } else {
        var inf = nodeToInfo(n);
        n.remove();
        results.push(Object.assign({ deleted: true }, inf));
      }
    }
    return { deleted: true, count: results.length, results: results };
  }
  const node = await resolveNode(params);
  if (!node || node.removed) {
    var ref = params.id || params.nodeId || params.name || params.nodeName;
    return { deleted: true, alreadyGone: true, ref: ref };
  }
  const info = nodeToInfo(node);
  node.remove();
  return Object.assign({ deleted: true }, info);
};

handlers.append = async function(params) {
  var parentId   = params.parentId   || null;
  var parentName = params.parentName || null;
  var childId    = params.childId    || null;
  var childName  = params.childName  || null;
  var parent = parentId   ? (await findNodeByIdAsync(parentId))   : (parentName ? findNodeByName(parentName) : null);
  var child  = childId    ? (await findNodeByIdAsync(childId))    : (childName  ? findNodeByName(childName)  : null);
  if (!parent || !child) throw new Error("Parent or child not found");
  parent.appendChild(child);
  return { parentId: parent.id, childId: child.id };
};

handlers.listComponents = async () => {
  await figma.loadAllPagesAsync();
  const comps = figma.root.findAllWithCriteria({ types: ["COMPONENT"] });
  return comps.map(c => ({ id: c.id, name: c.name, key: c.key || null }));
};

// Expose Figma's loadAllPagesAsync so user code can opt-in before queries that
// span pages. Required when the plugin runs under documentAccess: dynamic-page
// (see plugin/manifest.json) — figma.root.findOne / findAll only sees pages
// that have been loaded. Internal handlers call this themselves where needed
// (listComponents, instantiate); this op lets user code do the same from
// figma_write blocks.
handlers.loadAllPagesAsync = async function() {
  await figma.loadAllPagesAsync();
  return { loaded: true, pageCount: figma.root.children.length };
};

handlers.instantiate = async function(params) {
  var componentId   = params.componentId   || null;
  var componentName = params.componentName || null;
  var parentId      = params.parentId      || null;
  var parentName    = params.parentName    || null;
  var x = params.x !== undefined ? params.x : 0;
  var y = params.y !== undefined ? params.y : 0;
  var overrides = params.overrides || null;

  // Under documentAccess: dynamic-page, figma.root.findOne only sees already-
  // loaded pages. Without this, lookup silently fails for any component that
  // lives on an unvisited page — even when called by id. listComponents does
  // the same dance for the same reason.
  await figma.loadAllPagesAsync();

  var comp = null;
  if (componentId) {
    comp = figma.root.findOne(function(n) { return n.id === componentId && n.type === "COMPONENT"; });
  } else if (componentName) {
    comp = figma.root.findOne(function(n) { return n.name === componentName && n.type === "COMPONENT"; });
  }
  if (!comp) throw new Error("Component " + (componentId || componentName) + " not found");

  var inst = comp.createInstance();
  inst.x = x;
  inst.y = y;

  var parent = parentId ? (await findNodeByIdAsync(parentId)) : (parentName ? findNodeByName(parentName) : null);
  if (parent) parent.appendChild(inst);

  if (overrides && typeof overrides === "object") {
    var overrideKeys = Object.keys(overrides);
    for (var oi = 0; oi < overrideKeys.length; oi++) {
      var layerName = overrideKeys[oi];
      var ov = overrides[layerName];
      // Use IIFE to capture layerName for synchronous findOne callback
      var target = (function(lName) {
        return inst.findOne(function(n) { return n.name === lName; });
      })(layerName);
      if (!target) continue;

      if (ov.text !== undefined && target.type === "TEXT") {
        await figma.loadFontAsync(target.fontName);
        target.characters = String(ov.text);
      }
      if (ov.fill !== undefined) {
        var fillNorm = normalizeHex(ov.fill);
        if (fillNorm) target.fills = solidFill(fillNorm);
      }
      if (ov.stroke !== undefined) {
        var strokeNorm = normalizeHex(ov.stroke);
        if (strokeNorm) target.strokes = solidStroke(strokeNorm);
      }
      if (ov.opacity    !== undefined) target.opacity    = ov.opacity;
      if (ov.visible    !== undefined) target.visible    = Boolean(ov.visible);
      if (ov.fontSize   !== undefined && target.type === "TEXT") {
        await figma.loadFontAsync(target.fontName);
        target.fontSize = ov.fontSize;
      }
      if (ov.cornerRadius !== undefined && "cornerRadius" in target) {
        target.cornerRadius = ov.cornerRadius;
      }
    }
  }

  return nodeToInfo(inst);
};

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

// swapComponent — point an instance at a different main component.
// Wraps Figma's InstanceNode.swapComponent(targetComponent).
// Different from INSTANCE_SWAP component properties (which are nested swaps
// inside a main component's slots) — this swaps the instance's own main.
handlers.swapComponent = async function(params) {
  var nodeId = params.id || params.nodeId;
  var componentId = params.componentId || params.targetComponentId;

  if (!nodeId) throw new Error("id is required");
  if (!componentId) throw new Error("componentId is required");

  var instance = await findNodeByIdAsync(nodeId);
  if (!instance) throw new Error("Instance not found: " + nodeId);
  if (instance.type !== "INSTANCE") {
    throw new Error("swapComponent source must be an INSTANCE, got: " + instance.type);
  }

  var target = await findNodeByIdAsync(componentId);
  if (!target) throw new Error("Target component not found: " + componentId);
  if (target.type !== "COMPONENT") {
    throw new Error("swapComponent target must be a COMPONENT, got: " + target.type);
  }

  instance.swapComponent(target);

  return {
    id: instance.id,
    name: instance.name,
    newMainComponentId: target.id,
    newMainComponentName: target.name,
  };
};
