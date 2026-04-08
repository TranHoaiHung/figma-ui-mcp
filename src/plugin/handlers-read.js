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
    if (detailLevel !== "full") iconCount = 999; // skip inline SVG for non-full modes
    async function inlineSvgForIcons(node) {
      if (!node) return;
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
handlers.scan_design = async function(params) {
  var p = params || {};
  var id = p.id, name = p.name;
  var root;
  if (id) root = await findNodeByIdAsync(id);
  else if (name) root = findNodeByName(name);
  else root = figma.currentPage;
  if (!root) throw new Error("Node not found");

  var summary = {
    rootId: root.id,
    rootName: root.name,
    rootType: root.type,
    width: Math.round(root.width),
    height: Math.round(root.height),
    totalNodes: 0,
    sections: [],      // top-level children with their text content
    allText: [],       // every text node: id, content, font, color, position
    allColors: {},     // color → count (usage frequency)
    allFonts: {},      // "Inter/Bold/16px" → count
    images: [],        // nodes with image fills
    icons: [],         // likely icon nodes
    components: [],    // component instances with names
  };

  var scanIncludeHidden = !!(p.includeHidden);
  function walkCount(node) {
    if (!node || typeof node !== "object") return;
    if (!scanIncludeHidden && node.visible === false) return;
    summary.totalNodes++;

    // Collect text
    if (node.type === "TEXT") {
      var textInfo = {
        id: node.id, name: node.name,
        x: Math.round(node.x), y: Math.round(node.y),
        width: Math.round(node.width), height: Math.round(node.height),
      };
      try {
        textInfo.content = node.characters;
        textInfo.fill = getFillHex(node);
        textInfo.fontSize = node.fontSize;
        textInfo.fontFamily = node.fontName ? node.fontName.family : null;
        textInfo.fontWeight = node.fontName ? node.fontName.style : null;
      } catch(e) {
        try { textInfo.content = node.characters; } catch(e2) {}
      }
      if (summary.allText.length < 500) summary.allText.push(textInfo);

      // Count font usage
      if (textInfo.fontFamily) {
        var fontKey = textInfo.fontFamily + "/" + (textInfo.fontWeight || "Regular") + "/" + (textInfo.fontSize || "?") + "px";
        summary.allFonts[fontKey] = (summary.allFonts[fontKey] || 0) + 1;
      }
    }

    // Collect colors
    try {
      var hex = getFillHex(node);
      if (hex) summary.allColors[hex] = (summary.allColors[hex] || 0) + 1;
    } catch(e) {}
    try {
      var strokeHex = getStrokeHex(node);
      if (strokeHex) summary.allColors[strokeHex] = (summary.allColors[strokeHex] || 0) + 1;
    } catch(e) {}

    // Collect images
    if (hasImageFill(node) && summary.images.length < 50) {
      summary.images.push({
        id: node.id, name: node.name,
        x: Math.round(node.x), y: Math.round(node.y),
        width: Math.round(node.width), height: Math.round(node.height),
      });
    }

    // Collect icons
    if (isLikelyIcon(node) && summary.icons.length < 50) {
      summary.icons.push({ id: node.id, name: node.name, width: Math.round(node.width), height: Math.round(node.height) });
    }

    // Collect component instances
    if (node.type === "INSTANCE" && summary.components.length < 50) {
      try {
        var mc = node.mainComponent;
        summary.components.push({
          id: node.id, name: node.name,
          componentName: mc ? mc.name : null,
          componentId: mc ? mc.id : null,
          width: Math.round(node.width), height: Math.round(node.height),
        });
      } catch(e) {}
    }

    // Recurse
    if ("children" in node && Array.isArray(node.children)) {
      for (var i = 0; i < node.children.length; i++) walkCount(node.children[i]);
    }
  }

  // Build sections from top-level children
  function countAssets(n, sec) {
    if (!n || typeof n !== "object") return;
    if (isLikelyIcon(n)) sec.iconCount++;
    if (hasImageFill(n)) sec.imageCount++;
    if ("children" in n && Array.isArray(n.children)) { for (var i = 0; i < n.children.length; i++) countAssets(n.children[i], sec); }
  }

  if ("children" in root) {
    for (var ci = 0; ci < root.children.length; ci++) {
      var child = root.children[ci];
      var section = {
        id: child.id, name: child.name, type: child.type,
        x: Math.round(child.x), y: Math.round(child.y),
        width: Math.round(child.width), height: Math.round(child.height),
        childCount: "children" in child ? child.children.length : 0,
      };
      // Summarize text inside this section
      var sectionTexts = collectTextContent(child, 20);
      if (sectionTexts.length) section.textContent = sectionTexts;
      section.iconCount = 0;
      section.imageCount = 0;
      // Quick count icons/images in section
      countAssets(child, section);
      summary.sections.push(section);
    }
  }

  // Walk entire tree for comprehensive data
  walkCount(root);

  // Sort colors by usage
  var colorEntries = Object.keys(summary.allColors).map(function(k) { return { color: k, count: summary.allColors[k] }; });
  colorEntries.sort(function(a, b) { return b.count - a.count; });
  summary.allColors = colorEntries.slice(0, 30); // top 30 colors

  // Sort fonts by usage
  var fontEntries = Object.keys(summary.allFonts).map(function(k) { return { font: k, count: summary.allFonts[k] }; });
  fontEntries.sort(function(a, b) { return b.count - a.count; });
  summary.allFonts = fontEntries;

  return summary;
};

// search_nodes — find nodes by properties (color, type, font, name pattern)
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
    if (node.type === "TEXT") {
      try {
        if (criteria.fontFamily && node.fontName && node.fontName.family !== criteria.fontFamily) return false;
        if (criteria.fontWeight && node.fontName && node.fontName.style !== criteria.fontWeight) return false;
        if (criteria.fontSize && node.fontSize !== criteria.fontSize) return false;
      } catch(e) { /* mixed styles, skip font filter */ }
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
          try {
            info.content = node.characters;
            info.fontSize = node.fontSize;
            info.fontFamily = node.fontName ? node.fontName.family : null;
            info.fontWeight = node.fontName ? node.fontName.style : null;
          } catch(e) { try { info.content = node.characters; } catch(e2) {} }
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
    return Promise.reject(new Error("[v1.9.1-export] " + exportErr.message + " type=" + node.type + " id=" + node.id));
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
    return Promise.reject(new Error("[v1.9.1-encode] " + encodeErr.message));
  }
};

// Manual UTF-8 decode for Figma sandbox (no TextDecoder available)
function uint8ArrayToString(arr) {
  var result = "";
  var i = 0;
  while (i < arr.length) {
    var byte1 = arr[i++];
    if (byte1 < 0x80) {
      result += String.fromCharCode(byte1);
    } else if (byte1 < 0xE0) {
      var byte2 = arr[i++] & 0x3F;
      result += String.fromCharCode(((byte1 & 0x1F) << 6) | byte2);
    } else if (byte1 < 0xF0) {
      var byte2 = arr[i++] & 0x3F;
      var byte3 = arr[i++] & 0x3F;
      result += String.fromCharCode(((byte1 & 0x0F) << 12) | (byte2 << 6) | byte3);
    } else {
      var byte2 = arr[i++] & 0x3F;
      var byte3 = arr[i++] & 0x3F;
      var byte4 = arr[i++] & 0x3F;
      var codePoint = ((byte1 & 0x07) << 18) | (byte2 << 12) | (byte3 << 6) | byte4;
      codePoint -= 0x10000;
      result += String.fromCharCode(0xD800 + (codePoint >> 10), 0xDC00 + (codePoint & 0x3FF));
    }
  }
  return result;
}

// Export node SVG — helper used by export_svg and inline icon extraction
async function exportNodeSvg(node) {
  var bytes = await node.exportAsync({ format: "SVG" });
  var arr = (typeof Uint8Array !== "undefined" && !(bytes instanceof Uint8Array)) ? new Uint8Array(bytes) : bytes;
  return uint8ArrayToString(arr);
}

// export_svg — export node as SVG string
handlers.export_svg = async function(params) {
  var id = params ? params.id : null;
  var nodeName = params ? params.name : null;
  var node = null;
  if (id) node = await findNodeByIdAsync(id);
  if (!node && nodeName) {
    node = figma.currentPage.findOne(function(n) { return n.name === nodeName; });
  }
  if (!node) node = figma.currentPage;
  if (!node) throw new Error("Node not found");
  var svg = await exportNodeSvg(node);
  return { svg: svg, nodeId: node.id, width: Math.round(node.width), height: Math.round(node.height) };
};

// export_image — export node as base64 PNG/JPG (for saving to disk, not for inline display)
handlers.export_image = async function(params) {
  var id = params ? params.id : null;
  var nodeName = params ? params.name : null;
  var format = (params && params.format) ? params.format.toUpperCase() : "PNG";
  var scale = (params && params.scale) ? params.scale : 2;

  if (format !== "PNG" && format !== "JPG") format = "PNG";

  var node = null;
  if (id) node = await findNodeByIdAsync(id);
  if (!node && nodeName) {
    node = figma.currentPage.findOne(function(n) { return n.name === nodeName; });
  }
  if (!node) throw new Error("Node not found for export");

  var bytes = await node.exportAsync({ format: format, constraint: { type: "SCALE", value: scale } });
  var arr = (typeof Uint8Array !== "undefined" && !(bytes instanceof Uint8Array)) ? new Uint8Array(bytes) : bytes;

  // Manual base64 encode (Figma sandbox has no btoa)
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

  return {
    base64: b64,
    format: format.toLowerCase(),
    width: Math.round(node.width * scale),
    height: Math.round(node.height * scale),
    nodeId: node.id,
    nodeName: node.name,
    sizeBytes: len,
  };
};
