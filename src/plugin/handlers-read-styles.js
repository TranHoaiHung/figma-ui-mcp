// ─── HANDLERS READ STYLES ───
// Local styles and component listings.
// Split out of handlers-read-detail.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

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
