# figma-ui-mcp — AI Assistant Guide

## Project Overview
`figma-ui-mcp` is a standalone, open-source **bidirectional Figma MCP server**.
Claude can draw UI directly on Figma canvas and read existing designs back as structured data.

## Architecture
```
server/index.js           — MCP server (stdio transport)
server/bridge-server.js   — HTTP bridge :38451 (plugin polls /poll, Claude posts to /exec)
server/code-executor.js   — VM sandbox for figma_write JS code
server/api-docs.js        — figma_docs content (rules + API reference)
server/tool-definitions.js — MCP tool schemas
plugin/code.js            — Figma plugin main thread (operation handlers)
plugin/ui.html            — Plugin UI (polls bridge, shows connection status dot)
plugin/manifest.json      — Figma plugin manifest
```

## MCP Tools
| Tool | Purpose |
|------|---------|
| `figma_status` | Check plugin connection. Call first before anything. |
| `figma_write` | Execute JS code to create/modify nodes on canvas |
| `figma_read` | Read design data, selection, screenshot, SVG |
| `figma_docs` | Get full API reference + Design Library rules |

## MANDATORY WORKFLOW (follow every time)

### 1. Check connection
Always call `figma_status` first. If not connected → tell user to run plugin.

### 2. Read selection when user refers to current frame
When user says "this frame", "cái đang chọn", "bạn thấy không", "the selected":
→ Call `figma_read` with `operation: "get_selection"` IMMEDIATELY.

### 3. Design Library First (NON-NEGOTIABLE)
Before drawing any new design:
1. Check `await figma.get_page_nodes()` for frame named **"🎨 Design Library"**
2. Not found → `await figma.ensure_library()` (creates it with default tokens)
3. Found → `await figma.get_library_tokens()` (load colors + text styles)
4. Use ONLY library tokens. Never hardcode colors/font sizes inline.
5. New token needed → add to library FIRST, then use it.

### 4. Build iteratively
One section at a time. Verify with `figma_read get_page_nodes` after each major step.

## Design Library Tokens (defaults)

### Colors
| Token               | Hex       | Usage                    |
|---------------------|-----------|--------------------------|
| bg-base             | #0F1117   | Page/canvas background   |
| bg-surface          | #191C24   | Cards, side panels       |
| bg-elevated         | #1E2233   | Dividers, hover states   |
| accent-purple       | #6366F1   | Primary CTA, active nav  |
| positive-green      | #00C896   | Profit, success, LONG    |
| negative-red        | #FF4560   | Loss, error, SHORT       |
| text-primary        | #E8ECF4   | Headings, values         |
| text-secondary      | #6B7280   | Labels, captions         |
| border              | #1E2233   | Separators               |

### Text Styles
| Token        | Size | Weight   |
|--------------|------|----------|
| heading-2xl  | 32px | Bold     |
| heading-xl   | 24px | Bold     |
| heading-lg   | 20px | Bold     |
| heading-md   | 16px | SemiBold |
| body-md      | 14px | Regular  |
| body-sm      | 12px | Regular  |
| caption      | 11px | Regular  |
| label        | 11px | Medium   |

## Layer Order Rule (CRITICAL)
In Figma, the LAST child drawn renders ON TOP. When building screens:
1. **Draw background/hero image FIRST** (bottom layer)
2. Then overlays, content, buttons on top
3. **NEVER** add a full-size image after other elements — it covers everything

```
CORRECT:  image → overlay → back btn → title → content
WRONG:    back btn → title → content → image (image covers all!)
```

## Component Naming Convention
- Colors: `color/{name}` → `color/accent-purple`
- Text: `text/{role}` → `text/heading-xl`
- Buttons: `btn/{variant}` → `btn/primary`, `btn/danger`
- Badges: `badge/{variant}` → `badge/success`
- Cards: `card/{variant}` → `card/kpi`
- Inputs: `input/{state}` → `input/default`

## Key Operations Reference
```js
await figma.ensure_library()       // create/get Design Library frame
await figma.get_library_tokens()   // read color + text tokens
await figma.loadImage(url, opts)   // download image → create IMAGE node
await figma.loadIcon(name, opts)   // fetch SVG icon → create SVG node (auto fallback chain)
await figma.loadIconIn(name, opts) // icon inside centered circle bg
await figma.get_selection()        // read user's Figma selection
await figma.get_page_nodes()       // list all top-level frames
await figma.create({ type, name, parentId, x, y, width, height, fill, ... })
await figma.modify({ id, fill, width, content, ... })
await figma.query({ name: "Card" }) // find nodes
await figma.delete({ id })
```

## SVG Icons
Use `type: "SVG"` with `svg` param containing SVG markup string.
Replace `fill="currentColor"` or `stroke="currentColor"` with desired color before sending.

### ICON LIBRARY PRIORITY (MANDATORY)
Always try libraries in this order. If icon not found in first, fallback to next:

| Priority | Library | Style | URL Pattern | Fill Type |
|----------|---------|-------|-------------|-----------|
| 1st | **Fluent UI** | Win11 Filled | `https://unpkg.com/@fluentui/svg-icons/icons/{name}_24_filled.svg` | `fill` |
| 2nd | **Bootstrap** | Filled | `https://unpkg.com/bootstrap-icons@1.11.3/icons/{name}-fill.svg` | `fill` |
| 3rd | **Phosphor** | Filled | `https://unpkg.com/@phosphor-icons/core@latest/assets/fill/{name}-fill.svg` | `fill` |
| 4th | **Lucide** | Outline | `https://unpkg.com/lucide-static@0.577.0/icons/{name}.svg` | `stroke` |

**Naming differences between libraries:**
| Concept | Fluent UI | Bootstrap | Phosphor | Lucide |
|---------|-----------|-----------|----------|--------|
| Home | `home_24_filled` | `house-fill` | `house-fill` | `home` |
| Bell | `alert_24_filled` | `bell-fill` | `bell-fill` | `bell` |
| User | `person_24_filled` | `person-fill` | `user-fill` | `user` |
| Star | `star_24_filled` | `star-fill` | `star-fill` | `star` |
| Book | `book_24_filled` | `book-fill` | `book-open-fill` | `book-open` |
| Search | `search_24_filled` | `search` | `magnifying-glass-fill` | `search` |
| Settings | `settings_24_filled` | `gear-fill` | `gear-fill` | `settings` |
| Check | `checkmark_24_filled` | `check-circle-fill` | `check-circle-fill` | `check` |
| Close | `dismiss_24_filled` | `x-circle-fill` | `x-circle-fill` | `x` |
| Arrow L | `arrow_left_24_filled` | `arrow-left` | `arrow-left-fill` | `arrow-left` |
| Arrow R | `arrow_right_24_filled` | `arrow-right` | `arrow-right-fill` | `arrow-right` |
| Fire | `fire_24_filled` | `fire` | `fire-fill` | `flame` |
| Trophy | `trophy_24_filled` | `trophy-fill` | `trophy-fill` | `trophy` |
| Clock | `clock_24_filled` | `clock-fill` | `clock-fill` | `clock` |
| Share | `share_24_filled` | `share-fill` | `share-fill` | `share-2` |
| Lock | `lock_closed_24_filled` | `lock-fill` | `lock-fill` | `lock` |
| Gift | `gift_24_filled` | `gift-fill` | `gift-fill` | `gift` |
| Heart | `heart_24_filled` | `heart-fill` | `heart-fill` | `heart` |
| Compass | `compass_northwest_24_filled` | `compass-fill` | `compass-fill` | `compass` |
| Grid | `grid_24_filled` | `grid-fill` | `grid-four-fill` | `grid-2x2` |
| Eye | `eye_24_filled` | `eye-fill` | `eye-fill` | `eye` |
| Bookmark | `bookmark_24_filled` | `bookmark-fill` | `bookmark-simple-fill` | `bookmark` |
| Play | `play_24_filled` | `play-fill` | `play-fill` | `play` |
| Chat | `chat_24_filled` | `chat-fill` | `chat-circle-fill` | `message-circle` |
| Lightning | `flash_24_filled` | `lightning-fill` | `lightning-fill` | `zap` |

### TEXT vs BACKGROUND COLOR RULE (MANDATORY — CRITICAL)
**NEVER** create a container where fill color equals text color inside it. Text will be invisible.

**Pattern to AVOID:**
```
frame(fill: "#6C5CE7") → text(fill: "#6C5CE7")  ← INVISIBLE!
```

**Correct patterns for tinted/accent containers:**

| Style | Container | Text | When to use |
|-------|-----------|------|-------------|
| Filled active | `fill: "#6C5CE7"` | `fill: "#FFFFFF"` | Active tabs, primary buttons |
| Outlined accent | `fill: "#FFFFFF", stroke: "#6C5CE7"` | `fill: "#6C5CE7"` | Filter pills, level badges |
| Ghost/subtle | `fill: "#F5F6FA"` | `fill: "#1E3150"` | Inactive tabs, secondary |
| Tinted (safe) | `fill: "#FFFFFF", stroke: color` | `fill: color` | Tags, badges with border |

**Rule: If container and text need the same accent color, use white bg + colored border + colored text.**

### ICON COLORING RULE (MANDATORY)
Always pass `fill` param when creating SVG icons. Different libraries handle color differently:
- **Fluent UI**: No default fill attr → MUST pass `fill` param to color vectors
- **Bootstrap**: Uses `fill="currentColor"` → sed replacement + `fill` param
- **Phosphor**: Uses `fill="currentColor"` → sed replacement + `fill` param
- **Lucide**: Uses `stroke="currentColor"` → sed replacement + `stroke` via SVG markup

The plugin's SVG handler applies `fill` to ALL vector children, so always include it:
```js
figma.create({ type: "SVG", svg: "...", fill: "#6C5CE7", ... })
```

Icon color must match its context:
| Context | Icon Color | Example |
|---------|-----------|---------|
| On white/light bg | Brand color or `#1E3150` | Card icons, tab bar |
| On colored bg (button) | `#FFFFFF` | Button icons |
| On colored circle bg | Same as circle color | `figma_icon_in` |
| Inactive/disabled | `#8E9AAD` | Inactive tab, muted |
| Accent/CTA | `#6C5CE7` (purple) | Active state |
| Success | `#00B894` (jade) | Check marks |
| Warning/gold | `#F0B429` | Stars, rewards |
| Danger/alert | `#FF6B6B` (coral) | Notifications |

### ICON SIZING RULE (MANDATORY)
Icon must ALWAYS be smaller than its container. Use this ratio:
```
icon_size = container_size * 0.5    (50% of container)
```
| Container | Icon | Example |
|-----------|------|---------|
| 24px      | 12px | Small badge dot |
| 32px      | 16px | Letter circle in quiz |
| 36px      | 18px | Header action circle |
| 40px      | 20px | Card icon circle |
| 44px      | 22px | Standard icon bg |
| 48px      | 24px | Large icon bg |
| 56px      | 28px | Hero icon |
| 64px      | 32px | Featured icon |
| 80px      | 40px | Splash/celebration |

**NEVER** set icon_size >= container_size. If icon overflows container, it looks broken.
When using `figma_center` wrapper for icon, calculate: `figma_center(..., container_size, ...)` then `figma_icon(..., container_size * 0.5, ...)`.

### DOT + TEXT / ICON + TEXT ROW ALIGNMENT RULE (MANDATORY)
When placing a small element (dot, icon, bullet) next to text in a horizontal row:

**ALWAYS use `counterAxisAlignItems: "CENTER"`** so items are vertically centered with each other.

```
CORRECT:
layoutMode: "HORIZONTAL", counterAxisAlignItems: "CENTER", itemSpacing: 12
→ dot (8px) and text (22px line-height) are vertically aligned

WRONG:
counterAxisAlignItems: "MIN"
→ dot sits at top, text at top — dot appears higher than text center
```

| Pattern | Layout | Cross Axis | When to use |
|---------|--------|------------|-------------|
| Dot + single-line text | HORIZONTAL | CENTER | Bullet points, list items |
| Icon + single-line text | HORIZONTAL | CENTER | Menu items, labels |
| Icon + multi-line text | HORIZONTAL | MIN + paddingTop on icon | Descriptions, cards |
| Badge + text | HORIZONTAL | CENTER | Tags, status indicators |

**Multi-line exception:** If text wraps to 2+ lines and dot/icon should align with the FIRST line only:
```
counterAxisAlignItems: "MIN"
icon paddingTop = (textLineHeight - iconSize) / 2
Example: text 22px line-height, dot 8px → paddingTop = (22 - 8) / 2 = 7
```

### PROGRESS BAR RULE (MANDATORY — CRITICAL)
Progress bars require TWO rectangles overlapping: track (full width bg) + fill (partial width foreground).
**Auto-layout frames stack children sequentially**, so placing both rectangles inside auto-layout will show them SIDE BY SIDE, not overlapping.

**ALWAYS wrap progress bars in a non-auto-layout frame:**
```js
// CORRECT: wrapper frame WITHOUT layoutMode → children overlap via absolute x,y
var pbWrap = await figma.create({
  type: "FRAME", name: "progress-bar", parentId: autoLayoutParent.id,
  width: 352, height: 6
  // NO layoutMode here!
});
await figma.create({ type: "RECTANGLE", name: "progress-track", parentId: pbWrap.id, x: 0, y: 0, width: 352, height: 6, fill: "#E7EAF0", cornerRadius: 3 });
await figma.create({ type: "RECTANGLE", name: "progress-fill", parentId: pbWrap.id, x: 0, y: 0, width: 211, height: 6, fill: "#6C5CE7", cornerRadius: 3 });

// WRONG: both rectangles directly in auto-layout → they sit next to each other
await figma.create({ type: "RECTANGLE", parentId: autoLayoutFrame.id, width: 352, height: 6, fill: "#E7EAF0" });
await figma.create({ type: "RECTANGLE", parentId: autoLayoutFrame.id, width: 211, height: 6, fill: "#6C5CE7" });
// ↑ These will NOT overlap — they'll be placed 352px + 211px = 563px total width!
```

**This rule applies to ANY overlapping elements inside auto-layout:** score rings, slider tracks, overlay badges, etc.
Use a non-auto-layout wrapper frame whenever children must overlap.

### BADGE / PILL / TAG RULE (MANDATORY — TWO CONCERNS)
Badges have TWO separate concerns: (1) text centering INSIDE badge, (2) badge POSITION on parent.

**Concern 1 — Text inside badge: ALWAYS use auto-layout CENTER/CENTER**
```js
// CORRECT: Auto-layout frame → text auto-centers inside badge
var badge = await figma.create({
  type: "FRAME", name: "badge", parentId: parent.id,
  x: 100, y: 10, width: 64, height: 20,
  fill: "#E8FBF5", cornerRadius: 10,
  layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "CENTER",   // centers text horizontally
  counterAxisAlignItems: "CENTER"    // centers text vertically
});
await figma.create({ type: "TEXT", parentId: badge.id, content: "Free", fontSize: 10, fontWeight: "SemiBold", fill: "#00B894" });

// WRONG: Separate rectangle + text → text never properly centered
```

**Concern 2 — Badge position on card: use absolute x,y on PARENT (not inside card auto-layout)**
```js
// Badge at top-right corner of a card:
// badgeX = cardX + cardWidth - badgeWidth - margin (e.g. 6px)
// badgeY = cardY + margin (e.g. 6px)
var badge = await figma.create({
  ..., parentId: rootFrame.id,    // parent is ROOT, not the card!
  x: cardX + cardWidth - 64 - 6, // top-right corner
  y: cardY + 6,
  ...
});
// Badge is a sibling of the card, overlapping its top-right corner via absolute positioning.
// Do NOT put badge inside the card's auto-layout — it will be stacked with other children!
```

**This applies to:** badges, pills, tags, labels, small buttons, notification dots with numbers, level indicators.

### CONTAINER HEIGHT MUST FIT CONTENT RULE (MANDATORY)
When creating auto-layout containers (cards, banners, panels):
- Set height **generously** to fit all children with padding + spacing
- If unsure, add 20-30px buffer — too tall is better than content being clipped
- After creating, verify with `get_design` or `screenshot` that no content overflows
- Formula: height = paddingTop + paddingBottom + (childCount * avgChildHeight) + ((childCount-1) * itemSpacing)

## Images & Icons (Server-side helpers — NO bash/curl needed)

### figma.loadImage(url, opts) — Download image and place on canvas
```js
// Thumbnail image
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

### figma.loadIcon(name, opts) — Fetch SVG icon (auto fallback: Fluent → Bootstrap → Phosphor → Lucide)
```js
await figma.loadIcon("chevron-left", { parentId: header.id, x: 16, y: 16, size: 22, fill: "#FFFFFF" });
await figma.loadIcon("bookmark",     { parentId: header.id, x: 398, y: 16, size: 22, fill: "#1E3150" });
await figma.loadIcon("play",         { parentId: btn.id, size: 24, fill: "#FFFFFF" });
```

### figma.loadIconIn(name, opts) — Icon inside centered circle background
```js
// 40px circle with jade bg at 10% opacity, 20px icon inside centered
await figma.loadIconIn("check", {
  parentId: card.id, containerSize: 40, fill: "#00B894", bgOpacity: 0.1
});
```

### Legacy (still works but prefer helpers above)
`type: "IMAGE"` with `imageData` (base64) — use only when you already have base64 data.
`type: "SVG"` with `svg` string — use only when you have custom SVG markup.

## AUTO LAYOUT (PREFERRED for centering — NON-NEGOTIABLE for complex containers)

Use Auto Layout instead of manual x/y math whenever a container has children that need centering.

### Creating an Auto Layout Frame
```js
// Horizontal row: icon + text side by side, vertically centered
await figma.create({
  type: "FRAME", name: "Button",
  parentId: root.id,
  x: 24, y: 100, width: 392, height: 52,
  fill: "#6C5CE7", cornerRadius: 12,
  layoutMode: "HORIZONTAL",           // "HORIZONTAL" | "VERTICAL"
  primaryAxisAlignItems: "CENTER",     // main axis: "MIN"|"CENTER"|"MAX"|"SPACE_BETWEEN"
  counterAxisAlignItems: "CENTER",     // cross axis: "MIN"|"CENTER"|"MAX"
  padding: 16,                        // uniform, or use paddingTop/Bottom/Left/Right
  itemSpacing: 8,                     // gap between children
})
// → Children added to this frame will auto-center!
```

### Common patterns:
```
// Button with centered text:
layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER"

// Card with icon left + text right, vertically centered:
layoutMode: "HORIZONTAL", primaryAxisAlignItems: "MIN", counterAxisAlignItems: "CENTER", paddingLeft: 16, itemSpacing: 12

// Vertical stack (title + subtitle + button):
layoutMode: "VERTICAL", primaryAxisAlignItems: "MIN", counterAxisAlignItems: "STRETCH", itemSpacing: 8

// Centered icon in a circle/square:
layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER"
```

### Child properties:
```js
// Make child fill parent width in vertical layout:
await figma.create({ ..., layoutAlign: "STRETCH" })

// Make child grow to fill available space:
await figma.create({ ..., layoutGrow: 1 })
```

### Modify existing frame to auto-layout:
```js
await figma.modify({ id: frameId, layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER" })
```

### RULE: Always use Auto Layout for:
- Buttons (text must be centered)
- Cards with icon + text rows
- Tab bar items
- List items
- Any container where children must be centered
- Badge pills with text

### FALLBACK: Manual math (only when Auto Layout is inappropriate)
```
icon_x = container_x + (container_w - icon_size) / 2
text_x = button_x + (button_w - text_w_estimate) / 2
```

## Figma Plugin Sandbox Limitations
The plugin JS sandbox does NOT support:
- Optional chaining `?.` → use `x ? x.y : null`
- Nullish coalescing `??` → use `x !== undefined ? x : default`
- Object spread `{...obj}` → use `Object.assign({}, obj)`
- `require`, `fetch`, `setTimeout`, `process`, `fs`

## Important Notes
- Bridge `/exec` endpoint: POST `{ operation, params }` → synchronous result (used for curl-based driving)
- Plugin connects via polling `/poll` every 900ms
- Plugin considered offline after 15s without poll (`HEALTH_TTL_MS`)
- `figma.ui.postMessage()` TS hint is harmless — runtime works correctly
