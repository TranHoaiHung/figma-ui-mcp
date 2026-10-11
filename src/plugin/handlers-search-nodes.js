// ─── HANDLERS SEARCH NODES ───
// handlers.search_nodes and get_page_nodes.
// Split out of handlers-read.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

handlers.search_nodes = async function(params) {
  var p = params || {};
  var results = [];
  var maxResults = p.limit || 50;

  // Search criteria
  var criteria = {
    type: p.type || null,               // "TEXT", "FRAME", "RECTANGLE", etc.
    namePattern: p.namePattern || null,  // wildcard pattern: "*header*"
    fill: p.fill || null,               // hex color: "#FF0000"
    fontFamily: p.fontFamily || null,    // "Inter"
    fontWeight: p.fontWeight || null,    // "Bold"
    fontSize: p.fontSize || null,        // 14
    text: p.text || null,               // exact or partial TEXT content match
    hasImage: p.hasImage || false,       // true = nodes with image fills
    hasIcon: p.hasIcon || false,         // true = likely icon nodes
    includeHidden: p.includeHidden || false, // false = skip visible:false nodes (default)
    minWidth: p.minWidth || null,
    maxWidth: p.maxWidth || null,
    minHeight: p.minHeight || null,
    maxHeight: p.maxHeight || null,
  };

  // Convert wildcard pattern to simple matcher
  function matchName(name, pattern) {
    if (!pattern) return true;
    var parts = pattern.toLowerCase().split("*");
    var str = name.toLowerCase();
    var pos = 0;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === "") continue;
      var idx = str.indexOf(parts[i], pos);
      if (idx === -1) return false;
      pos = idx + parts[i].length;
    }
    return true;
  }

  function matchNode(node) {
    if (criteria.type && node.type !== criteria.type) return false;
    if (criteria.namePattern && !matchName(node.name, criteria.namePattern)) return false;
    if (criteria.fill) {
      var nodeFill = getFillHex(node);
      if (!nodeFill || nodeFill.toLowerCase() !== criteria.fill.toLowerCase()) return false;
    }
    // BUG-16: text filter only applies to TEXT nodes; non-TEXT nodes are excluded when text is set
    if (criteria.text && node.type !== "TEXT") return false;
    if (node.type === "TEXT") {
      try {
        if (criteria.text && node.characters.indexOf(criteria.text) === -1) return false;
        // Resolve the font only when it is actually being filtered on: for a
        // mixed node readFontName costs a getStyledTextSegments call per node.
        if (criteria.fontFamily || criteria.fontWeight) {
          var matchFont = readFontName(node);
          if (criteria.fontFamily && matchFont.family && matchFont.family !== criteria.fontFamily) return false;
          if (criteria.fontWeight && matchFont.style && matchFont.style !== criteria.fontWeight) return false;
        }
        if (criteria.fontSize) {
          var matchSize = readMixedNumber(node, "fontSize");
          if (matchSize.value !== criteria.fontSize) return false;
        }
      } catch(e) { /* unreadable characters — skip the text filters */ }
    } else {
      if (criteria.fontFamily || criteria.fontWeight || criteria.fontSize) return false;
    }
    if (criteria.hasImage && !hasImageFill(node)) return false;
    if (criteria.hasIcon && !isLikelyIcon(node)) return false;
    if (criteria.minWidth && node.width < criteria.minWidth) return false;
    if (criteria.maxWidth && node.width > criteria.maxWidth) return false;
    if (criteria.minHeight && node.height < criteria.minHeight) return false;
    if (criteria.maxHeight && node.height > criteria.maxHeight) return false;
    return true;
  }

  function walkAndMatch(node) {
    // Guard: 'in' operator requires a non-null object — null/undefined/primitives crash here
    if (!node || typeof node !== "object") return;
    // Skip invisible nodes unless caller explicitly requests hidden elements
    if (!criteria.includeHidden && node.visible === false) return;
    if (results.length >= maxResults) return;
    try {
      if (matchNode(node)) {
        var info = {
          id: node.id, name: node.name, type: node.type,
          x: Math.round(node.x), y: Math.round(node.y),
          width: Math.round(node.width), height: Math.round(node.height),
        };
        try { info.fill = getFillHex(node); } catch(e) {}
        if (node.type === "TEXT") {
          var hitTp = readTextProps(node);
          info.content = hitTp.content;
          info.fontSize = hitTp.fontSize;
          info.fontFamily = hitTp.fontFamily;
          info.fontWeight = hitTp.fontWeight;
          if (hitTp.mixed.font) info.mixedFonts = true;
        }
        // Find page path for context
        var path = [];
        var parent = node.parent;
        while (parent && parent.type !== "PAGE" && path.length < 5) {
          path.unshift(parent.name);
          parent = parent.parent;
        }
        if (path.length) info.path = path.join(" > ");
        results.push(info);
      }
    } catch(e) { /* skip inaccessible nodes */ }
    if (node && typeof node === "object" && "children" in node && Array.isArray(node.children)) {
      for (var i = 0; i < node.children.length; i++) {
        if (results.length >= maxResults) return;
        walkAndMatch(node.children[i]);
      }
    }
  }

  // Search scope: specific node or current page (no cross-page load — too slow on large files)
  var root;
  if (p.id) root = await findNodeByIdAsync(p.id);
  else if (p.name) root = findNodeByName(p.name);
  else root = figma.currentPage;

  walkAndMatch(root);

  return {
    results: results,
    total: results.length,
    criteria: criteria,
    truncated: results.length >= maxResults,
  };
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

// Shared base64 encoder — Figma sandbox has no btoa/TextEncoder
