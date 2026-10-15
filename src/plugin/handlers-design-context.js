// ─── HANDLERS DESIGN CONTEXT ───
// handlers.get_design_context — design-to-code context for a subtree.
// Split out of handlers-read-detail.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

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
        // Same omission as get_node_detail had: a consumer of this context had
        // no way to learn a border was dashed, from any read path on the bridge.
        if (nd.dashPattern && nd.dashPattern.length) {
          ctx.stroke.dashPattern = Array.prototype.slice.call(nd.dashPattern);
        }
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
        // This call site kept the pre-readFontName idiom, so a mixed node left
        // fontFamily/fontWeight absent here even after the other paths were fixed.
        var ctxTp = readTextProps(nd);
        ctx.text = { content: ctxTp.content };
        if (nd.textStyleId && styleNameMap[nd.textStyleId]) ctx.text.style = styleNameMap[nd.textStyleId];
        ctx.text.fontSize = ctxTp.fontSize;
        ctx.text.fontFamily = ctxTp.fontFamily;
        ctx.text.fontWeight = ctxTp.fontWeight;
        var ctxLh = formatLineHeight(ctxTp.lineHeight, null);
        if (ctxLh !== null) ctx.text.lineHeight = ctxLh;
        ctx.text.color = resolveFill(nd);
        ctx.text.align = ctxTp.textAlign;
        if (ctxTp.anyMixed) ctx.text.mixedStyles = ctxTp.mixed;
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
