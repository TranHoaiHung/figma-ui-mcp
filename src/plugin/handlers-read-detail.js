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

  // clipsContent resolved here so get_css does not need a second node fetch
  try { if ("clipsContent" in node && node.clipsContent) detail.clipsContent = true; } catch(e) {}

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

  // P1: Resolve bound variables → name + resolvedType + value (not just IDs)
  try {
    if (node.boundVariables) {
      var bv = {};
      var bvKeys = Object.keys(node.boundVariables);
      for (var bvi = 0; bvi < bvKeys.length; bvi++) {
        var bvk = bvKeys[bvi];
        var binding = node.boundVariables[bvk];
        if (!binding) continue;
        var bindings = Array.isArray(binding) ? binding : [binding];
        var resolved = [];
        for (var bi = 0; bi < bindings.length; bi++) {
          var alias = bindings[bi];
          if (!alias || !alias.id) continue;
          var entry = { id: alias.id };
          try {
            var variable = await figma.variables.getVariableByIdAsync(alias.id);
            if (variable) {
              entry.name = variable.name;
              entry.resolvedType = variable.resolvedType;
              // Get first mode value as preview
              var modeIds = Object.keys(variable.valuesByMode);
              if (modeIds.length > 0) {
                var val = variable.valuesByMode[modeIds[0]];
                if (val && typeof val === "object" && "r" in val) entry.value = rgbToHex(val);
                else entry.value = val;
              }
            }
          } catch(e2) {}
          resolved.push(entry);
        }
        if (resolved.length > 0) bv[bvk] = Array.isArray(binding) ? resolved : resolved[0];
      }
      if (Object.keys(bv).length > 0) detail.boundVariables = bv;
    }
  } catch(e) {}

  // P4: Resolve style IDs → name + values (not just opaque IDs)
  try {
    if (node.textStyleId && typeof node.textStyleId === "string") {
      detail.textStyleId = node.textStyleId;
      try {
        var ts = await figma.getStyleByIdAsync(node.textStyleId);
        if (ts) detail.textStyle = { name: ts.name, fontSize: ts.fontSize, fontFamily: ts.fontName ? ts.fontName.family : null, fontWeight: ts.fontName ? ts.fontName.style : null };
      } catch(e2) {}
    }
  } catch(e) {}
  try {
    if (node.fillStyleId && typeof node.fillStyleId === "string") {
      detail.fillStyleId = node.fillStyleId;
      try {
        var fs = await figma.getStyleByIdAsync(node.fillStyleId);
        if (fs) {
          var fsHex = null;
          if (fs.paints && fs.paints.length && fs.paints[0].type === "SOLID") fsHex = rgbToHex(fs.paints[0].color);
          detail.fillStyle = { name: fs.name, hex: fsHex };
        }
      } catch(e2) {}
    }
  } catch(e) {}
  try { if (node.strokeStyleId && typeof node.strokeStyleId === "string") detail.strokeStyleId = node.strokeStyleId; } catch(e) {}
  try { if (node.effectStyleId && typeof node.effectStyleId === "string") detail.effectStyleId = node.effectStyleId; } catch(e) {}

  // Instance: source component reference + property values + overrides + P5 variantLabel
  if (node.type === "INSTANCE") {
    try {
      var instComp = node.mainComponent;
      if (instComp) {
        detail.componentId = instComp.id;
        detail.componentName = instComp.name;
        // P5: componentSetName + variantLabel — split "Button/State=Primary, Size=Large"
        if (instComp.parent && instComp.parent.type === "COMPONENT_SET") {
          detail.componentSetName = instComp.parent.name;
          // variantLabel = part of component name after the set name
          var setName = instComp.parent.name;
          var compName = instComp.name;
          detail.variantLabel = compName.indexOf(setName) === 0 ? compName.slice(setName.length).replace(/^[,\s/]+/, "") : compName;
        }
      }
    } catch(e) {}
    // P3: Full override list instead of just count
    try {
      if (node.overrides && node.overrides.length) {
        detail.overrides = node.overrides.map(function(ov) {
          return { id: ov.id, overriddenFields: ov.overriddenFields || [] };
        });
        detail.overrideCount = node.overrides.length;
      }
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

// P2: get_css — return a ready-to-use CSS string for a single node
// Covers: layout (flex), spacing, typography, fills, stroke, radius, shadow, opacity, position
handlers.get_css = async function(params) {
  // Reuse get_node_detail to get all structured data, then format as CSS
  var detail = await handlers.get_node_detail(params);
  var lines = [];

  // Position — only emit absolute positioning for non-auto-layout nodes (flex children use flow)
  if (!detail.css) {
    lines.push("position: absolute;");
    if (detail.x !== undefined) lines.push("left: " + detail.x + "px;");
    if (detail.y !== undefined) lines.push("top: " + detail.y + "px;");
  }
  if (detail.width !== undefined) lines.push("width: " + detail.width + "px;");
  if (detail.height !== undefined) lines.push("height: " + detail.height + "px;");

  // Layout (flex)
  if (detail.css) {
    var c = detail.css;
    if (c.display) lines.push("display: " + c.display + ";");
    if (c.flexDirection) lines.push("flex-direction: " + c.flexDirection + ";");
    if (c.gap) lines.push("gap: " + c.gap + ";");
    if (c.alignItems) lines.push("align-items: " + c.alignItems + ";");
    if (c.justifyContent) lines.push("justify-content: " + c.justifyContent + ";");
    if (c.padding && c.padding !== "0px 0px 0px 0px") lines.push("padding: " + c.padding + ";");
  }

  // Background / fill
  if (detail.fills && detail.fills.length) {
    var f = detail.fills[0];
    if (f.type === "SOLID") {
      var bg = f.color;
      if (f.opacity !== undefined && f.opacity !== 1) {
        // Convert hex + opacity to rgba
        var r2 = parseInt(bg.slice(1, 3), 16);
        var g2 = parseInt(bg.slice(3, 5), 16);
        var b2 = parseInt(bg.slice(5, 7), 16);
        bg = "rgba(" + r2 + ", " + g2 + ", " + b2 + ", " + f.opacity + ")";
      }
      lines.push("background-color: " + bg + ";");
    } else if (f.type === "GRADIENT_LINEAR" && f.gradientStops) {
      var stops = f.gradientStops.map(function(s) { return s.color + " " + Math.round(s.position * 100) + "%"; }).join(", ");
      lines.push("background: linear-gradient(" + (f.gradientAngle || 0) + "deg, " + stops + ");");
    }
  }

  // Stroke / border
  if (detail.stroke) lines.push("border: " + (detail.strokeWeight || 1) + "px solid " + detail.stroke + ";");

  // Border radius
  if (detail.borderRadius) lines.push("border-radius: " + detail.borderRadius + ";");

  // Effects
  if (detail.boxShadow) lines.push("box-shadow: " + detail.boxShadow + ";");
  if (detail.filter) lines.push("filter: " + detail.filter + ";");
  if (detail.backdropFilter) lines.push("backdrop-filter: " + detail.backdropFilter + ";");

  // Opacity / blend
  if (detail.opacity !== undefined) lines.push("opacity: " + detail.opacity + ";");
  if (detail.blendMode) lines.push("mix-blend-mode: " + detail.blendMode.toLowerCase().replace(/_/g, "-") + ";");

  // Typography (TEXT nodes)
  if (detail.color) lines.push("color: " + detail.color + ";");
  if (detail.fontSize) lines.push("font-size: " + detail.fontSize + ";");
  if (detail.fontFamily) lines.push("font-family: \"" + detail.fontFamily + "\", sans-serif;");
  if (detail.fontWeight) {
    var weightMap = { "Thin": 100, "ExtraLight": 200, "Light": 300, "Regular": 400, "Medium": 500, "SemiBold": 600, "Bold": 700, "ExtraBold": 800, "Black": 900 };
    var wNum = weightMap[detail.fontWeight] || detail.fontWeight;
    lines.push("font-weight: " + wNum + ";");
  }
  if (detail.lineHeight) lines.push("line-height: " + detail.lineHeight + ";");
  if (detail.letterSpacing) lines.push("letter-spacing: " + detail.letterSpacing + ";");
  if (detail.textAlign) lines.push("text-align: " + detail.textAlign.toLowerCase() + ";");
  if (detail.textDecoration) lines.push("text-decoration: " + detail.textDecoration.toLowerCase() + ";");

  // Rotation
  if (detail.rotation) lines.push("transform: rotate(" + detail.rotation + "deg);");

  // Overflow clip — reuse clipsContent resolved in get_node_detail (no second node fetch)
  if (detail.clipsContent) lines.push("overflow: hidden;");

  return {
    nodeId: detail.id,
    name: detail.name,
    type: detail.type,
    css: lines.join("\n"),
    // Also return structured detail for programmatic use
    detail: detail,
  };
};

// get_design_context — AI-optimized design-to-code payload for a node/selection
// Returns: flex layout semantics, token-resolved colors, typography, component instances
// Much more code-ready than get_design (raw tree) or get_css (single string)
handlers.get_design_context = async function(params) {
  var id = params ? (params.id || params.nodeId) : null;
  var nodeName = params ? (params.name || params.nodeName) : null;
  var node = null;
  if (id) node = await findNodeByIdAsync(id);
  if (!node && nodeName) node = figma.currentPage.findOne(function(n) { return n.name === nodeName; });
  if (!node) {
    // Fall back to current selection
    var sel = figma.currentPage.selection;
    node = sel && sel.length > 0 ? sel[0] : null;
  }
  if (!node) throw new Error("No node specified and nothing selected. Pass nodeId or select a node.");

  // Build variable name lookup: variableId → name
  // Use getLocalVariablesAsync (single call) instead of per-ID fetches — avoids O(n²) await loop
  var varNameMap = {};
  try {
    var localVars = await figma.variables.getLocalVariablesAsync();
    for (var lvi = 0; lvi < localVars.length; lvi++) {
      var lv = localVars[lvi];
      if (lv) varNameMap[lv.id] = lv.name;
    }
  } catch(e) {}

  // Build style name lookup: styleId → name
  var styleNameMap = {};
  try {
    var pStyles = await figma.getLocalPaintStylesAsync();
    pStyles.forEach(function(s) { styleNameMap[s.id] = s.name; });
    var tStyles = await figma.getLocalTextStylesAsync();
    tStyles.forEach(function(s) { styleNameMap[s.id] = s.name; });
  } catch(e) {}

  // Resolve fill to token name or hex
  function resolveFill(nd) {
    if (!nd) return null;
    try {
      if (nd.fillStyleId && styleNameMap[nd.fillStyleId]) return "var(--" + styleNameMap[nd.fillStyleId].replace(/\//g, "-") + ")";
      if (nd.boundVariables && nd.boundVariables.fills) {
        var bvf = Array.isArray(nd.boundVariables.fills) ? nd.boundVariables.fills[0] : nd.boundVariables.fills;
        if (bvf && bvf.id && varNameMap[bvf.id]) return "var(--" + varNameMap[bvf.id].replace(/\//g, "-") + ")";
      }
      return getFillHex(nd);
    } catch(e) { return null; }
  }

  // Resolve a single node to its code-ready context shape
  function nodeContext(nd, depth) {
    if (!nd || nd.visible === false) return null;
    var ctx = { id: nd.id, name: nd.name, type: nd.type };

    // Layout
    try {
      if (nd.layoutMode && nd.layoutMode !== "NONE") {
        var alignMap = { "MIN": "flex-start", "CENTER": "center", "MAX": "flex-end", "SPACE_BETWEEN": "space-between" };
        ctx.layout = {
          display: "flex",
          flexDirection: nd.layoutMode === "HORIZONTAL" ? "row" : "column",
          gap: nd.itemSpacing + "px",
          alignItems: alignMap[nd.counterAxisAlignItems] || nd.counterAxisAlignItems,
          justifyContent: alignMap[nd.primaryAxisAlignItems] || nd.primaryAxisAlignItems,
          padding: nd.paddingTop + "px " + nd.paddingRight + "px " + nd.paddingBottom + "px " + nd.paddingLeft + "px",
          wrap: nd.layoutWrap === "WRAP" ? "wrap" : "nowrap",
        };
      }
    } catch(e) {}

    // Size
    try { ctx.size = { width: Math.round(nd.width), height: Math.round(nd.height) }; } catch(e) {}

    // Fill (token-resolved)
    var fillVal = resolveFill(nd);
    if (fillVal) ctx.fill = fillVal;

    // Stroke
    try {
      if (nd.strokes && nd.strokes.length && nd.strokes[0].type === "SOLID") {
        ctx.stroke = { color: rgbToHex(nd.strokes[0].color), weight: nd.strokeWeight };
      }
    } catch(e) {}

    // Corner radius
    try {
      if ("cornerRadius" in nd && nd.cornerRadius) ctx.borderRadius = nd.cornerRadius + "px";
    } catch(e) {}

    // Opacity / effects
    try { if (nd.opacity !== undefined && nd.opacity !== 1) ctx.opacity = nd.opacity; } catch(e) {}
    try {
      if (nd.effects && nd.effects.length) {
        ctx.effects = nd.effects.filter(function(e) { return e.visible !== false; }).map(function(e) {
          var ed = { type: e.type };
          if (e.color) ed.color = "rgba(" + Math.round(e.color.r*255) + "," + Math.round(e.color.g*255) + "," + Math.round(e.color.b*255) + "," + Math.round((e.color.a||1)*100)/100 + ")";
          if (e.offset) { ed.offsetX = e.offset.x; ed.offsetY = e.offset.y; }
          if (e.radius) ed.radius = e.radius;
          return ed;
        });
      }
    } catch(e) {}

    // Text
    if (nd.type === "TEXT") {
      try {
        ctx.text = { content: nd.characters };
        if (nd.textStyleId && styleNameMap[nd.textStyleId]) ctx.text.style = styleNameMap[nd.textStyleId];
        ctx.text.fontSize = nd.fontSize;
        ctx.text.fontFamily = nd.fontName ? nd.fontName.family : null;
        ctx.text.fontWeight = nd.fontName ? nd.fontName.style : null;
        if (nd.lineHeight && nd.lineHeight.unit !== "AUTO") ctx.text.lineHeight = nd.lineHeight.value + (nd.lineHeight.unit === "PERCENT" ? "%" : "px");
        ctx.text.color = resolveFill(nd);
        ctx.text.align = nd.textAlignHorizontal ? nd.textAlignHorizontal.toLowerCase() : null;
      } catch(e) {}
    }

    // Component instance
    if (nd.type === "INSTANCE") {
      try {
        var mc = nd.mainComponent;
        if (mc) {
          ctx.component = { name: mc.name };
          if (mc.parent && mc.parent.type === "COMPONENT_SET") {
            ctx.component.set = mc.parent.name;
            ctx.component.variant = mc.name.indexOf(mc.parent.name) === 0
              ? mc.name.slice(mc.parent.name.length).replace(/^[,\s/]+/, "")
              : mc.name;
          }
          if (nd.componentProperties) {
            var props = {};
            var pks = Object.keys(nd.componentProperties);
            for (var pi = 0; pi < pks.length; pi++) props[pks[pi]] = nd.componentProperties[pks[pi]].value;
            ctx.component.properties = props;
          }
        }
      } catch(e) {}
    }

    // Children (limited depth to avoid token overflow)
    if (depth < 4 && nd.children && nd.children.length) {
      ctx.children = [];
      for (var i = 0; i < nd.children.length; i++) {
        var child = nodeContext(nd.children[i], depth + 1);
        if (child) ctx.children.push(child);
      }
    } else if (nd.children && nd.children.length) {
      ctx.childCount = nd.children.length;
    }

    return ctx;
  }

  var context = nodeContext(node, 0);

  // Summary tokens used in this subtree (for code scaffolding)
  // Use plain objects instead of Set — Figma sandbox ES5 compatibility
  var usedColors = {}, usedTextStyles = {}, usedComponents = {};
  function collectUsed(nd) {
    if (!nd) return;
    if (nd.fill && nd.fill.indexOf("var(--") === 0) usedColors[nd.fill] = 1;
    if (nd.text && nd.text.style) usedTextStyles[nd.text.style] = 1;
    if (nd.component) usedComponents[nd.component.set || nd.component.name] = 1;
    if (nd.children) {
      for (var cui = 0; cui < nd.children.length; cui++) collectUsed(nd.children[cui]);
    }
  }
  collectUsed(context);

  return {
    nodeId: node.id,
    name: node.name,
    type: node.type,
    context: context,
    summary: {
      tokensUsed: Object.keys(usedColors),
      textStylesUsed: Object.keys(usedTextStyles),
      componentsUsed: Object.keys(usedComponents),
    },
    hint: "Use context.layout for flex CSS, context.fill for token-resolved colors, context.component for React component mapping, context.text.style for typography class names.",
  };
};

// get_component_map — list every component instance in a frame with variant properties
// Use this to map Figma components to their code equivalents
handlers.get_component_map = async function(params) {
  var id = params ? (params.id || params.nodeId) : null;
  var nodeName = params ? (params.name || params.nodeName) : null;
  var node = null;
  if (id) node = await findNodeByIdAsync(id);
  if (!node && nodeName) node = figma.currentPage.findOne(function(n) { return n.name === nodeName; });
  if (!node) {
    var sel = figma.currentPage.selection;
    node = sel && sel.length > 0 ? sel[0] : figma.currentPage;
  }

  // Find all INSTANCE nodes in subtree
  var instances = [];
  function walkInstances(nd) {
    if (!nd) return;
    if (nd.type === "INSTANCE") {
      var entry = { id: nd.id, name: nd.name, x: Math.round(nd.x), y: Math.round(nd.y), width: Math.round(nd.width), height: Math.round(nd.height) };
      try {
        var mc = nd.mainComponent;
        if (mc) {
          entry.componentName = mc.name;
          entry.componentKey = mc.key || null;
          if (mc.parent && mc.parent.type === "COMPONENT_SET") {
            entry.componentSetName = mc.parent.name;
            entry.variantLabel = mc.name.indexOf(mc.parent.name) === 0
              ? mc.name.slice(mc.parent.name.length).replace(/^[,\s/]+/, "")
              : mc.name;
          }
        }
      } catch(e) {}
      try {
        if (nd.componentProperties) {
          var props = {};
          var pks = Object.keys(nd.componentProperties);
          for (var pi = 0; pi < pks.length; pi++) props[pks[pi]] = nd.componentProperties[pks[pi]].value;
          if (Object.keys(props).length > 0) entry.properties = props;
        }
      } catch(e) {}
      // Suggested import path based on component name convention
      var cname = entry.componentSetName || entry.componentName || "";
      var cnameLast = cname ? cname.split("/").slice(-1)[0].replace(/[^a-zA-Z0-9]/g, "") : "";
      entry.suggestedImport = cname ? "import { " + cnameLast + " } from '@/components/" + cnameLast + "'" : null;
      instances.push(entry);
    }
    if (nd.children) nd.children.forEach(walkInstances);
  }
  walkInstances(node);

  // Deduplicate by componentName for summary
  var uniqueComponents = {};
  instances.forEach(function(inst) {
    var key = inst.componentSetName || inst.componentName || inst.name;
    if (key && !uniqueComponents[key]) uniqueComponents[key] = { name: key, count: 0, suggestedImport: inst.suggestedImport };
    if (key) uniqueComponents[key].count++;
  });

  return {
    frameId: node.id,
    frameName: node.name,
    totalInstances: instances.length,
    instances: instances,
    uniqueComponents: Object.values(uniqueComponents),
    hint: "suggestedImport is a best-guess based on component name. Adjust the import path to match your actual codebase structure.",
  };
};

// get_unmapped_components — find component instances with no description (likely no code mapping)
// Helps AI ask: "do you have a Button component in your codebase?"
handlers.get_unmapped_components = async function(params) {
  var mapResult = await handlers.get_component_map(params);
  var allLocalComps = await handlers.get_local_components();

  // Build set of components that have descriptions (likely mapped)
  var described = new Set();
  allLocalComps.components.forEach(function(c) { if (c.description && c.description.trim()) described.add(c.name); });
  allLocalComps.componentSets.forEach(function(s) { if (s.description && s.description.trim()) described.add(s.name); });

  // Filter to only unique components that are used in frame but have no description
  var unmapped = mapResult.uniqueComponents.filter(function(uc) { return !described.has(uc.name); });
  var mapped = mapResult.uniqueComponents.filter(function(uc) { return described.has(uc.name); });

  return {
    frameId: mapResult.frameId,
    frameName: mapResult.frameName,
    totalUsed: mapResult.uniqueComponents.length,
    unmapped: unmapped.map(function(u) { return { name: u.name, count: u.count, suggestedImport: u.suggestedImport }; }),
    mapped: mapped.map(function(u) { return { name: u.name, count: u.count }; }),
    hint: unmapped.length > 0
      ? "These " + unmapped.length + " components have no description. Add a code import path to each component's description in Figma (e.g. '@/components/Button') so get_component_map can suggest accurate imports."
      : "All components in this frame have descriptions — fully mapped.",
  };
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
