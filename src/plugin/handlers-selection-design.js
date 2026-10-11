// ─── READ HANDLERS ────────────────────────────────────────────────────────────

// get_selection — returns full design data for current selection (or specified node)
handlers.get_selection = async function(params) {
  var id = params ? params.id : null;
  var nodeName = params ? params.name : null;
  var nodes;
  if (id) {
    nodes = [await findNodeByIdAsync(id)].filter(Boolean);
  } else if (nodeName) {
    nodes = [findNodeByName(nodeName)].filter(Boolean);
  } else {
    nodes = [].concat(figma.currentPage.selection);
  }

  if (!nodes.length) return { nodes: [], message: "Nothing selected" };

  var maxDepth = (params && params.depth !== undefined) ? (params.depth === "full" ? 50 : Number(params.depth)) : 15;
  var detailLevel = (params && params.detail) || "full";
  var filterInvisible = !(params && params.includeHidden === true);
  var trees = nodes.map(function(n) { return extractDesignTree(n, 0, maxDepth, detailLevel, filterInvisible); });
  return {
    nodes: trees,
    // Reuse already-computed tree instead of calling extractDesignTree twice
    tokens: detailLevel !== "minimal" && trees.length === 1 ? extractTokens(trees[0]) : null,
  };
};

// get_design — full node tree with configurable depth
// depth: number (default 10) or "full" for unlimited
handlers.get_design = async function(params) {
  var p = params || {};
  var id = p.id, name = p.name;
  var depthParam = p.depth !== undefined ? p.depth : 10;
  var detailLevel = p.detail || "full"; // "minimal" | "compact" | "full"
  var filterInvisible = !(p.includeHidden === true);

  var root;
  if (id)   root = await findNodeByIdAsync(id);
  else if (name) root = findNodeByName(name);
  else      root = figma.currentPage;

  if (!root) throw new Error("Node not found: id=" + (id || "none") + " name=" + (name || "none"));

  var maxDepth = (depthParam === "full") ? 50 : Number(depthParam);
  if (isNaN(maxDepth) || maxDepth < 1) maxDepth = 10;

  try {
    var tree = extractDesignTree(root, 0, maxDepth, detailLevel, filterInvisible);

    // Post-process: inline SVG for icon nodes (full mode only, max 10, with time budget)
    var iconCount = 0;
    var svgStartTime = Date.now();
    var SVG_TIME_BUDGET_MS = 5000; // max 5s for SVG inlining — prevent timeout on heavy files
    var SVG_MAX_ICONS = 10;
    var skipInlineSvg = (detailLevel !== "full");
    async function inlineSvgForIcons(node) {
      if (!node || skipInlineSvg) return;
      if (iconCount >= SVG_MAX_ICONS || (Date.now() - svgStartTime) > SVG_TIME_BUDGET_MS) return;
      if (node.isIcon && node.id) {
        try {
          var figNode = await findNodeByIdAsync(node.id);
          if (figNode) {
            var svg = await exportNodeSvg(figNode);
            if (svg && svg.length < 5000) {
              node.svgMarkup = svg;
              delete node.iconHint;
              iconCount++;
            }
          }
        } catch(e) { /* skip failed icon export */ }
      }
      if (node.children) {
        for (var i = 0; i < node.children.length; i++) {
          if ((Date.now() - svgStartTime) > SVG_TIME_BUDGET_MS) break;
          await inlineSvgForIcons(node.children[i]);
        }
      }
    }
    await inlineSvgForIcons(tree);

    var tokens = extractTokens(tree);
    var meta = { maxDepth: maxDepth, detail: detailLevel, nodeType: root.type };
    if (detailLevel === "full") meta.inlinedIcons = iconCount;
    return { tree: tree, tokens: (detailLevel !== "minimal" ? tokens : undefined), meta: meta };
  } catch(e) {
    throw new Error("[get_design] " + e.message + " nodeType=" + root.type + " id=" + root.id);
  }
};

// scan_design — progressive scan for large/complex designs
// Returns a structured summary: sections, all text content, all colors, component list, image nodes
// Works on any size file without token overflow
