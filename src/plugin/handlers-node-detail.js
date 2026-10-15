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
      // A dashed stroke is a decision, and it was the one stroke property this
      // reader dropped. The write side has forwarded `dashPattern` since BUG-17,
      // so a border drawn through this bridge could not be read back as it was
      // drawn. Worse, `get_css` asserted `solid` for every stroke, so an
      // agent reading faithfully rendered a dashed affordance as a solid one and
      // every other field — colour, weight, radius, size — agreed with it.
      // Empty array means solid; it is omitted rather than reported as [].
      if (node.dashPattern && node.dashPattern.length) {
        detail.dashPattern = Array.prototype.slice.call(node.dashPattern);
      }
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
    // readTextProps handles the figma.mixed Symbol on every property. The old
    // code did `node.fontSize + "px"`, which throws a TypeError on a mixed node,
    // and the catch then discarded colour, alignment and the resolved font too.
    var tp = readTextProps(node);
    detail.content = tp.content;
    detail.color = getFillHex(node);
    if (tp.fontSize !== null) detail.fontSize = tp.fontSize + "px";
    detail.fontFamily = tp.fontFamily;
    detail.fontWeight = tp.fontWeight;
    var detLh = formatLineHeight(tp.lineHeight, "normal");
    if (detLh !== null) detail.lineHeight = detLh;
    if (!tp.letterSpacing.mixed && tp.letterSpacing.value) detail.letterSpacing = tp.letterSpacing.value + "px";
    detail.textAlign = tp.textAlign;
    if (tp.anyMixed) {
      detail.mixedStyles = tp.mixed;
      if (tp.mixed.font) detail.mixedFonts = true;
      var detSegs = readTextSegments(node);
      if (detSegs) detail.segments = detSegs;
    }
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
