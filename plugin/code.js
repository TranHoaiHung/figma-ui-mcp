// figma-ui-mcp — Figma Plugin main thread v1.2.1
// Handles both WRITE (draw UI) and READ (extract design) operations.

figma.showUI(__html__, { width: 300, height: 340, title: "Figma UI MCP" });

// ─── UTILS ────────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace(/^#/, "").replace(/^(.)(.)(.)$/, "$1$1$2$2$3$3");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function rgbToHex({ r, g, b }) {
  return "#" + [r, g, b]
    .map(v => Math.round(v * 255).toString(16).padStart(2, "0"))
    .join("");
}

function solidFill(hex, fillOpacity) {
  var fill = { type: "SOLID", color: hexToRgb(hex) };
  if (fillOpacity !== undefined) fill.opacity = fillOpacity;
  return [fill];
}

function solidStroke(hex) {
  return [{ type: "SOLID", color: hexToRgb(hex) }];
}

function getFillHex(node) {
  if (!node.fills || !node.fills.length) return null;
  const f = node.fills.find(f => f.type === "SOLID");
  return f ? rgbToHex(f.color) : null;
}

function getStrokeHex(node) {
  if (!node.strokes || !node.strokes.length) return null;
  const s = node.strokes.find(s => s.type === "SOLID");
  return s ? rgbToHex(s.color) : null;
}

const FONT_STYLE_MAP = {
  Regular: "Regular", Medium: "Medium",
  SemiBold: "Semi Bold", Bold: "Bold", Light: "Light",
  Thin: "Thin", Heavy: "Heavy",
  "Condensed Heavy": "Condensed Heavy",
  "Thin Italic": "Thin Italic",
  "Light Italic": "Light Italic",
  "Extra Bold": "Extra Bold",
  "Semi Bold": "Semi Bold",
};

function findNodeById(id) {
  return figma.currentPage.findOne(n => n.id === id)
      || figma.root.findOne(n => n.id === id);
}

function findNodeByName(name) {
  return figma.currentPage.findOne(n => n.name === name)
      || figma.root.findOne(n => n.name === name);
}

function resolveNode(params) {
  if (params.id)   return findNodeById(params.id);
  if (params.name) return findNodeByName(params.name);
  return null;
}

function nodeToInfo(node) {
  if (!node) return null;
  const info = {
    id:       node.id,
    name:     node.name,
    type:     node.type,
    parentId: node.parent ? node.parent.id : null,
  };
  if ("x" in node)      info.x = Math.round(node.x);
  if ("y" in node)      info.y = Math.round(node.y);
  if ("width" in node)  info.width  = Math.round(node.width);
  if ("height" in node) info.height = Math.round(node.height);
  return info;
}

// ─── READ HELPERS ─────────────────────────────────────────────────────────────

// Recursively extract design data from a node tree (for figma_get_design)
function extractDesignTree(node, depth = 0) {
  if (depth > 8) return null; // guard against huge documents

  const info = {
    id:    node.id,
    name:  node.name,
    type:  node.type,
    x:     "x"      in node ? Math.round(node.x)      : undefined,
    y:     "y"      in node ? Math.round(node.y)       : undefined,
    width: "width"  in node ? Math.round(node.width)   : undefined,
    height:"height" in node ? Math.round(node.height)  : undefined,
  };

  // Safely read style properties — COMPONENT_SET and some nodes
  // throw "Cannot unwrap symbol" when accessing fills/strokes/etc.
  try {
    if ("fills" in node)      info.fill   = getFillHex(node);
  } catch(e) { /* skip fills for this node type */ }
  try {
    if ("strokes" in node)    info.stroke = getStrokeHex(node);
  } catch(e) { /* skip strokes */ }
  try {
    if ("strokeWeight" in node && node.strokes && node.strokes.length) info.strokeWeight = node.strokeWeight;
  } catch(e) { /* skip strokeWeight */ }
  try {
    if ("cornerRadius" in node) info.cornerRadius = node.cornerRadius;
  } catch(e) { /* skip cornerRadius */ }
  try {
    if ("opacity" in node && node.opacity !== 1) info.opacity = node.opacity;
  } catch(e) { /* skip opacity */ }
  try {
    if ("visible" in node && !node.visible) info.visible = false;
  } catch(e) { /* skip visible */ }

  if (node.type === "TEXT") {
    try {
      info.content    = node.characters;
      info.fontSize   = node.fontSize;
      info.fontFamily = node.fontName ? node.fontName.family : null;
      info.fontWeight = node.fontName ? node.fontName.style : null;
      info.lineHeight = node.lineHeight ? node.lineHeight.value : null;
      info.textAlign  = node.textAlignHorizontal;
    } catch(e) {
      // Mixed text styles — read character-level styles
      try {
        info.content = node.characters;
        // For mixed fonts, get the first character's style as representative
        if (node.characters.length > 0) {
          var rs = node.getRangeFontName(0, 1);
          if (rs) { info.fontFamily = rs.family; info.fontWeight = rs.style; }
          info.fontSize = node.getRangeFontSize(0, 1);
        }
      } catch(e2) { info.content = node.characters || ""; }
    }
  }

  try {
    if ("layoutMode" in node && node.layoutMode !== "NONE") {
      info.layout = {
        mode:        node.layoutMode,
        spacing:     node.itemSpacing,
        paddingTop:  node.paddingTop,
        paddingRight: node.paddingRight,
        paddingBottom: node.paddingBottom,
        paddingLeft:  node.paddingLeft,
        align:        node.primaryAxisAlignItems,
        crossAlign:   node.counterAxisAlignItems,
      };
    }
  } catch(e) { /* skip layout for this node type */ }

  // Add component-specific info
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    try { info.description = node.description; } catch(e) {}
  }
  if (node.type === "INSTANCE") {
    try {
      var mainComp = node.mainComponent;
      if (mainComp) { info.componentName = mainComp.name; info.componentId = mainComp.id; }
    } catch(e) {}
  }

  if ("children" in node && node.children.length) {
    info.children = node.children
      .map(c => extractDesignTree(c, depth + 1))
      .filter(Boolean);
  }

  return info;
}

// Collect all unique colors, fonts, spacing from a design tree
function extractTokens(tree) {
  const colors = new Set();
  const fonts  = new Set();
  const sizes  = new Set();

  function walk(node) {
    if (node.fill)   colors.add(node.fill);
    if (node.stroke) colors.add(node.stroke);
    if (node.fontFamily && node.fontWeight) fonts.add(`${node.fontFamily}/${node.fontWeight}/${node.fontSize}px`);
    if (node.width)  sizes.add(node.width);
    if (node.height) sizes.add(node.height);
    (node.children || []).forEach(walk);
  }
  walk(tree);

  return {
    colors: [...colors],
    fonts:  [...fonts],
    sizes:  [...sizes].sort((a, b) => a - b),
  };
}

// ─── WRITE HANDLERS ───────────────────────────────────────────────────────────

const handlers = {};

handlers.status = async () => ({
  connected:   true,
  version:     "1.2.4",
  fileName:    figma.root.name,
  currentPage: figma.currentPage.name,
  pageCount:   figma.root.children.length,
  selection:   figma.currentPage.selection.map(nodeToInfo),
});

handlers.listPages = async () =>
  figma.root.children.map(p => ({ id: p.id, name: p.name }));

handlers.setPage = async ({ name }) => {
  const page = figma.root.children.find(p => p.name === name);
  if (!page) throw new Error(`Page "${name}" not found`);
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
    const n = findNodeById(id);
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
  const {
    type, parentId, name,
    x = 0, y = 0, width = 100, height = 100,
    fill, stroke, strokeWeight = 1, cornerRadius,
    content = "", fontSize = 14, fontWeight = "Regular", lineHeight,
    opacity, visible,
  } = params;

  let parent = figma.currentPage;
  if (parentId) {
    const p = findNodeById(parentId) || findNodeByName(parentId);
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
    if (lineHeight) node.lineHeight = { value: lineHeight, unit: "PIXELS" };
    // Text alignment
    if (params.textAlignHorizontal) node.textAlignHorizontal = params.textAlignHorizontal;
    if (params.textAlignVertical) node.textAlignVertical = params.textAlignVertical;
    // Auto-resize: "WIDTH_AND_HEIGHT" (default, hug), "HEIGHT" (fixed width, auto height), "NONE" (fixed both)
    if (params.textAutoResize) node.textAutoResize = params.textAutoResize;

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

    var cleanData = imgData.replace(/[^A-Za-z0-9+/]/g, "");
    var outLen = Math.floor(cleanData.length * 3 / 4);
    if (imgData.endsWith("==")) outLen -= 2;
    else if (imgData.endsWith("=")) outLen -= 1;

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
  const node = resolveNode(params);
  if (!node) throw new Error(`Node not found: ${JSON.stringify(params)}`);

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

handlers.delete = async (params) => {
  const node = resolveNode(params);
  if (!node) throw new Error(`Node not found: ${JSON.stringify(params)}`);
  const info = nodeToInfo(node);
  node.remove();
  return Object.assign({ deleted: true }, info);
};

handlers.append = async function(params) {
  var parentId = params.parentId || null;
  var parentName = params.parentName || null;
  var childId = params.childId || null;
  var childName = params.childName || null;
  var parent = parentId ? findNodeById(parentId) : (parentName ? findNodeByName(parentName) : null);
  var child = childId ? findNodeById(childId) : (childName ? findNodeByName(childName) : null);
  if (!parent || !child) throw new Error("Parent or child not found");
  parent.appendChild(child);
  return { parentId: parent.id, childId: child.id };
};

handlers.listComponents = async () => {
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
  var parent = parentId ? findNodeById(parentId) : (parentName ? findNodeByName(parentName) : null);
  if (parent) parent.appendChild(inst);
  return nodeToInfo(inst);
};

// ─── DESIGN LIBRARY HANDLERS ──────────────────────────────────────────────────

var LIBRARY_NAME = "\uD83C\uDFA8 Design Library";
var LIBRARY_X = -2000;
var LIBRARY_Y = 0;

handlers.ensure_library = async function() {
  var existing = figma.currentPage.findOne(function(n) { return n.name === LIBRARY_NAME && n.type === "FRAME"; });
  if (existing) return { id: existing.id, name: existing.name, existed: true };

  // Create library frame off-canvas
  var lib = figma.createFrame();
  lib.name = LIBRARY_NAME;
  lib.resize(1600, 900);
  lib.x = LIBRARY_X;
  lib.y = LIBRARY_Y;
  lib.fills = [{ type: "SOLID", color: { r: 0.08, g: 0.08, b: 0.1 } }];

  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });

  // Section: Colors
  var colorsLabel = figma.createText();
  colorsLabel.characters = "COLORS";
  colorsLabel.fontName = { family: "Inter", style: "Bold" };
  colorsLabel.fontSize = 11;
  colorsLabel.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.5 } }];
  colorsLabel.x = 24; colorsLabel.y = 24;
  lib.appendChild(colorsLabel);

  // Default color palette
  var defaultColors = [
    { name: "bg-base",        hex: "#0F1117", x: 24  },
    { name: "bg-surface",     hex: "#191C24", x: 84  },
    { name: "bg-elevated",    hex: "#1E2233", x: 144 },
    { name: "accent-purple",  hex: "#6366F1", x: 204 },
    { name: "positive-green", hex: "#00C896", x: 264 },
    { name: "negative-red",   hex: "#FF4560", x: 324 },
    { name: "text-primary",   hex: "#E8ECF4", x: 384 },
    { name: "text-secondary", hex: "#6B7280", x: 444 },
    { name: "border",         hex: "#1E2233", x: 504 },
  ];

  for (var ci = 0; ci < defaultColors.length; ci++) {
    var c = defaultColors[ci];
    var rgb = hexToRgb(c.hex);
    var swatch = figma.createRectangle();
    swatch.name = "color/" + c.name;
    swatch.resize(48, 48);
    swatch.x = c.x; swatch.y = 44;
    swatch.cornerRadius = 8;
    swatch.fills = [{ type: "SOLID", color: rgb }];
    lib.appendChild(swatch);

    var swatchLabel = figma.createText();
    swatchLabel.characters = c.name;
    swatchLabel.fontName = { family: "Inter", style: "Regular" };
    swatchLabel.fontSize = 9;
    swatchLabel.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.6 } }];
    swatchLabel.x = c.x; swatchLabel.y = 98;
    lib.appendChild(swatchLabel);
  }

  // Section: Text Styles
  var textLabel = figma.createText();
  textLabel.characters = "TEXT STYLES";
  textLabel.fontName = { family: "Inter", style: "Bold" };
  textLabel.fontSize = 11;
  textLabel.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.5 } }];
  textLabel.x = 24; textLabel.y = 130;
  lib.appendChild(textLabel);

  var textStyles = [
    { name: "heading-2xl", size: 32, weight: "Bold",    fill: "#E8ECF4" },
    { name: "heading-xl",  size: 24, weight: "Bold",    fill: "#E8ECF4" },
    { name: "heading-lg",  size: 20, weight: "Bold",    fill: "#E8ECF4" },
    { name: "heading-md",  size: 16, weight: "SemiBold",fill: "#E8ECF4" },
    { name: "body-md",     size: 14, weight: "Regular", fill: "#E8ECF4" },
    { name: "body-sm",     size: 12, weight: "Regular", fill: "#9CA3AF" },
    { name: "caption",     size: 11, weight: "Regular", fill: "#6B7280" },
    { name: "label",       size: 11, weight: "Medium",  fill: "#6B7280" },
  ];

  var txY = 152;
  for (var ti = 0; ti < textStyles.length; ti++) {
    var ts = textStyles[ti];
    var style = ts.weight === "SemiBold" ? "Semi Bold" : ts.weight;
    await figma.loadFontAsync({ family: "Inter", style: style });
    var tn = figma.createText();
    tn.name = "text/" + ts.name;
    tn.characters = "Aa — " + ts.name + " / " + ts.size + "px";
    tn.fontName = { family: "Inter", style: style };
    tn.fontSize = ts.size;
    tn.fills = solidFill(ts.fill);
    tn.x = 24; tn.y = txY;
    lib.appendChild(tn);
    txY += ts.size + 16;
  }

  return { id: lib.id, name: lib.name, existed: false };
};

handlers.get_library_tokens = async function() {
  var lib = figma.currentPage.findOne(function(n) { return n.name === LIBRARY_NAME && n.type === "FRAME"; });
  if (!lib) return { error: "Library not found. Call ensure_library() first.", colors: [], textStyles: [] };

  var colors = [];
  var textStyles = [];

  var children = lib.children || [];
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (child.name && child.name.indexOf("color/") === 0 && child.type === "RECTANGLE") {
      colors.push({ name: child.name.replace("color/", ""), hex: getFillHex(child) || "#000000" });
    }
    if (child.name && child.name.indexOf("text/") === 0 && child.type === "TEXT") {
      textStyles.push({
        name: child.name.replace("text/", ""),
        fontSize: child.fontSize,
        fontWeight: child.fontName ? child.fontName.style : "Regular",
        fill: getFillHex(child) || "#ffffff",
      });
    }
  }

  return { libraryId: lib.id, colors: colors, textStyles: textStyles };
};

// ─── READ HANDLERS ────────────────────────────────────────────────────────────

// get_selection — returns full design data for current selection (or specified node)
handlers.get_selection = async function(params) {
  var id = params ? params.id : null;
  var nodeName = params ? params.name : null;
  var nodes;
  if (id) {
    nodes = [findNodeById(id)].filter(Boolean);
  } else if (nodeName) {
    nodes = [findNodeByName(nodeName)].filter(Boolean);
  } else {
    nodes = [].concat(figma.currentPage.selection);
  }

  if (!nodes.length) return { nodes: [], message: "Nothing selected" };

  return {
    nodes: nodes.map(n => extractDesignTree(n)),
    tokens: nodes.length === 1 ? extractTokens(extractDesignTree(nodes[0])) : null,
  };
};

// get_design — full page node tree (limited depth)
handlers.get_design = async ({ id, name, depth = 4 } = {}) => {
  let root;
  if (id)   root = findNodeById(id);
  else if (name) root = findNodeByName(name);
  else      root = figma.currentPage;

  if (!root) throw new Error("Node not found: id=" + (id || "none") + " name=" + (name || "none"));

  try {
    const tree = extractDesignTree(root, 8 - depth);
    const tokens = extractTokens(tree);
    return { tree, tokens };
  } catch(e) {
    throw new Error("[get_design] " + e.message + " nodeType=" + root.type + " id=" + root.id);
  }
};

// get_page_nodes — shallow list of top-level frames on current page
handlers.get_page_nodes = async () => {
  const page = figma.currentPage;
  return {
    page: page.name,
    nodes: page.children.map(function(n) {
      return Object.assign(nodeToInfo(n), { childCount: "children" in n ? n.children.length : 0 });
    }),
  };
};

// screenshot — export node as PNG base64 (v1.2.5)
handlers.screenshot = async function(params) {
  var id = params && params.id ? params.id : null;
  var nodeName = params && params.name ? params.name : null;
  var s = params && params.scale ? params.scale : 1;

  var page = figma.currentPage;
  var children = page.children;
  var node = null;
  var i;

  // Deep search by ID — check top-level first, then deep search
  if (id) {
    for (i = 0; i < children.length; i++) {
      if (children[i].id === id) { node = children[i]; break; }
    }
    if (!node) {
      node = figma.currentPage.findOne(function(n) { return n.id === id; });
    }
  }
  // Deep search by name
  if (node === null && nodeName) {
    for (i = 0; i < children.length; i++) {
      if (children[i].name === nodeName) { node = children[i]; break; }
    }
    if (!node) {
      node = figma.currentPage.findOne(function(n) { return n.name === nodeName; });
    }
  }
  // Fallback: any exportable top-level node (FRAME, COMPONENT, COMPONENT_SET, SECTION)
  if (node === null) {
    var exportableTypes = ["FRAME", "COMPONENT", "COMPONENT_SET", "SECTION", "INSTANCE", "GROUP"];
    for (i = 0; i < children.length; i++) {
      if (exportableTypes.indexOf(children[i].type) !== -1) { node = children[i]; break; }
    }
  }
  if (node === null) {
    return Promise.reject(new Error("[v1.2.5] No exportable node found. children=" + children.length));
  }

  try {
    var bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: s } });
  } catch(exportErr) {
    return Promise.reject(new Error("[v1.2.4-export] " + exportErr.message + " type=" + node.type + " id=" + node.id));
  }

  // Figma plugin sandbox: no btoa, no TextEncoder — manual base64
  try {
    // exportAsync returns Uint8Array directly in Figma sandbox
    var arr = bytes;
    if (typeof Uint8Array !== "undefined" && !(bytes instanceof Uint8Array)) {
      arr = new Uint8Array(bytes);
    }
    var CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var b64 = "";
    var len = arr.length;
    for (var j = 0; j < len; j += 3) {
      var b0 = arr[j];
      var b1 = j + 1 < len ? arr[j + 1] : 0;
      var b2 = j + 2 < len ? arr[j + 2] : 0;
      b64 += CHARS[b0 >> 2];
      b64 += CHARS[((b0 & 3) << 4) | (b1 >> 4)];
      b64 += j + 1 < len ? CHARS[((b1 & 15) << 2) | (b2 >> 6)] : "=";
      b64 += j + 2 < len ? CHARS[b2 & 63] : "=";
    }
    return { dataUrl: "data:image/png;base64," + b64, nodeId: node.id, width: node.width, height: node.height };
  } catch(encodeErr) {
    return Promise.reject(new Error("[v1.2.4-encode] " + encodeErr.message));
  }
};

// export_svg — export node as SVG string
handlers.export_svg = async function(params) {
  var id = params ? params.id : null;
  var nodeName = params ? params.name : null;
  var node = null;
  if (id) node = findNodeById(id);
  if (!node && nodeName) {
    node = figma.currentPage.findOne(function(n) { return n.name === nodeName; });
  }
  if (!node) node = figma.currentPage;
  if (!node) throw new Error("Node not found");
  const bytes = await node.exportAsync({ format: "SVG" });
  return { svg: new TextDecoder().decode(bytes), nodeId: node.id };
};

// ─── DISPATCHER ───────────────────────────────────────────────────────────────

// Sanitize data before postMessage — remove Symbol values (e.g. figma.mixed)
// that cannot be serialized via structured clone / JSON
function sanitizeForPostMessage(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "symbol") return "mixed";
  if (typeof obj === "number" || typeof obj === "string" || typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForPostMessage);
  if (typeof obj === "object") {
    var clean = {};
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        var val = obj[key];
        if (typeof val === "symbol") {
          clean[key] = "mixed";
        } else {
          clean[key] = sanitizeForPostMessage(val);
        }
      }
    }
    return clean;
  }
  return obj;
}

figma.ui.onmessage = async (request) => {
  const { id, operation, params } = request;
  const handler = handlers[operation];

  if (!handler) {
    figma.ui.postMessage({
      id, operation, success: false,
      error: `Unknown operation "${operation}". Available: ${Object.keys(handlers).join(", ")}`,
    });
    return;
  }

  try {
    var data = await handler(params || {});
    figma.ui.postMessage({ id: id, operation: operation, success: true, data: sanitizeForPostMessage(data) });
  } catch (err) {
    var errMsg = "[dispatch:" + operation + "] " + (err && err.message ? err.message : String(err));
    figma.ui.postMessage({ id: id, operation: operation, success: false, error: errMsg });
  }
};
