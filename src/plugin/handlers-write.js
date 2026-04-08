// ─── WRITE HANDLERS ───────────────────────────────────────────────────────────

const handlers = {};

handlers.status = async () => ({
  connected:   true,
  version:     "2.1.1",
  fileName:    figma.root.name,
  currentPage: figma.currentPage.name,
  pageCount:   figma.root.children.length,
  selection:   figma.currentPage.selection.map(nodeToInfo),
});

handlers.listPages = async () =>
  figma.root.children.map(p => ({ id: p.id, name: p.name }));

handlers.setPage = async (params) => {
  // Accept name, pageName, page (string), or id/pageId
  var name = params.name || params.pageName || params.page;
  var id   = params.id   || params.pageId;
  var page = null;
  if (id)   page = figma.root.children.find(function(p) { return p.id === id; });
  if (!page && name) page = figma.root.children.find(function(p) { return p.name === name; });
  // If only 1 page exists, switch to it regardless of the name passed
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

handlers.query = async ({ type, name, id }) => {
  if (id) {
    const n = await findNodeByIdAsync(id);
    return n ? [nodeToInfo(n)] : [];
  }
  const results = figma.currentPage.findAll(n => {
    if (type && name) return n.type === type && n.name === name;
    if (type) return n.type === type;
    if (name) return n.name === name;
    return false;
  });
  return results.slice(0, 100).map(nodeToInfo);
};

handlers.create = async (params) => {
  // Guard: type must be provided — dump keys to help diagnose missing field
  if (!params || !params.type) {
    var keys = Object.keys(params || {});
    throw new Error("create: 'type' is required. Received keys: [" + keys.join(", ") + "]. Use type: FRAME|RECTANGLE|ELLIPSE|LINE|TEXT|SVG|VECTOR|IMAGE");
  }
  const {
    type, parentId, name,
    x = 0, y = 0, width = 100, height = 100,
    fill, stroke, strokeWeight = 1, cornerRadius,
    content = "", fontSize = 14, fontWeight = "Regular", lineHeight,
    opacity, visible,
  } = params;

  let parent = figma.currentPage;
  if (parentId) {
    const p = (await findNodeByIdAsync(parentId)) || findNodeByName(parentId);
    if (p) parent = p;
  }

  let node;

  if (type === "FRAME" || type === "GROUP") {
    node = figma.createFrame();
    node.resize(width, height);
    node.fills = fill ? solidFill(fill, params.fillOpacity) : [];
    if (stroke) { node.strokes = solidStroke(stroke); node.strokeWeight = strokeWeight; }
    if (cornerRadius !== undefined) node.cornerRadius = cornerRadius;

    // Auto Layout support
    // layoutMode: "HORIZONTAL" | "VERTICAL" | "NONE"
    if (params.layoutMode && params.layoutMode !== "NONE") {
      node.layoutMode = params.layoutMode;
      // Alignment: how children align on each axis
      if (params.primaryAxisAlignItems) node.primaryAxisAlignItems = params.primaryAxisAlignItems;
      if (params.counterAxisAlignItems) node.counterAxisAlignItems = params.counterAxisAlignItems;

      // Padding: supports uniform, axis-based, and individual
      if (params.padding !== undefined) {
        node.paddingTop = params.padding;
        node.paddingBottom = params.padding;
        node.paddingLeft = params.padding;
        node.paddingRight = params.padding;
      }
      if (params.paddingHorizontal !== undefined) {
        node.paddingLeft = params.paddingHorizontal;
        node.paddingRight = params.paddingHorizontal;
      }
      if (params.paddingVertical !== undefined) {
        node.paddingTop = params.paddingVertical;
        node.paddingBottom = params.paddingVertical;
      }
      if (params.paddingTop !== undefined) node.paddingTop = params.paddingTop;
      if (params.paddingBottom !== undefined) node.paddingBottom = params.paddingBottom;
      if (params.paddingLeft !== undefined) node.paddingLeft = params.paddingLeft;
      if (params.paddingRight !== undefined) node.paddingRight = params.paddingRight;

      // Spacing between children
      if (params.itemSpacing !== undefined) node.itemSpacing = params.itemSpacing;

      // Sizing: default to FIXED so frame keeps its set width/height
      node.primaryAxisSizingMode = params.primaryAxisSizingMode || "FIXED";
      node.counterAxisSizingMode = params.counterAxisSizingMode || "FIXED";

      // Clip content
      if (params.clipsContent !== undefined) node.clipsContent = params.clipsContent;
    }

  } else if (type === "RECTANGLE") {
    node = figma.createRectangle();
    node.resize(width, height);
    node.fills = fill ? solidFill(fill, params.fillOpacity) : [];
    if (stroke) { node.strokes = solidStroke(stroke); node.strokeWeight = strokeWeight; }
    if (cornerRadius !== undefined) node.cornerRadius = cornerRadius;

  } else if (type === "ELLIPSE") {
    node = figma.createEllipse();
    node.resize(width, height);
    node.fills = fill ? solidFill(fill, params.fillOpacity) : [];
    if (stroke) { node.strokes = solidStroke(stroke); node.strokeWeight = strokeWeight; }

  } else if (type === "LINE") {
    node = figma.createLine();
    node.resize(width || 100, 0);
    node.fills = [];
    if (stroke) { node.strokes = solidStroke(stroke); node.strokeWeight = strokeWeight; }

  } else if (type === "TEXT") {
    const style = FONT_STYLE_MAP[fontWeight] || "Regular";
    await figma.loadFontAsync({ family: "Inter", style });
    node = figma.createText();
    node.fontName = { family: "Inter", style };
    node.fontSize = fontSize;
    node.characters = content;
    if (fill) node.fills = solidFill(fill);
    // Accept lineHeight as number (pixels) or pre-formed object { value, unit }
    if (lineHeight) {
      if (typeof lineHeight === "object" && lineHeight.unit) node.lineHeight = lineHeight;
      else node.lineHeight = { value: lineHeight, unit: "PIXELS" };
    }
    // Text alignment
    if (params.textAlignHorizontal) node.textAlignHorizontal = params.textAlignHorizontal;
    if (params.textAlignVertical) node.textAlignVertical = params.textAlignVertical;
    // Auto-resize: "WIDTH_AND_HEIGHT" (default, hug), "HEIGHT" (fixed width, auto height), "NONE" (fixed both)
    // Auto-detect: if width is set, default to "HEIGHT" so text wraps instead of overflowing
    if (params.textAutoResize) {
      node.textAutoResize = params.textAutoResize;
    } else if (width) {
      node.textAutoResize = "HEIGHT";
    }

  } else if (type === "SVG") {
    // Create vector node from SVG string using Figma's built-in API
    var svgStr = params.svg;
    if (!svgStr) throw new Error("SVG type requires 'svg' param with SVG markup string");
    node = figma.createNodeFromSvg(svgStr);
    // createNodeFromSvg returns a FRAME containing vectors — resize if needed
    if (width && height) node.resize(width, height);

    // Apply color to all vector children
    // Detects whether icon uses fill or stroke style and applies accordingly
    if ((fill || stroke) && node.findAll) {
      var allVectors = node.findAll(function(n) { return n.type === "VECTOR"; });
      for (var vi = 0; vi < allVectors.length; vi++) {
        var vec = allVectors[vi];
        var hasFill = vec.fills && vec.fills.length > 0 && vec.fills[0].type === "SOLID";
        var hasStroke = vec.strokes && vec.strokes.length > 0;

        if (fill) {
          if (hasFill) {
            // Filled icon (Fluent UI, Bootstrap, Phosphor): replace fill color
            vec.fills = solidFill(fill);
          } else if (hasStroke) {
            // Stroke icon (Lucide): apply as stroke color
            vec.strokes = solidStroke(fill);
          } else {
            // No fill or stroke yet: set fill (handles Fluent UI default black)
            vec.fills = solidFill(fill);
          }
        }
        if (stroke) {
          vec.strokes = solidStroke(stroke);
          vec.strokeWeight = strokeWeight;
        }
      }
    }

  } else if (type === "VECTOR") {
    // Create vector paths from SVG path data (d attribute)
    // Supports: diagonal lines, curves (bezier, quadratic, arcs), polygons, any shape
    // params.paths: array of {d, windingRule?} or single string d
    // params.d: shorthand — single path data string (alternative to paths)
    // params.strokeCap: "NONE" | "ROUND" | "SQUARE" | "ARROW_LINES" | "ARROW_EQUILATERAL"
    // params.strokeJoin: "MITER" | "BEVEL" | "ROUND"
    var pathData = params.d || params.path;
    var pathsArr = params.paths;

    if (!pathData && !pathsArr) {
      throw new Error('VECTOR type requires "d" (path data string) or "paths" (array of {d, windingRule})');
    }

    node = figma.createVector();
    node.resize(width, height);

    // Build vectorPaths
    if (pathsArr && Array.isArray(pathsArr)) {
      node.vectorPaths = pathsArr.map(function(p) {
        return {
          data: typeof p === "string" ? p : p.d,
          windingRule: (typeof p === "object" && p.windingRule) ? p.windingRule : "NONZERO"
        };
      });
    } else {
      node.vectorPaths = [{
        data: pathData,
        windingRule: params.windingRule || "NONZERO"
      }];
    }

    // Fill and stroke
    if (fill) {
      node.fills = solidFill(fill, params.fillOpacity);
    } else {
      node.fills = [];
    }
    if (stroke) {
      node.strokes = solidStroke(stroke);
      node.strokeWeight = strokeWeight;
    }

    // Stroke styling
    if (params.strokeCap) node.strokeCap = params.strokeCap;
    if (params.strokeJoin) node.strokeJoin = params.strokeJoin;

  } else if (type === "IMAGE") {
    // Create a rectangle with an image fill from base64 data
    // params.imageData: base64-encoded image (PNG/JPG)
    // params.scaleMode: "FILL" | "FIT" | "CROP" | "TILE" (default "FILL")
    var imgData = params.imageData;
    if (!imgData) throw new Error("IMAGE type requires 'imageData' param with base64 string");

    // Decode base64 to Uint8Array using manual lookup table
    // (plugin sandbox may not have atob)
    var B64CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var lookup = {};
    for (var li = 0; li < B64CHARS.length; li++) { lookup[B64CHARS[li]] = li; }

    // Strip data URI prefix if present, then remove non-base64 chars except padding
    var strippedData = imgData.indexOf(",") !== -1 ? imgData.substring(imgData.indexOf(",") + 1) : imgData;
    var cleanData = strippedData.replace(/[^A-Za-z0-9+/=]/g, "");
    var outLen = Math.floor(cleanData.replace(/=/g, "").length * 3 / 4);

    var raw = new Uint8Array(outLen);
    var j = 0;
    for (var ci = 0; ci < cleanData.length; ci += 4) {
      var a = lookup[cleanData[ci]] || 0;
      var b = lookup[cleanData[ci+1]] || 0;
      var c = lookup[cleanData[ci+2]] || 0;
      var d = lookup[cleanData[ci+3]] || 0;
      raw[j++] = (a << 2) | (b >> 4);
      if (j < outLen) raw[j++] = ((b & 15) << 4) | (c >> 2);
      if (j < outLen) raw[j++] = ((c & 3) << 6) | d;
    }

    var image = figma.createImage(raw);

    node = figma.createRectangle();
    node.resize(width, height);
    if (cornerRadius !== undefined) node.cornerRadius = cornerRadius;
    node.fills = [{
      type: "IMAGE",
      imageHash: image.hash,
      scaleMode: params.scaleMode || "FILL"
    }];
    if (stroke) { node.strokes = solidStroke(stroke); node.strokeWeight = strokeWeight; }

  } else {
    throw new Error('Unsupported node type: "' + type + '". Use FRAME, RECTANGLE, ELLIPSE, LINE, TEXT, SVG, VECTOR, IMAGE.');
  }

  if (name)   node.name = name;
  node.x = x;
  node.y = y;
  if (opacity !== undefined) node.opacity = opacity;
  if (visible !== undefined) node.visible = visible;

  if (parent !== figma.currentPage) {
    // Guard: parent may have been deleted in a prior batch step
    if (!parent || parent.removed) {
      node.remove();
      throw new Error("Parent node no longer exists (was it deleted?): " + (params.parentId || params.parentName));
    }
    parent.appendChild(node);

    // Auto-set child layout properties when parent uses auto-layout
    if (parent.layoutMode && parent.layoutMode !== "NONE" && "layoutAlign" in node) {
      if (params.layoutAlign !== undefined) {
        node.layoutAlign = params.layoutAlign;
      }
      // Do NOT auto-stretch text or icons — let auto-layout center them naturally
      // Only stretch explicitly when requested via layoutAlign: "STRETCH"
      if (params.layoutGrow !== undefined) {
        node.layoutGrow = params.layoutGrow;
      }
    }
  } else {
    // Top-level node, still allow explicit layout props
    if (params.layoutAlign !== undefined && "layoutAlign" in node) node.layoutAlign = params.layoutAlign;
    if (params.layoutGrow !== undefined && "layoutGrow" in node) node.layoutGrow = params.layoutGrow;
  }

  return nodeToInfo(node);
};

handlers.modify = async (params) => {
  const node = await resolveNode(params);
  var nodeRef = params.id || params.nodeId || params.targetId || params.name || params.nodeName;
  if (!node) {
    // Dump all keys received so we can see what the AI actually passed
    var keys = Object.keys(params || {});
    throw new Error("Node not found: " + nodeRef + ". Received params keys: [" + keys.join(", ") + "]. Use id or name field.");
  }
  if (node.removed) throw new Error("Node was deleted: " + nodeRef);

  if (params.fill     !== undefined && "fills"   in node) node.fills   = solidFill(params.fill, params.fillOpacity);
  if (params.fillOpacity !== undefined && params.fill === undefined && "fills" in node && node.fills && node.fills.length) {
    // Update fillOpacity on existing fill without changing color
    var existingFills = JSON.parse(JSON.stringify(node.fills));
    existingFills[0].opacity = params.fillOpacity;
    node.fills = existingFills;
  }
  if (params.stroke   !== undefined && "strokes" in node) {
    node.strokes = solidStroke(params.stroke);
    if (params.strokeWeight !== undefined) node.strokeWeight = params.strokeWeight;
  }
  if (params.x       !== undefined) node.x = params.x;
  if (params.y       !== undefined) node.y = params.y;
  if (params.opacity !== undefined) node.opacity = params.opacity;
  if (params.visible !== undefined) node.visible = params.visible;
  if (params.name    !== undefined) node.name = params.name;
  if (params.cornerRadius !== undefined && "cornerRadius" in node) node.cornerRadius = params.cornerRadius;

  if ((params.width !== undefined || params.height !== undefined) && "resize" in node) {
    node.resize(params.width !== undefined ? params.width : node.width, params.height !== undefined ? params.height : node.height);
  }

  if (node.type === "TEXT") {
    if (params.content !== undefined || params.fontWeight !== undefined || params.fontFamily !== undefined) {
      const family = params.fontFamily || node.fontName.family;
      const style = FONT_STYLE_MAP[params.fontWeight] || node.fontName.style;
      await figma.loadFontAsync({ family, style });
      node.fontName = { family, style };
      if (params.content !== undefined) node.characters = params.content;
    }
    if (params.fontSize !== undefined) node.fontSize = params.fontSize;
    // textAlign, textAlignVertical, lineHeight require font to be loaded
    if (params.textAlign !== undefined || params.textAlignVertical !== undefined || params.lineHeight !== undefined) {
      await figma.loadFontAsync(node.fontName);
      if (params.textAlign !== undefined) node.textAlignHorizontal = params.textAlign.toUpperCase();
      if (params.textAlignVertical !== undefined) node.textAlignVertical = params.textAlignVertical.toUpperCase();
      if (params.lineHeight !== undefined) {
        if (typeof params.lineHeight === "object" && params.lineHeight.unit) node.lineHeight = params.lineHeight;
        else node.lineHeight = { value: params.lineHeight, unit: "PIXELS" };
      }
    }
  }

  // Auto Layout properties (modify existing frame)
  if (node.type === "FRAME") {
    if (params.layoutMode !== undefined) {
      node.layoutMode = params.layoutMode === "NONE" ? "NONE" : params.layoutMode;
    }
    if (params.primaryAxisAlignItems !== undefined) node.primaryAxisAlignItems = params.primaryAxisAlignItems;
    if (params.counterAxisAlignItems !== undefined) node.counterAxisAlignItems = params.counterAxisAlignItems;
    if (params.padding !== undefined) {
      node.paddingTop = params.padding;
      node.paddingBottom = params.padding;
      node.paddingLeft = params.padding;
      node.paddingRight = params.padding;
    }
    if (params.paddingHorizontal !== undefined) {
      node.paddingLeft = params.paddingHorizontal;
      node.paddingRight = params.paddingHorizontal;
    }
    if (params.paddingVertical !== undefined) {
      node.paddingTop = params.paddingVertical;
      node.paddingBottom = params.paddingVertical;
    }
    if (params.paddingTop !== undefined) node.paddingTop = params.paddingTop;
    if (params.paddingBottom !== undefined) node.paddingBottom = params.paddingBottom;
    if (params.paddingLeft !== undefined) node.paddingLeft = params.paddingLeft;
    if (params.paddingRight !== undefined) node.paddingRight = params.paddingRight;
    if (params.itemSpacing !== undefined) node.itemSpacing = params.itemSpacing;
    if (params.primaryAxisSizingMode !== undefined) node.primaryAxisSizingMode = params.primaryAxisSizingMode;
    if (params.counterAxisSizingMode !== undefined) node.counterAxisSizingMode = params.counterAxisSizingMode;
    if (params.clipsContent !== undefined) node.clipsContent = params.clipsContent;
  }

  // Child layout properties (when inside auto-layout parent)
  if (params.layoutAlign !== undefined && "layoutAlign" in node) node.layoutAlign = params.layoutAlign;
  if (params.layoutGrow !== undefined && "layoutGrow" in node) node.layoutGrow = params.layoutGrow;

  return nodeToInfo(node);
};

// "delete" is a JS reserved keyword — assign via bracket notation to avoid engine quirks
handlers["delete"] = async (params) => {
  const node = await resolveNode(params);
  // Treat already-deleted/not-found as success — idempotent delete
  if (!node || node.removed) {
    var ref = params.id || params.nodeId || params.name || params.nodeName;
    return { deleted: true, alreadyGone: true, ref: ref };
  }
  const info = nodeToInfo(node);
  node.remove();
  return Object.assign({ deleted: true }, info);
};

handlers.append = async function(params) {
  var parentId = params.parentId || null;
  var parentName = params.parentName || null;
  var childId = params.childId || null;
  var childName = params.childName || null;
  var parent = parentId ? (await findNodeByIdAsync(parentId)) : (parentName ? findNodeByName(parentName) : null);
  var child = childId ? (await findNodeByIdAsync(childId)) : (childName ? findNodeByName(childName) : null);
  if (!parent || !child) throw new Error("Parent or child not found");
  parent.appendChild(child);
  return { parentId: parent.id, childId: child.id };
};

handlers.listComponents = async () => {
  await figma.loadAllPagesAsync();
  const comps = figma.root.findAllWithCriteria({ types: ["COMPONENT"] });
  return comps.map(c => ({ id: c.id, name: c.name, key: c.key || null }));
};

handlers.instantiate = async function(params) {
  var componentId = params.componentId || null;
  var componentName = params.componentName || null;
  var parentId = params.parentId || null;
  var parentName = params.parentName || null;
  var x = params.x || 0;
  var y = params.y || 0;
  var comp = null;
  if (componentId) {
    comp = figma.root.findOne(function(n) { return n.id === componentId && n.type === "COMPONENT"; });
  } else if (componentName) {
    comp = figma.root.findOne(function(n) { return n.name === componentName && n.type === "COMPONENT"; });
  }
  if (!comp) throw new Error("Component " + (componentId || componentName) + " not found");
  var inst = comp.createInstance();
  inst.x = x; inst.y = y;
  var parent = parentId ? (await findNodeByIdAsync(parentId)) : (parentName ? findNodeByName(parentName) : null);
  if (parent) parent.appendChild(inst);
  return nodeToInfo(inst);
};
