// ─── UTILS ────────────────────────────────────────────────────────────────────

// Map common CSS color names to hex (AI sometimes passes color names instead of hex)
var CSS_COLOR_MAP = {
  "white": "#FFFFFF", "black": "#000000", "red": "#FF0000", "green": "#008000",
  "blue": "#0000FF", "yellow": "#FFFF00", "orange": "#FFA500", "purple": "#800080",
  "pink": "#FFC0CB", "gray": "#808080", "grey": "#808080", "transparent": "NONE",
  "teal": "#008080", "cyan": "#00FFFF", "magenta": "#FF00FF", "lime": "#00FF00",
  "navy": "#000080", "brown": "#A52A2A", "silver": "#C0C0C0", "gold": "#FFD700",
};

function normalizeHex(hex) {
  if (!hex) return null;
  var s = String(hex).trim();
  // CSS color name
  var mapped = CSS_COLOR_MAP[s.toLowerCase()];
  if (mapped) s = mapped;
  // Transparent / none
  if (s.toUpperCase() === "NONE" || s.toUpperCase() === "TRANSPARENT") return null;
  // rgba(r,g,b,a) or rgb(r,g,b) → convert to hex (alpha discarded here — use extractColorAlpha for alpha)
  var rgbaMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbaMatch) {
    var rr = Math.min(255, Math.max(0, parseInt(rgbaMatch[1])));
    var gg = Math.min(255, Math.max(0, parseInt(rgbaMatch[2])));
    var bb = Math.min(255, Math.max(0, parseInt(rgbaMatch[3])));
    s = "#" + ((1 << 24) + (rr << 16) + (gg << 8) + bb).toString(16).slice(1);
  }
  // Strip #
  s = s.replace(/^#/, "");
  // 8-char hex with alpha → take first 6 (alpha handled separately by extractColorAlpha)
  if (s.length === 8 && /^[0-9a-fA-F]{8}$/.test(s)) s = s.slice(0, 6);
  // 4-char hex shorthand with alpha → take first 3
  if (s.length === 4 && /^[0-9a-fA-F]{4}$/.test(s)) s = s.slice(0, 3);
  // Expand 3-char shorthand
  if (s.length === 3) s = s[0]+s[0]+s[1]+s[1]+s[2]+s[2];
  // Must be 6 hex chars now
  if (!/^[0-9a-fA-F]{6}$/.test(s)) {
    throw new Error("Invalid color value: \"" + hex + "\". Use 6-digit hex like #FF0000, 8-digit #RRGGBBAA, rgba(r,g,b,a), or a CSS name.");
  }
  return s;
}

// Extract alpha (0..1) from an 8-digit hex "#RRGGBBAA" or rgba(r,g,b,a) string.
// Returns null when the input has no alpha component.
function extractColorAlpha(hex) {
  if (!hex) return null;
  var s = String(hex).trim();
  // rgba(r,g,b,a) — capture 4th component
  var rgbaMatch = s.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d*\.?\d+)\s*\)/i);
  if (rgbaMatch) return Math.min(1, Math.max(0, parseFloat(rgbaMatch[1])));
  // #RRGGBBAA → alpha = AA/255
  var cleaned = s.replace(/^#/, "");
  if (cleaned.length === 8 && /^[0-9a-fA-F]{8}$/.test(cleaned)) {
    return parseInt(cleaned.slice(6, 8), 16) / 255;
  }
  // #RGBA (4-char shorthand)
  if (cleaned.length === 4 && /^[0-9a-fA-F]{4}$/.test(cleaned)) {
    var a4 = cleaned[3];
    return parseInt(a4 + a4, 16) / 255;
  }
  return null;
}

function hexToRgb(hex) {
  var h = normalizeHex(hex);
  if (!h) return { r: 0, g: 0, b: 0 };
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
  // "NONE", empty, transparent → no fill
  if (!hex) return [];
  var normalized = normalizeHex(hex);
  if (!normalized) return [];
  var fill = { type: "SOLID", color: hexToRgb(hex) };
  // BUG-02: extract alpha from 8-digit hex or rgba() automatically (explicit fillOpacity wins)
  if (fillOpacity !== undefined) {
    fill.opacity = fillOpacity;
  } else {
    var extracted = extractColorAlpha(hex);
    if (extracted !== null && extracted < 1) fill.opacity = extracted;
  }
  return [fill];
}

function solidStroke(hex, strokeOpacity) {
  if (!hex) return [];
  var normalized = normalizeHex(hex);
  if (!normalized) return [];
  var stroke = { type: "SOLID", color: hexToRgb(hex) };
  if (strokeOpacity !== undefined) {
    stroke.opacity = strokeOpacity;
  } else {
    var extracted = extractColorAlpha(hex);
    if (extracted !== null && extracted < 1) stroke.opacity = extracted;
  }
  return [stroke];
}

// Paint/effect helpers (buildFillArray, buildGradientPaint, buildEffect,
// applyEffects, applyCornerRadii) live in paint-and-effects.js.

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

// SVG path helpers (normalizeSvgPath, arcToCubicSegments) live in svg-path-helpers.js.

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
