// ─── HANDLERS CREATE ───
// handlers.create — dispatches to the node builders.
// Split out of handlers-write.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

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
      // BUG-TEXT-01: pass `undefined` for w/h that the caller didn't set,
      // so buildText can default to WIDTH_AND_HEIGHT hug instead of being stuck at 100×100.
      node = await buildText(
        params,
        hasExplicitWidth  ? width  : undefined,
        hasExplicitHeight ? height : undefined,
        fill, fontSize, fontWeight, lineHeight
      );
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
      if (hasExplicitWidth && hasExplicitHeight) textAutoResize = "NONE";
      else if (hasExplicitWidth)                 textAutoResize = "HEIGHT";
      else                                       textAutoResize = "WIDTH_AND_HEIGHT";
    }
    node.textAutoResize = textAutoResize;
    if (textAutoResize === "NONE" && hasExplicitWidth && hasExplicitHeight) {
      node.resize(width, height);
    } else if (textAutoResize === "HEIGHT" && hasExplicitWidth) {
      node.resize(width, node.height);
    }
  }

  // x/y set after appendChild — Figma resets position on reparent
  node.x = x;
  node.y = y;

  return nodeToInfo(node);
};
