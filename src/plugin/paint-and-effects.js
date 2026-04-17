// ─── Gradients (BUG-11) ─────────────────────────────────────────────────────
// Build a GRADIENT_LINEAR or GRADIENT_RADIAL paint from an AI-friendly spec.
// spec: { type: "LINEAR_GRADIENT" | "RADIAL_GRADIENT",
//         angle?: deg, stops: [{ pos: 0..1, color: "#hex", opacity?: 0..1 }] }
function buildGradientPaint(spec) {
  if (!spec || typeof spec !== "object") return null;
  var t = String(spec.type || "").toUpperCase();
  if (t !== "LINEAR_GRADIENT" && t !== "RADIAL_GRADIENT" &&
      t !== "GRADIENT_LINEAR" && t !== "GRADIENT_RADIAL" &&
      t !== "LINEAR" && t !== "RADIAL") return null;

  var stops = spec.stops || [];
  if (!stops.length) return null;

  var gradientStops = stops.map(function(s) {
    var rgb = hexToRgb(s.color);
    var extracted = extractColorAlpha(s.color);
    var a = s.opacity !== undefined ? s.opacity : (extracted !== null ? extracted : 1);
    return {
      position: Math.min(1, Math.max(0, s.position !== undefined ? s.position : (s.pos !== undefined ? s.pos : 0))),
      color: { r: rgb.r, g: rgb.g, b: rgb.b, a: a }
    };
  });

  // gradientTransform: 2x3 matrix. angle=0° → L→R; angle=90° → T→B.
  var angle = (spec.angle !== undefined) ? spec.angle : 90;
  var rad = angle * Math.PI / 180;
  var cos = Math.cos(rad), sin = Math.sin(rad);
  var gradientTransform = [
    [cos, sin, (1 - cos - sin) / 2],
    [-sin, cos, (1 + sin - cos) / 2]
  ];

  var isRadial = (t === "RADIAL_GRADIENT" || t === "GRADIENT_RADIAL" || t === "RADIAL");
  return {
    type: isRadial ? "GRADIENT_RADIAL" : "GRADIENT_LINEAR",
    gradientStops: gradientStops,
    gradientTransform: gradientTransform,
  };
}

// ─── Effects (BUG-10) ───────────────────────────────────────────────────────
// Build Figma effect object from AI-friendly spec.
// spec: { type: "DROP_SHADOW"|"INNER_SHADOW"|"LAYER_BLUR"|"BACKGROUND_BLUR",
//         color?, offset?: {x,y}, radius?, spread?, visible?, blendMode? }
function buildEffect(spec) {
  if (!spec || typeof spec !== "object") return null;
  var t = String(spec.type || "").toUpperCase();
  var radius = spec.radius !== undefined ? spec.radius : (spec.blur !== undefined ? spec.blur : 4);

  if (t === "LAYER_BLUR" || t === "BLUR") {
    return { type: "LAYER_BLUR", radius: radius, visible: spec.visible !== false };
  }
  if (t === "BACKGROUND_BLUR" || t === "BG_BLUR") {
    return { type: "BACKGROUND_BLUR", radius: radius, visible: spec.visible !== false };
  }
  // DROP_SHADOW / INNER_SHADOW
  var shadowType = (t === "INNER_SHADOW") ? "INNER_SHADOW" : "DROP_SHADOW";
  var color = spec.color || "#000000";
  var rgb = hexToRgb(color);
  var alpha = spec.opacity !== undefined ? spec.opacity
             : (extractColorAlpha(color) !== null ? extractColorAlpha(color) : 0.25);
  var offsetX = (spec.offset && spec.offset.x !== undefined) ? spec.offset.x
              : (spec.offsetX !== undefined ? spec.offsetX : 0);
  var offsetY = (spec.offset && spec.offset.y !== undefined) ? spec.offset.y
              : (spec.offsetY !== undefined ? spec.offsetY : 4);
  return {
    type: shadowType,
    color: { r: rgb.r, g: rgb.g, b: rgb.b, a: alpha },
    offset: { x: offsetX, y: offsetY },
    radius: radius,
    spread: spec.spread || 0,
    visible: spec.visible !== false,
    blendMode: spec.blendMode || "NORMAL",
  };
}

function applyEffects(node, effectsSpec) {
  if (!("effects" in node)) return;
  var specs = Array.isArray(effectsSpec) ? effectsSpec : [effectsSpec];
  var built = specs.map(buildEffect).filter(function(e) { return e !== null; });
  node.effects = built;
}

// Accept either hex string or gradient spec. Returns Figma fills array.
function buildFillArray(fillSpec, fillOpacity) {
  if (!fillSpec) return [];
  if (typeof fillSpec === "string") return solidFill(fillSpec, fillOpacity);
  if (typeof fillSpec === "object" && (fillSpec.type || fillSpec.stops)) {
    var gp = buildGradientPaint(fillSpec);
    if (gp) return [gp];
  }
  return [];
}

// ─── Individual corner radii (BUG-13) ───────────────────────────────────────
function applyCornerRadii(node, params) {
  if (params.cornerRadius !== undefined && "cornerRadius" in node) {
    node.cornerRadius = params.cornerRadius;
  }
  var corners = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"];
  for (var ci = 0; ci < corners.length; ci++) {
    var key = corners[ci];
    if (params[key] !== undefined && key in node) {
      node[key] = params[key];
    }
  }
}
