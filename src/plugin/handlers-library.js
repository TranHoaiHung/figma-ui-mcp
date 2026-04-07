// ─── DESIGN LIBRARY HANDLERS ──────────────────────────────────────────────────

var LIBRARY_NAME = "\uD83C\uDFA8 Design Library";
var LIBRARY_X = -2000;
var LIBRARY_Y = 0;

handlers.ensure_library = async function() {
  var existing = figma.currentPage.findOne(function(n) { return n.name === LIBRARY_NAME && n.type === "FRAME"; });
  if (existing) return { id: existing.id, name: existing.name, existed: true };

  // Create library frame off-canvas
  var lib = figma.createFrame();
  lib.name = LIBRARY_NAME;
  lib.resize(1600, 900);
  lib.x = LIBRARY_X;
  lib.y = LIBRARY_Y;
  lib.fills = [{ type: "SOLID", color: { r: 0.08, g: 0.08, b: 0.1 } }];

  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });

  // Section: Colors
  var colorsLabel = figma.createText();
  colorsLabel.characters = "COLORS";
  colorsLabel.fontName = { family: "Inter", style: "Bold" };
  colorsLabel.fontSize = 11;
  colorsLabel.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.5 } }];
  colorsLabel.x = 24; colorsLabel.y = 24;
  lib.appendChild(colorsLabel);

  // Default color palette
  var defaultColors = [
    { name: "bg-base",        hex: "#0F1117", x: 24  },
    { name: "bg-surface",     hex: "#191C24", x: 84  },
    { name: "bg-elevated",    hex: "#1E2233", x: 144 },
    { name: "accent-purple",  hex: "#6366F1", x: 204 },
    { name: "positive-green", hex: "#00C896", x: 264 },
    { name: "negative-red",   hex: "#FF4560", x: 324 },
    { name: "text-primary",   hex: "#E8ECF4", x: 384 },
    { name: "text-secondary", hex: "#6B7280", x: 444 },
    { name: "border",         hex: "#1E2233", x: 504 },
  ];

  for (var ci = 0; ci < defaultColors.length; ci++) {
    var c = defaultColors[ci];
    var rgb = hexToRgb(c.hex);
    var swatch = figma.createRectangle();
    swatch.name = "color/" + c.name;
    swatch.resize(48, 48);
    swatch.x = c.x; swatch.y = 44;
    swatch.cornerRadius = 8;
    swatch.fills = [{ type: "SOLID", color: rgb }];
    lib.appendChild(swatch);

    var swatchLabel = figma.createText();
    swatchLabel.characters = c.name;
    swatchLabel.fontName = { family: "Inter", style: "Regular" };
    swatchLabel.fontSize = 9;
    swatchLabel.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.6 } }];
    swatchLabel.x = c.x; swatchLabel.y = 98;
    lib.appendChild(swatchLabel);
  }

  // Section: Text Styles
  var textLabel = figma.createText();
  textLabel.characters = "TEXT STYLES";
  textLabel.fontName = { family: "Inter", style: "Bold" };
  textLabel.fontSize = 11;
  textLabel.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.5 } }];
  textLabel.x = 24; textLabel.y = 130;
  lib.appendChild(textLabel);

  var textStyles = [
    { name: "heading-2xl", size: 32, weight: "Bold",    fill: "#E8ECF4" },
    { name: "heading-xl",  size: 24, weight: "Bold",    fill: "#E8ECF4" },
    { name: "heading-lg",  size: 20, weight: "Bold",    fill: "#E8ECF4" },
    { name: "heading-md",  size: 16, weight: "SemiBold",fill: "#E8ECF4" },
    { name: "body-md",     size: 14, weight: "Regular", fill: "#E8ECF4" },
    { name: "body-sm",     size: 12, weight: "Regular", fill: "#9CA3AF" },
    { name: "caption",     size: 11, weight: "Regular", fill: "#6B7280" },
    { name: "label",       size: 11, weight: "Medium",  fill: "#6B7280" },
  ];

  var txY = 152;
  for (var ti = 0; ti < textStyles.length; ti++) {
    var ts = textStyles[ti];
    var style = ts.weight === "SemiBold" ? "Semi Bold" : ts.weight;
    await figma.loadFontAsync({ family: "Inter", style: style });
    var tn = figma.createText();
    tn.name = "text/" + ts.name;
    tn.characters = "Aa — " + ts.name + " / " + ts.size + "px";
    tn.fontName = { family: "Inter", style: style };
    tn.fontSize = ts.size;
    tn.fills = solidFill(ts.fill);
    tn.x = 24; tn.y = txY;
    lib.appendChild(tn);
    txY += ts.size + 16;
  }

  return { id: lib.id, name: lib.name, existed: false };
};

handlers.get_library_tokens = async function() {
  var lib = figma.currentPage.findOne(function(n) { return n.name === LIBRARY_NAME && n.type === "FRAME"; });
  if (!lib) return { error: "Library not found. Call ensure_library() first.", colors: [], textStyles: [] };

  var colors = [];
  var textStyles = [];

  var children = lib.children || [];
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (child.name && child.name.indexOf("color/") === 0 && child.type === "RECTANGLE") {
      colors.push({ name: child.name.replace("color/", ""), hex: getFillHex(child) || "#000000" });
    }
    if (child.name && child.name.indexOf("text/") === 0 && child.type === "TEXT") {
      textStyles.push({
        name: child.name.replace("text/", ""),
        fontSize: child.fontSize,
        fontWeight: child.fontName ? child.fontName.style : "Regular",
        fill: getFillHex(child) || "#ffffff",
      });
    }
  }

  return { libraryId: lib.id, colors: colors, textStyles: textStyles };
};
