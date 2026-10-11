// ─── READ HELPERS ─────────────────────────────────────────────────────────────

// Detect if a node is likely an icon (small vector/group/instance)
function isLikelyIcon(node) {
  if (!node || !("width" in node)) return false;
  var w = node.width, h = node.height;
  // Icons are typically small (8-64px) and roughly square
  if (w < 8 || w > 80 || h < 8 || h > 80) return false;
  var ratio = Math.max(w, h) / Math.min(w, h);
  if (ratio > 1.5) return false;
  var iconTypes = ["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "LINE"];
  if (iconTypes.indexOf(node.type) !== -1) return true;
  // Small instance or group with only vectors inside
  if (node.type === "INSTANCE" || node.type === "GROUP" || node.type === "FRAME") {
    if (!node.children || node.children.length === 0) return false;
    if (node.children.length > 10) return false;
    var allVectors = true;
    for (var i = 0; i < node.children.length; i++) {
      var ct = node.children[i].type;
      if (iconTypes.indexOf(ct) === -1 && ct !== "GROUP" && ct !== "FRAME" && ct !== "BOOLEAN_OPERATION") {
        allVectors = false; break;
      }
    }
    return allVectors;
  }
  return false;
}

// Check if node has image fill
function hasImageFill(node) {
  try {
    if (!node.fills || !node.fills.length) return false;
    for (var i = 0; i < node.fills.length; i++) {
      if (node.fills[i].type === "IMAGE" && node.fills[i].visible !== false) return true;
    }
  } catch(e) {}
  return false;
}

// Collect all text content from a subtree (for truncated nodes summary)
function collectTextContent(node, maxItems) {
  if (!maxItems) maxItems = 10;
  var texts = [];
  function walk(n) {
    if (!n || typeof n !== "object") return;
    if (texts.length >= maxItems) return;
    if (n.type === "TEXT") {
      var t = n.characters;
      if (t && t.trim()) texts.push(t.trim().substring(0, 60));
    }
    if ("children" in n && Array.isArray(n.children)) {
      for (var i = 0; i < n.children.length; i++) walk(n.children[i]);
    }
  }
  walk(node);
  return texts;
}

// Collect icon names from a subtree
function collectIconNames(node, maxItems) {
  if (!maxItems) maxItems = 10;
  var icons = [];
  function walk(n) {
    if (!n || typeof n !== "object") return;
    if (icons.length >= maxItems) return;
    if (isLikelyIcon(n)) icons.push(n.name);
    if ("children" in n && Array.isArray(n.children)) {
      for (var i = 0; i < n.children.length; i++) walk(n.children[i]);
    }
  }
  walk(node);
  return icons;
}

// Detail levels: "minimal" | "compact" | "full"
// minimal: id, name, type, position, size, childCount — ~5% token cost
// compact: + fill, stroke, cornerRadius, layout, text content — ~30% token cost
// full:    + effects, segments, gradient details, boundVariables, inline SVG — 100% token cost
// filterInvisible: true (default) = skip nodes with visible:false | false = include all nodes
