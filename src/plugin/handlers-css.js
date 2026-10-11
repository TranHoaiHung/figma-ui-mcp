// ─── HANDLERS CSS ───
// handlers.get_css — CSS translation of a node's properties.
// Split out of handlers-read-detail.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

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
