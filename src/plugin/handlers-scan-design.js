// ─── HANDLERS SCAN DESIGN ───
// handlers.scan_design — whole-frame summary.
// Split out of handlers-read.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

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
      var scanTp = readTextProps(node);
      textInfo.content = scanTp.content;
      textInfo.fill = getFillHex(node);
      textInfo.fontSize = scanTp.fontSize;
      textInfo.fontFamily = scanTp.fontFamily;
      textInfo.fontWeight = scanTp.fontWeight;
      if (scanTp.mixed.font) textInfo.mixedFonts = true;
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
    if (summary.images.length < 50 && hasImageFill(node)) {
      summary.images.push({
        id: node.id, name: node.name,
        x: Math.round(node.x), y: Math.round(node.y),
        width: Math.round(node.width), height: Math.round(node.height),
      });
    }

    // Collect icons
    if (summary.icons.length < 50 && isLikelyIcon(node)) {
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

  // Walk entire tree first — collects all nodes, colors, fonts, images, icons, components
  walkCount(root);

  // Build sections from top-level children — reuse data already collected by walkCount
  if ("children" in root) {
    var sectionIconIds = {};
    var sectionImageIds = {};
    // Index icons/images by id for O(1) lookup
    for (var ii = 0; ii < summary.icons.length; ii++) sectionIconIds[summary.icons[ii].id] = true;
    for (var im = 0; im < summary.images.length; im++) sectionImageIds[summary.images[im].id] = true;

    for (var ci = 0; ci < root.children.length; ci++) {
      var child = root.children[ci];
      var section = {
        id: child.id, name: child.name, type: child.type,
        x: Math.round(child.x), y: Math.round(child.y),
        width: Math.round(child.width), height: Math.round(child.height),
        childCount: "children" in child ? child.children.length : 0,
        iconCount: 0,
        imageCount: 0,
      };
      var sectionTexts = collectTextContent(child, 20);
      if (sectionTexts.length) section.textContent = sectionTexts;
      // Count the icons and images inside this section's subtree. The previous
      // version compared against summary.icons[].parentId, which is never set,
      // so a section only ever counted itself. sectionIconIds/sectionImageIds
      // are already built above; walk the subtree once and test membership.
      (function countInSubtree(n) {
        if (!n || typeof n !== "object") return;
        if (!scanIncludeHidden && n.visible === false) return;
        if (sectionIconIds[n.id]) section.iconCount++;
        if (sectionImageIds[n.id]) section.imageCount++;
        if ("children" in n) {
          for (var k = 0; k < n.children.length; k++) countInSubtree(n.children[k]);
        }
      })(child);
      summary.sections.push(section);
    }
  }

  // Sort colors by usage
  var colorEntries = Object.keys(summary.allColors).map(function(k) { return { color: k, count: summary.allColors[k] }; });
  colorEntries.sort(function(a, b) { return b.count - a.count; });
  summary.allColors = colorEntries.slice(0, 30); // top 30 colors

  // Sort fonts by usage, cap at 30 (same as allColors)
  var fontEntries = Object.keys(summary.allFonts).map(function(k) { return { font: k, count: summary.allFonts[k] }; });
  fontEntries.sort(function(a, b) { return b.count - a.count; });
  summary.allFonts = fontEntries.slice(0, 30);

  return summary;
};

// search_nodes — find nodes by properties (color, type, font, name pattern)
