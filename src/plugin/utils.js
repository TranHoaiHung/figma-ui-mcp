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
  // "NONE" or empty means no fill → return empty array
  if (!hex || hex.toUpperCase() === "NONE") return [];
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
  // Check page-level nodes first to avoid root.findOne() which requires loadAllPagesAsync
  if (figma.currentPage.id === id) return figma.currentPage;
  if (figma.root.id === id) return figma.root;
  var node = figma.currentPage.findOne(n => n.id === id);
  if (node) return node;
  // figma.getNodeById was removed — no sync cross-page fallback available
  return null;
}

async function findNodeByIdAsync(id) {
  if (figma.currentPage.id === id) return figma.currentPage;
  if (figma.root.id === id) return figma.root;
  var node = figma.currentPage.findOne(n => n.id === id);
  if (node) return node;
  // Use async API as cross-page fallback (Figma removed the sync getNodeById)
  try { var n2 = await figma.getNodeByIdAsync(id); if (n2) return n2; } catch(e) {}
  return null;
}

function findNodeByName(name) {
  if (figma.currentPage.name === name) return figma.currentPage;
  return figma.currentPage.findOne(n => n.name === name);
}

async function resolveNode(params) {
  // Accept id, nodeId, targetId — then fall back to name/nodeName
  var id   = params.id || params.nodeId || params.targetId;
  var name = params.name || params.nodeName;
  var node = null;
  if (id)   node = await findNodeByIdAsync(id);
  if (!node && name) node = findNodeByName(name);
  return node;
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
