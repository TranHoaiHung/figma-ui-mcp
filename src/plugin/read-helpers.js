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
function extractDesignTree(node, depth, maxDepth, detailLevel) {
  if (!node || typeof node !== "object") return null;
  if (depth === undefined) depth = 0;
  if (maxDepth === undefined) maxDepth = 15;
  if (!detailLevel) detailLevel = "full";
  if (depth > maxDepth) return null;

  var isMinimal = (detailLevel === "minimal");
  var isCompact = (detailLevel === "compact");
  var isFull    = (detailLevel === "full");

  var info = {
    id:    node.id,
    name:  node.name,
    type:  node.type,
    x:     "x"      in node ? Math.round(node.x)      : undefined,
    y:     "y"      in node ? Math.round(node.y)       : undefined,
    width: "width"  in node ? Math.round(node.width)   : undefined,
    height:"height" in node ? Math.round(node.height)  : undefined,
  };

  // Minimal: only basic info + childCount, skip all style properties
  if (isMinimal) {
    if ("children" in node && node.children.length) {
      info.childCount = node.children.length;
      if (node.type === "TEXT") { try { info.content = node.characters; } catch(e) {} }
      info.children = node.children
        .map(function(c) { return extractDesignTree(c, depth + 1, maxDepth, detailLevel); })
        .filter(Boolean);
    }
    return info;
  }

  // ── Fill (multiple fills, gradients, images) ──
  try {
    if ("fills" in node && node.fills && node.fills.length) {
      var fills = node.fills;
      if (fills.length === 1 && fills[0].type === "SOLID") {
        info.fill = rgbToHex(fills[0].color);
        if (fills[0].opacity !== undefined && fills[0].opacity !== 1) {
          info.fillOpacity = Math.round(fills[0].opacity * 100) / 100;
        }
      } else {
        info.fills = [];
        for (var fi = 0; fi < fills.length; fi++) {
          var f = fills[fi];
          var fd = { type: f.type, visible: f.visible !== false };
          if (f.type === "SOLID") {
            fd.color = rgbToHex(f.color);
            if (f.opacity !== undefined && f.opacity !== 1) fd.opacity = Math.round(f.opacity * 100) / 100;
          } else if (f.type === "GRADIENT_LINEAR" || f.type === "GRADIENT_RADIAL" || f.type === "GRADIENT_ANGULAR") {
            fd.gradientStops = f.gradientStops ? f.gradientStops.map(function(gs) {
              return { color: rgbToHex(gs.color), position: Math.round(gs.position * 100) / 100 };
            }) : [];
            // Extract gradient angle from gradientTransform matrix
            try {
              if (f.gradientTransform && f.type === "GRADIENT_LINEAR") {
                var gt = f.gradientTransform;
                var angle = Math.round(Math.atan2(gt[1][0], gt[0][0]) * 180 / Math.PI);
                fd.gradientAngle = ((angle % 360) + 360) % 360;
              }
            } catch(e2) {}
          } else if (f.type === "IMAGE") {
            fd.scaleMode = f.scaleMode || "FILL";
            fd.imageHash = f.imageHash || null;
          }
          info.fills.push(fd);
        }
      }
    }
  } catch(e) { /* skip fills */ }

  // ── Stroke (all strokes, not just first solid) ──
  try {
    if ("strokes" in node && node.strokes && node.strokes.length) {
      var strokes = node.strokes;
      if (strokes.length === 1 && strokes[0].type === "SOLID") {
        info.stroke = rgbToHex(strokes[0].color);
        if (node.strokeWeight) info.strokeWeight = node.strokeWeight;
        if (node.strokeAlign) info.strokeAlign = node.strokeAlign;
      } else {
        info.strokes = strokes.map(function(s) {
          var sd = { type: s.type };
          if (s.type === "SOLID") sd.color = rgbToHex(s.color);
          if (s.opacity !== undefined && s.opacity !== 1) sd.opacity = Math.round(s.opacity * 100) / 100;
          return sd;
        });
        if (node.strokeWeight) info.strokeWeight = node.strokeWeight;
        if (node.strokeAlign) info.strokeAlign = node.strokeAlign;
      }
    }
  } catch(e) { /* skip strokes */ }

  // ── Corner radius (per-corner support) ──
  try {
    if ("cornerRadius" in node && node.cornerRadius !== 0) {
      if (typeof node.cornerRadius === "number") {
        info.cornerRadius = node.cornerRadius;
      } else {
        info.cornerRadius = {
          tl: node.topLeftRadius || 0, tr: node.topRightRadius || 0,
          br: node.bottomRightRadius || 0, bl: node.bottomLeftRadius || 0,
        };
      }
    }
  } catch(e) {}

  // ── Rotation ──
  try { if ("rotation" in node && node.rotation !== 0) info.rotation = Math.round(node.rotation * 100) / 100; } catch(e) {}

  // ── Opacity, visibility, blend mode, clip ──
  try { if ("opacity" in node && node.opacity !== 1) info.opacity = Math.round(node.opacity * 100) / 100; } catch(e) {}
  try { if ("visible" in node && !node.visible) info.visible = false; } catch(e) {}
  try { if ("blendMode" in node && node.blendMode !== "NORMAL" && node.blendMode !== "PASS_THROUGH") info.blendMode = node.blendMode; } catch(e) {}
  try { if ("clipsContent" in node && node.clipsContent) info.clipsContent = true; } catch(e) {}

  // ── Bound Variables (Design Tokens) — full only ──
  if (isFull) try {
    if (node.boundVariables) {
      var bv = {};
      var bvKeys = Object.keys(node.boundVariables);
      for (var bvi = 0; bvi < bvKeys.length; bvi++) {
        var bvk = bvKeys[bvi];
        var binding = node.boundVariables[bvk];
        if (binding) {
          // binding can be a single VariableAlias or array of them
          if (Array.isArray(binding)) {
            bv[bvk] = binding.map(function(b) { return b ? b.id : null; });
          } else {
            bv[bvk] = binding.id || null;
          }
        }
      }
      if (Object.keys(bv).length > 0) info.boundVariables = bv;
    }
  } catch(e) {}

  // ── Effects (shadows, blurs) — full only ──
  if (isFull) try {
    if ("effects" in node && node.effects && node.effects.length) {
      var effs = [];
      for (var ei = 0; ei < node.effects.length; ei++) {
        var eff = node.effects[ei];
        if (eff.visible === false) continue;
        var ed = { type: eff.type };
        if (eff.color) ed.color = rgbToHex(eff.color);
        if (eff.offset) ed.offset = { x: eff.offset.x, y: eff.offset.y };
        if (eff.radius !== undefined) ed.radius = eff.radius;
        if (eff.spread !== undefined) ed.spread = eff.spread;
        effs.push(ed);
      }
      if (effs.length) info.effects = effs;
    }
  } catch(e) {}

  // ── TEXT node — comprehensive extraction ──
  if (node.type === "TEXT") {
    try {
      info.content = node.characters;
      info.fill = getFillHex(node);
      info.fontSize = node.fontSize;
      info.fontFamily = node.fontName ? node.fontName.family : null;
      info.fontWeight = node.fontName ? node.fontName.style : null;
      if (node.lineHeight) {
        if (node.lineHeight.unit === "AUTO") info.lineHeight = "auto";
        else if (node.lineHeight.unit === "PERCENT") info.lineHeight = Math.round(node.lineHeight.value) + "%";
        else info.lineHeight = node.lineHeight.value;
      }
      if (node.letterSpacing && node.letterSpacing.value !== 0) info.letterSpacing = node.letterSpacing.value;
      info.textAlign = node.textAlignHorizontal;
      if (node.textAlignVertical && node.textAlignVertical !== "TOP") info.textAlignVertical = node.textAlignVertical;
      if (node.textDecoration && node.textDecoration !== "NONE") info.textDecoration = node.textDecoration;
      if (node.textTruncation && node.textTruncation !== "DISABLED") info.textTruncation = node.textTruncation;
      if (node.textAutoResize) info.textAutoResize = node.textAutoResize;
    } catch(e) {
      // Mixed text styles — extract per-segment with style runs
      try {
        info.content = node.characters;
        info.fill = getFillHex(node);
        info.textAlign = node.textAlignHorizontal;
        info.mixedStyles = true;

        // Extract style segments
        if (node.characters.length > 0) {
          var segments = [];
          var text = node.characters;
          var segStart = 0;

          for (var si = 0; si <= text.length; si++) {
            if (si === text.length || si > segStart) {
              // Check if style changed at this position
              var changed = (si === text.length);
              if (!changed && si > 0) {
                try {
                  var prevFont = node.getRangeFontName(si - 1, si);
                  var curFont = node.getRangeFontName(si, si + 1);
                  var prevSize = node.getRangeFontSize(si - 1, si);
                  var curSize = node.getRangeFontSize(si, si + 1);
                  if (prevFont.family !== curFont.family || prevFont.style !== curFont.style || prevSize !== curSize) changed = true;
                  // Check fill change
                  try {
                    var prevFills = node.getRangeFills(si - 1, si);
                    var curFills = node.getRangeFills(si, si + 1);
                    if (prevFills[0] && curFills[0] && prevFills[0].type === "SOLID" && curFills[0].type === "SOLID") {
                      if (rgbToHex(prevFills[0].color) !== rgbToHex(curFills[0].color)) changed = true;
                    }
                  } catch(e4) {}
                } catch(e5) {}
              }

              if (changed && segStart < si) {
                var seg = { text: text.substring(segStart, si) };
                try {
                  var sFont = node.getRangeFontName(segStart, segStart + 1);
                  seg.fontFamily = sFont.family;
                  seg.fontWeight = sFont.style;
                  seg.fontSize = node.getRangeFontSize(segStart, segStart + 1);
                  var sFills = node.getRangeFills(segStart, segStart + 1);
                  if (sFills && sFills[0] && sFills[0].type === "SOLID") seg.fill = rgbToHex(sFills[0].color);
                } catch(e6) {}
                segments.push(seg);
                segStart = si;
              }
            }
          }

          if (segments.length > 1) {
            info.segments = segments;
            // Use first segment as representative
            info.fontFamily = segments[0].fontFamily;
            info.fontWeight = segments[0].fontWeight;
            info.fontSize = segments[0].fontSize;
            info.fill = segments[0].fill;
          } else if (segments.length === 1) {
            info.fontFamily = segments[0].fontFamily;
            info.fontWeight = segments[0].fontWeight;
            info.fontSize = segments[0].fontSize;
            info.fill = segments[0].fill;
          }
        }
      } catch(e2) { info.content = node.characters || ""; }
    }
  }

  // ── Auto Layout (comprehensive) ──
  try {
    if ("layoutMode" in node && node.layoutMode !== "NONE") {
      var pt = node.paddingTop, pr = node.paddingRight, pb = node.paddingBottom, pl = node.paddingLeft;
      info.layout = {
        mode:    node.layoutMode,
        itemSpacing: node.itemSpacing,
        align:   node.primaryAxisAlignItems,
        crossAlign: node.counterAxisAlignItems,
        paddingTop: pt, paddingRight: pr, paddingBottom: pb, paddingLeft: pl,
      };
      // Counter axis spacing (gap between wrapped rows/columns)
      try { if (node.counterAxisSpacing !== undefined && node.counterAxisSpacing !== 0) info.layout.counterAxisSpacing = node.counterAxisSpacing; } catch(e2) {}
      // Sizing modes
      if (node.primaryAxisSizingMode) info.layout.primarySizing = node.primaryAxisSizingMode;
      if (node.counterAxisSizingMode) info.layout.counterSizing = node.counterAxisSizingMode;
      if (node.layoutWrap && node.layoutWrap !== "NO_WRAP") info.layout.wrap = node.layoutWrap;
    }
  } catch(e) {}

  // ── Child layout properties ──
  try { if ("layoutAlign" in node && node.layoutAlign && node.layoutAlign !== "INHERIT") info.layoutAlign = node.layoutAlign; } catch(e) {}
  try { if ("layoutGrow" in node && node.layoutGrow !== 0) info.layoutGrow = node.layoutGrow; } catch(e) {}
  try { if ("layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE") info.layoutPositioning = "ABSOLUTE"; } catch(e) {}

  // ── Constraints ──
  try {
    if ("constraints" in node && node.constraints) {
      var ch = node.constraints.horizontal, cv = node.constraints.vertical;
      if ((ch && ch !== "MIN") || (cv && cv !== "MIN")) {
        info.constraints = { horizontal: ch, vertical: cv };
      }
    }
  } catch(e) {}

  // ── Applied style references (Issue #3: expose textStyleId / fillStyleId) ──
  try { if (node.textStyleId && typeof node.textStyleId === "string") info.textStyleId = node.textStyleId; } catch(e) {}
  try { if (node.fillStyleId && typeof node.fillStyleId === "string") info.fillStyleId = node.fillStyleId; } catch(e) {}
  try { if (node.strokeStyleId && typeof node.strokeStyleId === "string") info.strokeStyleId = node.strokeStyleId; } catch(e) {}
  try { if (node.effectStyleId && typeof node.effectStyleId === "string") info.effectStyleId = node.effectStyleId; } catch(e) {}
  try { if (node.gridStyleId && typeof node.gridStyleId === "string") info.gridStyleId = node.gridStyleId; } catch(e) {}

  // ── Component-specific info ──
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    try { info.description = node.description; } catch(e) {}
    // Expose component property definitions for COMPONENT/COMPONENT_SET
    try {
      if (node.componentPropertyDefinitions) {
        var defs = node.componentPropertyDefinitions;
        var defKeys = Object.keys(defs);
        if (defKeys.length > 0) {
          info.componentPropertyDefinitions = {};
          for (var di = 0; di < defKeys.length; di++) {
            var dk = defKeys[di];
            var d = defs[dk];
            info.componentPropertyDefinitions[dk] = { type: d.type, defaultValue: d.defaultValue };
          }
        }
      }
    } catch(e) {}
  }
  if (node.type === "INSTANCE") {
    // Issue #2: expose source component reference
    try {
      var mainComp = node.mainComponent;
      if (mainComp) { info.componentName = mainComp.name; info.componentId = mainComp.id; }
    } catch(e) {}
    try { if (node.overrides && node.overrides.length) info.overrideCount = node.overrides.length; } catch(e) {}
    // Issue #4: expose explicit component property values on this instance
    try {
      if (node.componentProperties) {
        var props = node.componentProperties;
        var propKeys = Object.keys(props);
        if (propKeys.length > 0) {
          info.componentPropertyValues = {};
          for (var pi = 0; pi < propKeys.length; pi++) {
            var pk = propKeys[pi];
            var pv = props[pk];
            info.componentPropertyValues[pk] = { type: pv.type, value: pv.value };
          }
        }
      }
    } catch(e) {}
  }

  // ── VECTOR / BOOLEAN_OPERATION ──
  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") {
    try { if (node.vectorPaths) info.pathCount = node.vectorPaths.length; } catch(e) {}
  }

  // ── Image detection — flag nodes with image fills (compact+full) ──
  if ((isCompact || isFull) && hasImageFill(node)) {
    info.hasImage = true;
    info.imageHint = "Use figma_read screenshot with nodeId to extract this image";
  }

  // ── Icon detection — flag small vector/instance nodes (compact+full) ──
  if ((isCompact || isFull) && isLikelyIcon(node)) {
    info.isIcon = true;
    info.iconHint = "Use figma_read export_svg with nodeId to extract SVG markup";
  }

  // ── Children ──
  if (node && typeof node === "object" && "children" in node && Array.isArray(node.children) && node.children.length) {
    if (depth >= maxDepth) {
      // At depth limit: summarize instead of truncating to empty []
      info.childCount = node.children.length;
      var texts = collectTextContent(node, 15);
      if (texts.length) info.textContent = texts;
      var icons = collectIconNames(node, 10);
      if (icons.length) info.iconNames = icons;
    } else {
      info.children = node.children
        .map(function(c) { return extractDesignTree(c, depth + 1, maxDepth, detailLevel); })
        .filter(Boolean);
    }
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
