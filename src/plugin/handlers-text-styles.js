// ─── HANDLERS TEXT STYLES ───
// handlers.applyTextStyle.
// Split out of handlers-tokens.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

handlers.applyTextStyle = async function(params) {
  var nodeId = params.nodeId || params.id;
  var styleName = params.styleName || params.name;
  var styleId = params.styleId;

  if (!nodeId) throw new Error("nodeId is required");
  if (!styleId && !styleName) throw new Error("styleName or styleId is required");

  var node = await findNodeByIdAsync(nodeId);
  if (!node) throw new Error("Node not found: " + nodeId);
  if (node.type !== "TEXT") throw new Error("applyTextStyle requires a TEXT node, got: " + node.type);

  var resolvedStyleId = styleId;
  if (!resolvedStyleId) {
    // BUG-01: only use async API
    var styles = await figma.getLocalTextStylesAsync();
    if (!styles) throw new Error("Could not list text styles");
    for (var i = 0; i < styles.length; i++) {
      if (styles[i].name === styleName) { resolvedStyleId = styles[i].id; break; }
    }
    if (!resolvedStyleId) {
      throw new Error("Text style not found: \"" + styleName + "\". Available: " +
        styles.map(function(s) { return s.name; }).join(", "));
    }
  }

  try {
    var styleObj = await figma.getStyleByIdAsync ? await figma.getStyleByIdAsync(resolvedStyleId) : figma.getStyleById(resolvedStyleId);
    if (styleObj && styleObj.fontName) {
      await figma.loadFontAsync(styleObj.fontName);
    }
  } catch (e) {}

  if (node.setTextStyleIdAsync) {
    await node.setTextStyleIdAsync(resolvedStyleId);
  } else {
    node.textStyleId = resolvedStyleId;
  }

  return {
    nodeId: node.id,
    nodeName: node.name,
    styleId: resolvedStyleId,
    styleName: styleName || null,
  };
};

// ─── COMPONENT PROPERTY DEFINITIONS (v2.5.22) ────────────────────────────────
// Creates the master-side property definitions (TEXT/BOOLEAN/INSTANCE_SWAP) that
// instance overrides flow through. Without these, setting `instance.characters`
// or instance overrides won't trigger auto-layout recalculation, because Figma
// only re-measures when content arrives via a bound component property.
//
// Variant properties (type "VARIANT") are intentionally not creatable here —
// Figma manages those through ComponentSet children and `combineAsVariants()`.

// Resolve "PropName" to "PropName#1:2" by searching componentPropertyDefinitions.
// Figma appends a unique `#id` suffix to every property; APIs that consume the
// name (componentPropertyReferences, deleteComponentProperty) require the
// fully-qualified form. Pass it in directly and it's returned unchanged.
