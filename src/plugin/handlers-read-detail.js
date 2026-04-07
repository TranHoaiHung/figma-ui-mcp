// ─── READ DETAIL HANDLERS ─────────────────────────────────────────────────────

// get_node_detail — CSS-like properties for a single node (no tree traversal)
handlers.get_node_detail = async function(params) {
  // Accept id, nodeId, name, nodeName — try ID first then name fallback
  var id = params ? (params.id || params.nodeId) : null;
  var nodeName = params ? (params.name || params.nodeName) : null;
  var node = null;
  if (id) node = await findNodeByIdAsync(id);
  if (!node && nodeName) node = figma.currentPage.findOne(function(n) { return n.name === nodeName; });
  if (!node) throw new Error("Node not found: " + (id || nodeName || "no id/name given") + ". Use figma_read get_page_nodes to get current node IDs.");

  var detail = {
    id: node.id, name: node.name, type: node.type,
    x: Math.round(node.x), y: Math.round(node.y),
    width: Math.round(node.width), height: Math.round(node.height),
  };

  // Fill(s)
  try {
    if (node.fills && node.fills.length) {
      detail.fills = [];
      for (var fi = 0; fi < node.fills.length; fi++) {
        var f = node.fills[fi];
        if (f.visible === false) continue;
        var fd = { type: f.type };
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
        }
        detail.fills.push(fd);
      }
    }
  } catch(e) {}

  // Stroke (all strokes)
  try {
    if (node.strokes && node.strokes.length) {
      var dStrokes = node.strokes;
      if (dStrokes.length === 1 && dStrokes[0].type === "SOLID") {
        detail.stroke = rgbToHex(dStrokes[0].color);
      } else {
        detail.strokes = dStrokes.map(function(s) {
          var sd = { type: s.type };
          if (s.type === "SOLID") sd.color = rgbToHex(s.color);
          return sd;
        });
      }
      detail.strokeWeight = node.strokeWeight;
      detail.strokeAlign = node.strokeAlign;
    }
  } catch(e) {}

  // Corner radius
  try {
    if ("cornerRadius" in node && node.cornerRadius !== 0) {
      if (typeof node.cornerRadius === "number") {
        detail.borderRadius = node.cornerRadius + "px";
      } else {
        detail.borderRadius = (node.topLeftRadius || 0) + "px " + (node.topRightRadius || 0) + "px " + (node.bottomRightRadius || 0) + "px " + (node.bottomLeftRadius || 0) + "px";
      }
    }
  } catch(e) {}

  // Rotation
  try { if ("rotation" in node && node.rotation !== 0) detail.rotation = Math.round(node.rotation * 100) / 100; } catch(e) {}

  // Opacity, blendMode, visible
  try { if (node.opacity !== undefined && node.opacity !== 1) detail.opacity = Math.round(node.opacity * 100) / 100; } catch(e) {}
  try { if (node.blendMode && node.blendMode !== "NORMAL" && node.blendMode !== "PASS_THROUGH") detail.blendMode = node.blendMode; } catch(e) {}
  try { if ("visible" in node && !node.visible) detail.visible = false; } catch(e) {}

  // Effects → CSS boxShadow + filter (blur)
  try {
    if (node.effects && node.effects.length) {
      var shadows = [];
      var blurValues = [];
      for (var ei = 0; ei < node.effects.length; ei++) {
        var eff = node.effects[ei];
        if (eff.visible === false) continue;
        if (eff.type === "DROP_SHADOW" || eff.type === "INNER_SHADOW") {
          var c = eff.color;
          var rgba = "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + "," + (c.a !== undefined ? Math.round(c.a * 100) / 100 : 1) + ")";
          var prefix = eff.type === "INNER_SHADOW" ? "inset " : "";
          shadows.push(prefix + (eff.offset ? eff.offset.x : 0) + "px " + (eff.offset ? eff.offset.y : 0) + "px " + (eff.radius || 0) + "px " + (eff.spread || 0) + "px " + rgba);
        } else if (eff.type === "LAYER_BLUR") {
          blurValues.push("blur(" + (eff.radius || 0) + "px)");
        } else if (eff.type === "BACKGROUND_BLUR") {
          detail.backdropFilter = "blur(" + (eff.radius || 0) + "px)";
        }
      }
      if (shadows.length) detail.boxShadow = shadows.join(", ");
      if (blurValues.length) detail.filter = blurValues.join(" ");
    }
  } catch(e) {}

  // Layout / padding
  try {
    if (node.layoutMode && node.layoutMode !== "NONE") {
      var alignMap = { "MIN": "flex-start", "CENTER": "center", "MAX": "flex-end", "SPACE_BETWEEN": "space-between" };
      detail.css = {
        display: "flex",
        flexDirection: node.layoutMode === "HORIZONTAL" ? "row" : "column",
        gap: node.itemSpacing + "px",
        alignItems: alignMap[node.counterAxisAlignItems] || node.counterAxisAlignItems,
        justifyContent: alignMap[node.primaryAxisAlignItems] || node.primaryAxisAlignItems,
        padding: node.paddingTop + "px " + node.paddingRight + "px " + node.paddingBottom + "px " + node.paddingLeft + "px",
      };
    }
  } catch(e) {}

  // Text properties
  if (node.type === "TEXT") {
    try {
      detail.content = node.characters;
      detail.color = getFillHex(node);
      detail.fontSize = node.fontSize + "px";
      detail.fontFamily = node.fontName ? node.fontName.family : null;
      detail.fontWeight = node.fontName ? node.fontName.style : null;
      if (node.lineHeight) {
        if (node.lineHeight.unit === "AUTO") detail.lineHeight = "normal";
        else if (node.lineHeight.unit === "PERCENT") detail.lineHeight = Math.round(node.lineHeight.value) + "%";
        else detail.lineHeight = node.lineHeight.value + "px";
      }
      if (node.letterSpacing && node.letterSpacing.value !== 0) detail.letterSpacing = node.letterSpacing.value + "px";
      detail.textAlign = node.textAlignHorizontal ? node.textAlignHorizontal.toLowerCase() : null;
    } catch(e) { try { detail.content = node.characters; } catch(e2) {} }
  }

  // Bound variables
  try {
    if (node.boundVariables) {
      var bv = {};
      var bvKeys = Object.keys(node.boundVariables);
      for (var bvi = 0; bvi < bvKeys.length; bvi++) {
        var bvk = bvKeys[bvi];
        var binding = node.boundVariables[bvk];
        if (binding) {
          if (Array.isArray(binding)) bv[bvk] = binding.map(function(b) { return b ? b.id : null; });
          else bv[bvk] = binding.id || null;
        }
      }
      if (Object.keys(bv).length > 0) detail.boundVariables = bv;
    }
  } catch(e) {}

  // Applied style references (Issue #3: textStyleId / fillStyleId)
  try { if (node.textStyleId && typeof node.textStyleId === "string") detail.textStyleId = node.textStyleId; } catch(e) {}
  try { if (node.fillStyleId && typeof node.fillStyleId === "string") detail.fillStyleId = node.fillStyleId; } catch(e) {}
  try { if (node.strokeStyleId && typeof node.strokeStyleId === "string") detail.strokeStyleId = node.strokeStyleId; } catch(e) {}
  try { if (node.effectStyleId && typeof node.effectStyleId === "string") detail.effectStyleId = node.effectStyleId; } catch(e) {}

  // Instance: source component reference (Issue #2) + property values (Issue #4)
  if (node.type === "INSTANCE") {
    try {
      var instComp = node.mainComponent;
      if (instComp) { detail.componentId = instComp.id; detail.componentName = instComp.name; }
    } catch(e) {}
    try {
      if (node.componentProperties) {
        var iProps = node.componentProperties;
        var iPropKeys = Object.keys(iProps);
        if (iPropKeys.length > 0) {
          detail.componentPropertyValues = {};
          for (var ipi = 0; ipi < iPropKeys.length; ipi++) {
            var ipk = iPropKeys[ipi];
            var ipv = iProps[ipk];
            detail.componentPropertyValues[ipk] = { type: ipv.type, value: ipv.value };
          }
        }
      }
    } catch(e) {}
  }

  // Children count + text content summary
  if (node && typeof node === "object" && "children" in node && Array.isArray(node.children)) {
    detail.childCount = node.children.length;
    var texts = collectTextContent(node, 20);
    if (texts.length) detail.textContent = texts;
    var icons = collectIconNames(node, 10);
    if (icons.length) detail.iconNames = icons;
  }

  return detail;
};

// get_styles — read all local paint, text, effect, and grid styles
handlers.get_styles = async function() {
  var paintStyles = await figma.getLocalPaintStylesAsync();
  var textStyles = await figma.getLocalTextStylesAsync();
  var effectStyles = await figma.getLocalEffectStylesAsync();
  var gridStyles = await figma.getLocalGridStylesAsync();

  return {
    paintStyles: paintStyles.map(function(s) {
      var paints = s.paints || [];
      var hex = null;
      if (paints.length > 0 && paints[0].type === "SOLID") {
        hex = rgbToHex(paints[0].color);
      }
      return { id: s.id, name: s.name, hex: hex, type: "PAINT" };
    }),
    textStyles: textStyles.map(function(s) {
      return {
        id: s.id, name: s.name, type: "TEXT",
        fontSize: s.fontSize,
        fontFamily: s.fontName ? s.fontName.family : null,
        fontWeight: s.fontName ? s.fontName.style : null,
        lineHeight: s.lineHeight ? s.lineHeight.value : null,
        letterSpacing: s.letterSpacing ? s.letterSpacing.value : null,
      };
    }),
    effectStyles: effectStyles.map(function(s) {
      return { id: s.id, name: s.name, type: "EFFECT", effects: s.effects.length };
    }),
    gridStyles: gridStyles.map(function(s) {
      return { id: s.id, name: s.name, type: "GRID" };
    }),
  };
};

// get_local_components — enhanced component listing with descriptions and properties
handlers.get_local_components = async function() {
  await figma.loadAllPagesAsync();
  var comps = figma.root.findAllWithCriteria({ types: ["COMPONENT"] });
  var sets = figma.root.findAllWithCriteria({ types: ["COMPONENT_SET"] });

  return {
    components: comps.map(function(c) {
      var info = {
        id: c.id, name: c.name, key: c.key || null,
        description: c.description || "",
        width: Math.round(c.width), height: Math.round(c.height),
        page: c.parent ? (function findPage(n) {
          while (n && n.type !== "PAGE") n = n.parent;
          return n ? n.name : null;
        })(c) : null,
      };
      // Component properties (variant props)
      try {
        if (c.componentPropertyDefinitions) {
          var defs = c.componentPropertyDefinitions;
          var props = {};
          for (var key in defs) {
            if (Object.prototype.hasOwnProperty.call(defs, key)) {
              props[key] = { type: defs[key].type, defaultValue: defs[key].defaultValue };
              if (defs[key].variantOptions) props[key].options = defs[key].variantOptions;
            }
          }
          info.properties = props;
        }
      } catch(e) { /* skip properties */ }
      return info;
    }),
    componentSets: sets.map(function(s) {
      return {
        id: s.id, name: s.name, key: s.key || null,
        description: s.description || "",
        variantCount: s.children ? s.children.length : 0,
      };
    }),
    total: comps.length + sets.length,
  };
};

// get_viewport — current viewport position and zoom
handlers.get_viewport = async function() {
  var vp = figma.viewport;
  return {
    center: { x: Math.round(vp.center.x), y: Math.round(vp.center.y) },
    zoom: vp.zoom,
    bounds: vp.bounds ? {
      x: Math.round(vp.bounds.x), y: Math.round(vp.bounds.y),
      width: Math.round(vp.bounds.width), height: Math.round(vp.bounds.height),
    } : null,
  };
};

// set_viewport — navigate to specific area
handlers.set_viewport = async function(params) {
  if (params.nodeId || params.nodeName) {
    // Zoom to fit a specific node
    var node = params.nodeId ? (await findNodeByIdAsync(params.nodeId)) : findNodeByName(params.nodeName);
    if (!node) throw new Error("Node not found for viewport navigation");
    figma.viewport.scrollAndZoomIntoView([node]);
    return { scrolledTo: node.id, name: node.name };
  }
  if (params.center) {
    figma.viewport.center = { x: params.center.x, y: params.center.y };
  }
  if (params.zoom !== undefined) {
    figma.viewport.zoom = params.zoom;
  }
  return {
    center: { x: Math.round(figma.viewport.center.x), y: Math.round(figma.viewport.center.y) },
    zoom: figma.viewport.zoom,
  };
};

// get_variables — read Figma local variables (Design Tokens)
handlers.get_variables = async function() {
  var collections = [];
  try {
    var localCollections = await figma.variables.getLocalVariableCollectionsAsync();
    for (var ci = 0; ci < localCollections.length; ci++) {
      var col = localCollections[ci];
      var variables = [];
      for (var vi = 0; vi < col.variableIds.length; vi++) {
        var v = await figma.variables.getVariableByIdAsync(col.variableIds[vi]);
        if (!v) continue;
        var values = {};
        for (var modeId in v.valuesByMode) {
          if (Object.prototype.hasOwnProperty.call(v.valuesByMode, modeId)) {
            var val = v.valuesByMode[modeId];
            // Convert color values to hex
            if (val && typeof val === "object" && "r" in val && "g" in val && "b" in val) {
              values[modeId] = rgbToHex(val);
            } else {
              values[modeId] = val;
            }
          }
        }
        variables.push({
          id: v.id, name: v.name,
          resolvedType: v.resolvedType,
          values: values,
          description: v.description || "",
        });
      }
      collections.push({
        id: col.id, name: col.name,
        modes: col.modes.map(function(m) { return { id: m.modeId, name: m.name }; }),
        variables: variables,
      });
    }
  } catch(e) {
    return { error: "Variables API not available: " + e.message, collections: [] };
  }
  return { collections: collections };
};
