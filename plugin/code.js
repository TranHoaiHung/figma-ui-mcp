// figma-ui-mcp — Figma Plugin main thread
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

function solidFill(hex) {
  return [{ type: "SOLID", color: hexToRgb(hex) }];
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

  if ("fills" in node)      info.fill   = getFillHex(node);
  if ("strokes" in node)    info.stroke = getStrokeHex(node);
  if ("strokeWeight" in node && node.strokes && node.strokes.length) info.strokeWeight = node.strokeWeight;
  if ("cornerRadius" in node) info.cornerRadius = node.cornerRadius;
  if ("opacity" in node && node.opacity !== 1) info.opacity = node.opacity;
  if ("visible" in node && !node.visible) info.visible = false;

  if (node.type === "TEXT") {
    info.content    = node.characters;
    info.fontSize   = node.fontSize;
    info.fontFamily = node.fontName ? node.fontName.family : null;
    info.fontWeight = node.fontName ? node.fontName.style : null;
    info.lineHeight = node.lineHeight ? node.lineHeight.value : null;
    info.textAlign  = node.textAlignHorizontal;
  }

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
    node.fills = fill ? solidFill(fill) : [];
    if (stroke) { node.strokes = solidStroke(stroke); node.strokeWeight = strokeWeight; }
    if (cornerRadius !== undefined) node.cornerRadius = cornerRadius;

  } else if (type === "RECTANGLE") {
    node = figma.createRectangle();
    node.resize(width, height);
    node.fills = fill ? solidFill(fill) : [];
    if (stroke) { node.strokes = solidStroke(stroke); node.strokeWeight = strokeWeight; }
    if (cornerRadius !== undefined) node.cornerRadius = cornerRadius;

  } else if (type === "ELLIPSE") {
    node = figma.createEllipse();
    node.resize(width, height);
    node.fills = fill ? solidFill(fill) : [];
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

  } else {
    throw new Error(`Unsupported node type: "${type}". Use FRAME, RECTANGLE, ELLIPSE, LINE, TEXT.`);
  }

  if (name)   node.name = name;
  node.x = x;
  node.y = y;
  if (opacity !== undefined) node.opacity = opacity;
  if (visible !== undefined) node.visible = visible;

  if (parent !== figma.currentPage) {
    parent.appendChild(node);
  }

  return nodeToInfo(node);
};

handlers.modify = async (params) => {
  const node = resolveNode(params);
  if (!node) throw new Error(`Node not found: ${JSON.stringify(params)}`);

  if (params.fill     !== undefined && "fills"   in node) node.fills   = solidFill(params.fill);
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
    if (params.content !== undefined || params.fontWeight !== undefined) {
      const style = FONT_STYLE_MAP[params.fontWeight] || node.fontName.style;
      await figma.loadFontAsync({ family: node.fontName.family, style });
      if (params.fontWeight) node.fontName = { family: node.fontName.family, style };
      if (params.content !== undefined) node.characters = params.content;
    }
    if (params.fontSize !== undefined) node.fontSize = params.fontSize;
  }

  return nodeToInfo(node);
};

handlers.delete = async (params) => {
  const node = resolveNode(params);
  if (!node) throw new Error(`Node not found: ${JSON.stringify(params)}`);
  const info = nodeToInfo(node);
  node.remove();
  return Object.assign({ deleted: true }, info);
};

handlers.append = async ({ parentId, childId }) => {
  const parent = findNodeById(parentId);
  const child  = findNodeById(childId);
  if (!parent || !child) throw new Error("Parent or child not found");
  parent.appendChild(child);
  return { parentId: parent.id, childId: child.id };
};

handlers.listComponents = async () => {
  const comps = figma.root.findAllWithCriteria({ types: ["COMPONENT"] });
  return comps.map(c => ({ id: c.id, name: c.name, key: c.key || null }));
};

handlers.instantiate = async ({ componentId, parentId, x = 0, y = 0 }) => {
  const comp = figma.root.findOne(n => n.id === componentId && n.type === "COMPONENT");
  if (!comp) throw new Error(`Component ${componentId} not found`);
  const inst = comp.createInstance();
  inst.x = x; inst.y = y;
  if (parentId) {
    const p = findNodeById(parentId);
    if (p) p.appendChild(inst);
  }
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
handlers.get_selection = async ({ id } = {}) => {
  const nodes = id
    ? [findNodeById(id)].filter(Boolean)
    : [...figma.currentPage.selection];

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

  if (!root) throw new Error("Node not found");

  const tree = extractDesignTree(root, 8 - depth);
  const tokens = extractTokens(tree);
  return { tree, tokens };
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

// screenshot — export node as PNG base64
// Uses figma.getNodeById() for reliable node access + chunked btoa for large images
handlers.screenshot = async function(params) {
  var id = params ? params.id : null;
  var s = params ? (params.scale || 1) : 1;
  var node = null;

  // Find node by id in top-level children
  if (id) {
    var children = figma.currentPage.children;
    for (var ci = 0; ci < children.length; ci++) {
      if (children[ci].id === id) { node = children[ci]; break; }
    }
    if (!node) node = figma.currentPage.findOne(function(n) { return n.id === id; });
  }
  // Fall back to first top-level frame (avoids PageNode which has no exportAsync)
  if (!node) {
    var frames = figma.currentPage.children;
    for (var fi = 0; fi < frames.length; fi++) {
      if (frames[fi].type === "FRAME") { node = frames[fi]; break; }
    }
  }
  if (!node) throw new Error("No frame found to screenshot");

  // Detailed type check
  var exportType = typeof node.exportAsync;
  if (exportType !== "function") {
    throw new Error("exportAsync is " + exportType + " on " + node.type + "/" + node.id + " — reload plugin");
  }

  // Try export with scale constraint
  var bytes;
  try {
    bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: s } });
  } catch (e1) {
    // Retry without constraint (some API versions differ)
    try {
      bytes = await node.exportAsync({ format: "PNG" });
    } catch (e2) {
      throw new Error("exportAsync failed: " + e1.message + " | retry: " + e2.message);
    }
  }

  var arr = new Uint8Array(bytes);
  var b64 = "";
  var CHUNK = 8192;
  for (var i = 0; i < arr.length; i += CHUNK) {
    b64 += btoa(String.fromCharCode.apply(null, arr.subarray(i, i + CHUNK)));
  }
  return { dataUrl: "data:image/png;base64," + b64, nodeId: node.id, width: node.width, height: node.height };
};

// export_svg — export node as SVG string
handlers.export_svg = async ({ id } = {}) => {
  const node = id ? findNodeById(id) : figma.currentPage;
  if (!node) throw new Error("Node not found");
  const bytes = await node.exportAsync({ format: "SVG" });
  return { svg: new TextDecoder().decode(bytes), nodeId: node.id };
};

// ─── DISPATCHER ───────────────────────────────────────────────────────────────

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
    const data = await handler(params || {});
    figma.ui.postMessage({ id, operation, success: true, data });
  } catch (err) {
    figma.ui.postMessage({ id, operation, success: false, error: err.message });
  }
};
