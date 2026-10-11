
# figma-ui-mcp — Layout Rules

---

## AUTO LAYOUT (PREFERRED — NON-NEGOTIABLE for complex containers)

```js
await figma.create({
  type: "FRAME", name: "Button", parentId: root.id,
  x: 24, y: 100, width: 392, height: 52,
  fill: "#6C5CE7", cornerRadius: 12,
  layoutMode: "HORIZONTAL",           // "HORIZONTAL" | "VERTICAL"
  primaryAxisAlignItems: "CENTER",    // main axis: "MIN"|"CENTER"|"MAX"|"SPACE_BETWEEN"
  counterAxisAlignItems: "CENTER",    // cross axis: "MIN"|"CENTER"|"MAX"
  padding: 16,
  itemSpacing: 8,
})
```

**Common patterns:**
```
// Button with centered text:
layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER"

// Card with icon + text row:
layoutMode: "HORIZONTAL", primaryAxisAlignItems: "MIN", counterAxisAlignItems: "CENTER", paddingLeft: 16, itemSpacing: 12

// Vertical stack:
layoutMode: "VERTICAL", primaryAxisAlignItems: "MIN", counterAxisAlignItems: "MIN", itemSpacing: 8
// children: layoutAlign: "STRETCH"

// Centered icon in circle:
layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER"
```

**Child properties:**
```js
await figma.create({ ..., layoutAlign: "STRETCH" })  // fill parent width in vertical layout
await figma.create({ ..., layoutGrow: 1 })           // grow to fill available space
```

**Modify frame to auto-layout:**
```js
await figma.modify({ id: frameId, layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER" })
```

**Always use Auto Layout for:** buttons, cards with icon+text rows, tab bar items, list items, badge pills.

---

## BUTTON / INPUT CONSTRUCTION RULE

NEVER use RECTANGLE + TEXT as siblings. Always use FRAME with layoutMode:

```js
// WRONG
await figma.create({ type: "RECTANGLE", parentId: frame.id, x: 56, y: 808, width: 488, height: 58, fill: "#00C896", cornerRadius: 30 });
await figma.create({ type: "TEXT", parentId: frame.id, x: 180, y: 827, content: "Submit" }); // not truly centered

// CORRECT
var btn = await figma.create({
  type: "FRAME", parentId: frame.id, x: 56, y: 808, width: 488, height: 58,
  fill: "#00C896", cornerRadius: 30,
  layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER",
});
await figma.create({ type: "TEXT", parentId: btn.id, content: "Submit", fill: "#fff", fontSize: 16, fontWeight: "Bold" });
```

Applies to: buttons, inputs, tabs, chips, badges, nav items — ALL elements with background + content.

---

## CARD / SCREEN LAYOUT RULE

NEVER use absolute x/y for children inside a card. Use VERTICAL auto-layout:

```js
// CORRECT — VERTICAL auto-layout card
var card = await figma.create({
  type: "FRAME", name: "Card", width: 480, height: 610,
  layoutMode: "VERTICAL", primaryAxisAlignItems: "MIN",
  counterAxisAlignItems: "MIN",        // NOT "STRETCH" — invalid. Use "MIN" + layoutAlign: "STRETCH" on children
  paddingTop: 48, paddingBottom: 48, paddingLeft: 48, paddingRight: 48,
  itemSpacing: 16,
});

// Full-width children: layoutAlign STRETCH (no width needed)
await figma.create({ type: "FRAME", name: "Input", parentId: card.id,
  height: 52, layoutAlign: "STRETCH",
  layoutMode: "HORIZONTAL", counterAxisAlignItems: "CENTER",
  paddingLeft: 20, paddingRight: 20 });

// "or" divider row
var dividerRow = await figma.create({ type: "FRAME", parentId: card.id,
  height: 20, layoutAlign: "STRETCH",
  layoutMode: "HORIZONTAL", primaryAxisAlignItems: "SPACE_BETWEEN", counterAxisAlignItems: "CENTER" });
await figma.create({ type: "RECTANGLE", parentId: dividerRow.id, height: 1, layoutGrow: 1, fill: "#E0E0E0" });
await figma.create({ type: "TEXT", parentId: dividerRow.id, content: "or", fontSize: 12, fill: "#888" });
await figma.create({ type: "RECTANGLE", parentId: dividerRow.id, height: 1, layoutGrow: 1, fill: "#E0E0E0" });
```

**Card build order:** create frame → add children without x/y → full-width: `layoutAlign: "STRETCH"` → growing spacers: `layoutGrow: 1`

---

## DOT + TEXT / ICON + TEXT ROW ALIGNMENT RULE

ALWAYS use `counterAxisAlignItems: "CENTER"` for icon/dot next to text:
```
CORRECT: layoutMode: "HORIZONTAL", counterAxisAlignItems: "CENTER", itemSpacing: 12
WRONG:   counterAxisAlignItems: "MIN" → dot sits at top, misaligned
```

**Multi-line exception:** if dot/icon aligns with FIRST line only:
```
counterAxisAlignItems: "MIN"
icon paddingTop = (textLineHeight - iconSize) / 2
// e.g. text 22px, dot 8px → paddingTop = (22 - 8) / 2 = 7
```

---

## PROGRESS BAR RULE (CRITICAL)

Progress bars = TWO overlapping rectangles. Auto-layout stacks them side-by-side, NOT overlapping.
**ALWAYS wrap in a non-auto-layout frame:**

```js
// CORRECT — no layoutMode on wrapper → children overlap via absolute x,y
var pbWrap = await figma.create({
  type: "FRAME", name: "progress-bar", parentId: autoLayoutParent.id,
  width: 352, height: 6   // NO layoutMode
});
await figma.create({ type: "RECTANGLE", parentId: pbWrap.id, x: 0, y: 0, width: 352, height: 6, fill: "#E7EAF0", cornerRadius: 3 });
await figma.create({ type: "RECTANGLE", parentId: pbWrap.id, x: 0, y: 0, width: 211, height: 6, fill: "#6C5CE7", cornerRadius: 3 });

// WRONG — inside auto-layout: 352 + 211 = 563px total, not overlapping!
```

Applies to: progress bars, score rings, slider tracks, overlay badges.

---

## BADGE / PILL / TAG RULE

**Concern 1 — Text inside badge: use auto-layout CENTER/CENTER**
```js
var badge = await figma.create({
  type: "FRAME", name: "badge", parentId: parent.id,
  x: 100, y: 10, width: 64, height: 20, fill: "#E8FBF5", cornerRadius: 10,
  layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER"
});
await figma.create({ type: "TEXT", parentId: badge.id, content: "Free", fontSize: 10, fontWeight: "SemiBold", fill: "#00B894" });
```

**Concern 2 — Badge position on card corner: parent is ROOT, not the card**
```js
// badgeX = cardX + cardWidth - badgeWidth - 6
// badgeY = cardY + 6
var badge = await figma.create({ ..., parentId: rootFrame.id,
  x: cardX + cardWidth - 64 - 6, y: cardY + 6, ... });
// Badge is sibling of card, overlapping top-right corner via absolute positioning
```

---

## MOBILE BOTTOM ANCHORING RULE

Bottom elements (tab bar, FAB) MUST be calculated from frame bottom:
```
nav_bar_y = frameHeight - safeArea - navHeight  // e.g. 844 - 34 - 64 = 746
cta_y     = nav_bar_y - gap - ctaHeight         // e.g. 746 - 12 - 56 = 678
```

Standard iOS: safeArea = 34px, home indicator at y = frameH - 18.
NEVER hardcode y for bottom elements without calculating from frameHeight.

---

## HUG vs STRETCH CONFLICT RULE

HORIZONTAL child in VERTICAL parent that should fill width must use `primaryAxisSizingMode: "FIXED"`:
```js
// CORRECT — child stretches in parent
await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisSizingMode: "FIXED",   // accept parent width
  layoutAlign: "STRETCH" });        // fill parent cross-axis

// WRONG — AUTO overrides STRETCH
await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisSizingMode: "AUTO",    // hugs content → ignores STRETCH
  layoutAlign: "STRETCH" });
```

---

## CENTERED CONTENT MUST USE AUTO-LAYOUT

NEVER use manual `x = (containerW - childW) / 2` — it breaks when content changes.

```js
// CORRECT
var card = await figma.create({ type: "FRAME", width: 108, height: 108, fill: "#0D1229", cornerRadius: 18,
  layoutMode: "VERTICAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER",
  paddingTop: 16, paddingBottom: 14, itemSpacing: 8 });
// Children added without x/y — auto-centered

// WRONG
var card = await figma.create({ type: "FRAME", width: 108, height: 108 }); // no layoutMode
await figma.create({ type: "FRAME", parentId: card.id, x: 34, y: 16, ... }); // manual math = fragile
```

---

## ILLUSTRATION CENTERING + LAYER ORDER RULE

**Draw order: background → rings → center icon (last = on top)**
```js
var centerX = 140, centerY = 130;

// 1. Rings FIRST (bottom layers)
await figma.create({ type: "ELLIPSE", parentId: area.id,
  x: centerX - 110, y: centerY - 110, width: 220, height: 220 });
await figma.create({ type: "ELLIPSE", parentId: area.id,
  x: centerX - 80,  y: centerY - 80,  width: 160, height: 160 });

// 2. Center icon LAST (top layer)
await figma.create({ type: "FRAME", parentId: area.id,
  x: centerX - 50, y: centerY - 50, width: 100, height: 100 });
```

**Centering formula:**
```
element_x = centerX - (element_width / 2)
element_y = centerY - (element_height / 2)
```

---

## TEXT ALIGN vs LAYOUT ALIGN RULE

`layoutAlign: "STRETCH"` controls box size. `textAlign: "CENTER"` controls content. Both must be set:

```js
// CORRECT — box fills width AND content is centered
await figma.create({ type: "TEXT", parentId: card.id,
  content: "Centered heading", fontSize: 18, fill: "#FFFFFF",
  textAlign: "CENTER",    // content alignment
  layoutAlign: "STRETCH", // box fills parent width
  lineHeight: 26 });

// WRONG — box stretches but content stays LEFT (default)
await figma.create({ type: "TEXT", parentId: card.id,
  content: "Should center but won't", layoutAlign: "STRETCH" });
```

---

## TEXT WRAPPING IN AUTO-LAYOUT RULE

Text inside auto-layout overflows unless constrained. Always use `layoutAlign: "STRETCH"` on text that should wrap:

```js
// CORRECT
await figma.create({ type: "TEXT", parentId: textFrame.id,
  content: "Long text...", fontSize: 13, fill: "#E0E6F0", lineHeight: 18,
  layoutAlign: "STRETCH"  // constrains width → enables wrapping
});

// WRONG — text renders at natural width, overflows parent
await figma.create({ type: "TEXT", parentId: textFrame.id,
  content: "Long text...", fontSize: 13 });  // no layoutAlign
```

Use `layoutAlign: "STRETCH"` on: multi-line descriptions, paragraphs, text inside `layoutGrow: 1` parents.

---

## HEADER TITLE CENTERING RULE

Pattern [Left action] [Title] [Right action] — title must use `layoutGrow: 1` + `textAlign: "CENTER"`:

```js
var header = await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "SPACE_BETWEEN", counterAxisAlignItems: "CENTER" });
await figma.create({ type: "FRAME", parentId: header.id, width: 32, height: 32 }); // Left action
await figma.create({ type: "TEXT", parentId: header.id, content: "Title",
  fontSize: 17, fontWeight: "Bold", fill: "#FFFFFF",
  textAlign: "CENTER", layoutGrow: 1 });     // BOTH needed
await figma.create({ type: "FRAME", parentId: header.id, width: 77 });              // Right action
```

Applies to: modal headers, nav bars, any [action][title][action] pattern.
