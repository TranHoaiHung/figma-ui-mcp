
# figma-ui-mcp — Images & Icons

---

## figma.loadImage(url, opts)

Download image from URL, place on canvas:

```js
// Hero image
await figma.loadImage("https://images.unsplash.com/photo-xxx?w=440&h=248&fit=crop", {
  parentId: frame.id, x: 0, y: 0, width: 440, height: 248,
  name: "hero-image", scaleMode: "FILL"
});

// Circular avatar
await figma.loadImage("https://images.unsplash.com/photo-xxx?w=48&h=48&fit=crop", {
  parentId: row.id, width: 32, height: 32,
  name: "avatar", cornerRadius: 16, scaleMode: "FILL"
});
```

---

## figma.loadIcon(name, opts)

Fetch SVG icon with 7-library auto-fallback (filled-first, iOS style preferred):

```js
await figma.loadIcon("notifications", { parentId: header.id, x: 16, y: 16, size: 22, fill: "#FFFFFF" });
await figma.loadIcon("bookmark",      { parentId: header.id, x: 398, y: 16, size: 22, fill: "#1E3150" });
await figma.loadIcon("play",          { parentId: btn.id, size: 24, fill: "#FFFFFF" });
```

---

## figma.loadIconIn(name, opts)

Icon inside centered circle background:

```js
// Standard: creates 40px circle wrapper + 20px icon centered inside
await figma.loadIconIn("checkmark", {
  parentId: card.id, containerSize: 40, fill: "#00B894", bgOpacity: 0.1
});

// noContainer: true — load icon directly into an existing styled frame (avoids double-wrap)
// Use when you already created the wrapper frame yourself (BUG-15 prevention)
await figma.loadIconIn("arrow-right", {
  parentId: myWrapperFrameId,  // frame you already created at desired size
  containerSize: 28,           // icon size = containerSize/2 = 14px
  fill: "#FFFFFF",
  noContainer: true            // places icon directly — no extra wrapper created
});

// Transparent background (no tint circle)
await figma.loadIconIn("arrow-left", {
  parentId: btnId, containerSize: 32, fill: "#FFFFFF", bgOpacity: 0
});
```

**⚠️ BUG-15 warning:** If you pass a pre-styled wrapper frame as `parentId` WITHOUT `noContainer:true`,
`loadIconIn` will create an additional inner wrap inside it → icon shrinks to 25% of container size.
Use `noContainer: true` when the parent is already the intended icon container.

---

## ICON LIBRARY PRIORITY (MANDATORY)

`figma.loadIcon()` tries libraries in this order, returns first match:

| Priority | Library | Style | Fill Type |
|----------|---------|-------|-----------|
| 1st | **Ionicons** v7.4.0 | iOS filled | injected at `<svg>` root |
| 2nd | **Fluent UI** | Win11 Filled | `fill` attr |
| 3rd | **Bootstrap** | Filled | `fill` attr |
| 4th | **Phosphor** | Filled | `fill` attr |
| 5th | **Tabler Filled** v3.24 | Filled (4,500+) | `currentColor` → replaced |
| 6th | **Tabler Outline** | Outline | `currentColor` → replaced |
| 7th | **Lucide** | Outline fallback | `stroke` → replaced |

**Ionicons-specific naming** (iOS naming conventions):

| Concept | Ionicons name |
|---------|--------------|
| Bell | `notifications` |
| Back arrow | `chevron-back` |
| Forward | `chevron-forward` |
| Clock | `time` |
| Plus | `add` |
| Close | `close` |
| Checkmark | `checkmark` |
| Fire | `flame` |
| Lightning | `flash` |
| Lock | `lock-closed` |
| Chat | `chatbubble` |

Outline variants: append `-outline` (`home-outline`). Sharp: append `-sharp`.

**Common names across libraries:**

| Concept | Ionicons | Fluent | Bootstrap | Lucide |
|---------|----------|--------|-----------|--------|
| Home | `home` | `home_24_filled` | `house-fill` | `home` |
| User | `person` | `person_24_filled` | `person-fill` | `user` |
| Star | `star` | `star_24_filled` | `star-fill` | `star` |
| Search | `search` | `search_24_filled` | `search` | `search` |
| Settings | `settings` | `settings_24_filled` | `gear-fill` | `settings` |
| Heart | `heart` | `heart_24_filled` | `heart-fill` | `heart` |
| Bookmark | `bookmark` | `bookmark_24_filled` | `bookmark-fill` | `bookmark` |
| Play | `play` | `play_24_filled` | `play-fill` | `play` |
| Menu | `menu` | `navigation_24_filled` | `list` | `menu` |
| Cart | `cart` | `cart_24_filled` | `cart-fill` | `shopping-cart` |

---

## ICON COLORING RULE (MANDATORY)

Always pass `fill` param. Different libraries handle color differently — the plugin normalizes all:

| Context | Icon Color |
|---------|-----------|
| On white/light bg | Brand color or `#1E3150` |
| On colored bg (button) | `#FFFFFF` |
| On colored circle bg | Same as circle color |
| Inactive/disabled | `#8E9AAD` |
| Accent/CTA | `#6C5CE7` |
| Success | `#00B894` |
| Warning | `#F0B429` |
| Danger | `#FF6B6B` |

```js
figma.create({ type: "SVG", svg: "...", fill: "#6C5CE7", ... })
```

---

## ICON SIZING RULE (MANDATORY)

Icon MUST be smaller than container. Rule: `icon_size = container_size × 0.5`

| Container | Icon |
|-----------|------|
| 24px | 12px |
| 32px | 16px |
| 40px | 20px |
| 44px | 22px |
| 48px | 24px |
| 56px | 28px |
| 64px | 32px |
| 80px | 40px |

NEVER set icon_size >= container_size.

---

## SVG Icons (manual)

Use `type: "SVG"` with raw SVG markup when you have custom SVG:
```js
// Replace fill/stroke "currentColor" before sending
var svg = '<svg viewBox="0 0 24 24"><path d="M..." fill="#6C5CE7"/></svg>';
await figma.create({ type: "SVG", svg, parentId: f.id, x: 0, y: 0, width: 24, height: 24, fill: "#6C5CE7" });
```

---

## Known Figma Limitations (read before building)

These are **Figma platform behaviors** — not plugin bugs. Understanding them prevents wasted iterations.

---

### BUG-03 — Inter baseline offset (visual centering off by ~3–4px)

Auto-layout `CENTER` is mathematically correct but Inter font has extra ascender whitespace — text appears shifted upward visually.

**Workaround:** Add `paddingBottom: 3` or `paddingBottom: 4` to the wrapper frame:
```js
await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER",
  paddingBottom: 3,   // ← compensate Inter baseline
  width: 120, height: 40, fill: "#6C5CE7" });
```
Applies to: buttons, tab bar items, icon+label rows — any container where Inter text must appear perfectly centered.

---

### BUG-04 — VECTOR bounding box ignores width/height

Figma recalculates VECTOR dimensions from actual path geometry. Explicit `width`/`height` are ignored — the node gets the path's bounding box instead.

**Do NOT use VECTOR for circular arcs.** Use ELLIPSE + arcData:
```js
// ❌ VECTOR arc — width/height ignored, misaligns with sibling ELLIPSE
await figma.create({ type: "VECTOR", x:20, y:20, width:130, height:130,
  d: "M 65 7 A 58 58 0 1 1 12.4 107.4", stroke: "#428DE7", strokeWeight: 14 });
// → actual node: width=95, height=114 (path bounding box, not 130×130)

// ✅ ELLIPSE + arcData — always respects width/height
await figma.create({ type: "ELLIPSE", x:20, y:20, width:130, height:130,
  fill: "#00000000", stroke: "#428DE7", strokeWeight: 14,
  arcData: { startingAngle: -1.5708, endingAngle: -1.5708 + 0.72*2*Math.PI, innerRadius: 0 }});
```

---

### BUG-07 — counterAxisAlignItems "STRETCH" is not a valid value

Figma plugin API does not support `counterAxisAlignItems: "STRETCH"`. It throws immediately.

**Correct pattern:**
```js
// ❌ Throws error
await figma.create({ type: "FRAME", layoutMode: "VERTICAL",
  counterAxisAlignItems: "STRETCH" });

// ✅ Use "MIN" on container + layoutAlign: "STRETCH" on each child
var col = await figma.create({ type: "FRAME", layoutMode: "VERTICAL",
  counterAxisAlignItems: "MIN", width: 300, height: 200 });
await figma.create({ type: "FRAME", parentId: col.id, height: 52,
  layoutAlign: "STRETCH" });   // ← child fills parent width
```

---

### BUG-08 — figma_write sandbox is isolated per call

Every `figma_write` execution runs in a **fresh JavaScript sandbox**. Variables, constants, and helper functions defined in one call are gone in the next.

**Rule:** Redeclare all constants at the top of every `figma_write` call:
```js
// Must repeat this in EVERY figma_write call that needs these values
var COLORS = { accent: "#6C5CE7", bg: "#0F1117", text: "#E8ECF4" };
var frameId = "123:456";   // re-query if you don't have the ID from this call
```

---

### BUG-09/10 — figma.getChildren / figma.read not available in sandbox

`figma.getChildren(nodeId)`, `figma.getNodeChildren()`, and `figma.read(...)` are not exposed in the write sandbox. Calling them throws `figma.getChildren is not a function`.

**Correct pattern:** Use separate `figma_read` tool calls:
```js
// ❌ Inside figma_write — crashes
var children = await figma.getChildren("123:456");

// ✅ Use figma_read tool BEFORE the figma_write call
// figma_read({ operation: "get_design", nodeId: "123:456", depth: 2 })
// → inspect children, collect IDs, then use IDs in figma_write
```

---

### BUG-11 — SVG path H and V commands not supported

Figma's path parser does not support horizontal (`H`) or vertical (`V`) line commands. Using them throws `Invalid command at H`.

**Replace before using:**
| SVG command | Replace with |
|-------------|-------------|
| `H 100` | `L 100 {currentY}` |
| `V 50` | `L {currentX} 50` |
| `h 20` | `l 20 0` |
| `v -10` | `l 0 -10` |

```js
// ❌ Throws: Invalid command at H
await figma.create({ type: "VECTOR", d: "M 0 8 H 14 M 2 8 L 7 3" });

// ✅ Replace H with L
await figma.create({ type: "VECTOR", d: "M 0 8 L 14 8 M 2 8 L 7 3" });
```

---

### BUG-12 — Emoji in TEXT nodes misalign in auto-layout

Emoji characters (🔔 📋 ⌂ ✉ ☰) render as colored OS glyphs in Figma, not plain text. Problems:
1. Different ascender/descender metrics → shifted vertically in auto-layout
2. Glyph size ≠ fontSize (unreliable sizing)
3. Platform-variant rendering (macOS vs Windows vs web)

**Always use SVG icons instead:**
```js
// ❌ Never — emoji misaligns and renders inconsistently
await figma.create({ type: "TEXT", content: "⌂", fontSize: 20 });

// ✅ Always — SVG icon is pixel-perfect and colorable
await figma.loadIcon("home", { parentId: tabId, size: 20, fill: "#428DE7" });
```

---

### BUG-14 — layoutGrow:1 conflicts with primaryAxisAlignItems:"CENTER"

`"CENTER"` distributes remaining space equally around children. `layoutGrow: 1` on a child consumes **all** remaining space before CENTER applies — children shift to one side instead of centering.

**Rule:** Never combine `layoutGrow` with `primaryAxisAlignItems: "CENTER"`.

```js
// ❌ Spacer + CENTER — dots shift, centering broken
await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "CENTER" });
await figma.create({ type: "FRAME", parentId: rowId, layoutGrow: 1 }); // breaks centering

// ✅ Option A: SPACE_BETWEEN (distributes equally, no spacer needed)
await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "SPACE_BETWEEN" });

// ✅ Option B: "MIN" + paddingLeft for manual centering
await figma.create({ type: "FRAME", layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "MIN", paddingLeft: 60 });

// ✅ Option C: absolute x positions — skip auto-layout entirely for dot rows
```

---

## export_image vs screenshot

| | screenshot | export_image |
|--|-----------|-------------|
| Output | Inline image in Claude Code | base64 text string |
| Format | PNG only | PNG or JPG |
| Use case | "Show me the frame" | "Save this asset" |

```js
figma_read({ operation: "screenshot", nodeId: "123:456", scale: 1 })   // inline preview
figma_read({ operation: "export_image", nodeId: "123:456", scale: 2, format: "png" })  // save to disk
```
