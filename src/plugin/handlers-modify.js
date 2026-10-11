// ─── HANDLERS MODIFY ───
// handlers.modify.
// Split out of handlers-write.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

handlers.modify = async (params) => {
  const node = await resolveNode(params);
  var nodeRef = params.id || params.nodeId || params.targetId || params.name || params.nodeName;
  if (!node) {
    var keys = Object.keys(params || {});
    throw new Error("Node not found: " + nodeRef + ". Received params keys: [" + keys.join(", ") + "]. Use id or name field.");
  }
  if (node.removed) throw new Error("Node was deleted: " + nodeRef);

  if (params.fontColor !== undefined && params.fill === undefined) params.fill = params.fontColor;
  if (params.fill     !== undefined && "fills"   in node) node.fills   = buildFillArray(params.fill, params.fillOpacity);
  if (params.fillOpacity !== undefined && params.fill === undefined && "fills" in node && node.fills && node.fills.length) {
    var existingFills = JSON.parse(JSON.stringify(node.fills));
    existingFills[0].opacity = params.fillOpacity;
    node.fills = existingFills;
  }
  // BUG-18: accept both `stroke` and `strokeColor` aliases in modify
  var modifyStroke = params.stroke !== undefined ? params.stroke : (params.strokeColor !== undefined ? params.strokeColor : undefined);
  if (modifyStroke !== undefined && "strokes" in node) {
    node.strokes = solidStroke(modifyStroke, params.strokeOpacity);
    if (params.strokeWeight !== undefined) node.strokeWeight = params.strokeWeight;
    if (params.strokeAlign !== undefined) node.strokeAlign = params.strokeAlign;
    if (params.strokeDashPattern && Array.isArray(params.strokeDashPattern)) node.dashPattern = params.strokeDashPattern;
  }
  if (params.x       !== undefined) node.x = params.x;
  if (params.y       !== undefined) node.y = params.y;
  if (params.opacity !== undefined) node.opacity = params.opacity;
  if (params.visible !== undefined) node.visible = params.visible;
  if (params.name    !== undefined) node.name = params.name;
  applyCornerRadii(node, params);
  if (params.effects !== undefined) {
    if (params.effects === null || (Array.isArray(params.effects) && params.effects.length === 0)) {
      if ("effects" in node) node.effects = [];
    } else {
      applyEffects(node, params.effects);
    }
  }

  if ((params.width !== undefined || params.height !== undefined) && "resize" in node) {
    node.resize(
      params.width  !== undefined ? params.width  : node.width,
      params.height !== undefined ? params.height : node.height
    );
  }

  if (node.type === "TEXT") {
    if (params.content !== undefined || params.fontWeight !== undefined || params.fontFamily !== undefined) {
      var curFont = readFontName(node);
      const family = params.fontFamily || curFont.family;
      const style = FONT_STYLE_MAP[params.fontWeight] || curFont.style;
      if (!family) throw new Error("Cannot resolve a font for text node " + node.id + " — pass fontFamily explicitly.");
      await figma.loadFontAsync({ family, style });
      node.fontName = { family, style };
      if (params.content !== undefined) {
        node.characters = params.content;
        if (params.width === undefined && params.textAutoResize === undefined &&
            node.textAutoResize !== "NONE") {
          node.textAutoResize = "WIDTH_AND_HEIGHT";
        }
        // Auto-promote layoutSizing so a hug-mode auto-layout parent actually
        // reflows in response to the new content. textAutoResize alone is
        // overridden by layoutSizingHorizontal:FIXED for auto-layout children.
        autoPromoteTextHugForReflow(node, params);
      }
    }
    if (params.fontSize !== undefined) node.fontSize = params.fontSize;
    if (params.textAlign !== undefined || params.textAlignVertical !== undefined || params.lineHeight !== undefined) {
      await ensureTextFontLoaded(node);
      if (params.textAlign         !== undefined) node.textAlignHorizontal = params.textAlign.toUpperCase();
      if (params.textAlignVertical !== undefined) node.textAlignVertical   = params.textAlignVertical.toUpperCase();
      if (params.lineHeight !== undefined) {
        node.lineHeight = (typeof params.lineHeight === "object" && params.lineHeight.unit)
          ? params.lineHeight
          : { value: params.lineHeight, unit: "PIXELS" };
      }
    }
  }

  // Auto Layout properties on FRAME
  if (node.type === "FRAME") {
    var removingLayout = params.layoutMode === "NONE" || params.layoutMode === null || params.layoutMode === "";
    if (params.layoutMode !== undefined) {
      node.layoutMode = removingLayout ? "NONE" : params.layoutMode;
    }
    // Only apply align/spacing when the frame actually has auto-layout active
    if (node.layoutMode !== "NONE") {
      if (params.primaryAxisAlignItems !== undefined) node.primaryAxisAlignItems = params.primaryAxisAlignItems;
      if (params.counterAxisAlignItems === "STRETCH") {
        throw new Error(
          "counterAxisAlignItems does not support \"STRETCH\". " +
          "Set counterAxisAlignItems: \"MIN\" and layoutAlign: \"STRETCH\" on each child."
        );
      }
      if (params.counterAxisAlignItems !== undefined) node.counterAxisAlignItems = params.counterAxisAlignItems;
    }
    if (params.padding !== undefined) {
      node.paddingTop = node.paddingBottom = node.paddingLeft = node.paddingRight = params.padding;
    }
    if (params.paddingHorizontal !== undefined) { node.paddingLeft = node.paddingRight = params.paddingHorizontal; }
    if (params.paddingVertical   !== undefined) { node.paddingTop  = node.paddingBottom = params.paddingVertical; }
    if (params.paddingTop    !== undefined) node.paddingTop    = params.paddingTop;
    if (params.paddingBottom !== undefined) node.paddingBottom = params.paddingBottom;
    if (params.paddingLeft   !== undefined) node.paddingLeft   = params.paddingLeft;
    if (params.paddingRight  !== undefined) node.paddingRight  = params.paddingRight;
    if (params.itemSpacing   !== undefined) node.itemSpacing   = params.itemSpacing;
    if (params.primaryAxisSizingMode !== undefined) node.primaryAxisSizingMode = params.primaryAxisSizingMode;
    if (params.counterAxisSizingMode !== undefined) node.counterAxisSizingMode = params.counterAxisSizingMode;
    if (params.clipsContent  !== undefined) node.clipsContent  = params.clipsContent;
  }

  applyChildLayout(node, params);

  return nodeToInfo(node);
};

// BUG-DEL-01: warn when deleting frames containing COMPONENT masters.
// Deleting a COMPONENT cascades: every INSTANCE of that component in the document
// is broken. Figma also has reported edge cases where deleting a frame containing
// component masters that bind variables can leave variable collections in an odd
// state. We don't block — the user might know what they're doing — but we surface
// the warning in the response so AI agents can confirm before proceeding.
