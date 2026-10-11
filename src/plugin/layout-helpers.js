// ─── LAYOUT HELPERS ───
// Shared property/auto-layout application used by create and modify.
// Split out of handlers-write.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

// ─── shared helpers ────────────────────────────────────────────────────────────

// Apply resize + fill + stroke + effects — shared by FRAME, RECT, ELLIPSE builders.
function applyCommonProps(node, params, width, height, fill, stroke, strokeWeight) {
  node.resize(width, height);
  node.fills = fill ? buildFillArray(fill, params.fillOpacity) : [];
  if (stroke) {
    node.strokes = solidStroke(stroke, params.strokeOpacity);
    node.strokeWeight = strokeWeight;
    if (params.strokeAlign) node.strokeAlign = params.strokeAlign;
    // BUG-17: forward strokeDashPattern to Figma dashPattern
    if (params.strokeDashPattern && Array.isArray(params.strokeDashPattern)) node.dashPattern = params.strokeDashPattern;
  }
  if (params.effects) applyEffects(node, params.effects);
}

// Apply auto-layout props to a FRAME node (create or modify path).
function applyAutoLayout(node, params) {
  if (!params.layoutMode || params.layoutMode === "NONE") return;
  node.layoutMode = params.layoutMode;
  if (params.counterAxisAlignItems === "STRETCH") {
    throw new Error(
      "counterAxisAlignItems does not support \"STRETCH\". " +
      "Set counterAxisAlignItems: \"MIN\" on the container and layoutAlign: \"STRETCH\" on each child."
    );
  }
  if (params.primaryAxisAlignItems) node.primaryAxisAlignItems = params.primaryAxisAlignItems;
  if (params.counterAxisAlignItems) node.counterAxisAlignItems = params.counterAxisAlignItems;

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

  node.primaryAxisSizingMode = params.primaryAxisSizingMode || "FIXED";
  node.counterAxisSizingMode = params.counterAxisSizingMode || "FIXED";
  if (params.clipsContent !== undefined) node.clipsContent = params.clipsContent;
}

// Apply child layout props (layoutAlign, layoutGrow, layoutSizing{H,V}) — works
// for both create and modify paths. layoutSizingHorizontal/Vertical control how
// a child sits inside an auto-layout parent (HUG | FIXED | FILL) and are the
// modern (post-2022) per-axis controls — they override textAutoResize for
// auto-layout children, so without them programmatically-changed text content
// can't push a hug-width parent to grow.
//
// Setting these on a node that's NOT inside an auto-layout parent throws in
// Figma, so we guard with the `in` check + a try/catch for the edge case where
// `in` reports true but the runtime still rejects (e.g. parent layoutMode is
// being changed in the same call).
function applyChildLayout(node, params) {
  if (params.layoutAlign !== undefined && "layoutAlign" in node) node.layoutAlign = params.layoutAlign;
  if (params.layoutGrow  !== undefined && "layoutGrow"  in node) node.layoutGrow  = params.layoutGrow;
  if (params.layoutSizingHorizontal !== undefined && "layoutSizingHorizontal" in node) {
    try { node.layoutSizingHorizontal = params.layoutSizingHorizontal; } catch (e) {}
  }
  if (params.layoutSizingVertical !== undefined && "layoutSizingVertical" in node) {
    try { node.layoutSizingVertical = params.layoutSizingVertical; } catch (e) {}
  }
}

// When TEXT content is changed on a node inside a hug-axis auto-layout parent,
// promote the text node's matching layoutSizing axis to HUG. Otherwise the
// parent's hug request is silently ignored because the child's
// layoutSizingHorizontal defaults to FIXED after parenting — and FIXED beats
// textAutoResize for auto-layout children. Without this, setComponentProperties
// (and direct modify with content) update the text but the button never grows.
//
// Best-effort: skipped when the user passed the axis explicitly, when the
// parent isn't hug-mode, or when Figma rejects the assignment.
function autoPromoteTextHugForReflow(node, params) {
  if (!node || node.type !== "TEXT") return;
  if (params.content === undefined) return;

  var parent = node.parent;
  if (!parent || !parent.layoutMode || parent.layoutMode === "NONE") return;

  var horizontal = parent.layoutMode === "HORIZONTAL";
  var parentHugsPrimary = parent.primaryAxisSizingMode === "AUTO" ||
    (horizontal ? parent.layoutSizingHorizontal === "HUG"
                : parent.layoutSizingVertical   === "HUG");
  if (!parentHugsPrimary) return;

  if (horizontal && params.layoutSizingHorizontal !== undefined) return;
  if (!horizontal && params.layoutSizingVertical !== undefined) return;

  try {
    if (horizontal && "layoutSizingHorizontal" in node) {
      node.layoutSizingHorizontal = "HUG";
    } else if (!horizontal && "layoutSizingVertical" in node) {
      node.layoutSizingVertical = "HUG";
    }
  } catch (e) {}
}

// Reusable base64 lookup table — built once, not per-call.
var _B64_LOOKUP = (function() {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var t = {};
  for (var i = 0; i < chars.length; i++) t[chars[i]] = i;
  return t;
})();
