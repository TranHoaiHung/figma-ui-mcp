
# figma-ui-mcp — Design Tokens & Variables

---

## setupDesignTokens — Bootstrap complete token system (idempotent)

One call creates all variables. Existing variables get updated; new ones are created.

```js
const result = await figma.setupDesignTokens({
  collectionName: "Design Tokens",

  // COLOR variables
  colors: {
    "accent":       "#3B82F6",
    "bg-base":      "#08090E",
    "text-primary": "#F0F2F5",
    "positive":     "#00DC82",
  },

  // FLOAT variables (spacing, radius, etc.)
  numbers: {
    "spacing-xs": 4, "spacing-sm": 8, "spacing-md": 16, "spacing-lg": 24,
    "radius-sm": 8,  "radius-md": 12, "radius-lg": 16,
  },

  // FLOAT variables for typography (v2.5.4+)
  fontSizes: {
    "text-xs": 11, "text-sm": 12, "text-body": 14,
    "text-heading-md": 16, "text-heading-lg": 20, "text-heading-xl": 24,
  },

  // STRING variables for fonts (v2.5.4+)
  fonts: {
    "font-primary": "Inter",
    "font-display": "Playfair Display",
  },

  // Text styles that reference variables above — {curly-braces} binds to variable
  textStyles: {
    "text/heading-xl": { fontFamily: "{font-primary}", fontWeight: "Bold",
                         fontSize: "{text-heading-xl}", lineHeight: 32, letterSpacing: -0.4 },
    "text/body":       { fontFamily: "{font-primary}", fontWeight: "Regular",
                         fontSize: "{text-body}", lineHeight: 20 },
    "text/caption":    { fontFamily: "{font-primary}", fontWeight: "Regular",
                         fontSize: "{text-xs}", lineHeight: 16 },
  }
});
// → { collectionId, created: [...], updated: [...], textStyles: [...], totalVariables: N }

// Multi-mode: Light + Dark
await figma.setupDesignTokens({
  collectionName: "Design Tokens",
  modes: ["light", "dark"],
  colors: {
    "bg-base":      { light: "#FFFFFF",  dark: "#0F1117" },
    "text-primary": { light: "#111827",  dark: "#F9FAFB" },
    "accent":       { light: "#3B82F6",  dark: "#60A5FA" },
  }
});

// Multi-mode typography: Compact / Comfortable / Large
await figma.setupDesignTokens({
  collectionName: "Typography",
  modes: ["compact", "comfortable", "large"],
  fontSizes: {
    "text-body":       { compact: 12, comfortable: 14, large: 16 },
    "text-heading-xl": { compact: 22, comfortable: 24, large: 28 },
  }
});
// Switch frame mode:
await figma.setFrameVariableMode({ nodeId, collectionId, modeName: "large" });
```

---

## applyTextStyle — Apply a text style by name (v2.5.4+)

```js
var title = await figma.create({ type: "TEXT", content: "Dashboard", parentId: card.id });
await figma.applyTextStyle({ nodeId: title.id, styleName: "text/heading-xl" });
// → { nodeId, styleName, styleId }
```

Why use instead of inline props: font changes propagate, mode switches work, consistent across screens.

---

## modifyVariable — Change variable value (all bound nodes update)

```js
await figma.modifyVariable({ variableName: "accent", value: "#0EA5E9" });
await figma.modifyVariable({ variableId: "VariableID:57:671", value: "#FF6B35" });
await figma.modifyVariable({ variableName: "spacing-md", value: 20 });
await figma.modifyVariable({ variableName: "font-primary", value: "SF Pro" }); // font swap
```

---

## applyVariable — Bind a variable to a node property

```js
await figma.applyVariable({ nodeId: card.id, field: "fill",         variableId: varMap["accent"] });
await figma.applyVariable({ nodeId: card.id, field: "fill",         variableName: "accent" }); // by name
```

**Supported fields:**

| Field | Variable type | Notes |
|-------|--------------|-------|
| `fill` / `stroke` | COLOR | Binds to first solid paint |
| `opacity` | FLOAT | 0.0–1.0 |
| `width` / `height` | FLOAT | |
| `cornerRadius` | FLOAT | Alias → topLeftRadius |
| `topLeftRadius` / `topRightRadius` / `bottomLeftRadius` / `bottomRightRadius` | FLOAT | Individual corners |
| `strokeWeight` | FLOAT | |
| `itemSpacing` | FLOAT | Auto-layout gap |
| `paddingTop` / `paddingBottom` / `paddingLeft` / `paddingRight` | FLOAT | |
| `fontSize` / `letterSpacing` / `lineHeight` | FLOAT | TEXT only |
| `fontFamily` / `fontStyle` | STRING | v2.5.4+ font swap |
| `characters` | STRING | v2.5.4+ bind text content |
| `visible` | BOOLEAN | Show/hide |

```js
// Complete card binding
var bindings = [
  { nodeId: card.id, field: "fill",        varName: "bg-surface" },
  { nodeId: card.id, field: "cornerRadius", varName: "radius-md" },
  { nodeId: card.id, field: "paddingTop",   varName: "spacing-md" },
  { nodeId: card.id, field: "itemSpacing",  varName: "spacing-sm" },
  { nodeId: title.id, field: "fill",        varName: "text-primary" },
];
for (var bi = 0; bi < bindings.length; bi++) {
  var b = bindings[bi];
  if (varMap[b.varName])
    await figma.applyVariable({ nodeId: b.nodeId, field: b.field, variableId: varMap[b.varName] });
}
```

---

## Low-level Variable API

```js
// Create collection + variables + modes manually (prefer setupDesignTokens)
var colors = await figma.createVariableCollection({ name: "Colors" });
await figma.renameVariableMode({ collectionId: colors.id, modeId: colors.modes[0].id, newName: "Light" });
var dark = await figma.addVariableMode({ collectionId: colors.id, modeName: "Dark" });

var bgBase = await figma.createVariable({ name: "bg-base", collectionId: colors.id, resolvedType: "COLOR", value: "#FFFFFF" });
await figma.setVariableValue({ variableId: bgBase.id, modeId: dark.modeId, value: "#0F1117" });

await figma.applyVariable({ nodeId: card.id, field: "fill", variableId: bgBase.id });

await figma.setFrameVariableMode({ nodeId: frame.id, collectionId: colors.id, modeName: "Dark" });
await figma.clearFrameVariableMode({ nodeId: frame.id, collectionId: colors.id });

await figma.removeVariableMode({ collectionId: colors.id, modeId: dark.modeId });
```

---

## Paint & Text Styles

```js
await figma.createPaintStyle({ name: "color/primary", color: "#006FEE", description: "Primary brand" });
// → { id, name, key, color }

await figma.createTextStyle({ name: "text/heading-xl",
  fontFamily: "Inter", fontWeight: "Bold", fontSize: 24, lineHeight: 32, letterSpacing: -0.5 });
// → { id, name, key, fontSize }
```

---

## ensure_library & get_library_tokens

```js
const lib = await figma.ensure_library();
// → { id, existed } — creates "🎨 Design Library" frame if not present

const tokens = await figma.get_library_tokens();
// → { colors: [{name, hex}], textStyles: [{name, fontSize, fontWeight, fill}] }
```

---

## Effects, Gradients, Corner Radii, Hex Alpha

```js
// Effects
effects: [
  { type: "DROP_SHADOW", color: "#00000026", offset: {x:0,y:8}, radius: 24, spread: 0 },
  { type: "INNER_SHADOW", color: "#00000030", offset: {x:0,y:2}, radius: 4 },
  { type: "LAYER_BLUR", radius: 12 },
  { type: "BACKGROUND_BLUR", radius: 20 },  // needs fill with alpha < 1 (glass effect)
]
await figma.modify({ id: node, effects: [] });  // clear all

// Gradient fill
fill: { type: "LINEAR_GRADIENT", angle: 135,
  stops: [{ pos: 0, color: "#7C3AED" }, { pos: 1, color: "#EC4899" }] }
fill: { type: "RADIAL_GRADIENT",
  stops: [{ pos: 0, color: "#FFFFFF" }, { pos: 1, color: "#00000000" }] }

// Individual corner radii
topLeftRadius: 20, topRightRadius: 20, bottomLeftRadius: 0, bottomRightRadius: 0

// Hex alpha — 8-digit hex, alpha auto-applied
fill: "#FFFFFF80"    // 50% white
fill: "#6C5CE733"    // 20% accent
// Also: rgba(255,255,255,0.5)
```

---

## Mixed Text Segments

```js
// get_design / get_selection returns segments for mixed-style text:
{
  "type": "TEXT", "content": "8 đ 83 token", "mixedStyles": true,
  "segments": [
    { "text": "8 đ",      "fill": "#1E3150", "fontWeight": "Bold",    "fontSize": 14 },
    { "text": "83 token", "fill": "#8E9AAD", "fontWeight": "Regular", "fontSize": 14 }
  ]
}
```
