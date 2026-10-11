// ─── NODE UTILS ───
// Font style map, node lookup by id/name, and the compact node summary.
// Split out of utils.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

const FONT_STYLE_MAP = {
  Regular: "Regular", Medium: "Medium",
  SemiBold: "Semi Bold", Bold: "Bold", Light: "Light",
  Thin: "Thin", Heavy: "Heavy",
  // BUG-02 fix: map "Black" and aliases to nearest available Inter weight
  Black: "Bold", ExtraBold: "Extra Bold", UltraBold: "Extra Bold",
  "Extra Bold": "Extra Bold", "Ultra Bold": "Extra Bold",
  "Semi Bold": "Semi Bold",
  "Condensed Heavy": "Condensed Heavy",
  "Thin Italic": "Thin Italic",
  "Light Italic": "Light Italic",
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
  // getNodeByIdAsync is an indexed lookup; currentPage.findOne walks the whole
  // page tree. This used to scan first and only fall back to the index, so every
  // id resolution cost a full traversal — 40 call sites, and a 50-op batch paid
  // it 50 times. Index first, keep the scan as the fallback.
  try { var n = await figma.getNodeByIdAsync(id); if (n) return n; } catch(e) {}
  var node = figma.currentPage.findOne(n2 => n2.id === id);
  if (node) return node;
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
