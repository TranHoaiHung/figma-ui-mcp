
# figma-ui-mcp — Design Rules 10–20 + Component Reuse

---

### Rule 10 — Layout Quality Standards

**Padding & Spacing:**
- Cards: min 16px all sides (20px recommended)
- List items: min 12px vertical, 16-20px horizontal
- Buttons: min 12px vertical, 24px horizontal
- Never flush against container edges

**Text:**
- Button text: ALWAYS centered (auto-layout CENTER/CENTER)
- Long text: ALWAYS set `width` → wraps automatically (`textAutoResize: "HEIGHT"`)
- Multi-line: `lineHeight` = 1.4–1.6× fontSize

**Borders:** Card borders: `stroke: "#E0E0E0", strokeWeight: 1`

**Shadow for elevated cards:**
```js
// Draw shadow BEFORE card (layer order rule)
await figma.create({ type: "RECTANGLE", parentId: root.id,
  x: cardX + 2, y: cardY + 4, width: cardWidth, height: cardHeight,
  fill: "#000000", cornerRadius: cardRadius, opacity: 0.08 });
// Then draw card on top
```

---

### Rule 11 — Centered Profile Layouts
```js
// CORRECT: full-width text with CENTER align
await figma.create({ type: "TEXT", parentId: rootId,
  x: 0, y: 202, width: frameWidth,   // FULL width of parent
  content: "Profile Name", fontSize: 22, fontWeight: "Bold",
  textAlign: "CENTER" });
// For centered badge: x = (frameWidth - badgeWidth) / 2
```

---

### Rule 12 — Key-Value Info Rows
NEVER place label+value as one text string. Use separate nodes in horizontal auto-layout:
```js
var row = await figma.create({
  type: "FRAME", parentId: parentId, height: 36,
  layoutMode: "HORIZONTAL", primaryAxisAlignItems: "MIN",
  counterAxisAlignItems: "CENTER", itemSpacing: 8, layoutAlign: "STRETCH"
});
await figma.create({ type: "TEXT", parentId: row.id, content: "Name:", fontSize: 13,
  fontWeight: "Regular", fill: "#8B8FA3", width: 110 });
await figma.create({ type: "TEXT", parentId: row.id, content: "John Doe", fontSize: 13,
  fontWeight: "Medium", fill: "#F0F2F5", layoutGrow: 1 });
```
Row height: simple key-value min 36px, with icon min 40px.

---

### Rule 13 — Container Height Calculation
```
height = paddingTop + paddingBottom + (n × childH) + ((n-1) × spacing)
```
Use `primaryAxisSizingMode: "AUTO"` to auto-grow. Always verify with screenshot.

---

### Rule 14 — Score/Match Result Cards
```js
var scoreRow = await figma.create({
  type: "FRAME", height: 32, layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "SPACE_BETWEEN", counterAxisAlignItems: "CENTER",
  paddingLeft: 8, paddingRight: 8, layoutAlign: "STRETCH"
});
```

---

### Rule 15 — Button Variants System

| Variant | Fill | Text | Border |
|---------|------|------|--------|
| Solid | brand color | white | none |
| Flat | brand 10% opacity | brand | none |
| Bordered | transparent | brand | 1px brand |
| Ghost | transparent | brand | none |
| Light | #F5F6FA | #1E3150 | none |

**Size scale:**
| Size | Height | paddingX | fontSize | cornerRadius |
|------|--------|----------|----------|--------------|
| sm | 32px | 12px | 12px | 8px |
| md | 40px | 16px | 14px | 12px |
| lg | 48px | 24px | 16px | 14px |

---

### Rule 16 — Consistent Spacing Scale
Use ONLY: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48px. Never random values.

---

### Rule 17 — Border Radius Consistency
| Element | cornerRadius |
|---------|-------------|
| Small chips/tags | 4–6px |
| Input fields | 8px |
| Buttons | 8–12px |
| Cards | 12–16px |
| Large panels | 16–24px |
| Full round | 9999px |

**Nested radius rule:** inner = outer - padding. (Card 16px, padding 8px → inner 8px)

---

### Rule 18 — Shadow/Elevation System
| Level | Effect |
|-------|--------|
| flat | No shadow |
| sm | 0 1px 2px rgba(0,0,0,0.05) |
| md | 0 4px 6px rgba(0,0,0,0.07) |
| lg | 0 10px 15px rgba(0,0,0,0.1) |

Dark themes: use border (1px #2A2B45) instead of shadows.

---

### Rule 19 — Semantic Color Usage
| Role | Light | Dark |
|------|-------|------|
| Primary | #006FEE | #338EF7 |
| Success | #17C964 | #45D483 |
| Warning | #F5A524 | #F7B750 |
| Danger | #F31260 | #F54180 |
| Default | #71717A | #A1A1AA |

All semantic colors must pair with white text (#FFFFFF) for WCAG AA (4.5:1).

---

### Rule 20 — Component State Indicators
| State | Visual change |
|-------|--------------|
| Default | Base |
| Hover | opacity 0.8–0.9 |
| Focused | 2px ring/stroke |
| Disabled | opacity: 0.5 |
| Loading | Spinner SVG |

---

## COMPONENT REUSE RULE (CRITICAL)

**Before drawing ANY screen:**
1. Check `get_page_nodes` for existing "⚙️ Components" frame
2. If not → create it first (x: -600, outside visible screens)
3. Create master components inside via `figma.createComponent()`
4. Use `figma.clone({ id: componentId })` for instances

**Must be components:** bottom nav, app header, status bar, CTA buttons, cards, badges, icon containers.

```js
// 1. Create Components frame once
var compFrame = await figma.create({
  type: "FRAME", name: "⚙️ Components", x: -600, y: 0,
  width: 500, height: 800, fill: "#1A1A2E",
  layoutMode: "VERTICAL", itemSpacing: 40,
  paddingTop: 40, paddingLeft: 24, paddingRight: 24, paddingBottom: 40,
  primaryAxisSizingMode: "AUTO", counterAxisSizingMode: "FIXED"
});

// 2. Build frame, then convert to component
var navFrame = await figma.create({ type: "FRAME", name: "nav/bottom-bar",
  parentId: compFrame.id, width: 350, height: 64, fill: "#0A0F24",
  cornerRadius: 22, layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "SPACE_BETWEEN", counterAxisAlignItems: "CENTER",
  paddingLeft: 28, paddingRight: 28 });
var navComp = await figma.createComponent({ nodeId: navFrame.id, name: "nav/bottom-bar" });

// 3. Clone on every screen
var navInst = await figma.clone({ id: navComp.id, parentId: screenFrame.id, x: 20, y: 746 });
```

**Rules:**
- Name components with slash notation: `nav/bottom-bar`, `btn/primary`, `card/idea`
- ALWAYS check `get_local_components` before creating new ones
- Clone first then `figma.modify()` text children for variant content
